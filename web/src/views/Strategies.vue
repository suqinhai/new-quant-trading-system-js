<template>
  <div class="strategies">
    <!-- 顶部操作栏 -->
    <el-card shadow="hover" class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索策略名称"
            prefix-icon="Search"
            clearable
            style="width: 250px"
            @clear="fetchStrategies"
            @keyup.enter="fetchStrategies"
          />
          <el-select v-model="filterStatus" placeholder="状态筛选" clearable style="width: 120px" @change="fetchStrategies">
            <el-option label="运行中" value="running" />
            <el-option label="已停止" value="stopped" />
            <el-option label="暂停" value="paused" />
            <el-option label="异常" value="error" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
            创建策略
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 策略列表 -->
    <el-card shadow="hover" class="table-card">
      <el-table
        v-loading="loading"
        :data="strategies"
        stripe
        style="width: 100%"
        @row-click="openDetailDrawer"
      >
        <el-table-column prop="name" label="策略名称" min-width="150">
          <template #default="{ row }">
            <div class="strategy-name">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.isDefault" size="small" type="info">默认</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="策略类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ getStrategyTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="symbol" label="交易对" width="130" />
        <el-table-column prop="state" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.state)" size="small">
              {{ getStatusLabel(row.state) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalReturn" label="总收益率" width="120">
          <template #default="{ row }">
            <span :class="row.totalReturn >= 0 ? 'profit' : 'loss'">
              {{ row.totalReturn >= 0 ? '+' : '' }}{{ (row.totalReturn * 100).toFixed(2) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="todayReturn" label="今日收益" width="120">
          <template #default="{ row }">
            <span :class="row.todayReturn >= 0 ? 'profit' : 'loss'">
              {{ row.todayReturn >= 0 ? '+' : '' }}{{ (row.todayReturn * 100).toFixed(2) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="trades" label="交易次数" width="100" />
        <el-table-column prop="winRate" label="胜率" width="80">
          <template #default="{ row }">
            {{ (row.winRate * 100).toFixed(1) }}%
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.state !== 'running'"
              type="success"
              size="small"
              text
              @click.stop="startStrategy(row)"
            >
              <el-icon><VideoPlay /></el-icon>
              启动
            </el-button>
            <el-button
              v-else
              type="warning"
              size="small"
              text
              @click.stop="stopStrategy(row)"
            >
              <el-icon><VideoPause /></el-icon>
              停止
            </el-button>
            <el-button type="primary" size="small" text @click.stop="openBacktestDialog(row)">
              <el-icon><DataAnalysis /></el-icon>
              回测
            </el-button>
            <el-dropdown trigger="click" @click.stop>
              <el-button type="info" size="small" text>
                <el-icon><More /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openEditDialog(row)">
                    <el-icon><Edit /></el-icon>编辑
                  </el-dropdown-item>
                  <el-dropdown-item @click="duplicateStrategy(row)">
                    <el-icon><CopyDocument /></el-icon>复制
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="deleteStrategy(row)">
                    <el-icon><Delete /></el-icon>删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchStrategies"
          @current-change="fetchStrategies"
        />
      </div>
    </el-card>

    <!-- 创建/编辑策略对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑策略' : '创建策略'"
      width="600px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="策略名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入策略名称" />
        </el-form-item>
        <el-form-item label="策略类型" prop="type">
          <el-select v-model="formData.type" placeholder="请选择策略类型" style="width: 100%">
            <el-option label="SMA 均线策略" value="SMA" />
            <el-option label="RSI 指标策略" value="RSI" />
            <el-option label="布林带策略" value="BollingerBands" />
            <el-option label="MACD 策略" value="MACD" />
            <el-option label="网格交易策略" value="Grid" />
            <el-option label="资金费率套利" value="FundingArb" />
          </el-select>
        </el-form-item>
        <el-form-item label="交易对" prop="symbol">
          <el-select v-model="formData.symbol" placeholder="请选择交易对" filterable style="width: 100%">
            <el-option label="BTC/USDT" value="BTC/USDT:USDT" />
            <el-option label="ETH/USDT" value="ETH/USDT:USDT" />
            <el-option label="BNB/USDT" value="BNB/USDT:USDT" />
            <el-option label="SOL/USDT" value="SOL/USDT:USDT" />
            <el-option label="XRP/USDT" value="XRP/USDT:USDT" />
          </el-select>
        </el-form-item>
        <el-form-item label="交易所" prop="exchange">
          <el-select v-model="formData.exchange" placeholder="请选择交易所" style="width: 100%">
            <el-option label="Binance" value="binance" />
            <el-option label="OKX" value="okx" />
            <el-option label="Bybit" value="bybit" />
          </el-select>
        </el-form-item>
        <el-form-item label="初始资金" prop="initialCapital">
          <el-input-number v-model="formData.initialCapital" :min="100" :max="1000000" :step="100" style="width: 100%" />
        </el-form-item>

        <el-divider content-position="left">策略参数</el-divider>

        <!-- SMA 参数 -->
        <template v-if="formData.type === 'SMA'">
          <el-form-item label="短期周期">
            <el-input-number v-model="formData.params.shortPeriod" :min="5" :max="50" />
          </el-form-item>
          <el-form-item label="长期周期">
            <el-input-number v-model="formData.params.longPeriod" :min="10" :max="200" />
          </el-form-item>
        </template>

        <!-- RSI 参数 -->
        <template v-if="formData.type === 'RSI'">
          <el-form-item label="RSI 周期">
            <el-input-number v-model="formData.params.period" :min="5" :max="50" />
          </el-form-item>
          <el-form-item label="超买阈值">
            <el-input-number v-model="formData.params.overbought" :min="60" :max="90" />
          </el-form-item>
          <el-form-item label="超卖阈值">
            <el-input-number v-model="formData.params.oversold" :min="10" :max="40" />
          </el-form-item>
        </template>

        <!-- Grid 参数 -->
        <template v-if="formData.type === 'Grid'">
          <el-form-item label="网格数量">
            <el-input-number v-model="formData.params.gridCount" :min="5" :max="100" />
          </el-form-item>
          <el-form-item label="上边界价格">
            <el-input-number v-model="formData.params.upperPrice" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="下边界价格">
            <el-input-number v-model="formData.params.lowerPrice" :min="0" :precision="2" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 回测对话框 -->
    <el-dialog v-model="backtestDialogVisible" title="策略回测" width="700px" destroy-on-close>
      <el-form :model="backtestParams" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开始日期">
              <el-date-picker
                v-model="backtestParams.startDate"
                type="date"
                placeholder="选择开始日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束日期">
              <el-date-picker
                v-model="backtestParams.endDate"
                type="date"
                placeholder="选择结束日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="初始资金">
          <el-input-number v-model="backtestParams.initialCapital" :min="1000" :max="1000000" :step="1000" style="width: 200px" />
        </el-form-item>
      </el-form>

      <el-divider v-if="backtestResult" content-position="left">回测结果</el-divider>

      <div v-if="backtestResult" class="backtest-result">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-statistic title="总收益率" :value="backtestResult.totalReturn * 100" suffix="%" :precision="2" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="最大回撤" :value="backtestResult.maxDrawdown * 100" suffix="%" :precision="2" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="夏普比率" :value="backtestResult.sharpeRatio" :precision="2" />
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="8">
            <el-statistic title="交易次数" :value="backtestResult.trades" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="胜率" :value="backtestResult.winRate * 100" suffix="%" :precision="1" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="盈亏比" :value="backtestResult.profitFactor" :precision="2" />
          </el-col>
        </el-row>
      </div>

      <template #footer>
        <el-button @click="backtestDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="backtestLoading" @click="runBacktest">
          {{ backtestLoading ? '回测中...' : '开始回测' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 策略详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="策略详情" size="500px">
      <template v-if="selectedStrategy">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="策略名称">{{ selectedStrategy.name }}</el-descriptions-item>
          <el-descriptions-item label="策略类型">
            <el-tag size="small">{{ getStrategyTypeLabel(selectedStrategy.type) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="交易对">{{ selectedStrategy.symbol }}</el-descriptions-item>
          <el-descriptions-item label="交易所">{{ selectedStrategy.exchange }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedStrategy.state)" size="small">
              {{ getStatusLabel(selectedStrategy.state) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(selectedStrategy.createdAt) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">策略参数</el-divider>

        <el-descriptions :column="1" border>
          <el-descriptions-item
            v-for="(value, key) in selectedStrategy.params"
            :key="key"
            :label="key"
          >
            {{ value }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">统计信息</el-divider>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-card shadow="never" class="stat-card">
              <el-statistic title="总收益率" :value="(selectedStrategy.totalReturn || 0) * 100" suffix="%" :precision="2" />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never" class="stat-card">
              <el-statistic title="胜率" :value="(selectedStrategy.winRate || 0) * 100" suffix="%" :precision="1" />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never" class="stat-card">
              <el-statistic title="交易次数" :value="selectedStrategy.trades || 0" />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never" class="stat-card">
              <el-statistic title="最大回撤" :value="(selectedStrategy.maxDrawdown || 0) * 100" suffix="%" :precision="2" />
            </el-card>
          </el-col>
        </el-row>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import api from '@/api'

const loading = ref(false)
const strategies = ref([])
const searchKeyword = ref('')
const filterStatus = ref('')

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const submitting = ref(false)

const formData = reactive({
  name: '',
  type: 'SMA',
  symbol: 'BTC/USDT:USDT',
  exchange: 'binance',
  initialCapital: 10000,
  params: {
    shortPeriod: 10,
    longPeriod: 30,
    period: 14,
    overbought: 70,
    oversold: 30,
    gridCount: 20,
    upperPrice: 0,
    lowerPrice: 0
  }
})

const formRules = {
  name: [{ required: true, message: '请输入策略名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择策略类型', trigger: 'change' }],
  symbol: [{ required: true, message: '请选择交易对', trigger: 'change' }],
  exchange: [{ required: true, message: '请选择交易所', trigger: 'change' }]
}

const backtestDialogVisible = ref(false)
const backtestLoading = ref(false)
const backtestParams = reactive({
  startDate: dayjs().subtract(30, 'day').toDate(),
  endDate: new Date(),
  initialCapital: 10000
})
const backtestResult = ref(null)
const backtestStrategyId = ref(null)

const drawerVisible = ref(false)
const selectedStrategy = ref(null)

onMounted(() => {
  fetchStrategies()
})

const fetchStrategies = async () => {
  loading.value = true
  try {
    const res = await api.strategies.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value,
      status: filterStatus.value
    })
    strategies.value = res.data || res.list || []
    pagination.total = res.total || strategies.value.length
  } catch (error) {
    console.error('Failed to fetch strategies:', error)
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const openEditDialog = (row) => {
  isEdit.value = true
  Object.assign(formData, {
    id: row.id,
    name: row.name,
    type: row.type,
    symbol: row.symbol,
    exchange: row.exchange,
    initialCapital: row.initialCapital,
    params: { ...row.params }
  })
  dialogVisible.value = true
}

const resetForm = () => {
  Object.assign(formData, {
    id: undefined,
    name: '',
    type: 'SMA',
    symbol: 'BTC/USDT:USDT',
    exchange: 'binance',
    initialCapital: 10000,
    params: {
      shortPeriod: 10,
      longPeriod: 30,
      period: 14,
      overbought: 70,
      oversold: 30,
      gridCount: 20,
      upperPrice: 0,
      lowerPrice: 0
    }
  })
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitting.value = true
    try {
      if (isEdit.value) {
        await api.strategies.update(formData.id, formData)
        ElMessage.success('策略已更新')
      } else {
        await api.strategies.create(formData)
        ElMessage.success('策略已创建')
      }
      dialogVisible.value = false
      fetchStrategies()
    } catch (error) {
      console.error('Failed to save strategy:', error)
    } finally {
      submitting.value = false
    }
  })
}

const startStrategy = async (row) => {
  try {
    await api.strategies.start(row.id)
    ElMessage.success('策略已启动')
    row.state = 'running'
  } catch (error) {
    console.error('Failed to start strategy:', error)
  }
}

const stopStrategy = async (row) => {
  try {
    await ElMessageBox.confirm('确定要停止该策略吗？', '提示', {
      type: 'warning'
    })
    await api.strategies.stop(row.id)
    ElMessage.success('策略已停止')
    row.state = 'stopped'
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to stop strategy:', error)
    }
  }
}

const deleteStrategy = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该策略吗？此操作不可恢复。', '警告', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger'
    })
    await api.strategies.delete(row.id)
    ElMessage.success('策略已删除')
    fetchStrategies()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete strategy:', error)
    }
  }
}

const duplicateStrategy = async (row) => {
  isEdit.value = false
  Object.assign(formData, {
    id: undefined,
    name: `${row.name} (副本)`,
    type: row.type,
    symbol: row.symbol,
    exchange: row.exchange,
    initialCapital: row.initialCapital,
    params: { ...row.params }
  })
  dialogVisible.value = true
}

const openBacktestDialog = (row) => {
  backtestStrategyId.value = row.id
  backtestResult.value = null
  backtestDialogVisible.value = true
}

const runBacktest = async () => {
  backtestLoading.value = true
  try {
    const res = await api.strategies.backtest(backtestStrategyId.value, {
      startDate: dayjs(backtestParams.startDate).format('YYYY-MM-DD'),
      endDate: dayjs(backtestParams.endDate).format('YYYY-MM-DD'),
      initialCapital: backtestParams.initialCapital
    })
    backtestResult.value = res.data || res
    ElMessage.success('回测完成')
  } catch (error) {
    console.error('Failed to run backtest:', error)
  } finally {
    backtestLoading.value = false
  }
}

const openDetailDrawer = (row) => {
  selectedStrategy.value = row
  drawerVisible.value = true
}

const getStrategyTypeLabel = (type) => {
  const labels = {
    SMA: 'SMA 均线',
    RSI: 'RSI 指标',
    BollingerBands: '布林带',
    MACD: 'MACD',
    Grid: '网格交易',
    FundingArb: '资金费率套利'
  }
  return labels[type] || type
}

const getStatusType = (status) => {
  const types = {
    running: 'success',
    stopped: 'info',
    paused: 'warning',
    error: 'danger'
  }
  return types[status] || 'info'
}

const getStatusLabel = (status) => {
  const labels = {
    running: '运行中',
    stopped: '已停止',
    paused: '已暂停',
    error: '异常'
  }
  return labels[status] || status
}

const formatTime = (timestamp) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style lang="scss" scoped>
.strategies {
  .toolbar-card {
    margin-bottom: 20px;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .toolbar-left {
      display: flex;
      gap: 12px;
    }
  }

  .table-card {
    .strategy-name {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .profit { color: #67c23a; }
    .loss { color: #f56c6c; }
  }

  .pagination {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
  }

  .backtest-result {
    padding: 20px;
    background: #f5f7fa;
    border-radius: 8px;
  }

  .stat-card {
    margin-bottom: 16px;
  }
}
</style>
