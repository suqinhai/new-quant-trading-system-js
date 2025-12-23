<template>
  <div class="risk-control">
    <el-row :gutter="20">
      <!-- 左侧：风控配置 -->
      <el-col :xs="24" :lg="14">
        <!-- 当前风控状态 -->
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>风控状态</span>
              <el-switch
                v-model="riskStatus.tradingAllowed"
                active-text="交易已启用"
                inactive-text="交易已禁用"
                :loading="statusLoading"
                @change="toggleTrading"
              />
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="status-item">
                <span class="label">今日已实现盈亏</span>
                <span class="value" :class="riskStatus.dailyPnL >= 0 ? 'profit' : 'loss'">
                  {{ riskStatus.dailyPnL >= 0 ? '+' : '' }}${{ formatNumber(riskStatus.dailyPnL) }}
                </span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="status-item">
                <span class="label">今日交易次数</span>
                <span class="value">{{ riskStatus.dailyTradeCount }}</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="status-item">
                <span class="label">当前持仓数</span>
                <span class="value">{{ riskStatus.currentPositions }} / {{ riskConfig.maxPositions }}</span>
              </div>
            </el-col>
          </el-row>
          <el-row :gutter="20" style="margin-top: 16px">
            <el-col :span="8">
              <div class="status-item">
                <span class="label">连续亏损次数</span>
                <span class="value" :class="riskStatus.consecutiveLosses > 3 ? 'loss' : ''">
                  {{ riskStatus.consecutiveLosses }}
                </span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="status-item">
                <span class="label">最后交易时间</span>
                <span class="value">{{ riskStatus.lastTradeTime ? formatTime(riskStatus.lastTradeTime) : '-' }}</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="status-item">
                <span class="label">风控触发次数</span>
                <span class="value" :class="riskStatus.triggerCount > 0 ? 'loss' : ''">
                  {{ riskStatus.triggerCount }}
                </span>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 风控参数配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>风控参数配置</span>
              <el-button type="primary" size="small" :loading="saving" @click="saveConfig">
                <el-icon><Check /></el-icon>
                保存配置
              </el-button>
            </div>
          </template>

          <el-form :model="riskConfig" label-width="140px" label-position="left">
            <el-divider content-position="left">资金风控</el-divider>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="单笔最大亏损">
                  <el-input-number
                    v-model="riskConfig.maxLossPerTrade"
                    :min="0.01"
                    :max="0.2"
                    :step="0.01"
                    :precision="2"
                    style="width: 100%"
                  />
                  <span class="input-tip">占总资金百分比</span>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="单日最大亏损">
                  <el-input-number
                    v-model="riskConfig.maxDailyLoss"
                    :min="0.01"
                    :max="0.5"
                    :step="0.01"
                    :precision="2"
                    style="width: 100%"
                  />
                  <span class="input-tip">占总资金百分比</span>
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">仓位风控</el-divider>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="最大持仓数量">
                  <el-input-number
                    v-model="riskConfig.maxPositions"
                    :min="1"
                    :max="50"
                    :step="1"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="单交易对最大仓位">
                  <el-input-number
                    v-model="riskConfig.maxPositionSize"
                    :min="0.05"
                    :max="1"
                    :step="0.05"
                    :precision="2"
                    style="width: 100%"
                  />
                  <span class="input-tip">占总资金百分比</span>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="最大杠杆倍数">
                  <el-input-number
                    v-model="riskConfig.maxLeverage"
                    :min="1"
                    :max="125"
                    :step="1"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="冷却期（秒）">
                  <el-input-number
                    v-model="riskConfig.cooldownPeriod"
                    :min="0"
                    :max="3600"
                    :step="10"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">止损止盈</el-divider>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="默认止损">
                  <el-input-number
                    v-model="riskConfig.defaultStopLoss"
                    :min="0.01"
                    :max="0.5"
                    :step="0.01"
                    :precision="2"
                    style="width: 100%"
                  />
                  <span class="input-tip">价格下跌百分比</span>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="默认止盈">
                  <el-input-number
                    v-model="riskConfig.defaultTakeProfit"
                    :min="0.01"
                    :max="1"
                    :step="0.01"
                    :precision="2"
                    style="width: 100%"
                  />
                  <span class="input-tip">价格上涨百分比</span>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="追踪止损">
                  <el-switch v-model="riskConfig.enableTrailingStop" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="追踪止损距离" v-if="riskConfig.enableTrailingStop">
                  <el-input-number
                    v-model="riskConfig.trailingStopDistance"
                    :min="0.01"
                    :max="0.2"
                    :step="0.01"
                    :precision="2"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：风控告警 -->
      <el-col :xs="24" :lg="10">
        <el-card shadow="hover" class="alerts-card">
          <template #header>
            <div class="card-header">
              <span>
                <el-icon class="warning-icon"><WarningFilled /></el-icon>
                风控告警
                <el-badge v-if="alerts.length > 0" :value="alerts.length" type="danger" class="alert-badge" />
              </span>
              <el-button
                v-if="alerts.length > 0"
                type="danger"
                size="small"
                text
                @click="dismissAllAlerts"
              >
                全部清除
              </el-button>
            </div>
          </template>

          <div v-if="alerts.length > 0" class="alerts-list">
            <el-timeline>
              <el-timeline-item
                v-for="alert in alerts"
                :key="alert.id"
                :type="getAlertType(alert.level)"
                :timestamp="formatTime(alert.timestamp)"
                placement="top"
              >
                <el-card shadow="never" class="alert-card">
                  <div class="alert-content">
                    <div class="alert-header">
                      <el-tag :type="getAlertType(alert.level)" size="small">
                        {{ getAlertLevelLabel(alert.level) }}
                      </el-tag>
                      <el-button
                        type="info"
                        size="small"
                        text
                        circle
                        @click="dismissAlert(alert.id)"
                      >
                        <el-icon><Close /></el-icon>
                      </el-button>
                    </div>
                    <p class="alert-message">{{ alert.message }}</p>
                    <p class="alert-detail" v-if="alert.detail">{{ alert.detail }}</p>
                  </div>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </div>

          <el-empty v-else description="暂无风控告警" />
        </el-card>

        <!-- 风控限制 -->
        <el-card shadow="hover" class="limits-card">
          <template #header>
            <div class="card-header">
              <span>风控限制</span>
            </div>
          </template>

          <el-form :model="riskLimits" label-width="120px" label-position="left">
            <el-form-item label="每日最大交易次数">
              <el-input-number
                v-model="riskLimits.maxDailyTrades"
                :min="1"
                :max="1000"
                :step="10"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="最大连续亏损次数">
              <el-input-number
                v-model="riskLimits.maxConsecutiveLosses"
                :min="1"
                :max="20"
                :step="1"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="单笔最大金额">
              <el-input-number
                v-model="riskLimits.maxOrderAmount"
                :min="100"
                :max="1000000"
                :step="100"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingLimits" @click="saveLimits">
                保存限制
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import api from '@/api'

const saving = ref(false)
const savingLimits = ref(false)
const statusLoading = ref(false)

const riskStatus = reactive({
  tradingAllowed: true,
  dailyPnL: 0,
  dailyTradeCount: 0,
  currentPositions: 0,
  consecutiveLosses: 0,
  lastTradeTime: null,
  triggerCount: 0
})

const riskConfig = reactive({
  maxLossPerTrade: 0.02,
  maxDailyLoss: 0.05,
  maxPositions: 10,
  maxPositionSize: 0.2,
  maxLeverage: 3,
  defaultStopLoss: 0.05,
  defaultTakeProfit: 0.1,
  enableTrailingStop: false,
  trailingStopDistance: 0.03,
  cooldownPeriod: 60
})

const riskLimits = reactive({
  maxDailyTrades: 100,
  maxConsecutiveLosses: 5,
  maxOrderAmount: 10000
})

const alerts = ref([])

let refreshTimer = null

onMounted(async () => {
  await Promise.all([
    fetchRiskConfig(),
    fetchRiskLimits(),
    fetchAlerts(),
    fetchRiskStatus()
  ])
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})

const startAutoRefresh = () => {
  refreshTimer = setInterval(() => {
    fetchRiskStatus()
    fetchAlerts()
  }, 5000)
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

const fetchRiskConfig = async () => {
  try {
    const res = await api.risk.getConfig()
    Object.assign(riskConfig, res.data || res)
    if (riskConfig.cooldownPeriod > 1000) {
      riskConfig.cooldownPeriod = Math.floor(riskConfig.cooldownPeriod / 1000)
    }
  } catch (error) {
    console.error('Failed to fetch risk config:', error)
  }
}

const fetchRiskLimits = async () => {
  try {
    const res = await api.risk.getLimits()
    Object.assign(riskLimits, res.data || res)
  } catch (error) {
    console.error('Failed to fetch risk limits:', error)
  }
}

const fetchAlerts = async () => {
  try {
    const res = await api.risk.getAlerts()
    alerts.value = res.data || res || []
  } catch (error) {
    console.error('Failed to fetch alerts:', error)
  }
}

const fetchRiskStatus = async () => {
  try {
    const res = await api.risk.getConfig()
    const data = res.data || res
    if (data.state) {
      Object.assign(riskStatus, data.state)
    }
  } catch (error) {
    console.error('Failed to fetch risk status:', error)
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    const configToSave = {
      ...riskConfig,
      cooldownPeriod: riskConfig.cooldownPeriod * 1000
    }
    await api.risk.updateConfig(configToSave)
    ElMessage.success('风控配置已保存')
  } catch (error) {
    console.error('Failed to save config:', error)
  } finally {
    saving.value = false
  }
}

const saveLimits = async () => {
  savingLimits.value = true
  try {
    await api.risk.updateLimits(riskLimits)
    ElMessage.success('风控限制已保存')
  } catch (error) {
    console.error('Failed to save limits:', error)
  } finally {
    savingLimits.value = false
  }
}

const toggleTrading = async (value) => {
  statusLoading.value = true
  try {
    if (!value) {
      await ElMessageBox.confirm(
        '禁用交易后，所有策略将停止下单。确定要禁用吗？',
        '警告',
        { type: 'warning' }
      )
    }
    await api.risk.updateConfig({ tradingAllowed: value })
    ElMessage.success(value ? '交易已启用' : '交易已禁用')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to toggle trading:', error)
    }
    riskStatus.tradingAllowed = !value
  } finally {
    statusLoading.value = false
  }
}

const dismissAlert = async (id) => {
  try {
    await api.risk.dismissAlert(id)
    alerts.value = alerts.value.filter(a => a.id !== id)
    ElMessage.success('告警已消除')
  } catch (error) {
    console.error('Failed to dismiss alert:', error)
  }
}

const dismissAllAlerts = async () => {
  try {
    await ElMessageBox.confirm('确定要清除所有告警吗？', '提示', { type: 'warning' })
    for (const alert of alerts.value) {
      await api.risk.dismissAlert(alert.id)
    }
    alerts.value = []
    ElMessage.success('所有告警已清除')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to dismiss all alerts:', error)
    }
  }
}

const formatTime = (timestamp) => {
  return dayjs(timestamp).format('MM-DD HH:mm:ss')
}

const formatNumber = (value) => {
  if (value == null) return '0.00'
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getAlertType = (level) => {
  const types = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return types[level] || 'info'
}

const getAlertLevelLabel = (level) => {
  const labels = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低'
  }
  return labels[level] || level
}
</script>

<style lang="scss" scoped>
.risk-control {
  .status-card {
    margin-bottom: 20px;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .status-item {
      text-align: center;

      .label {
        display: block;
        font-size: 13px;
        color: #909399;
        margin-bottom: 8px;
      }

      .value {
        font-size: 20px;
        font-weight: 600;
        color: #303133;

        &.profit { color: #67c23a; }
        &.loss { color: #f56c6c; }
      }
    }
  }

  .config-card, .alerts-card, .limits-card {
    margin-bottom: 20px;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .config-card {
    .input-tip {
      display: block;
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
    }
  }

  .alerts-card {
    .warning-icon {
      color: #e6a23c;
      margin-right: 8px;
    }

    .alert-badge {
      margin-left: 8px;
    }

    .alerts-list {
      max-height: 500px;
      overflow-y: auto;
    }

    .alert-card {
      .alert-content {
        .alert-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .alert-message {
          margin: 0;
          font-size: 14px;
          color: #303133;
        }

        .alert-detail {
          margin: 8px 0 0;
          font-size: 12px;
          color: #909399;
        }
      }
    }
  }
}

@media (max-width: 768px) {
  .risk-control {
    .status-card .status-item .value {
      font-size: 16px;
    }
  }
}
</style>
