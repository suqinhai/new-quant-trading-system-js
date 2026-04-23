#!/bin/bash
# ============================================================================
# start-all-strategies.sh
# Start or stop multiple single-strategy containers with shared services.
# ============================================================================

set -euo pipefail

ACTION="${1:-up}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.single-strategy.yml"
ENV_FILE="$PROJECT_DIR/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RUN_MODE="${RUN_MODE:-shadow}"
USE_SHARED_MARKET="${USE_SHARED_MARKET:-true}"
USE_SHARED_NOTIFICATION="${USE_SHARED_NOTIFICATION:-true}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-120}"

# Host-network strategy ports must stay above 1024 because the runtime
# container runs as a non-root user.
BASE_HTTP_PORT=13000
BASE_METRICS_PORT=19000
BASE_WS_PORT=18000

STRATEGIES=(
  SMA
  RSI
  MACD
  ATRBreakout
  BollingerWidth
  VolatilityRegime
  OrderFlow
  MultiTimeframe
  CrossExchangeSpread
  StatisticalArbitrage
)

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
Usage: ./start-all-strategies.sh [up|down|restart|logs|ps|status]

Actions:
  up       Start shared services and all strategy containers
  down     Stop all strategy containers and shared services
  restart  Restart all strategy containers
  logs     Tail recent logs for each strategy container
  ps       Show compose status for each strategy container
  status   Show shared-service and strategy summary

Environment:
  RUN_MODE=shadow|live|dev
  USE_SHARED_MARKET=true|false
  USE_SHARED_NOTIFICATION=true|false
  HEALTH_CHECK_TIMEOUT=<seconds>
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
  if [[ "${ENABLE_API:-true}" == "false" ]]; then
    log_error "ENABLE_API=false is incompatible with strategy health checks"
    exit 1
  fi

  local jwt_secret="${JWT_SECRET:-}"
  local dashboard_password="${DASHBOARD_PASSWORD:-}"

  if [[ -z "$jwt_secret" || "$jwt_secret" == "your-secret-key" ]]; then
    log_error "JWT_SECRET must be configured before starting strategy containers"
    exit 1
  fi

  if [[ -z "$dashboard_password" \
    || "$dashboard_password" == "your_secure_password_here" \
    || "$dashboard_password" == "admin123" ]]; then
    log_error "DASHBOARD_PASSWORD must be configured before starting strategy containers"
    exit 1
  fi
}

wait_for_container_health() {
  local container_name="$1"
  local timeout="${2:-60}"
  local elapsed=0

  while [[ "$elapsed" -lt "$timeout" ]]; do
    local status
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || true)"

    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      return 0
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  return 1
}

wait_for_strategy_health() {
  local strategy_name="$1"
  local http_port="$2"
  local elapsed=0
  local url="http://127.0.0.1:${http_port}/api/system/health"

  log_info "Waiting for $strategy_name on $url"

  while [[ "$elapsed" -lt "$HEALTH_CHECK_TIMEOUT" ]]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log_success "$strategy_name is healthy"
      return 0
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  log_error "$strategy_name did not become healthy within ${HEALTH_CHECK_TIMEOUT}s"
  return 1
}

start_shared_services() {
  if [[ "$USE_SHARED_MARKET" == "true" ]]; then
    if docker ps --format '{{.Names}}' | grep -qx 'quant-market-data'; then
      log_success "Shared market-data service already running"
    else
      log_info "Starting shared market-data service"
      docker compose -f "$COMPOSE_FILE" --profile market-data up -d market-data-service

      if wait_for_container_health "quant-market-data" 60; then
        log_success "Shared market-data service is ready"
      else
        log_error "Shared market-data service failed health check"
        exit 1
      fi
    fi
  fi

  if [[ "$USE_SHARED_NOTIFICATION" == "true" ]]; then
    if docker ps --format '{{.Names}}' | grep -qx 'quant-notification'; then
      log_success "Shared notification service already running"
    else
      log_info "Starting shared notification service"
      docker compose -f "$COMPOSE_FILE" --profile notification up -d notification-service

      if wait_for_container_health "quant-notification" 60; then
        log_success "Shared notification service is ready"
      else
        log_error "Shared notification service failed health check"
        exit 1
      fi
    fi
  fi
}

stop_shared_services() {
  if docker ps -a --format '{{.Names}}' | grep -qx 'quant-market-data'; then
    docker stop quant-market-data >/dev/null 2>&1 || true
    docker rm quant-market-data >/dev/null 2>&1 || true
  fi

  if docker ps -a --format '{{.Names}}' | grep -qx 'quant-notification'; then
    docker stop quant-notification >/dev/null 2>&1 || true
    docker rm quant-notification >/dev/null 2>&1 || true
  fi

  log_success "Shared services stopped"
}

run_strategy_compose() {
  local strategy_name="$1"
  local http_port="$2"
  local metrics_port="$3"
  local ws_port="$4"
  shift 4

  local project_name="quant-${strategy_name,,}"

  RUN_MODE="$RUN_MODE" \
  STRATEGY_NAME="$strategy_name" \
  INSTANCE_NAME="${strategy_name,,}" \
  PORT="$http_port" \
  HTTP_PORT="$http_port" \
  METRICS_PORT="$metrics_port" \
  WS_PORT="$ws_port" \
  USE_SHARED_MARKET_DATA="$USE_SHARED_MARKET" \
  USE_SHARED_NOTIFICATION="$USE_SHARED_NOTIFICATION" \
  docker compose -f "$COMPOSE_FILE" -p "$project_name" "$@"
}

show_status() {
  echo "========================================"
  echo "Shared Services"
  echo "========================================"
  if docker ps --format '{{.Names}}' | grep -qx 'quant-market-data'; then
    echo "market-data: running"
  else
    echo "market-data: stopped"
  fi

  if docker ps --format '{{.Names}}' | grep -qx 'quant-notification'; then
    echo "notification: running"
  else
    echo "notification: stopped"
  fi

  echo
  echo "========================================"
  echo "Strategy Containers"
  echo "========================================"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'quant-|NAMES' || true
}

main() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Compose file not found: $COMPOSE_FILE"
    exit 1
  fi

  if [[ ! "$ACTION" =~ ^(up|down|restart|logs|ps|status)$ ]]; then
    show_help
    exit 1
  fi

  cd "$PROJECT_DIR"
  load_env_file

  if [[ "$ACTION" == "up" || "$ACTION" == "restart" ]]; then
    validate_runtime_env
  fi

  if [[ "$ACTION" == "up" ]]; then
    start_shared_services
  fi

  for i in "${!STRATEGIES[@]}"; do
    strategy_name="${STRATEGIES[$i]}"
    http_port=$((BASE_HTTP_PORT + i))
    metrics_port=$((BASE_METRICS_PORT + i))
    ws_port=$((BASE_WS_PORT + i))

    case "$ACTION" in
      up)
        log_info "Starting $strategy_name on ports $http_port/$metrics_port/$ws_port"
        run_strategy_compose "$strategy_name" "$http_port" "$metrics_port" "$ws_port" up -d quant-single
        wait_for_strategy_health "$strategy_name" "$http_port"
        ;;
      down)
        log_info "Stopping $strategy_name"
        run_strategy_compose "$strategy_name" "$http_port" "$metrics_port" "$ws_port" down --remove-orphans
        ;;
      restart)
        log_info "Restarting $strategy_name"
        run_strategy_compose "$strategy_name" "$http_port" "$metrics_port" "$ws_port" down --remove-orphans
        run_strategy_compose "$strategy_name" "$http_port" "$metrics_port" "$ws_port" up -d quant-single
        wait_for_strategy_health "$strategy_name" "$http_port"
        ;;
      logs)
        echo "=== Logs for $strategy_name ==="
        run_strategy_compose "$strategy_name" "$http_port" "$metrics_port" "$ws_port" logs --tail 50 quant-single
        ;;
      ps)
        run_strategy_compose "$strategy_name" "$http_port" "$metrics_port" "$ws_port" ps
        ;;
      status)
        ;;
    esac
  done

  if [[ "$ACTION" == "down" ]]; then
    stop_shared_services
  fi

  if [[ "$ACTION" == "status" ]]; then
    show_status
  else
    log_success "Done: $ACTION"
  fi
}

main
