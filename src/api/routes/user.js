/**
 * RESTful API 路由 - 用户管理
 * User Management Routes
 *
 * @module src/api/routes/user
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建用户管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createUserRoutes(deps = {}) { // 导出函数 createUserRoutes
  const router = Router(); // 定义常量 router
  const { authManager, userStore } = deps; // 解构赋值

  /**
   * POST /api/auth/login
   * 用户登录
   */
  router.post('/login', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { username, password } = req.body; // 解构赋值

      if (!username || !password) { // 条件判断 !username || !password
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Username and password are required', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (authManager?.login) { // 条件判断 authManager?.login
        const result = await authManager.login(username, password); // 定义常量 result
        if (result.success) { // 条件判断 result.success
          return res.json({ // 返回结果
            success: true, // 成功标记
            data: { // 数据
              token: result.token, // 令牌
              user: result.user, // 用户
            } // 结束代码块
          }); // 结束代码块
        } else { // 执行语句
          return res.status(401).json({ // 返回结果
            success: false, // 成功标记
            error: result.error || 'Invalid credentials', // 错误
            code: 'UNAUTHORIZED' // 代码
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 默认测试用户
      if (username === 'admin' && password === 'admin123') { // 条件判断 username === 'admin' && password === 'admin123'
        return res.json({ // 返回结果
          success: true, // 成功标记
          data: { // 数据
            token: 'test_token_' + Date.now(), // 令牌
            user: { // 用户
              id: 'user_1', // ID
              username: 'admin', // username
              role: 'admin', // role
              email: 'admin@example.com', // 邮箱
            } // 结束代码块
          } // 结束代码块
        }); // 结束代码块
      } // 结束代码块

      res.status(401).json({ // 调用 res.status
        success: false, // 成功标记
        error: 'Invalid credentials', // 错误
        code: 'UNAUTHORIZED' // 代码
      }); // 结束代码块
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/auth/logout
   * 用户登出
   */
  router.post('/logout', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      if (authManager?.logout && req.user) { // 条件判断 authManager?.logout && req.user
        await authManager.logout(req.user.sub); // 等待异步结果
      } // 结束代码块

      res.json({ success: true, message: 'Logged out successfully' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/auth/refresh
   * 刷新 Token
   */
  router.post('/refresh', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      const { refreshToken } = req.body; // 解构赋值

      if (!refreshToken) { // 条件判断 !refreshToken
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Refresh token is required', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (authManager?.refreshToken) { // 条件判断 authManager?.refreshToken
        const result = await authManager.refreshToken(refreshToken); // 定义常量 result
        if (result.success) { // 条件判断 result.success
          return res.json({ // 返回结果
            success: true, // 成功标记
            data: { token: result.token } // 数据
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

      res.status(401).json({ // 调用 res.status
        success: false, // 成功标记
        error: 'Invalid refresh token', // 错误
        code: 'UNAUTHORIZED' // 代码
      }); // 结束代码块
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/user/profile
   * 获取用户信息
   */
  router.get('/profile', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      if (!req.user) { // 条件判断 !req.user
        return res.status(401).json({ // 返回结果
          success: false, // 成功标记
          error: 'Authentication required', // 错误
          code: 'UNAUTHORIZED' // 代码
        }); // 结束代码块
      } // 结束代码块

      let profile = { // 定义变量 profile
        id: req.user.sub, // ID
        username: req.user.username, // username
        role: req.user.role, // role
        email: req.user.email, // 邮箱
      }; // 结束代码块

      if (userStore?.getById) { // 条件判断 userStore?.getById
        const user = await userStore.getById(req.user.sub); // 定义常量 user
        if (user) { // 条件判断 user
          profile = { // 赋值 profile
            ...profile, // 展开对象或数组
            ...user, // 展开对象或数组
            password: undefined, // 密码
          }; // 结束代码块
        } // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: profile }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * PUT /api/user/profile
   * 更新用户信息
   */
  router.put('/profile', async (req, res) => { // 调用 router.put
    try { // 尝试执行
      if (!req.user) { // 条件判断 !req.user
        return res.status(401).json({ // 返回结果
          success: false, // 成功标记
          error: 'Authentication required', // 错误
          code: 'UNAUTHORIZED' // 代码
        }); // 结束代码块
      } // 结束代码块

      const { email, nickname, avatar } = req.body; // 解构赋值

      if (userStore?.update) { // 条件判断 userStore?.update
        await userStore.update(req.user.sub, { email, nickname, avatar }); // 等待异步结果
      } // 结束代码块

      res.json({ success: true, message: 'Profile updated' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/user/change-password
   * 修改密码
   */
  router.post('/change-password', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      if (!req.user) { // 条件判断 !req.user
        return res.status(401).json({ // 返回结果
          success: false, // 成功标记
          error: 'Authentication required', // 错误
          code: 'UNAUTHORIZED' // 代码
        }); // 结束代码块
      } // 结束代码块

      const { oldPassword, newPassword } = req.body; // 解构赋值

      if (!oldPassword || !newPassword) { // 条件判断 !oldPassword || !newPassword
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Old password and new password are required', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (newPassword.length < 8) { // 条件判断 newPassword.length < 8
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'New password must be at least 8 characters', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (authManager?.changePassword) { // 条件判断 authManager?.changePassword
        const result = await authManager.changePassword( // 定义常量 result
          req.user.sub, // 执行语句
          oldPassword, // 执行语句
          newPassword // 执行语句
        ); // 结束调用或参数

        if (!result.success) { // 条件判断 !result.success
          return res.status(400).json({ // 返回结果
            success: false, // 成功标记
            error: result.error || 'Failed to change password', // 错误
            code: 'PASSWORD_CHANGE_FAILED' // 代码
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

      res.json({ success: true, message: 'Password changed successfully' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/users (Admin only)
   * 获取用户列表
   */
  router.get('/users', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      let users = []; // 定义变量 users
      if (userStore?.getAll) { // 条件判断 userStore?.getAll
        users = await userStore.getAll(); // 赋值 users
        // 移除密码
        users = users.map(u => ({ ...u, password: undefined })); // 赋值 users
      } // 结束代码块

      res.json({ success: true, data: users }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * POST /api/users (Admin only)
   * 创建用户
   */
  router.post('/users', async (req, res) => { // 调用 router.post
    try { // 尝试执行
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      const { username, password, email, role } = req.body; // 解构赋值

      if (!username || !password) { // 条件判断 !username || !password
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Username and password are required', // 错误
          code: 'VALIDATION_ERROR' // 代码
        }); // 结束代码块
      } // 结束代码块

      const user = { // 定义常量 user
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // ID
        username, // 执行语句
        email, // 执行语句
        role: role || 'viewer', // role
        createdAt: Date.now(), // createdAt
      }; // 结束代码块

      if (authManager?.createUser) { // 条件判断 authManager?.createUser
        await authManager.createUser(user, password); // 等待异步结果
      } else if (userStore?.save) { // 执行语句
        await userStore.save({ ...user, password }); // 等待异步结果
      } // 结束代码块

      res.status(201).json({ success: true, data: { ...user, password: undefined } }); // 调用 res.status
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * DELETE /api/users/:id (Admin only)
   * 删除用户
   */
  router.delete('/users/:id', async (req, res) => { // 调用 router.delete
    try { // 尝试执行
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      const { id } = req.params; // 解构赋值

      // 防止删除自己
      if (id === req.user.sub) { // 条件判断 id === req.user.sub
        return res.status(400).json({ // 返回结果
          success: false, // 成功标记
          error: 'Cannot delete yourself', // 错误
          code: 'SELF_DELETE' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (userStore?.delete) { // 条件判断 userStore?.delete
        await userStore.delete(id); // 等待异步结果
      } // 结束代码块

      res.json({ success: true, message: 'User deleted' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createUserRoutes; // 默认导出
