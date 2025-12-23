#!/bin/bash
# =============================================================================
# deploy.sh - Automated Deployment Script
# Quant Trading System
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
ENV_FILE="$PROJECT_DIR/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="shadow"
PROFILE=""
PULL_LATEST=false
BUILD_LOCAL=false
BACKUP_BEFORE=false
HEALTH_CHECK_TIMEOUT=120
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

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [COMMAND]

Automated deployment script for Quant Trading System.

Commands:
    deploy      Deploy the application (default)
    stop        Stop running services
    restart     Restart services
    status      Show service status
    logs        Show service logs
    backup      Create backup before deployment
    rollback    Rollback to previous version
    health      Check service health

Options:
    -e, --env ENV       Environment: shadow (default), live, dev
    -p, --profile PROF  Docker Compose profile: ha, monitoring, tools
    -b, --build         Build images locally before deploy
    -l, --pull          Pull latest images before deploy
    -B, --backup        Create backup before deployment
    -t, --timeout SEC   Health check timeout (default: 120)
    -n, --dry-run       Show what would be done without executing
    -h, --help          Show this help message

Examples:
    $(basename "$0") deploy -e shadow          # Deploy shadow mode
    $(basename "$0") deploy -e live -B         # Deploy live mode with backup
    $(basename "$0") deploy -p ha -p monitoring # Deploy with HA and monitoring
    $(basename "$0") stop                       # Stop all services
    $(basename "$0") logs -e shadow            # View shadow mode logs

EOF
}

# =============================================================================
# Validation Functions
# =============================================================================
check_requirements() {
    log_info "Checking requirements..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    # Check compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "docker-compose.yml not found at $COMPOSE_FILE"
        exit 1
    fi

    # Check env file
    if [[ ! -f "$ENV_FILE" ]]; then
        log_warn ".env file not found. Using defaults."
    fi

    log_success "All requirements met"
}

check_directories() {
    log_info "Ensuring required directories exist..."

    local dirs=(
        "$PROJECT_DIR/data/redis-master"
        "$PROJECT_DIR/data/redis-replica1"
        "$PROJECT_DIR/data/redis-replica2"
        "$PROJECT_DIR/data/clickhouse"
        "$PROJECT_DIR/logs"
        "$PROJECT_DIR/logs/clickhouse"
        "$PROJECT_DIR/backups/redis"
        "$PROJECT_DIR/config"
    )

    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    done

    log_success "All directories ready"
}

# =============================================================================
# Service Functions
# =============================================================================
get_service_name() {
    case "$ENVIRONMENT" in
        shadow) echo "quant-shadow" ;;
        live)   echo "quant-live" ;;
        dev)    echo "quant-dev" ;;
        *)      echo "quant-shadow" ;;
    esac
}

build_compose_args() {
    local args="-f $COMPOSE_FILE"

    # Add profiles based on environment
    case "$ENVIRONMENT" in
        live)
            args="$args --profile live"
            ;;
        dev)
            args="$args --profile dev"
            ;;
    esac

    # Add additional profiles
    if [[ -n "$PROFILE" ]]; then
        for p in $PROFILE; do
            args="$args --profile $p"
        done
    fi

    echo "$args"
}

pull_images() {
    if [[ "$PULL_LATEST" == "true" ]]; then
        log_info "Pulling latest images..."
        local compose_args=$(build_compose_args)

        if [[ "$DRY_RUN" == "true" ]]; then
            echo "Would run: docker compose $compose_args pull"
        else
            docker compose $compose_args pull
        fi
    fi
}

build_images() {
    if [[ "$BUILD_LOCAL" == "true" ]]; then
        log_info "Building images locally..."
        local compose_args=$(build_compose_args)

        if [[ "$DRY_RUN" == "true" ]]; then
            echo "Would run: docker compose $compose_args build"
        else
            docker compose $compose_args build
        fi
    fi
}

create_backup() {
    if [[ "$BACKUP_BEFORE" == "true" ]]; then
        log_info "Creating backup..."
        local backup_dir="$PROJECT_DIR/backups/$(date +%Y%m%d_%H%M%S)"

        if [[ "$DRY_RUN" == "true" ]]; then
            echo "Would create backup at: $backup_dir"
        else
            mkdir -p "$backup_dir"

            # Backup Redis data
            if docker exec quant-redis-master redis-cli BGSAVE 2>/dev/null; then
                sleep 2
                docker cp quant-redis-master:/data/dump.rdb "$backup_dir/" 2>/dev/null || true
            fi

            # Backup current version info
            echo "Backup created at: $(date)" > "$backup_dir/backup-info.txt"
            docker compose ps > "$backup_dir/services-state.txt" 2>/dev/null || true

            log_success "Backup created at: $backup_dir"
        fi
    fi
}

deploy_services() {
    log_info "Deploying services ($ENVIRONMENT mode)..."
    local compose_args=$(build_compose_args)
    local service=$(get_service_name)

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would run: docker compose $compose_args up -d $service"
    else
        # Start infrastructure first
        log_info "Starting infrastructure services..."
        docker compose $compose_args up -d redis-master clickhouse

        # Wait for infrastructure
        log_info "Waiting for infrastructure to be ready..."
        wait_for_service "redis-master" 60
        wait_for_service "clickhouse" 60

        # Start application
        log_info "Starting application service..."
        docker compose $compose_args up -d $service

        log_success "Deployment initiated"
    fi
}

wait_for_service() {
    local service=$1
    local timeout=${2:-60}
    local elapsed=0

    log_info "Waiting for $service to be healthy..."

    while [[ $elapsed -lt $timeout ]]; do
        if docker compose ps "$service" 2>/dev/null | grep -q "healthy"; then
            log_success "$service is healthy"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done

    log_warn "$service did not become healthy within ${timeout}s"
    return 1
}

health_check() {
    local service=$(get_service_name)
    local timeout=$HEALTH_CHECK_TIMEOUT
    local elapsed=0

    log_info "Running health check (timeout: ${timeout}s)..."

    while [[ $elapsed -lt $timeout ]]; do
        # Check container status
        if docker compose ps "$service" 2>/dev/null | grep -q "healthy"; then
            log_success "Service is healthy"
            return 0
        fi

        # Try HTTP health check
        if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
            log_success "HTTP health check passed"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
        log_info "Health check in progress... (${elapsed}s/${timeout}s)"
    done

    log_error "Health check failed after ${timeout}s"
    return 1
}

stop_services() {
    log_info "Stopping services..."
    local compose_args=$(build_compose_args)

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would run: docker compose $compose_args down"
    else
        docker compose $compose_args down
        log_success "Services stopped"
    fi
}

restart_services() {
    log_info "Restarting services..."
    local compose_args=$(build_compose_args)
    local service=$(get_service_name)

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would run: docker compose $compose_args restart $service"
    else
        docker compose $compose_args restart $service
        log_success "Services restarted"
    fi
}

show_status() {
    log_info "Service status:"
    local compose_args=$(build_compose_args)
    docker compose $compose_args ps
}

show_logs() {
    local compose_args=$(build_compose_args)
    local service=$(get_service_name)
    docker compose $compose_args logs -f $service
}

rollback() {
    log_info "Rolling back to previous version..."

    # Find latest backup
    local latest_backup=$(ls -td "$PROJECT_DIR/backups"/*/ 2>/dev/null | head -1)

    if [[ -z "$latest_backup" ]]; then
        log_error "No backup found for rollback"
        exit 1
    fi

    log_info "Found backup: $latest_backup"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would rollback using backup: $latest_backup"
    else
        # Stop current services
        stop_services

        # Restore Redis data if backup exists
        if [[ -f "$latest_backup/dump.rdb" ]]; then
            log_info "Restoring Redis data..."
            docker cp "$latest_backup/dump.rdb" quant-redis-master:/data/
        fi

        # Restart services
        deploy_services

        log_success "Rollback completed"
    fi
}

# =============================================================================
# Main Script
# =============================================================================
main() {
    local command="deploy"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -p|--profile)
                PROFILE="$PROFILE $2"
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

    # Validate environment
    if [[ ! "$ENVIRONMENT" =~ ^(shadow|live|dev)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    fi

    # Change to project directory
    cd "$PROJECT_DIR"

    # Execute command
    case $command in
        deploy)
            check_requirements
            check_directories
            create_backup
            pull_images
            build_images
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
            show_status
            ;;
        logs)
            show_logs
            ;;
        backup)
            BACKUP_BEFORE=true
            create_backup
            ;;
        rollback)
            check_requirements
            rollback
            ;;
        health)
            health_check
            ;;
    esac
}

main "$@"
