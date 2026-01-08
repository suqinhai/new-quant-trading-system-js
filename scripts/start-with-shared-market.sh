#!/bin/bash
# =============================================================================
# 智能启动脚本 - 支持共享行情服务
# Smart Start Script - With Shared Market Data Service Support
#
# 功能 / Features:
# 1. 自动检测共享行情服务是否已在运行
# 2. 如果未运行，自动启动共享行情服务
# 3. 等待行情服务就绪后再启动策略容器
#
# 使用方法 / Usage:
#   ./scripts/start-with-shared-market.sh [single|multi] [options]
#
# 示例 / Examples:
#   # 启动多策略 (共享行情模式)
#   ./scripts/start-with-shared-market.sh multi
#
#   # 启动单策略 (共享行情模式)
#   STRATEGY_NAME=SMA ./scripts/start-with-shared-market.sh single
#
#   # 强制重启行情服务
#   ./scripts/start-with-shared-market.sh multi --force-restart-market
#
#   # 仅启动行情服务
#   ./scripts/start-with-shared-market.sh market-only
# =============================================================================

set -e

# 颜色定义 / Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数 / Log functions
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

# 打印横幅 / Print banner
print_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     量化交易系统 - 共享行情模式启动脚本                       ║"
    echo "║     Quant Trading System - Shared Market Data Launcher       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# 显示帮助 / Show help
show_help() {
    echo "使用方法 / Usage:"
    echo "  $0 [mode] [options]"
    echo ""
    echo "模式 / Modes:"
    echo "  single         启动单策略 (需要设置 STRATEGY_NAME 环境变量)"
    echo "  multi          启动多策略 (5个策略容器)"
    echo "  market-only    仅启动行情服务"
    echo "  stop           停止所有服务"
    echo "  status         查看服务状态"
    echo ""
    echo "选项 / Options:"
    echo "  --force-restart-market    强制重启行情服务"
    echo "  --no-market               不使用共享行情 (独立模式)"
    echo "  --detach, -d              后台运行"
    echo "  --help, -h                显示帮助"
    echo ""
    echo "环境变量 / Environment Variables:"
    echo "  STRATEGY_NAME             单策略模式时的策略名称"
    echo "  RUN_MODE                  运行模式 (shadow/live)"
    echo "  MARKET_DATA_EXCHANGES     行情服务的交易所列表"
    echo ""
    echo "示例 / Examples:"
    echo "  # 启动多策略"
    echo "  $0 multi"
    echo ""
    echo "  # 启动单策略"
    echo "  STRATEGY_NAME=SMA $0 single"
    echo ""
    echo "  # 仅启动行情服务"
    echo "  $0 market-only"
    echo ""
    echo "  # 停止所有服务"
    echo "  $0 stop"
}

# 检查 Redis 连接 / Check Redis connection
check_redis() {
    log_info "检查 Redis 连接... / Checking Redis connection..."

    if command -v redis-cli &> /dev/null; then
        if redis-cli -h ${REDIS_HOST:-127.0.0.1} -p ${REDIS_PORT:-6379} ping &> /dev/null; then
            log_success "Redis 连接正常 / Redis connection OK"
            return 0
        else
            log_error "Redis 连接失败 / Redis connection failed"
            return 1
        fi
    else
        log_warn "redis-cli 未安装，跳过 Redis 检查 / redis-cli not installed, skipping Redis check"
        return 0
    fi
}

# 检查行情服务是否运行 / Check if market data service is running
check_market_data_service() {
    log_info "检查共享行情服务状态... / Checking shared market data service status..."

    # 方法1: 检查 Docker 容器
    if docker ps --format '{{.Names}}' | grep -q "quant-market-data"; then
        log_success "行情服务容器正在运行 / Market data service container is running"
        return 0
    fi

    # 方法2: 检查 Redis 心跳
    if command -v redis-cli &> /dev/null; then
        local heartbeat=$(redis-cli -h ${REDIS_HOST:-127.0.0.1} -p ${REDIS_PORT:-6379} GET "market:service:heartbeat" 2>/dev/null)
        if [ -n "$heartbeat" ]; then
            # 解析时间戳，检查是否在 30 秒内
            local timestamp=$(echo "$heartbeat" | grep -o '"timestamp":[0-9]*' | grep -o '[0-9]*')
            local now=$(date +%s%3N)
            local age=$((now - timestamp))

            if [ "$age" -lt 30000 ]; then
                log_success "行情服务心跳正常 (${age}ms ago) / Market data service heartbeat OK"
                return 0
            else
                log_warn "行情服务心跳过期 (${age}ms ago) / Market data service heartbeat expired"
                return 1
            fi
        fi
    fi

    log_warn "行情服务未运行 / Market data service is not running"
    return 1
}

# 启动行情服务 / Start market data service
start_market_data_service() {
    local compose_file=$1

    log_info "启动共享行情服务... / Starting shared market data service..."

    # 使用 profile 启动行情服务
    docker compose -f "$compose_file" --profile market-data up -d market-data-service

    # 等待服务就绪
    log_info "等待行情服务就绪... / Waiting for market data service to be ready..."

    local max_wait=60
    local waited=0

    while [ $waited -lt $max_wait ]; do
        if check_market_data_service; then
            log_success "行情服务已就绪 / Market data service is ready"
            return 0
        fi

        sleep 2
        waited=$((waited + 2))
        echo -n "."
    done

    echo ""
    log_error "行情服务启动超时 / Market data service startup timeout"
    return 1
}

# 停止行情服务 / Stop market data service
stop_market_data_service() {
    log_info "停止共享行情服务... / Stopping shared market data service..."

    if docker ps --format '{{.Names}}' | grep -q "quant-market-data"; then
        docker stop quant-market-data
        docker rm quant-market-data 2>/dev/null || true
        log_success "行情服务已停止 / Market data service stopped"
    else
        log_info "行情服务未运行 / Market data service is not running"
    fi
}

# 启动策略容器 / Start strategy containers
start_strategies() {
    local compose_file=$1
    local use_shared_market=$2

    log_info "启动策略容器... / Starting strategy containers..."

    # 设置环境变量
    export USE_SHARED_MARKET_DATA="$use_shared_market"

    # 启动策略容器 (不包括 market-data profile)
    docker compose -f "$compose_file" up -d

    log_success "策略容器已启动 / Strategy containers started"
}

# 停止所有服务 / Stop all services
stop_all() {
    log_info "停止所有服务... / Stopping all services..."

    # 停止单策略
    if [ -f "docker-compose.single-strategy.yml" ]; then
        docker compose -f docker-compose.single-strategy.yml --profile market-data down 2>/dev/null || true
    fi

    # 停止多策略
    if [ -f "docker-compose.multi-strategy.yml" ]; then
        docker compose -f docker-compose.multi-strategy.yml --profile market-data down 2>/dev/null || true
    fi

    log_success "所有服务已停止 / All services stopped"
}

# 显示状态 / Show status
show_status() {
    echo ""
    echo "=== Docker 容器状态 / Docker Container Status ==="
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "quant-|NAME" || echo "无运行中的容器 / No running containers"

    echo ""
    echo "=== 行情服务心跳 / Market Data Service Heartbeat ==="
    if command -v redis-cli &> /dev/null; then
        local heartbeat=$(redis-cli -h ${REDIS_HOST:-127.0.0.1} -p ${REDIS_PORT:-6379} GET "market:service:heartbeat" 2>/dev/null)
        if [ -n "$heartbeat" ]; then
            echo "$heartbeat" | python3 -m json.tool 2>/dev/null || echo "$heartbeat"
        else
            echo "无心跳数据 / No heartbeat data"
        fi
    else
        echo "redis-cli 未安装 / redis-cli not installed"
    fi

    echo ""
}

# 主函数 / Main function
main() {
    print_banner

    local mode="${1:-multi}"
    local force_restart_market=false
    local use_shared_market=true
    local detach=true

    # 解析参数 / Parse arguments
    shift || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force-restart-market)
                force_restart_market=true
                shift
                ;;
            --no-market)
                use_shared_market=false
                shift
                ;;
            -d|--detach)
                detach=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1 / Unknown argument: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 根据模式执行 / Execute based on mode
    case $mode in
        single)
            local compose_file="docker-compose.single-strategy.yml"

            if [ -z "$STRATEGY_NAME" ]; then
                log_error "请设置 STRATEGY_NAME 环境变量 / Please set STRATEGY_NAME environment variable"
                exit 1
            fi

            log_info "模式: 单策略 ($STRATEGY_NAME) / Mode: Single strategy ($STRATEGY_NAME)"

            if [ "$use_shared_market" = true ]; then
                # 检查行情服务
                if [ "$force_restart_market" = true ]; then
                    stop_market_data_service
                fi

                if ! check_market_data_service; then
                    start_market_data_service "$compose_file"
                fi
            fi

            start_strategies "$compose_file" "$use_shared_market"
            ;;

        multi)
            local compose_file="docker-compose.multi-strategy.yml"

            log_info "模式: 多策略 / Mode: Multi strategy"

            if [ "$use_shared_market" = true ]; then
                # 检查行情服务
                if [ "$force_restart_market" = true ]; then
                    stop_market_data_service
                fi

                if ! check_market_data_service; then
                    start_market_data_service "$compose_file"
                fi
            fi

            start_strategies "$compose_file" "$use_shared_market"
            ;;

        market-only)
            log_info "模式: 仅行情服务 / Mode: Market data service only"

            # 优先使用 multi 的配置
            local compose_file="docker-compose.multi-strategy.yml"
            if [ ! -f "$compose_file" ]; then
                compose_file="docker-compose.single-strategy.yml"
            fi

            if [ "$force_restart_market" = true ]; then
                stop_market_data_service
            fi

            start_market_data_service "$compose_file"
            ;;

        stop)
            stop_all
            ;;

        status)
            show_status
            ;;

        *)
            log_error "未知模式: $mode / Unknown mode: $mode"
            show_help
            exit 1
            ;;
    esac

    echo ""
    log_success "完成 / Done"
}

# 执行主函数 / Execute main function
main "$@"
