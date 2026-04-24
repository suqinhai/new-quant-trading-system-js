#!/bin/bash
# =============================================================================
# blue-green-deploy.sh - Slot-based blue/green helper
# Requires an external proxy or manual port switch
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.single-strategy.yml"
STATE_FILE="$PROJECT_DIR/.blue-green-state"
IMAGE_NAME="quant-trading-system:latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT="shadow"
STRATEGY_NAME="${STRATEGY_NAME:-SMA}"
HEALTH_CHECK_TIMEOUT=180
DRY_RUN=false
REBUILD_IMAGE=true

BLUE_PORT=3000
GREEN_PORT=3001
BLUE_METRICS_PORT=9100
GREEN_METRICS_PORT=9101
BLUE_WS_PORT=8000
GREEN_WS_PORT=8001

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
  cat <<'EOF'
Usage: blue-green-deploy.sh [OPTIONS] COMMAND

Commands:
  deploy      Build image and deploy to the inactive slot
  switch      Mark the inactive slot as active after a health check
  rollback    Mark the previous slot as active after a health check
  status      Show slot status and active URLs
  cleanup     Remove the inactive slot

Options:
  -e, --env ENV       Runtime mode: shadow (default), live, dev
  -s, --strategy STR  Strategy name for the single-stack slot (default: SMA)
  -t, --timeout SEC   Health check timeout in seconds (default: 180)
  -n, --dry-run       Print commands without executing them
      --skip-build    Reuse the existing local image
  -h, --help          Show this help

Notes:
  This script manages blue/green slots on ports 3000 and 3001.
  Traffic switching is recorded in .blue-green-state; connect your reverse
  proxy or test client to the active port shown by the status command.
EOF
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

validate_runtime_env() {
  local jwt_secret="${JWT_SECRET:-}"
  local dashboard_password="${DASHBOARD_PASSWORD:-}"

  if [[ "${ENABLE_API:-true}" == "false" ]]; then
    log_error "ENABLE_API=false is incompatible with blue/green health checks"
    exit 1
  fi

  if [[ -z "$jwt_secret" || "$jwt_secret" == "your-secret-key" ]]; then
    log_error "JWT_SECRET must be configured with a non-placeholder value"
    exit 1
  fi

  if [[ -z "$dashboard_password" \
    || "$dashboard_password" == "your_secure_password_here" \
    || "$dashboard_password" == "admin123" ]]; then
    log_error "DASHBOARD_PASSWORD must be configured with a non-placeholder value"
    exit 1
  fi
}

get_active_env() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE"
  else
    echo "blue"
  fi
}

set_active_env() {
  echo "$1" > "$STATE_FILE"
}

get_inactive_env() {
  if [[ "$(get_active_env)" == "blue" ]]; then
    echo "green"
  else
    echo "blue"
  fi
}

get_project_name() {
  echo "quant-$1"
}

get_port() {
  if [[ "$1" == "blue" ]]; then
    echo "$BLUE_PORT"
  else
    echo "$GREEN_PORT"
  fi
}

get_metrics_port() {
  if [[ "$1" == "blue" ]]; then
    echo "$BLUE_METRICS_PORT"
  else
    echo "$GREEN_METRICS_PORT"
  fi
}

get_ws_port() {
  if [[ "$1" == "blue" ]]; then
    echo "$BLUE_WS_PORT"
  else
    echo "$GREEN_WS_PORT"
  fi
}

get_override_file() {
  echo "$PROJECT_DIR/docker-compose.$1.override.yml"
}

render_override_file() {
  local env="$1"
  local override_file
  override_file="$(get_override_file "$env")"

  cat > "$override_file" <<EOF
services:
  quant-single:
    container_name: quant-trading-$env
EOF
}

run_env_compose() {
  local env="$1"
  shift

  local port metrics_port ws_port project override_file
  port="$(get_port "$env")"
  metrics_port="$(get_metrics_port "$env")"
  ws_port="$(get_ws_port "$env")"
  project="$(get_project_name "$env")"
  override_file="$(get_override_file "$env")"

  local cmd=(
    docker compose
    -p "$project"
    -f "$COMPOSE_FILE"
    -f "$override_file"
  )

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run: RUN_MODE=$ENVIRONMENT STRATEGY_NAME=$STRATEGY_NAME PORT=$port HTTP_PORT=$port METRICS_PORT=$metrics_port WS_PORT=$ws_port $(printf '%q ' "${cmd[@]}")$*"
    return 0
  fi

  RUN_MODE="$ENVIRONMENT" \
  STRATEGY_NAME="$STRATEGY_NAME" \
  PORT="$port" \
  HTTP_PORT="$port" \
  METRICS_PORT="$metrics_port" \
  WS_PORT="$ws_port" \
  "${cmd[@]}" "$@"
}

ensure_image() {
  if [[ "$REBUILD_IMAGE" == "false" ]] && docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run: docker build --target production -t $IMAGE_NAME ."
    return 0
  fi

  log_info "Building production image..."
  docker build --target production -t "$IMAGE_NAME" "$PROJECT_DIR"
  log_success "Image ready: $IMAGE_NAME"
}

check_frontend_route() {
  local port="$1"
  local url="http://127.0.0.1:${port}/login"

  if [[ "${ENABLE_API:-true}" == "false" ]]; then
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run frontend check on $url"
    return 0
  fi

  local headers
  headers="$(curl -sS -D - -o /dev/null "$url" 2>/dev/null || true)"

  grep -qi '^HTTP/.* 200' <<<"$headers" && grep -qi '^Content-Type: text/html' <<<"$headers"
}

wait_for_health() {
  local env="$1"
  local port elapsed=0
  local api_url
  port="$(get_port "$env")"
  api_url="http://127.0.0.1:$port/api/system/health"

  log_info "Waiting for $env slot on $api_url"

  while [[ "$elapsed" -lt "$HEALTH_CHECK_TIMEOUT" ]]; do
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "Would run health check on slot $env"
      return 0
    fi

    if curl -fsS "$api_url" >/dev/null 2>&1 && check_frontend_route "$port"; then
      log_success "$env slot is healthy"
      return 0
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  log_error "$env slot failed API/frontend health check"
  return 1
}

start_environment() {
  local env="$1"

  render_override_file "$env"
  log_info "Starting $env slot on port $(get_port "$env")"
  run_env_compose "$env" up -d quant-single
}

stop_environment() {
  local env="$1"

  render_override_file "$env"
  log_info "Stopping $env slot"
  run_env_compose "$env" down --remove-orphans
}

cmd_deploy() {
  local inactive
  inactive="$(get_inactive_env)"

  ensure_image
  stop_environment "$inactive" || true
  start_environment "$inactive"
  wait_for_health "$inactive"

  log_success "Inactive slot ready"
  log_info "Candidate URL: http://127.0.0.1:$(get_port "$inactive")"
}

cmd_switch() {
  local inactive
  inactive="$(get_inactive_env)"

  wait_for_health "$inactive"
  set_active_env "$inactive"
  log_success "Active slot updated to: $inactive"
  log_warn "Switching only updates $STATE_FILE. Update your proxy or client to the new port."
}

cmd_rollback() {
  local previous
  previous="$(get_inactive_env)"

  wait_for_health "$previous"
  set_active_env "$previous"
  log_success "Rollback target marked active: $previous"
  log_warn "Switching only updates $STATE_FILE. Update your proxy or client to the new port."
}

cmd_status() {
  local active inactive
  active="$(get_active_env)"
  inactive="$(get_inactive_env)"

  echo "========================================"
  echo "Blue/Green Slot Status"
  echo "========================================"
  printf "%-18s %s\n" "Active slot:" "$active"
  printf "%-18s %s\n" "Standby slot:" "$inactive"
  printf "%-18s %s\n" "Active URL:" "http://127.0.0.1:$(get_port "$active")"
  printf "%-18s %s\n" "Standby URL:" "http://127.0.0.1:$(get_port "$inactive")"
  echo

  for env in blue green; do
    local project
    project="$(get_project_name "$env")"
    render_override_file "$env"

    if [[ "$DRY_RUN" == "true" ]]; then
      echo "$env: dry-run"
      continue
    fi

    RUN_MODE="$ENVIRONMENT" STRATEGY_NAME="$STRATEGY_NAME" \
      PORT="$(get_port "$env")" HTTP_PORT="$(get_port "$env")" \
      METRICS_PORT="$(get_metrics_port "$env")" WS_PORT="$(get_ws_port "$env")" \
      docker compose -p "$project" -f "$COMPOSE_FILE" -f "$(get_override_file "$env")" ps
  done
}

cmd_cleanup() {
  local inactive
  inactive="$(get_inactive_env)"

  stop_environment "$inactive"

  if [[ "$DRY_RUN" != "true" ]]; then
    rm -f "$(get_override_file "$inactive")"
  fi

  log_success "Inactive slot cleaned up: $inactive"
}

main() {
  local command=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -e|--env)
        ENVIRONMENT="$2"
        shift 2
        ;;
      -s|--strategy)
        STRATEGY_NAME="$2"
        shift 2
        ;;
      -t|--timeout)
        HEALTH_CHECK_TIMEOUT="$2"
        shift 2
        ;;
      -n|--dry-run)
        DRY_RUN=true
        shift
        ;;
      --skip-build)
        REBUILD_IMAGE=false
        shift
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      deploy|switch|rollback|status|cleanup)
        command="$1"
        shift
        ;;
      *)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
    esac
  done

  if [[ -z "$command" ]]; then
    show_help
    exit 1
  fi

  if [[ ! "$ENVIRONMENT" =~ ^(shadow|live|dev)$ ]]; then
    log_error "Invalid runtime mode: $ENVIRONMENT"
    exit 1
  fi

  if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Compose file not found: $COMPOSE_FILE"
    exit 1
  fi

  cd "$PROJECT_DIR"
  load_env_file
  validate_runtime_env

  case "$command" in
    deploy)
      cmd_deploy
      ;;
    switch)
      cmd_switch
      ;;
    rollback)
      cmd_rollback
      ;;
    status)
      cmd_status
      ;;
    cleanup)
      cmd_cleanup
      ;;
  esac
}

main "$@"
