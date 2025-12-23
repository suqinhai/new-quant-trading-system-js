<template>
  <el-container class="main-layout">
    <!-- 侧边栏 -->
    <el-aside :width="isCollapse ? '64px' : '220px'" class="sidebar">
      <div class="logo">
        <img src="@/assets/logo.svg" alt="Logo" class="logo-img" />
        <span v-show="!isCollapse" class="logo-text">量化交易系统</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        :collapse-transition="false"
        router
        background-color="#1d1e1f"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <template #title>仪表板</template>
        </el-menu-item>

        <el-menu-item index="/strategies">
          <el-icon><TrendCharts /></el-icon>
          <template #title>策略管理</template>
        </el-menu-item>

        <el-menu-item index="/trades">
          <el-icon><List /></el-icon>
          <template #title>交易记录</template>
        </el-menu-item>

        <el-menu-item index="/risk">
          <el-icon><Warning /></el-icon>
          <template #title>风控配置</template>
        </el-menu-item>

        <el-sub-menu index="settings">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </template>
          <el-menu-item index="/settings">
            <el-icon><Tools /></el-icon>
            <template #title>基础设置</template>
          </el-menu-item>
          <el-menu-item index="/settings?tab=exchange">
            <el-icon><Connection /></el-icon>
            <template #title>交易所配置</template>
          </el-menu-item>
          <el-menu-item index="/settings?tab=notification">
            <el-icon><Bell /></el-icon>
            <template #title>通知设置</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶部栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-icon
            class="collapse-btn"
            @click="isCollapse = !isCollapse"
          >
            <Fold v-if="!isCollapse" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentRoute?.meta?.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <!-- 运行模式 -->
          <el-tag :type="runMode === 'live' ? 'danger' : 'info'" effect="dark">
            {{ runMode === 'live' ? '实盘模式' : '影子模式' }}
          </el-tag>

          <!-- 系统状态 -->
          <el-tooltip :content="systemStatus.connected ? '系统正常' : '连接断开'">
            <el-badge :is-dot="true" :type="systemStatus.connected ? 'success' : 'danger'">
              <el-icon :size="20"><Monitor /></el-icon>
            </el-badge>
          </el-tooltip>

          <!-- 通知 -->
          <el-dropdown trigger="click">
            <el-badge :value="notifications.length" :max="99" :hidden="notifications.length === 0">
              <el-icon :size="20" class="notification-icon"><Bell /></el-icon>
            </el-badge>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="notifications.length === 0" disabled>
                  暂无通知
                </el-dropdown-item>
                <el-dropdown-item v-for="n in notifications" :key="n.id">
                  {{ n.message }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 用户 -->
          <el-dropdown trigger="click">
            <div class="user-info">
              <el-avatar :size="32" :src="userAvatar">
                <el-icon><User /></el-icon>
              </el-avatar>
              <span class="username">{{ username }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="goToProfile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </el-main>

      <!-- 底部 -->
      <el-footer class="footer">
        <span>Quant Trading System &copy; 2024</span>
        <span class="version">v1.0.0</span>
      </el-footer>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSystemStore } from '@/stores/system'

const route = useRoute()
const router = useRouter()
const systemStore = useSystemStore()

const isCollapse = ref(false)
const username = ref('Admin')
const userAvatar = ref('')

const currentRoute = computed(() => route)
const activeMenu = computed(() => route.path)
const runMode = computed(() => systemStore.runMode)
const systemStatus = computed(() => systemStore.status)
const notifications = computed(() => systemStore.notifications)

const goToProfile = () => {
  router.push('/settings?tab=profile')
}

const handleLogout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    router.push('/login')
  })
}
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100vh;
}

.sidebar {
  background-color: #1d1e1f;
  transition: width 0.3s;
  overflow: hidden;

  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    background-color: #141414;

    .logo-img {
      width: 32px;
      height: 32px;
    }

    .logo-text {
      margin-left: 12px;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
    }
  }

  .el-menu {
    border-right: none;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  z-index: 10;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;

    .collapse-btn {
      font-size: 20px;
      cursor: pointer;
      color: #606266;
      transition: color 0.3s;

      &:hover {
        color: #409eff;
      }
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 20px;

    .notification-icon {
      cursor: pointer;
      color: #606266;

      &:hover {
        color: #409eff;
      }
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      .username {
        font-size: 14px;
        color: #303133;
      }
    }
  }
}

.main-content {
  background-color: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  font-size: 12px;
  color: #909399;
  background-color: #fff;
  border-top: 1px solid #e4e7ed;

  .version {
    color: #c0c4cc;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
