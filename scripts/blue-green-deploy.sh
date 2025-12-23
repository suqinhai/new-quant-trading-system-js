#!/bin/bash
# =============================================================================
# blue-green-deploy.sh - Blue-Green Deployment Strategy
# Zero-downtime deployment with instant rollback capability
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$PROJECT_DIR/.blue-green-state"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Deployment configuration
BLUE_PORT=3000
GREEN_PORT=3001
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=5
SWITCH_DELAY=10
DRY_RUN=false

# =============================================================================
# Helper Functions
# =============================================================================
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

log_blue() {
    echo -e "${CYAN}[BLUE]${NC} $1"
}

log_green() {
    echo -e "${GREEN}[GREEN]${NC} $1"
}

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] COMMAND

Blue-Green deployment script for Quant Trading System.
Provides zero-downtime deployments with instant rollback.

Commands:
    deploy      Deploy new version using blue-green strategy
    switch      Switch traffic between blue and green
    rollback    Rollback to previous version (instant)
    status      Show current deployment status
    cleanup     Remove inactive environment

Options:
    -t, --timeout SEC   Health check timeout (default: 150s)
    -n, --dry-run       Show what would be done
    -h, --help          Show this help message

How it works:
    1. Current "active" environment serves traffic (e.g., BLUE on port 3000)
    2. New version deploys to "inactive" environment (e.g., GREEN on port 3001)
    3. Health checks verify new version is working
    4. Traffic switches to new version (GREEN becomes active)
    5. Old version (BLUE) remains for instant rollback

Examples:
    $(basename "$0") deploy              # Deploy new version
    $(basename "$0") status              # Check current state
    $(basename "$0") rollback            # Instant rollback
    $(basename "$0") switch              # Manual traffic switch

EOF
}

# =============================================================================
# State Management
# =============================================================================
get_active_env() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    else
        echo "blue"
    fi
}

set_active_env() {
    echo "$1" > "$STATE_FILE"
    log_info "Active environment set to: $1"
}

get_inactive_env() {
    local active=$(get_active_env)
    if [[ "$active" == "blue" ]]; then
        echo "green"
    else
        echo "blue"
    fi
}

get_port() {
    local env=$1
    if [[ "$env" == "blue" ]]; then
        echo "$BLUE_PORT"
    else
        echo "$GREEN_PORT"
    fi
}

# =============================================================================
# Docker Functions
# =============================================================================
get_container_name() {
    local env=$1
    echo "quant-trading-$env"
}

is_container_running() {
    local container=$1
    docker ps --format '{{.Names}}' | grep -q "^${container}$"
}

start_environment() {
    local env=$1
    local port=$(get_port "$env")
    local container=$(get_container_name "$env")

    log_info "Starting $env environment on port $port..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would start container: $container"
        return 0
    fi

    # Create custom compose override for this environment
    local override_file="$PROJECT_DIR/docker-compose.$env.yml"

    cat > "$override_file" << EOF
version: '3.8'

services:
  quant-$env:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    image: quant-trading-system:latest
    container_name: $container
    restart: unless-stopped
    ports:
      - "$port:3000"
      - "$((port + 6090)):9091"
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
      - ./config:/app/config:ro
      - ./.env:/app/.env:ro
    environment:
      - NODE_ENV=production
      - RUN_MODE=live
      - LOG_LEVEL=info
      - REDIS_HOST=redis-master
      - REDIS_PORT=6379
      - CLICKHOUSE_HOST=clickhouse
      - CLICKHOUSE_PORT=8123
      - DEPLOYMENT_ENV=$env
    depends_on:
      redis-master:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - quant-network
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2.0'
EOF

    # Start the environment
    docker compose -f "$COMPOSE_FILE" -f "$override_file" up -d "quant-$env"

    log_success "$env environment started"
}

stop_environment() {
    local env=$1
    local container=$(get_container_name "$env")

    log_info "Stopping $env environment..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would stop container: $container"
        return 0
    fi

    if is_container_running "$container"; then
        docker stop "$container" || true
        docker rm "$container" || true
        log_success "$env environment stopped"
    else
        log_info "$env environment not running"
    fi
}

# =============================================================================
# Health Check Functions
# =============================================================================
health_check() {
    local env=$1
    local port=$(get_port "$env")
    local retries=$HEALTH_CHECK_RETRIES
    local interval=$HEALTH_CHECK_INTERVAL

    log_info "Running health checks for $env environment (port $port)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would check health at http://localhost:$port/health"
        return 0
    fi

    local count=0
    while [[ $count -lt $retries ]]; do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "Health check passed for $env environment"
            return 0
        fi

        count=$((count + 1))
        log_info "Health check attempt $count/$retries..."
        sleep "$interval"
    done

    log_error "Health check failed for $env environment after $retries attempts"
    return 1
}

# =============================================================================
# Traffic Management
# =============================================================================
switch_traffic() {
    local target=$1
    local port=$(get_port "$target")

    log_info "Switching traffic to $target environment (port $port)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would switch traffic to $target"
        return 0
    fi

    # Update nginx/load balancer configuration
    # This is a placeholder - implement based on your infrastructure
    #
    # Example for nginx:
    # sed -i "s/proxy_pass http:\/\/localhost:[0-9]*/proxy_pass http:\/\/localhost:$port/" /etc/nginx/sites-enabled/quant-trading
    # nginx -s reload

    # For local development/testing, we update the state file
    set_active_env "$target"

    log_success "Traffic switched to $target environment"
}

# =============================================================================
# Commands
# =============================================================================
cmd_deploy() {
    log_info "Starting blue-green deployment..."

    local active=$(get_active_env)
    local inactive=$(get_inactive_env)

    log_info "Current active: $active"
    log_info "Deploying to: $inactive"

    # Step 1: Stop any existing inactive environment
    stop_environment "$inactive"

    # Step 2: Build/pull latest image
    log_info "Pulling latest images..."
    if [[ "$DRY_RUN" != "true" ]]; then
        docker compose -f "$COMPOSE_FILE" pull 2>/dev/null || true
        docker compose -f "$COMPOSE_FILE" build quant-shadow 2>/dev/null || true
    fi

    # Step 3: Start new version in inactive environment
    start_environment "$inactive"

    # Step 4: Wait for new version to be ready
    sleep 30  # Initial startup time

    # Step 5: Run health checks
    if ! health_check "$inactive"; then
        log_error "Deployment failed - new version unhealthy"
        log_info "Rolling back..."
        stop_environment "$inactive"
        exit 1
    fi

    # Step 6: Switch traffic
    log_info "Waiting ${SWITCH_DELAY}s before switching traffic..."
    sleep "$SWITCH_DELAY"

    switch_traffic "$inactive"

    # Deployment complete
    echo ""
    log_success "=========================================="
    log_success "Blue-Green Deployment Complete!"
    log_success "=========================================="
    log_success "Active environment: $inactive"
    log_success "Standby environment: $active"
    log_success ""
    log_info "To rollback: $(basename "$0") rollback"
}

cmd_switch() {
    local active=$(get_active_env)
    local inactive=$(get_inactive_env)

    log_info "Manual traffic switch requested"
    log_info "Current active: $active"
    log_info "Switching to: $inactive"

    # Verify inactive environment is healthy
    if ! health_check "$inactive"; then
        log_error "Cannot switch - $inactive environment unhealthy"
        exit 1
    fi

    switch_traffic "$inactive"
    log_success "Traffic switched to $inactive"
}

cmd_rollback() {
    local active=$(get_active_env)
    local inactive=$(get_inactive_env)

    log_info "=========================================="
    log_info "Initiating instant rollback"
    log_info "=========================================="
    log_info "Current active: $active"
    log_info "Rolling back to: $inactive"

    # Verify inactive environment is still available
    local container=$(get_container_name "$inactive")
    if ! is_container_running "$container"; then
        log_error "Rollback target ($inactive) is not running!"
        log_info "Attempting to start $inactive environment..."
        start_environment "$inactive"
        sleep 30
    fi

    # Verify health
    if ! health_check "$inactive"; then
        log_error "Cannot rollback - $inactive environment unhealthy"
        exit 1
    fi

    # Switch traffic immediately
    switch_traffic "$inactive"

    echo ""
    log_success "=========================================="
    log_success "Rollback Complete!"
    log_success "=========================================="
    log_success "Active environment: $inactive"
    log_success "Previous version ($active) still available"
}

cmd_status() {
    local active=$(get_active_env)
    local inactive=$(get_inactive_env)
    local blue_container=$(get_container_name "blue")
    local green_container=$(get_container_name "green")

    echo ""
    echo "========================================"
    echo "Blue-Green Deployment Status"
    echo "========================================"
    echo ""
    printf "%-20s %s\n" "Active Environment:" "$active"
    printf "%-20s %s\n" "Standby Environment:" "$inactive"
    echo ""
    echo "Environment Status:"
    echo "-------------------"

    # Blue status
    if is_container_running "$blue_container"; then
        local blue_status="RUNNING"
        if [[ "$active" == "blue" ]]; then
            blue_status="RUNNING (ACTIVE)"
        fi
        log_blue "BLUE (port $BLUE_PORT): $blue_status"
    else
        log_blue "BLUE (port $BLUE_PORT): STOPPED"
    fi

    # Green status
    if is_container_running "$green_container"; then
        local green_status="RUNNING"
        if [[ "$active" == "green" ]]; then
            green_status="RUNNING (ACTIVE)"
        fi
        log_green "GREEN (port $GREEN_PORT): $green_status"
    else
        log_green "GREEN (port $GREEN_PORT): STOPPED"
    fi

    echo ""
    echo "Quick Actions:"
    echo "--------------"
    echo "  Deploy new version:  $(basename "$0") deploy"
    echo "  Switch traffic:      $(basename "$0") switch"
    echo "  Rollback:            $(basename "$0") rollback"
    echo ""
}

cmd_cleanup() {
    local inactive=$(get_inactive_env)

    log_info "Cleaning up inactive environment: $inactive"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would stop and remove $inactive environment"
        return 0
    fi

    stop_environment "$inactive"

    # Remove override file
    local override_file="$PROJECT_DIR/docker-compose.$inactive.yml"
    if [[ -f "$override_file" ]]; then
        rm "$override_file"
    fi

    log_success "Cleanup complete"
}

# =============================================================================
# Main Script
# =============================================================================
main() {
    local command=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--timeout)
                HEALTH_CHECK_RETRIES=$(($2 / HEALTH_CHECK_INTERVAL))
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

    # Change to project directory
    cd "$PROJECT_DIR"

    # Execute command
    case $command in
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
