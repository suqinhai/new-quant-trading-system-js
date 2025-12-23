import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '仪表板', icon: 'Odometer' }
      },
      {
        path: 'strategies',
        name: 'Strategies',
        component: () => import('@/views/Strategies.vue'),
        meta: { title: '策略管理', icon: 'TrendCharts' }
      },
      {
        path: 'trades',
        name: 'Trades',
        component: () => import('@/views/Trades.vue'),
        meta: { title: '交易记录', icon: 'List' }
      },
      {
        path: 'risk',
        name: 'RiskControl',
        component: () => import('@/views/RiskControl.vue'),
        meta: { title: '风控配置', icon: 'Warning' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '系统设置', icon: 'Setting' }
      }
    ]
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '404' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || 'Quant Trading'} - 量化交易系统`
  next()
})

export default router
