import axios from 'axios'
import { ElMessage } from 'element-plus'

// 创建 axios 实例
const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    const message = error.response?.data?.message || error.message || '请求失败'
    ElMessage.error(message)

    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

// API 模块
const api = {
  // 系统相关
  system: {
    getStatus: () => request.get('/system/status'),
    getConfig: () => request.get('/system/config'),
    updateConfig: (data) => request.put('/system/config', data),
    getMetrics: () => request.get('/system/metrics'),
    healthCheck: () => request.get('/health')
  },

  // 策略相关
  strategies: {
    getList: (params) => request.get('/strategies', { params }),
    getById: (id) => request.get(`/strategies/${id}`),
    create: (data) => request.post('/strategies', data),
    update: (id, data) => request.put(`/strategies/${id}`, data),
    delete: (id) => request.delete(`/strategies/${id}`),
    start: (id) => request.post(`/strategies/${id}/start`),
    stop: (id) => request.post(`/strategies/${id}/stop`),
    getStats: (id) => request.get(`/strategies/${id}/stats`),
    backtest: (id, params) => request.post(`/strategies/${id}/backtest`, params)
  },

  // 交易相关
  trades: {
    getList: (params) => request.get('/trades', { params }),
    getById: (id) => request.get(`/trades/${id}`),
    getStats: (params) => request.get('/trades/stats', { params }),
    export: (params) => request.get('/trades/export', { params, responseType: 'blob' })
  },

  // 订单相关
  orders: {
    getList: (params) => request.get('/orders', { params }),
    getById: (id) => request.get(`/orders/${id}`),
    create: (data) => request.post('/orders', data),
    cancel: (id) => request.post(`/orders/${id}/cancel`),
    getOpenOrders: () => request.get('/orders/open')
  },

  // 持仓相关
  positions: {
    getList: () => request.get('/positions'),
    getBySymbol: (symbol) => request.get(`/positions/${symbol}`),
    close: (symbol) => request.post(`/positions/${symbol}/close`),
    closeAll: () => request.post('/positions/close-all')
  },

  // 风控相关
  risk: {
    getConfig: () => request.get('/risk/config'),
    updateConfig: (data) => request.put('/risk/config', data),
    getLimits: () => request.get('/risk/limits'),
    updateLimits: (data) => request.put('/risk/limits', data),
    getAlerts: () => request.get('/risk/alerts'),
    dismissAlert: (id) => request.post(`/risk/alerts/${id}/dismiss`)
  },

  // 交易所相关
  exchanges: {
    getList: () => request.get('/exchanges'),
    getById: (id) => request.get(`/exchanges/${id}`),
    testConnection: (id) => request.post(`/exchanges/${id}/test`),
    getBalance: (id) => request.get(`/exchanges/${id}/balance`),
    updateConfig: (id, data) => request.put(`/exchanges/${id}/config`, data)
  },

  // 仪表板相关
  dashboard: {
    getSummary: () => request.get('/dashboard/summary'),
    getPnL: (params) => request.get('/dashboard/pnl', { params }),
    getPerformance: (params) => request.get('/dashboard/performance', { params }),
    getRecentTrades: (limit = 10) => request.get('/dashboard/recent-trades', { params: { limit } }),
    getAlerts: () => request.get('/dashboard/alerts')
  },

  // 用户相关
  user: {
    login: (data) => request.post('/auth/login', data),
    logout: () => request.post('/auth/logout'),
    getProfile: () => request.get('/user/profile'),
    updateProfile: (data) => request.put('/user/profile', data),
    changePassword: (data) => request.put('/user/password', data)
  }
}

export default api
export { request }
