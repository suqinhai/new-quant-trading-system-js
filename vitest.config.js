/**
 * Vitest 配置文件
 * @see https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 全局变量
    globals: true,

    // 测试环境
    environment: 'node',

    // 测试文件匹配
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js',
      'tests/e2e/**/*.test.js',
    ],

    // 排除文件
    exclude: [
      'node_modules/**',
      'dist/**',
      // 排除使用 Node.js 内置测试运行器的旧测试文件
      'tests/unit/crypto.test.js',
      'tests/unit/helpers.test.js',
      'tests/unit/validators.test.js',
      'tests/integration/config.test.js',
    ],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',

      // 覆盖的文件
      include: ['src/**/*.js'],

      // 排除的文件
      exclude: [
        'node_modules/**',
        'tests/**',
        'examples/**',
        'scripts/**',
        '**/*.config.*',
        '**/index.js',
      ],

      // 覆盖率阈值
      thresholds: {
        global: {
          statements: 60,
          branches: 50,
          functions: 60,
          lines: 60,
        },
      },
    },

    // 超时设置
    testTimeout: 30000,
    hookTimeout: 30000,

    // 并行执行 (Vitest 4 新配置)
    isolate: true,
    fileParallelism: true,

    // 报告格式
    reporters: ['verbose'],

    // 失败时重试
    retry: 0,

    // 监听模式配置
    watch: false,
  },
});
