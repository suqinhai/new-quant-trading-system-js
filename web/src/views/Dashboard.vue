<template>
  <div class="dashboard">
    <!-- 资金概览卡片 -->
    <el-row :gutter="20" class="summary-row">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <div class="summary-icon total">
              <el-icon><Wallet /></el-icon>
            </div>
            <div class="summary-info">
              <span class="label">总资产</span>
              <span class="value">{{ formatMoney(summary.totalAssets) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <div class="summary-icon available">
              <el-icon><CreditCard /></el-icon>
            </div>
            <div class="summary-info">
              <span class="label">可用余额</span>
              <span class="value">{{ formatMoney(summary.availableBalance) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <div class="summary-icon position">
              <el-icon><TrendCharts /></el-icon>
            </div>
            <div class="summary-info">
              <span class="label">持仓市值</span>
              <span class="value">{{ formatMoney(summary.positionValue) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-item">
            <div class="summary-icon" :class="summary.todayPnL >= 0 ? 'profit' : 'loss'">
              <el-icon><DataLine /></el-icon>
            </div>
            <div class="summary-info">
              <span class="label">今日盈亏</span>
              <span class="value" :class="summary.todayPnL >= 0 ? 'profit' : 'loss'">
                {{ summary.todayPnL >= 0 ? '+' : '' }}{{ formatMoney(summary.todayPnL) }}
              </span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表和持仓 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>收益曲线</span>
              <el-radio-group v-model="pnlTimeRange" size="small" @change="fetchPnLData">
                <el-radio-button label="7d">7天</el-radio-button>
                <el-radio-button label="30d">30天</el-radio-button>
                <el-radio-button label="90d">90天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <v-chart :option="pnlChartOption" class="chart" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>系统状态</span>
              <el-tag :type="systemStatus.connected ? 'success' : 'danger'" size="small">
                {{ systemStatus.connected ? '正常' : '异常' }}
              </el-tag>
            </div>
          </template>
          <div class="status-list">
            <div class="status-item">
              <span class="label">运行时间</span>
              <span class="value">{{ formatUptime(systemStatus.uptime) }}</span>
            </div>
            <div class="status-item">
              <span class="label">CPU 使用率</span>
              <el-progress :percentage="systemStatus.cpuUsage" :stroke-width="8" />
            </div>
            <div class="status-item">
              <span class="label">内存使用率</span>
              <el-progress :percentage="systemStatus.memoryUsage" :stroke-width="8" />
            </div>
            <div class="status-item">
              <span class="label">运行策略</span>
              <span class="value">{{ summary.runningStrategies }} / {{ summary.totalStrategies }}</span>
            </div>
            <div class="status-item">
              <span class="label">今日交易</span>
              <span class="value">{{ summary.todayTrades }} 笔</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 持仓和交易记录 -->
    <el-row :gutter="20" class="data-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>当前持仓</span>
              <el-button text type="primary" @click="goToPositions">
                查看全部
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table :data="positions" stripe style="width: 100%" max-height="320">
            <el-table-column prop="symbol" label="交易对" min-width="100" />
            <el-table-column prop="side" label="方向" width="70">
              <template #default="{ row }">
                <el-tag :type="row.side === 'long' ? 'success' : 'danger'" size="small">
                  {{ row.side === 'long' ? '多' : '空' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="数量" width="100">
              <template #default="{ row }">
                {{ formatNumber(row.amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="entryPrice" label="开仓价" width="100">
              <template #default="{ row }">
                {{ formatPrice(row.entryPrice) }}
              </template>
            </el-table-column>
            <el-table-column prop="unrealizedPnL" label="未实现盈亏" width="120">
              <template #default="{ row }">
                <span :class="row.unrealizedPnL >= 0 ? 'profit' : 'loss'">
                  {{ row.unrealizedPnL >= 0 ? '+' : '' }}{{ formatMoney(row.unrealizedPnL) }}
                </span>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="positions.length === 0" description="暂无持仓" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>最近交易</span>
              <el-button text type="primary" @click="goToTrades">
                查看全部
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table :data="recentTrades" stripe style="width: 100%" max-height="320">
            <el-table-column prop="timestamp" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.timestamp) }}
              </template>
            </el-table-column>
            <el-table-column prop="symbol" label="交易对" min-width="100" />
            <el-table-column prop="side" label="方向" width="70">
              <template #default="{ row }">
                <el-tag :type="row.side === 'buy' ? 'success' : 'danger'" size="small">
                  {{ row.side === 'buy' ? '买入' : '卖出' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="price" label="价格" width="100">
              <template #default="{ row }">
                {{ formatPrice(row.price) }}
              </template>
            </el-table-column>
            <el-table-column prop="realizedPnL" label="盈亏" width="100">
              <template #default="{ row }">
                <span v-if="row.realizedPnL !== null" :class="row.realizedPnL >= 0 ? 'profit' : 'loss'">
                  {{ row.realizedPnL >= 0 ? '+' : '' }}{{ formatMoney(row.realizedPnL) }}
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="recentTrades.length === 0" description="暂无交易记录" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 风控告警 -->
    <el-row :gutter="20" class="alert-row" v-if="alerts.length > 0">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>
                <el-icon class="warning-icon"><WarningFilled /></el-icon>
                风控告警
              </span>
              <el-badge :value="alerts.length" type="danger" />
            </div>
          </template>
          <div class="alert-list">
            <el-alert
              v-for="alert in alerts"
              :key="alert.id"
              :title="alert.message"
              :type="alert.level === 'critical' ? 'error' : 'warning'"
              :description="formatTime(alert.timestamp)"
              show-icon
              closable
              @close="dismissAlert(alert.id)"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSystemStore } from '@/stores/system'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import dayjs from 'dayjs'
import api from '@/api'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const router = useRouter()
const systemStore = useSystemStore()

const summary = reactive({
  totalAssets: 0,
  availableBalance: 0,
  positionValue: 0,
  todayPnL: 0,
  runningStrategies: 0,
  totalStrategies: 0,
  todayTrades: 0
})

const positions = ref([])
const recentTrades = ref([])
const alerts = ref([])
const pnlData = ref([])
const pnlTimeRange = ref('7d')

const systemStatus = computed(() => systemStore.status)

const pnlChartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: (params) => {
      const data = params[0]
      return `${data.axisValue}<br/>累计盈亏: ${formatMoney(data.value)}`
    }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: pnlData.value.map(item => dayjs(item.timestamp).format('MM-DD'))
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: (value) => {
        if (Math.abs(value) >= 1000) {
          return (value / 1000).toFixed(1) + 'K'
        }
        return value
      }
    }
  },
  series: [
    {
      name: '累计盈亏',
      type: 'line',
      smooth: true,
      areaStyle: {
        opacity: 0.3
      },
      lineStyle: {
        width: 2
      },
      itemStyle: {
        color: pnlData.value.length > 0 && pnlData.value[pnlData.value.length - 1].cumulativePnL >= 0
          ? '#67c23a'
          : '#f56c6c'
      },
      data: pnlData.value.map(item => item.cumulativePnL)
    }
  ]
}))

let refreshTimer = null

onMounted(async () => {
  await Promise.all([
    fetchSummary(),
    fetchPositions(),
    fetchRecentTrades(),
    fetchAlerts(),
    fetchPnLData()
  ])
  systemStore.connectWebSocket()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})

const startAutoRefresh = () => {
  refreshTimer = setInterval(() => {
    fetchSummary()
    fetchPositions()
    fetchRecentTrades()
  }, 10000)
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

const fetchSummary = async () => {
  try {
    const res = await api.dashboard.getSummary()
    Object.assign(summary, res.data || res)
  } catch (error) {
    console.error('Failed to fetch summary:', error)
  }
}

const fetchPositions = async () => {
  try {
    const res = await api.positions.getList()
    positions.value = res.data || res || []
  } catch (error) {
    console.error('Failed to fetch positions:', error)
  }
}

const fetchRecentTrades = async () => {
  try {
    const res = await api.dashboard.getRecentTrades(10)
    recentTrades.value = res.data || res || []
  } catch (error) {
    console.error('Failed to fetch recent trades:', error)
  }
}

const fetchAlerts = async () => {
  try {
    const res = await api.dashboard.getAlerts()
    alerts.value = res.data || res || []
  } catch (error) {
    console.error('Failed to fetch alerts:', error)
  }
}

const fetchPnLData = async () => {
  try {
    const res = await api.dashboard.getPnL({ range: pnlTimeRange.value })
    pnlData.value = res.data || res || []
  } catch (error) {
    console.error('Failed to fetch PnL data:', error)
  }
}

const dismissAlert = async (id) => {
  try {
    await api.risk.dismissAlert(id)
    alerts.value = alerts.value.filter(a => a.id !== id)
  } catch (error) {
    console.error('Failed to dismiss alert:', error)
  }
}

const goToPositions = () => router.push('/trades?tab=positions')
const goToTrades = () => router.push('/trades')

const formatMoney = (value) => {
  if (value == null) return '$0.00'
  return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatNumber = (value) => {
  if (value == null) return '0'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

const formatPrice = (value) => {
  if (value == null) return '0'
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
}

const formatTime = (timestamp) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

const formatUptime = (seconds) => {
  if (!seconds) return '0秒'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
}
</script>

<style lang="scss" scoped>
.dashboard {
  .summary-row {
    margin-bottom: 20px;
  }

  .summary-card {
    .summary-item {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .summary-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: #fff;

      &.total { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
      &.available { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
      &.position { background: linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%); color: #333; }
      &.profit { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
      &.loss { background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%); }
    }

    .summary-info {
      display: flex;
      flex-direction: column;

      .label {
        font-size: 14px;
        color: #909399;
      }

      .value {
        font-size: 24px;
        font-weight: 600;
        color: #303133;

        &.profit { color: #67c23a; }
        &.loss { color: #f56c6c; }
      }
    }
  }

  .chart-row, .data-row, .alert-row {
    margin-bottom: 20px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .chart-card {
    .chart {
      height: 350px;
    }
  }

  .status-card {
    .status-list {
      .status-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid #ebeef5;

        &:last-child {
          border-bottom: none;
        }

        .label {
          font-size: 14px;
          color: #606266;
        }

        .value {
          font-size: 14px;
          font-weight: 500;
          color: #303133;
        }

        .el-progress {
          width: 120px;
        }
      }
    }
  }

  .profit { color: #67c23a; }
  .loss { color: #f56c6c; }

  .warning-icon {
    color: #e6a23c;
    margin-right: 8px;
  }

  .alert-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
}

@media (max-width: 768px) {
  .dashboard {
    .summary-card .summary-info .value {
      font-size: 18px;
    }

    .el-col {
      margin-bottom: 12px;
    }
  }
}
</style>
