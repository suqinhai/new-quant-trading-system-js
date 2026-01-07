#!/bin/bash
# ============================================================================
# 批量启动/停止所有策略容器
# Usage: ./start-all-strategies.sh [up|down|logs|ps|restart]
# ============================================================================

ACTION=${1:-up}

# 策略列表 (根据需要增删)


# STRATEGIES=(SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime OrderFlow MultiTimeframe CrossExchangeSpread StatisticalArbitrage Adaptive RiskDriven FundingArb BollingerBands MomentumRank Rotation FundingRateExtreme CrossSectional Grid RegimeSwitching SignalWeighting)

STRATEGIES=(
    SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime
)

# 端口基数 (每个策略递增)
BASE_PORT=3000
BASE_METRICS=9100
BASE_WS=8000

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
            docker logs --tail 20 "quant-$s_lower" 2>/dev/null
            ;;
        ps)
            docker ps --filter "name=quant-$s_lower" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
            ;;
        *)
            echo "Usage: $0 [up|down|restart|logs|ps]"
            exit 1
            ;;
    esac
done

echo ""
echo "Done! Action: $ACTION"
