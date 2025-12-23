<template>
  <div class="trades">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="总交易数" :value="stats.totalTrades" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="胜率" :value="stats.winRate * 100" suffix="%" :precision="1" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic
            title="总盈亏"
            :value="stats.totalPnL"
            prefix="$"
            :precision="2"
            :value-style="{ color: stats.totalPnL >= 0 ? '#67c23a' : '#f56c6c' }"
          />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic
            title="平均盈亏"
            :value="stats.avgPnL"
            prefix="$"
            :precision="2"
            :value-style="{ color: stats.avgPnL >= 0 ? '#67c23a' : '#f56c6c' }"
          />
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选和操作栏 -->
    <el-card shadow="hover" class="filter-card">
      <el-form :model="filters" inline>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            :shortcuts="dateShortcuts"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item label="交易对">
          <el-select v-model="filters.symbol" placeholder="全部" clearable filterable style="width: 150px">
            <el-option label="BTC/USDT" value="BTC/USDT" />
            <el-option label="ETH/USDT" value="ETH/USDT" />
            <el-option label="BNB/USDT" value="BNB/USDT" />
            <el-option label="SOL/USDT" value="SOL/USDT" />
            <el-option label="XRP/USDT" value="XRP/USDT" />
          </el-select>
        </el-form-item>
        <el-form-item label="方向">
          <el-select v-model="filters.side" placeholder="全部" clearable style="width: 100px">
            <el-option label="买入" value="buy" />
            <el-option label="卖出" value="sell" />
          </el-select>
        </el-form-item>
        <el-form-item label="策略">
          <el-select v-model="filters.strategy" placeholder="全部" clearable style="width: 150px">
            <el-option v-for="s in strategyOptions" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchTrades">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="resetFilters">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
      <div class="export-btn">
        <el-dropdown @command="handleExport">
          <el-button>
            <el-icon><Download /></el-icon>
            导出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="csv">导出 CSV</el-dropdown-item>
              <el-dropdown-item command="excel">导出 Excel</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-card>

    <!-- 交易记录表格 -->
    <el-card shadow="hover" class="table-card">
      <el-table
        v-loading="loading"
        :data="trades"
        stripe
        style="width: 100%"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="timestamp" label="时间" width="170" sortable="custom">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="tradeId" label="交易ID" width="150">
          <template #default="{ row }">
            <el-tooltip :content="row.tradeId" placement="top">
              <span class="trade-id">{{ row.tradeId?.substring(0, 12) }}...</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="symbol" label="交易对" width="120" />
        <el-table-column prop="side" label="方向" width="80">
          <template #default="{ row }">
            <el-tag :type="row.side === 'buy' ? 'success' : 'danger'" size="small">
              {{ row.side === 'buy' ? '买入' : '卖出' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="90">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ getOrderTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="数量" width="120" sortable="custom">
          <template #default="{ row }">
            {{ formatNumber(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="price" label="价格" width="110" sortable="custom">
          <template #default="{ row }">
            {{ formatPrice(row.price) }}
          </template>
        </el-table-column>
        <el-table-column prop="cost" label="金额" width="120">
          <template #default="{ row }">
            ${{ formatNumber(row.cost, 2) }}
          </template>
        </el-table-column>
        <el-table-column prop="fee" label="手续费" width="100">
          <template #default="{ row }">
            ${{ formatNumber(row.fee, 4) }}
          </template>
        </el-table-column>
        <el-table-column prop="realizedPnL" label="已实现盈亏" width="130" sortable="custom">
          <template #default="{ row }">
            <span v-if="row.realizedPnL !== null && row.realizedPnL !== undefined" :class="row.realizedPnL >= 0 ? 'profit' : 'loss'">
              {{ row.realizedPnL >= 0 ? '+' : '' }}${{ formatNumber(row.realizedPnL, 2) }}
            </span>
            <span v-else class="no-pnl">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="strategy" label="策略" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.strategy" size="small">{{ row.strategy }}</el-tag>
            <span v-else class="no-strategy">手动</span>
          </template>
        </el-table-column>
        <el-table-column prop="exchange" label="交易所" width="100">
          <template #default="{ row }">
            {{ getExchangeLabel(row.exchange) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchTrades"
          @current-change="fetchTrades"
        />
      </div>
    </el-card>

    <!-- 交易详情抽屉 -->
    <el-drawer v-model="detailDrawerVisible" title="交易详情" size="450px">
      <template v-if="selectedTrade">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="交易ID">{{ selectedTrade.tradeId }}</el-descriptions-item>
          <el-descriptions-item label="订单ID">{{ selectedTrade.orderId }}</el-descriptions-item>
          <el-descriptions-item label="交易时间">{{ formatTime(selectedTrade.timestamp) }}</el-descriptions-item>
          <el-descriptions-item label="交易对">{{ selectedTrade.symbol }}</el-descriptions-item>
          <el-descriptions-item label="交易方向">
            <el-tag :type="selectedTrade.side === 'buy' ? 'success' : 'danger'" size="small">
              {{ selectedTrade.side === 'buy' ? '买入' : '卖出' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="订单类型">{{ getOrderTypeLabel(selectedTrade.type) }}</el-descriptions-item>
          <el-descriptions-item label="成交数量">{{ formatNumber(selectedTrade.amount) }}</el-descriptions-item>
          <el-descriptions-item label="成交价格">${{ formatPrice(selectedTrade.price) }}</el-descriptions-item>
          <el-descriptions-item label="成交金额">${{ formatNumber(selectedTrade.cost, 2) }}</el-descriptions-item>
          <el-descriptions-item label="手续费">${{ formatNumber(selectedTrade.fee, 4) }}</el-descriptions-item>
          <el-descriptions-item label="已实现盈亏">
            <span v-if="selectedTrade.realizedPnL !== null" :class="selectedTrade.realizedPnL >= 0 ? 'profit' : 'loss'">
              {{ selectedTrade.realizedPnL >= 0 ? '+' : '' }}${{ formatNumber(selectedTrade.realizedPnL, 2) }}
            </span>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="策略">{{ selectedTrade.strategy || '手动交易' }}</el-descriptions-item>
          <el-descriptions-item label="交易所">{{ getExchangeLabel(selectedTrade.exchange) }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import api from '@/api'

const loading = ref(false)
const trades = ref([])

const stats = reactive({
  totalTrades: 0,
  winRate: 0,
  totalPnL: 0,
  avgPnL: 0
})

const filters = reactive({
  dateRange: [],
  symbol: '',
  side: '',
  strategy: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const sortParams = reactive({
  sortBy: 'timestamp',
  sortOrder: 'desc'
})

const strategyOptions = ref([])
const detailDrawerVisible = ref(false)
const selectedTrade = ref(null)

const dateShortcuts = [
  {
    text: '今天',
    value: () => {
      const today = dayjs().format('YYYY-MM-DD')
      return [today, today]
    }
  },
  {
    text: '最近7天',
    value: () => {
      return [dayjs().subtract(7, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
    }
  },
  {
    text: '最近30天',
    value: () => {
      return [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
    }
  },
  {
    text: '本月',
    value: () => {
      return [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
    }
  }
]

onMounted(async () => {
  await Promise.all([
    fetchTrades(),
    fetchStats(),
    fetchStrategyOptions()
  ])
})

const fetchTrades = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      sortBy: sortParams.sortBy,
      sortOrder: sortParams.sortOrder,
      ...buildFilterParams()
    }
    const res = await api.trades.getList(params)
    trades.value = res.data || res.list || []
    pagination.total = res.total || trades.value.length
  } catch (error) {
    console.error('Failed to fetch trades:', error)
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  try {
    const res = await api.trades.getStats(buildFilterParams())
    Object.assign(stats, res.data || res)
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

const fetchStrategyOptions = async () => {
  try {
    const res = await api.strategies.getList({ pageSize: 100 })
    const list = res.data || res.list || []
    strategyOptions.value = list.map(s => ({
      label: s.name,
      value: s.name
    }))
  } catch (error) {
    console.error('Failed to fetch strategy options:', error)
  }
}

const buildFilterParams = () => {
  const params = {}
  if (filters.dateRange && filters.dateRange.length === 2) {
    params.startDate = filters.dateRange[0]
    params.endDate = filters.dateRange[1]
  }
  if (filters.symbol) params.symbol = filters.symbol
  if (filters.side) params.side = filters.side
  if (filters.strategy) params.strategy = filters.strategy
  return params
}

const resetFilters = () => {
  filters.dateRange = []
  filters.symbol = ''
  filters.side = ''
  filters.strategy = ''
  pagination.page = 1
  fetchTrades()
  fetchStats()
}

const handleSortChange = ({ prop, order }) => {
  sortParams.sortBy = prop
  sortParams.sortOrder = order === 'ascending' ? 'asc' : 'desc'
  fetchTrades()
}

const handleExport = async (format) => {
  try {
    ElMessage.info('正在导出...')
    const res = await api.trades.export({
      format,
      ...buildFilterParams()
    })

    const blob = new Blob([res], {
      type: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trades_${dayjs().format('YYYYMMDD_HHmmss')}.${format === 'csv' ? 'csv' : 'xlsx'}`
    link.click()
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (error) {
    console.error('Failed to export:', error)
    ElMessage.error('导出失败')
  }
}

const openDetailDrawer = (row) => {
  selectedTrade.value = row
  detailDrawerVisible.value = true
}

const formatTime = (timestamp) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

const formatNumber = (value, decimals = 6) => {
  if (value == null) return '0'
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals > 2 ? 0 : decimals,
    maximumFractionDigits: decimals
  })
}

const formatPrice = (value) => {
  if (value == null) return '0'
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  })
}

const getOrderTypeLabel = (type) => {
  const labels = {
    market: '市价',
    limit: '限价',
    post_only: 'PostOnly',
    ioc: 'IOC',
    fok: 'FOK'
  }
  return labels[type] || type
}

const getExchangeLabel = (exchange) => {
  const labels = {
    binance: 'Binance',
    okx: 'OKX',
    bybit: 'Bybit'
  }
  return labels[exchange] || exchange
}
</script>

<style lang="scss" scoped>
.trades {
  .stats-row {
    margin-bottom: 20px;

    .stat-card {
      text-align: center;
    }
  }

  .filter-card {
    margin-bottom: 20px;

    :deep(.el-card__body) {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .el-form {
      flex: 1;
    }

    .export-btn {
      margin-left: 20px;
    }
  }

  .table-card {
    .trade-id {
      font-family: monospace;
      color: #909399;
      cursor: pointer;
    }

    .profit { color: #67c23a; font-weight: 500; }
    .loss { color: #f56c6c; font-weight: 500; }
    .no-pnl { color: #c0c4cc; }
    .no-strategy { color: #909399; font-style: italic; }
  }

  .pagination {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .trades {
    .filter-card {
      :deep(.el-card__body) {
        flex-direction: column;
      }

      .export-btn {
        margin-left: 0;
        margin-top: 12px;
      }
    }
  }
}
</style>
