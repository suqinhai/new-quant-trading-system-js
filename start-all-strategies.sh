#!/bin/bash
# ============================================================================
# 批量启动/停止所有策略容器 (支持共享行情和通知服务)
# Usage: ./start-all-strategies.sh [up|down|logs|ps|restart|status]
# ============================================================================

ACTION=${1:-up}

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# 策略列表 (根据需要增删)
# STRATEGIES=(
#     SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime
#     OrderFlow MultiTimeframe CrossExchangeSpread StatisticalArbitrage
#     Adaptive RiskDriven FundingArb BollingerBands MomentumRank
#     Rotation FundingRateExtreme CrossSectional Grid RegimeSwitching
#     SignalWeighting
# )

# STRATEGIES=(
#     SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime
#     OrderFlow MultiTimeframe CrossExchangeSpread StatisticalArbitrage
# )

STRATEGIES=(
    SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime
)

# 端口基数 (单策略专用端口段)
# 单策略 PORT: 1000+, METRICS: 3000+, WS: 5000+
# 多策略 PORT: 2000+, METRICS: 4000+, WS: 6000+
BASE_PORT=1000
BASE_METRICS=3000
BASE_WS=5000

# 共享服务配置
COMPOSE_FILE="docker-compose.single-strategy.yml"
USE_SHARED_MARKET=${USE_SHARED_MARKET:-true}
USE_SHARED_NOTIFICATION=${USE_SHARED_NOTIFICATION:-true}

# ============================================================================
# 共享服务管理函数
# ============================================================================

check_market_service() {
    if docker ps --format '{{.Names}}' | grep -q "quant-market-data"; then
        return 0
    fi
    return 1
}

check_notification_service() {
    if docker ps --format '{{.Names}}' | grep -q "quant-notification"; then
        return 0
    fi
    return 1
}

start_shared_services() {
    log_info "检查并启动共享服务..."

    # 启动行情服务
    if [ "$USE_SHARED_MARKET" = "true" ]; then
        if check_market_service; then
            log_success "行情服务已在运行"
        else
            log_info "启动共享行情服务..."
            docker compose -f "$COMPOSE_FILE" --profile market-data up -d market-data-service

            # 等待服务就绪
            log_info "等待行情服务就绪..."
            for i in {1..30}; do
                if check_market_service; then
                    log_success "行情服务已就绪"
                    break
                fi
                sleep 2
                echo -n "."
            done
            echo ""
        fi
    fi

    # 启动通知服务
    if [ "$USE_SHARED_NOTIFICATION" = "true" ]; then
        if check_notification_service; then
            log_success "通知服务已在运行"
        else
            log_info "启动共享通知服务..."
            docker compose -f "$COMPOSE_FILE" --profile notification up -d notification-service

            # 等待服务就绪
            log_info "等待通知服务就绪..."
            for i in {1..30}; do
                if check_notification_service; then
                    log_success "通知服务已就绪"
                    break
                fi
                sleep 2
                echo -n "."
            done
            echo ""
        fi
    fi
}

stop_shared_services() {
    log_info "停止共享服务..."

    if check_market_service; then
        log_info "停止行情服务..."
        docker stop quant-market-data 2>/dev/null || true
        docker rm quant-market-data 2>/dev/null || true
    fi

    if check_notification_service; then
        log_info "停止通知服务..."
        docker stop quant-notification 2>/dev/null || true
        docker rm quant-notification 2>/dev/null || true
    fi

    log_success "共享服务已停止"
}

show_status() {
    echo ""
    echo "=== 共享服务状态 ==="
    if check_market_service; then
        echo -e "行情服务: ${GREEN}运行中${NC}"
    else
        echo -e "行情服务: ${RED}未运行${NC}"
    fi

    if check_notification_service; then
        echo -e "通知服务: ${GREEN}运行中${NC}"
    else
        echo -e "通知服务: ${RED}未运行${NC}"
    fi

    echo ""
    echo "=== 策略容器状态 ==="
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "quant-|NAME" || echo "无运行中的策略容器"
    echo ""
}

# ============================================================================
# 主逻辑
# ============================================================================

# 如果是 up 操作，先启动共享服务
if [ "$ACTION" = "up" ]; then
    start_shared_services
fi

for i in "${!STRATEGIES[@]}"; do
    s="${STRATEGIES[$i]}"
    s_lower="${s,,}"  # 转小写
    PORT=$((BASE_PORT + i))
    METRICS_PORT=$((BASE_METRICS + i))
    WS_PORT=$((BASE_WS + i))

    case "$ACTION" in
        up)
            log_info "[$i] Starting $s on ports $PORT/$METRICS_PORT/$WS_PORT"
            STRATEGY_NAME=$s PORT=$PORT METRICS_PORT=$METRICS_PORT WS_PORT=$WS_PORT \
                USE_SHARED_MARKET_DATA=$USE_SHARED_MARKET \
                USE_SHARED_NOTIFICATION=$USE_SHARED_NOTIFICATION \
                docker compose -f "$COMPOSE_FILE" -p "quant-$s_lower" up -d
            ;;
        down)
            log_info "[$i] Stopping $s"
            docker compose -f "$COMPOSE_FILE" -p "quant-$s_lower" down
            ;;
        restart)
            log_info "[$i] Restarting $s"
            docker compose -f "$COMPOSE_FILE" -p "quant-$s_lower" down
            STRATEGY_NAME=$s PORT=$PORT METRICS_PORT=$METRICS_PORT WS_PORT=$WS_PORT \
                USE_SHARED_MARKET_DATA=$USE_SHARED_MARKET \
                USE_SHARED_NOTIFICATION=$USE_SHARED_NOTIFICATION \
                docker compose -f "$COMPOSE_FILE" -p "quant-$s_lower" up -d
            ;;
        logs)
            echo "=== Logs for $s ==="
            docker compose -f "$COMPOSE_FILE" -p "quant-$s_lower" logs --tail 20
            ;;
        ps)
            docker compose -f "$COMPOSE_FILE" -p "quant-$s_lower" ps
            ;;
        status)
            # status 在循环外处理
            ;;
        *)
            echo "Usage: $0 [up|down|restart|logs|ps|status]"
            echo ""
            echo "Options:"
            echo "  up      - 启动共享服务 + 所有策略容器"
            echo "  down    - 停止所有策略容器 + 共享服务"
            echo "  restart - 重启所有策略容器"
            echo "  logs    - 查看所有策略日志"
            echo "  ps      - 查看容器状态"
            echo "  status  - 查看服务状态概览"
            echo ""
            echo "Environment Variables:"
            echo "  USE_SHARED_MARKET=false       禁用共享行情服务"
            echo "  USE_SHARED_NOTIFICATION=false 禁用共享通知服务"
            exit 1
            ;;
    esac
done

# down 操作时停止共享服务
if [ "$ACTION" = "down" ]; then
    stop_shared_services
fi

# status 操作
if [ "$ACTION" = "status" ]; then
    show_status
    exit 0
fi

echo ""
log_success "Done! Action: $ACTION"
