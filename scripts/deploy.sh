#!/bin/bash
# =============================================================================
# deploy.sh - Staging-safe deployment helper
# Quant Trading System
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
SINGLE_COMPOSE_FILE="$PROJECT_DIR/docker-compose.single-strategy.yml"
MULTI_COMPOSE_FILE="$PROJECT_DIR/docker-compose.multi-strategy.yml"
IMAGE_NAME="quant-trading-system:latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT="shadow"
STACK="single"
PROFILE_ARGS=()
PULL_LATEST=false
BUILD_LOCAL=false
BACKUP_BEFORE=false
HEALTH_CHECK_TIMEOUT=180
DRY_RUN=false

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
Usage: deploy.sh [OPTIONS] [COMMAND]

Commands:
  deploy      Deploy the selected stack (default)
  stop        Stop the selected stack
  restart     Restart the selected stack
  status      Show container status
  logs        Tail application logs
  backup      Save a lightweight deployment snapshot
  rollback    Re-deploy from latest snapshot metadata
  health      Run HTTP/API health checks

Options:
  -e, --env ENV       Runtime mode: shadow (default), live, dev
  -s, --stack STACK   Compose stack: single (default), multi
  -p, --profile NAME  Additional compose profile, repeatable
  -b, --build         Build the production image locally before deploy
  -l, --pull          Pull the image before deploy
  -B, --backup        Create a backup snapshot before deploy
  -t, --timeout SEC   Health check timeout in seconds (default: 180)
  -n, --dry-run       Print commands without executing them
  -h, --help          Show this help

Examples:
  ./scripts/deploy.sh deploy -e shadow -s single
  ./scripts/deploy.sh deploy -e shadow -s multi -B
  ./scripts/deploy.sh status -s multi
EOF
}

get_compose_file() {
  case "$STACK" in
    single) echo "$SINGLE_COMPOSE_FILE" ;;
    multi) echo "$MULTI_COMPOSE_FILE" ;;
    *)
      log_error "Unsupported stack: $STACK"
      exit 1
      ;;
  esac
}

get_app_services() {
  case "$STACK" in
    single)
      printf '%s\n' "quant-single"
      ;;
    multi)
      printf '%s\n' \
        "quant-trend-core" \
        "quant-tech-alpha" \
        "quant-cross-factor" \
        "quant-event-risk" \
        "quant-hf-arbitrage"
      ;;
  esac
}

get_service_port() {
  local service="$1"

  case "$service" in
    quant-single)
      if [[ -n "${HTTP_PORT:-}" ]]; then
        echo "$HTTP_PORT"
      elif [[ -n "${PORT:-}" ]]; then
        echo "$PORT"
      else
        echo "3000"
      fi
      ;;
    quant-trend-core) echo "2001" ;;
    quant-tech-alpha) echo "2002" ;;
    quant-cross-factor) echo "2003" ;;
    quant-event-risk) echo "2004" ;;
    quant-hf-arbitrage) echo "2005" ;;
    *)
      log_error "Unknown service port mapping: $service"
      exit 1
      ;;
  esac
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  else
    log_warn ".env not found at $ENV_FILE"
  fi
}

validate_runtime_env() {
  if [[ "${ENABLE_API:-true}" == "false" ]]; then
    log_warn "ENABLE_API=false, skipping API credential validation"
    return 0
  fi

  local jwt_secret="${JWT_SECRET:-}"
  local dashboard_password="${DASHBOARD_PASSWORD:-}"

  if [[ -z "$jwt_secret" || "$jwt_secret" == "your-secret-key" ]]; then
    log_error "JWT_SECRET must be configured with a non-placeholder value"
    return 1
  fi

  if [[ -z "$dashboard_password" \
    || "$dashboard_password" == "your_secure_password_here" \
    || "$dashboard_password" == "admin123" ]]; then
    log_error "DASHBOARD_PASSWORD must be configured with a non-placeholder value"
    return 1
  fi

  if [[ "${ALLOW_INSECURE_DEFAULT_AUTH:-false}" == "true" ]]; then
    log_error "ALLOW_INSECURE_DEFAULT_AUTH=true is not allowed for deployment"
    return 1
  fi
}

build_compose_cmd() {
  local cmd=(docker compose -f "$(get_compose_file)")

  for profile in "${PROFILE_ARGS[@]}"; do
    cmd+=(--profile "$profile")
  done

  printf '%q ' "${cmd[@]}"
}

run_compose() {
  local cmd=(docker compose -f "$(get_compose_file)")

  for profile in "${PROFILE_ARGS[@]}"; do
    cmd+=(--profile "$profile")
  done

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run: RUN_MODE=$ENVIRONMENT $(printf '%q ' "${cmd[@]}")$*"
    return 0
  fi

  RUN_MODE="$ENVIRONMENT" "${cmd[@]}" "$@"
}

check_frontend_route() {
  local port="$1"
  local url="http://127.0.0.1:${port}/login"

  if [[ "${ENABLE_API:-true}" == "false" ]]; then
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run frontend check: $url"
    return 0
  fi

  local headers
  headers="$(curl -sS -D - -o /dev/null "$url" 2>/dev/null || true)"

  grep -qi '^HTTP/.* 200' <<<"$headers" && grep -qi '^Content-Type: text/html' <<<"$headers"
}

ensure_image_available() {
  if [[ "$BUILD_LOCAL" == "true" || "$PULL_LATEST" == "true" ]]; then
    return 0
  fi

  if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    return 0
  fi

  log_error "Image $IMAGE_NAME not found. Build it first with --build."
  exit 1
}

check_requirements() {
  log_info "Checking deployment requirements..."

  if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker is not installed"
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    log_error "Docker Compose is not available"
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running"
    exit 1
  fi

  if ! command -v curl >/dev/null 2>&1; then
    log_error "curl is required for health checks"
    exit 1
  fi

  local compose_file
  compose_file="$(get_compose_file)"

  if [[ ! -f "$compose_file" ]]; then
    log_error "Compose file not found: $compose_file"
    exit 1
  fi

  load_env_file
  validate_runtime_env
  log_success "Requirements satisfied"
}

check_directories() {
  log_info "Ensuring local directories exist..."

  local dirs=(
    "$PROJECT_DIR/logs"
    "$PROJECT_DIR/data"
    "$PROJECT_DIR/backups"
    "$PROJECT_DIR/backups/deploy"
    "$PROJECT_DIR/config"
  )

  for dir in "${dirs[@]}"; do
    mkdir -p "$dir"
  done

  log_success "Directories ready"
}

build_image() {
  if [[ "$BUILD_LOCAL" != "true" ]]; then
    return 0
  fi

  log_info "Building production image locally..."

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run: docker build --target production -t $IMAGE_NAME ."
    return 0
  fi

  docker build --target production -t "$IMAGE_NAME" "$PROJECT_DIR"
  log_success "Image built: $IMAGE_NAME"
}

pull_image() {
  if [[ "$PULL_LATEST" != "true" ]]; then
    return 0
  fi

  log_info "Pulling image $IMAGE_NAME..."

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would run: docker pull $IMAGE_NAME"
    return 0
  fi

  docker pull "$IMAGE_NAME"
  log_success "Image pulled: $IMAGE_NAME"
}

create_backup() {
  if [[ "$BACKUP_BEFORE" != "true" ]]; then
    return 0
  fi

  local backup_dir="$PROJECT_DIR/backups/deploy/$(date +%Y%m%d_%H%M%S)"
  log_info "Creating deployment snapshot: $backup_dir"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would create backup directory: $backup_dir"
    return 0
  fi

  mkdir -p "$backup_dir"
  printf 'environment=%s\nstack=%s\n' "$ENVIRONMENT" "$STACK" > "$backup_dir/runtime.env"
  run_compose ps > "$backup_dir/compose-ps.txt" || true

  if command -v git >/dev/null 2>&1; then
    git -C "$PROJECT_DIR" rev-parse HEAD > "$backup_dir/git-revision.txt" 2>/dev/null || true
    git -C "$PROJECT_DIR" status --short > "$backup_dir/git-status.txt" 2>/dev/null || true
  fi

  log_success "Deployment snapshot saved"
}

deploy_services() {
  mapfile -t services < <(get_app_services)

  log_info "Deploying stack=$STACK runtime=$ENVIRONMENT"

  if [[ "${#services[@]}" -eq 0 ]]; then
    log_error "No application services defined for stack: $STACK"
    exit 1
  fi

  run_compose up -d "${services[@]}"
  log_success "Compose deployment started"
}

stop_services() {
  log_info "Stopping stack=$STACK"
  run_compose down --remove-orphans
  log_success "Services stopped"
}

restart_services() {
  mapfile -t services < <(get_app_services)
  log_info "Restarting stack=$STACK"
  run_compose restart "${services[@]}"
  log_success "Services restarted"
}

show_status() {
  log_info "Current container status"
  run_compose ps
}

show_logs() {
  mapfile -t services < <(get_app_services)
  run_compose logs -f "${services[@]}"
}

wait_for_service() {
  local service="$1"
  local port="$2"
  local elapsed=0
  local api_url="http://127.0.0.1:${port}/api/system/health"

  log_info "Waiting for $service on $api_url"

  while [[ "$elapsed" -lt "$HEALTH_CHECK_TIMEOUT" ]]; do
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "Would run health check: $api_url"
      return 0
    fi

    if curl -fsS "$api_url" >/dev/null 2>&1 && check_frontend_route "$port"; then
      log_success "$service passed health check"
      return 0
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  log_error "$service did not become healthy and serve the frontend within ${HEALTH_CHECK_TIMEOUT}s"
  return 1
}

health_check() {
  mapfile -t services < <(get_app_services)

  for service in "${services[@]}"; do
    wait_for_service "$service" "$(get_service_port "$service")"
  done

  log_success "All health checks passed"
}

rollback() {
  local latest_backup
  latest_backup="$(ls -td "$PROJECT_DIR"/backups/deploy/*/ 2>/dev/null | head -1 || true)"

  if [[ -z "$latest_backup" ]]; then
    log_error "No deployment snapshot found"
    exit 1
  fi

  log_warn "Rollback replays the latest stack settings but cannot downgrade mutable image tags."
  log_info "Using snapshot: $latest_backup"

  if [[ -f "${latest_backup%/}/runtime.env" ]]; then
    # shellcheck disable=SC1090
    . "${latest_backup%/}/runtime.env"
  fi

  ensure_image_available
  stop_services
  deploy_services
  health_check
}

main() {
  local command="deploy"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -e|--env)
        ENVIRONMENT="$2"
        shift 2
        ;;
      -s|--stack)
        STACK="$2"
        shift 2
        ;;
      -p|--profile)
        PROFILE_ARGS+=("$2")
        shift 2
        ;;
      -b|--build)
        BUILD_LOCAL=true
        shift
        ;;
      -l|--pull)
        PULL_LATEST=true
        shift
        ;;
      -B|--backup)
        BACKUP_BEFORE=true
        shift
        ;;
      -t|--timeout)
        HEALTH_CHECK_TIMEOUT="$2"
        shift 2
        ;;
      -n|--dry-run)
        DRY_RUN=true
        shift
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      deploy|stop|restart|status|logs|backup|rollback|health)
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

  if [[ ! "$ENVIRONMENT" =~ ^(shadow|live|dev)$ ]]; then
    log_error "Invalid runtime mode: $ENVIRONMENT"
    exit 1
  fi

  if [[ ! "$STACK" =~ ^(single|multi)$ ]]; then
    log_error "Invalid stack: $STACK"
    exit 1
  fi

  cd "$PROJECT_DIR"

  case "$command" in
    deploy)
      check_requirements
      check_directories
      create_backup
      pull_image
      build_image
      ensure_image_available
      deploy_services
      health_check
      ;;
    stop)
      check_requirements
      stop_services
      ;;
    restart)
      check_requirements
      restart_services
      health_check
      ;;
    status)
      check_requirements
      show_status
      ;;
    logs)
      check_requirements
      show_logs
      ;;
    backup)
      check_requirements
      BACKUP_BEFORE=true
      create_backup
      ;;
    rollback)
      check_requirements
      rollback
      ;;
    health)
      check_requirements
      health_check
      ;;
  esac
}

main "$@"
