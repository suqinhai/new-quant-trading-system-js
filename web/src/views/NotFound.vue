<template>
  <div class="not-found">
    <div class="content">
      <h1>404</h1>
      <h2>页面未找到</h2>
      <p>抱歉，您访问的页面不存在</p>
      <el-button type="primary" @click="goHome">
        <el-icon><HomeFilled /></el-icon>
        返回首页
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => {
  router.push('/')
}
</script>

<style lang="scss" scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
}

.content {
  text-align: center;

  h1 {
    font-size: 120px;
    font-weight: 700;
    color: #409eff;
    margin: 0;
    line-height: 1;
    text-shadow: 4px 4px 0 rgba(64, 158, 255, 0.2);
  }

  h2 {
    font-size: 32px;
    color: #303133;
    margin: 20px 0 10px;
  }

  p {
    font-size: 16px;
    color: #909399;
    margin: 0 0 30px;
  }
}
</style>
