<template>
  <div class="settings">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- 基础设置 -->
      <el-tab-pane label="基础设置" name="basic">
        <el-card shadow="never">
          <template #header>
            <span>系统配置</span>
          </template>
          <el-form :model="basicConfig" label-width="120px" style="max-width: 600px">
            <el-form-item label="运行模式">
              <el-radio-group v-model="basicConfig.runMode" @change="handleModeChange">
                <el-radio-button label="shadow">
                  <el-icon><View /></el-icon>
                  影子模式
                </el-radio-button>
                <el-radio-button label="live">
                  <el-icon><Lightning /></el-icon>
                  实盘模式
                </el-radio-button>
              </el-radio-group>
              <div class="form-tip">
                <el-alert
                  v-if="basicConfig.runMode === 'live'"
                  title="实盘模式将使用真实资金进行交易，请谨慎操作"
                  type="warning"
                  :closable="false"
                  show-icon
                />
              </div>
            </el-form-item>
            <el-form-item label="日志级别">
              <el-select v-model="basicConfig.logLevel" style="width: 200px">
                <el-option label="Debug" value="debug" />
                <el-option label="Info" value="info" />
                <el-option label="Warning" value="warn" />
                <el-option label="Error" value="error" />
              </el-select>
            </el-form-item>
            <el-form-item label="数据刷新间隔">
              <el-input-number v-model="basicConfig.refreshInterval" :min="1" :max="60" />
              <span class="input-unit">秒</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingBasic" @click="saveBasicConfig">
                保存配置
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" style="margin-top: 20px">
          <template #header>
            <span>系统信息</span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="系统版本">{{ systemInfo.version }}</el-descriptions-item>
            <el-descriptions-item label="Node.js 版本">{{ systemInfo.nodeVersion }}</el-descriptions-item>
            <el-descriptions-item label="运行时间">{{ formatUptime(systemInfo.uptime) }}</el-descriptions-item>
            <el-descriptions-item label="数据库类型">{{ systemInfo.dbType }}</el-descriptions-item>
            <el-descriptions-item label="Redis 状态">
              <el-tag :type="systemInfo.redisConnected ? 'success' : 'danger'" size="small">
                {{ systemInfo.redisConnected ? '已连接' : '未连接' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="最后启动时间">{{ formatTime(systemInfo.startTime) }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>

      <!-- 交易所配置 -->
      <el-tab-pane label="交易所配置" name="exchange">
        <el-card shadow="never">
          <el-table :data="exchanges" stripe>
            <el-table-column prop="name" label="交易所" width="150">
              <template #default="{ row }">
                <div class="exchange-name">
                  <img :src="getExchangeLogo(row.id)" :alt="row.name" class="exchange-logo" />
                  <span>{{ row.name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.connected ? 'success' : 'danger'" size="small">
                  {{ row.connected ? '已连接' : '未连接' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="apiKey" label="API Key" min-width="200">
              <template #default="{ row }">
                <span class="masked-key">{{ maskApiKey(row.apiKey) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="sandbox" label="测试网" width="100">
              <template #default="{ row }">
                <el-tag :type="row.sandbox ? 'warning' : 'info'" size="small">
                  {{ row.sandbox ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <el-button type="primary" size="small" text @click="openExchangeDialog(row)">
                  <el-icon><Edit /></el-icon>
                  配置
                </el-button>
                <el-button
                  type="success"
                  size="small"
                  text
                  :loading="row.testing"
                  @click="testExchangeConnection(row)"
                >
                  <el-icon><Connection /></el-icon>
                  测试
                </el-button>
                <el-button type="info" size="small" text @click="fetchExchangeBalance(row)">
                  <el-icon><Wallet /></el-icon>
                  余额
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 交易所配置对话框 -->
        <el-dialog v-model="exchangeDialogVisible" title="交易所配置" width="500px">
          <el-form :model="exchangeForm" label-width="100px">
            <el-form-item label="交易所">
              <el-input :value="exchangeForm.name" disabled />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="exchangeForm.apiKey" placeholder="请输入 API Key" />
            </el-form-item>
            <el-form-item label="Secret">
              <el-input v-model="exchangeForm.secret" type="password" placeholder="请输入 Secret" show-password />
            </el-form-item>
            <el-form-item label="Password" v-if="exchangeForm.id === 'okx'">
              <el-input v-model="exchangeForm.password" type="password" placeholder="请输入 Passphrase" show-password />
            </el-form-item>
            <el-form-item label="测试网">
              <el-switch v-model="exchangeForm.sandbox" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="exchangeDialogVisible = false">取消</el-button>
            <el-button type="primary" :loading="savingExchange" @click="saveExchangeConfig">
              保存
            </el-button>
          </template>
        </el-dialog>

        <!-- 余额对话框 -->
        <el-dialog v-model="balanceDialogVisible" :title="`${balanceExchange} 余额`" width="600px">
          <el-table :data="balanceList" stripe max-height="400">
            <el-table-column prop="currency" label="币种" width="100" />
            <el-table-column prop="total" label="总额">
              <template #default="{ row }">
                {{ formatBalance(row.total) }}
              </template>
            </el-table-column>
            <el-table-column prop="free" label="可用">
              <template #default="{ row }">
                {{ formatBalance(row.free) }}
              </template>
            </el-table-column>
            <el-table-column prop="used" label="冻结">
              <template #default="{ row }">
                {{ formatBalance(row.used) }}
              </template>
            </el-table-column>
          </el-table>
        </el-dialog>
      </el-tab-pane>

      <!-- 通知设置 -->
      <el-tab-pane label="通知设置" name="notification">
        <el-row :gutter="20">
          <el-col :xs="24" :lg="12">
            <el-card shadow="never">
              <template #header>
                <div class="card-header">
                  <span>Telegram 通知</span>
                  <el-switch v-model="notificationConfig.telegram.enabled" />
                </div>
              </template>
              <el-form
                :model="notificationConfig.telegram"
                label-width="100px"
                :disabled="!notificationConfig.telegram.enabled"
              >
                <el-form-item label="Bot Token">
                  <el-input v-model="notificationConfig.telegram.botToken" placeholder="请输入 Bot Token" />
                </el-form-item>
                <el-form-item label="Chat ID">
                  <el-input v-model="notificationConfig.telegram.chatId" placeholder="请输入 Chat ID" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" size="small" @click="testTelegram">测试发送</el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>

          <el-col :xs="24" :lg="12">
            <el-card shadow="never">
              <template #header>
                <div class="card-header">
                  <span>邮件通知</span>
                  <el-switch v-model="notificationConfig.email.enabled" />
                </div>
              </template>
              <el-form
                :model="notificationConfig.email"
                label-width="100px"
                :disabled="!notificationConfig.email.enabled"
              >
                <el-form-item label="SMTP 服务器">
                  <el-input v-model="notificationConfig.email.host" placeholder="smtp.example.com" />
                </el-form-item>
                <el-form-item label="端口">
                  <el-input-number v-model="notificationConfig.email.port" :min="1" :max="65535" />
                </el-form-item>
                <el-form-item label="用户名">
                  <el-input v-model="notificationConfig.email.user" placeholder="请输入邮箱" />
                </el-form-item>
                <el-form-item label="密码">
                  <el-input v-model="notificationConfig.email.pass" type="password" placeholder="请输入密码" show-password />
                </el-form-item>
                <el-form-item label="收件人">
                  <el-input v-model="notificationConfig.email.to" placeholder="请输入收件人邮箱" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="24">
            <el-card shadow="never">
              <template #header>
                <div class="card-header">
                  <span>Webhook 通知</span>
                  <el-switch v-model="notificationConfig.webhook.enabled" />
                </div>
              </template>
              <el-form
                :model="notificationConfig.webhook"
                label-width="100px"
                :disabled="!notificationConfig.webhook.enabled"
              >
                <el-form-item label="Webhook URL">
                  <el-input v-model="notificationConfig.webhook.url" placeholder="https://example.com/webhook" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>

        <div style="margin-top: 20px; text-align: right">
          <el-button type="primary" :loading="savingNotification" @click="saveNotificationConfig">
            保存通知配置
          </el-button>
        </div>
      </el-tab-pane>

      <!-- 个人设置 -->
      <el-tab-pane label="个人设置" name="profile">
        <el-row :gutter="20">
          <el-col :xs="24" :lg="12">
            <el-card shadow="never">
              <template #header>
                <span>个人信息</span>
              </template>
              <el-form :model="profileForm" label-width="100px">
                <el-form-item label="头像">
                  <el-avatar :size="64" :src="profileForm.avatar">
                    <el-icon :size="32"><User /></el-icon>
                  </el-avatar>
                </el-form-item>
                <el-form-item label="用户名">
                  <el-input v-model="profileForm.username" placeholder="请输入用户名" />
                </el-form-item>
                <el-form-item label="邮箱">
                  <el-input v-model="profileForm.email" placeholder="请输入邮箱" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="savingProfile" @click="saveProfile">
                    保存信息
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>

          <el-col :xs="24" :lg="12">
            <el-card shadow="never">
              <template #header>
                <span>修改密码</span>
              </template>
              <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="100px">
                <el-form-item label="当前密码" prop="oldPassword">
                  <el-input v-model="passwordForm.oldPassword" type="password" placeholder="请输入当前密码" show-password />
                </el-form-item>
                <el-form-item label="新密码" prop="newPassword">
                  <el-input v-model="passwordForm.newPassword" type="password" placeholder="请输入新密码" show-password />
                </el-form-item>
                <el-form-item label="确认密码" prop="confirmPassword">
                  <el-input v-model="passwordForm.confirmPassword" type="password" placeholder="请再次输入新密码" show-password />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="savingPassword" @click="changePassword">
                    修改密码
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import api from '@/api'

const route = useRoute()
const activeTab = ref(route.query.tab || 'basic')

const savingBasic = ref(false)
const savingExchange = ref(false)
const savingNotification = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)

const basicConfig = reactive({
  runMode: 'shadow',
  logLevel: 'info',
  refreshInterval: 10
})

const systemInfo = reactive({
  version: '1.0.0',
  nodeVersion: '',
  uptime: 0,
  dbType: 'SQLite',
  redisConnected: false,
  startTime: null
})

const exchanges = ref([
  { id: 'binance', name: 'Binance', apiKey: '', connected: false, sandbox: false, testing: false },
  { id: 'okx', name: 'OKX', apiKey: '', connected: false, sandbox: false, testing: false },
  { id: 'bybit', name: 'Bybit', apiKey: '', connected: false, sandbox: false, testing: false }
])

const exchangeDialogVisible = ref(false)
const exchangeForm = reactive({
  id: '',
  name: '',
  apiKey: '',
  secret: '',
  password: '',
  sandbox: false
})

const balanceDialogVisible = ref(false)
const balanceExchange = ref('')
const balanceList = ref([])

const notificationConfig = reactive({
  telegram: { enabled: false, botToken: '', chatId: '' },
  email: { enabled: false, host: '', port: 587, user: '', pass: '', to: '' },
  webhook: { enabled: false, url: '' }
})

const profileForm = reactive({
  avatar: '',
  username: '',
  email: ''
})

const passwordFormRef = ref(null)
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

onMounted(async () => {
  await Promise.all([
    fetchSystemConfig(),
    fetchSystemInfo(),
    fetchExchanges(),
    fetchNotificationConfig(),
    fetchProfile()
  ])
})

const fetchSystemConfig = async () => {
  try {
    const res = await api.system.getConfig()
    const data = res.data || res
    basicConfig.runMode = data.runMode || 'shadow'
    basicConfig.logLevel = data.logging?.level || 'info'
    basicConfig.refreshInterval = data.refreshInterval || 10
  } catch (error) {
    console.error('Failed to fetch system config:', error)
  }
}

const fetchSystemInfo = async () => {
  try {
    const res = await api.system.getStatus()
    const data = res.data || res
    Object.assign(systemInfo, {
      version: data.version || '1.0.0',
      nodeVersion: data.nodeVersion || '',
      uptime: data.uptime || 0,
      dbType: data.database?.type || 'SQLite',
      redisConnected: data.redis?.connected || false,
      startTime: data.startTime
    })
  } catch (error) {
    console.error('Failed to fetch system info:', error)
  }
}

const fetchExchanges = async () => {
  try {
    const res = await api.exchanges.getList()
    const list = res.data || res || []
    exchanges.value = exchanges.value.map(ex => {
      const found = list.find(e => e.id === ex.id)
      return found ? { ...ex, ...found } : ex
    })
  } catch (error) {
    console.error('Failed to fetch exchanges:', error)
  }
}

const fetchNotificationConfig = async () => {
  try {
    const res = await api.system.getConfig()
    const data = res.data || res
    if (data.alert) {
      Object.assign(notificationConfig, data.alert)
    }
  } catch (error) {
    console.error('Failed to fetch notification config:', error)
  }
}

const fetchProfile = async () => {
  try {
    const res = await api.user.getProfile()
    const data = res.data || res
    Object.assign(profileForm, data)
  } catch (error) {
    console.error('Failed to fetch profile:', error)
  }
}

const handleModeChange = async (mode) => {
  if (mode === 'live') {
    try {
      await ElMessageBox.confirm(
        '切换到实盘模式将使用真实资金进行交易，确定要切换吗？',
        '警告',
        { type: 'warning', confirmButtonText: '确定切换', cancelButtonText: '取消' }
      )
    } catch {
      basicConfig.runMode = 'shadow'
    }
  }
}

const saveBasicConfig = async () => {
  savingBasic.value = true
  try {
    await api.system.updateConfig({
      runMode: basicConfig.runMode,
      logging: { level: basicConfig.logLevel },
      refreshInterval: basicConfig.refreshInterval
    })
    ElMessage.success('配置已保存')
  } catch (error) {
    console.error('Failed to save config:', error)
  } finally {
    savingBasic.value = false
  }
}

const openExchangeDialog = (exchange) => {
  Object.assign(exchangeForm, {
    id: exchange.id,
    name: exchange.name,
    apiKey: '',
    secret: '',
    password: '',
    sandbox: exchange.sandbox
  })
  exchangeDialogVisible.value = true
}

const saveExchangeConfig = async () => {
  savingExchange.value = true
  try {
    await api.exchanges.updateConfig(exchangeForm.id, {
      apiKey: exchangeForm.apiKey,
      secret: exchangeForm.secret,
      password: exchangeForm.password,
      sandbox: exchangeForm.sandbox
    })
    ElMessage.success('交易所配置已保存')
    exchangeDialogVisible.value = false
    fetchExchanges()
  } catch (error) {
    console.error('Failed to save exchange config:', error)
  } finally {
    savingExchange.value = false
  }
}

const testExchangeConnection = async (exchange) => {
  exchange.testing = true
  try {
    await api.exchanges.testConnection(exchange.id)
    exchange.connected = true
    ElMessage.success(`${exchange.name} 连接成功`)
  } catch (error) {
    exchange.connected = false
    ElMessage.error(`${exchange.name} 连接失败`)
  } finally {
    exchange.testing = false
  }
}

const fetchExchangeBalance = async (exchange) => {
  try {
    const res = await api.exchanges.getBalance(exchange.id)
    const data = res.data || res
    balanceExchange.value = exchange.name
    balanceList.value = Object.entries(data)
      .filter(([_, v]) => v.total > 0)
      .map(([currency, balance]) => ({ currency, ...balance }))
    balanceDialogVisible.value = true
  } catch (error) {
    ElMessage.error('获取余额失败')
  }
}

const testTelegram = async () => {
  try {
    ElMessage.info('正在发送测试消息...')
    await api.system.updateConfig({
      alert: { telegram: notificationConfig.telegram }
    })
    ElMessage.success('测试消息已发送')
  } catch (error) {
    ElMessage.error('发送失败')
  }
}

const saveNotificationConfig = async () => {
  savingNotification.value = true
  try {
    await api.system.updateConfig({ alert: notificationConfig })
    ElMessage.success('通知配置已保存')
  } catch (error) {
    console.error('Failed to save notification config:', error)
  } finally {
    savingNotification.value = false
  }
}

const saveProfile = async () => {
  savingProfile.value = true
  try {
    await api.user.updateProfile(profileForm)
    ElMessage.success('个人信息已保存')
  } catch (error) {
    console.error('Failed to save profile:', error)
  } finally {
    savingProfile.value = false
  }
}

const changePassword = async () => {
  if (!passwordFormRef.value) return
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return

    savingPassword.value = true
    try {
      await api.user.changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      })
      ElMessage.success('密码已修改')
      passwordForm.oldPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
    } catch (error) {
      console.error('Failed to change password:', error)
    } finally {
      savingPassword.value = false
    }
  })
}

const maskApiKey = (key) => {
  if (!key) return '未配置'
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
}

const getExchangeLogo = (id) => {
  const logos = {
    binance: 'https://cryptologos.cc/logos/binance-coin-bnb-logo.png',
    okx: 'https://cryptologos.cc/logos/okb-okb-logo.png',
    bybit: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png'
  }
  return logos[id] || ''
}

const formatUptime = (seconds) => {
  if (!seconds) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

const formatBalance = (value) => {
  if (value == null) return '0'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 8 })
}
</script>

<style lang="scss" scoped>
.settings {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .form-tip {
    margin-top: 10px;
  }

  .input-unit {
    margin-left: 10px;
    color: #909399;
  }

  .exchange-name {
    display: flex;
    align-items: center;
    gap: 10px;

    .exchange-logo {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }
  }

  .masked-key {
    font-family: monospace;
    color: #909399;
  }

  :deep(.el-tab-pane) {
    padding: 10px;
  }

  .el-card {
    margin-bottom: 0;
  }
}

@media (max-width: 768px) {
  .settings {
    .el-col {
      margin-bottom: 20px;
    }
  }
}
</style>
