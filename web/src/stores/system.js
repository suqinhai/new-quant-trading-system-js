import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useSystemStore = defineStore('system', () => {
  // 状态
  const runMode = ref('shadow') // 'shadow' | 'live'
  const status = ref({
    connected: true,
    uptime: 0,
    version: '1.0.0',
    nodeVersion: '',
    memoryUsage: 0,
    cpuUsage: 0
  })
  const notifications = ref([])
  const exchanges = ref([])
  const config = ref({})

  // 状态流连接
  let statusPollingTimer = null
  const wsConnected = ref(false)

  function clampPercentage(value) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, Math.round(value * 100) / 100))
  }

  function normalizeStatusPayload(payload = {}) {
    const uptime = Number(payload.uptime || 0)
    const memory = payload.memoryUsage || payload.memory || {}
    const cpu = payload.cpuUsage || payload.cpu || {}

    const memoryUsed = Number(memory.heapUsed ?? memory.used ?? memory.rss ?? 0)
    const memoryTotal = Number(memory.heapTotal ?? memory.total ?? 0)
    const memoryUsage = typeof memory === 'number'
      ? memory
      : memoryTotal > 0
        ? (memoryUsed / memoryTotal) * 100
        : 0

    const cpuMicros = typeof cpu === 'number'
      ? cpu
      : Number(cpu.user || 0) + Number(cpu.system || 0)
    const cpuUsage = typeof cpu === 'number'
      ? cpu
      : uptime > 0
        ? (cpuMicros / (uptime * 1000000)) * 100
        : 0

    const mode = payload.runMode || payload.mode
    if (mode) {
      runMode.value = mode
    }

    return {
      ...status.value,
      ...payload,
      connected: payload.connected ?? true,
      uptime,
      version: payload.version || status.value.version,
      nodeVersion: payload.nodeVersion || status.value.nodeVersion,
      memoryUsage: clampPercentage(memoryUsage),
      cpuUsage: clampPercentage(cpuUsage)
    }
  }

  // 计算属性
  const isLiveMode = computed(() => runMode.value === 'live')
  const unreadNotifications = computed(() =>
    notifications.value.filter(n => !n.read).length
  )

  // 方法
  async function fetchStatus() {
    try {
      const res = await api.system.getStatus()
      status.value = normalizeStatusPayload(res.data || res || {})
      wsConnected.value = true
      return true
    } catch (error) {
      status.value = {
        ...status.value,
        connected: false
      }
      wsConnected.value = false
      console.error('Failed to fetch system status:', error)
      return false
    }
  }

  async function fetchConfig() {
    try {
      const res = await api.system.getConfig()
      config.value = res.data
      runMode.value = res.data.runMode || 'shadow'
      return true
    } catch (error) {
      console.error('Failed to fetch config:', error)
      return false
    }
  }

  async function updateConfig(newConfig) {
    try {
      await api.system.updateConfig(newConfig)
      config.value = { ...config.value, ...newConfig }
      return true
    } catch (error) {
      console.error('Failed to update config:', error)
      return false
    }
  }

  async function switchMode(mode) {
    if (mode === 'live') {
      // 切换到实盘需要确认
      return false
    }
    runMode.value = mode
    await updateConfig({ runMode: mode })
    return true
  }

  async function refreshSystemStream() {
    await fetchStatus()
  }

  function disconnectWebSocket() {
    if (statusPollingTimer) {
      clearInterval(statusPollingTimer)
      statusPollingTimer = null
    }

    wsConnected.value = false
  }

  function connectWebSocket() {
    if (statusPollingTimer) {
      return
    }

    fetchConfig()
    refreshSystemStream()

    statusPollingTimer = setInterval(() => {
      refreshSystemStream()
    }, 5000)
  }

  function handleWsMessage(data) {
    switch (data.type) {
      case 'status':
        status.value = { ...status.value, ...data.payload }
        break
      case 'notification':
        notifications.value.unshift(data.payload)
        break
      case 'trade':
        // 处理交易更新
        break
      case 'position':
        // 处理持仓更新
        break
    }
  }

  function addNotification(notification) {
    notifications.value.unshift({
      id: Date.now(),
      read: false,
      timestamp: new Date().toISOString(),
      ...notification
    })
  }

  function markNotificationRead(id) {
    const notification = notifications.value.find(n => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  function clearNotifications() {
    notifications.value = []
  }

  return {
    // 状态
    runMode,
    status,
    notifications,
    exchanges,
    config,
    wsConnected,
    // 计算属性
    isLiveMode,
    unreadNotifications,
    // 方法
    fetchStatus,
    fetchConfig,
    updateConfig,
    switchMode,
    connectWebSocket,
    disconnectWebSocket,
    addNotification,
    markNotificationRead,
    clearNotifications
  }
})
