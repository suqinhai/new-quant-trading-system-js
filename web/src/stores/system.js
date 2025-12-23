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

  // WebSocket 连接
  let ws = null
  const wsConnected = ref(false)

  // 计算属性
  const isLiveMode = computed(() => runMode.value === 'live')
  const unreadNotifications = computed(() =>
    notifications.value.filter(n => !n.read).length
  )

  // 方法
  async function fetchStatus() {
    try {
      const res = await api.system.getStatus()
      status.value = res.data
    } catch (error) {
      console.error('Failed to fetch system status:', error)
    }
  }

  async function fetchConfig() {
    try {
      const res = await api.system.getConfig()
      config.value = res.data
      runMode.value = res.data.runMode || 'shadow'
    } catch (error) {
      console.error('Failed to fetch config:', error)
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

  function connectWebSocket() {
    if (ws) {
      ws.close()
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      wsConnected.value = true
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleWsMessage(data)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      wsConnected.value = false
      console.log('WebSocket disconnected, reconnecting...')
      setTimeout(connectWebSocket, 3000)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
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
    addNotification,
    markNotificationRead,
    clearNotifications
  }
})
