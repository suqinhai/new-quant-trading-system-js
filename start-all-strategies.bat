@echo off
REM ============================================================================
REM 批量启动/停止所有策略容器
REM Usage: start-all-strategies.bat [up|down|logs|ps]
REM ============================================================================
setlocal enabledelayedexpansion

set ACTION=%1
if "%ACTION%"=="" set ACTION=up

REM 策略列表 (根据需要增删)
#set STRATEGIES=SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime OrderFlow MultiTimeframe CrossExchangeSpread StatisticalArbitrage Adaptive RiskDriven FundingArb BollingerBands MomentumRank Rotation FundingRateExtreme CrossSectional Grid RegimeSwitching SignalWeighting
set STRATEGIES=SMA RSI MACD ATRBreakout BollingerWidth VolatilityRegime OrderFlow MultiTimeframe CrossExchangeSpread StatisticalArbitrage Adaptive RiskDriven FundingArb BollingerBands

REM 端口基数 (每个策略递增)
set BASE_PORT=3000
set BASE_METRICS=9100
set BASE_WS=8000
set /a IDX=0

for %%s in (%STRATEGIES%) do (
    set /a PORT=!BASE_PORT!+!IDX!
    set /a METRICS_PORT=!BASE_METRICS!+!IDX!
    set /a WS_PORT=!BASE_WS!+!IDX!
    set STRATEGY_NAME=%%s

    if "%ACTION%"=="up" (
        echo [!IDX!] Starting %%s on ports !PORT!/!METRICS_PORT!/!WS_PORT!
        cmd /C "set STRATEGY_NAME=%%s&& set PORT=!PORT!&& set METRICS_PORT=!METRICS_PORT!&& set WS_PORT=!WS_PORT!&& docker-compose -f docker-compose.single-strategy.yml -p quant-%%s up -d"
    ) else if "%ACTION%"=="down" (
        echo [!IDX!] Stopping %%s
        docker-compose -f docker-compose.single-strategy.yml -p quant-%%s down
    ) else if "%ACTION%"=="logs" (
        echo === Logs for %%s ===
        docker logs --tail 20 quant-%%s 2>nul
    ) else if "%ACTION%"=="ps" (
        docker ps --filter "name=quant-%%s" --format "table {{.Names}}\t{{.Status}}"
    )

    set /a IDX+=1
)

echo.
echo Done! Action: %ACTION%
