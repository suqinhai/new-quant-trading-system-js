#!/bin/bash
# ============================================================================
# 批量启动/停止所有策略容器
# Usage: ./start-all-strategies.sh [up|down|logs|ps|restart]
# ============================================================================

ACTION=${1:-up}

# 策略列表 (根据需要增删)
# STRATEGIES=(
#     SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime
#     OrderFlow MultiTimeframe CrossExchangeSpread StatisticalArbitrage
#     Adaptive RiskDriven FundingArb BollingerBands MomentumRank
#     Rotation FundingRateExtreme CrossSectional Grid RegimeSwitching
#     SignalWeighting
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

for i in "${!STRATEGIES[@]}"; do
    s="${STRATEGIES[$i]}"
    s_lower="${s,,}"  # 转小写
    PORT=$((BASE_PORT + i))
    METRICS_PORT=$((BASE_METRICS + i))
    WS_PORT=$((BASE_WS + i))

    case "$ACTION" in
        up)
            echo "[$i] Starting $s on ports $PORT/$METRICS_PORT/$WS_PORT"
            STRATEGY_NAME=$s PORT=$PORT METRICS_PORT=$METRICS_PORT WS_PORT=$WS_PORT \
                docker compose -f docker-compose.single-strategy.yml -p "quant-$s_lower" up -d
            ;;
        down)
            echo "[$i] Stopping $s"
            docker compose -f docker-compose.single-strategy.yml -p "quant-$s_lower" down
            ;;
        restart)
            echo "[$i] Restarting $s"
            docker compose -f docker-compose.single-strategy.yml -p "quant-$s_lower" down
            STRATEGY_NAME=$s PORT=$PORT METRICS_PORT=$METRICS_PORT WS_PORT=$WS_PORT \
                docker compose -f docker-compose.single-strategy.yml -p "quant-$s_lower" up -d
            ;;
        logs)
            echo "=== Logs for $s ==="
            docker compose -f docker-compose.single-strategy.yml -p "quant-$s_lower" logs --tail 20
            ;;
        ps)
            docker compose -f docker-compose.single-strategy.yml -p "quant-$s_lower" ps
            ;;
        *)
            echo "Usage: $0 [up|down|restart|logs|ps]"
            exit 1
            ;;
    esac
done

echo ""
echo "Done! Action: $ACTION"
