/**
 * RESTful API 路由 - 用户管理
 * User Management Routes
 *
 * @module src/api/routes/user
 */

import { Router } from 'express';

/**
 * 创建用户管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createUserRoutes(deps = {}) {
  const router = Router();
  const { authManager, userStore } = deps;

  /**
   * POST /api/auth/login
   * 用户登录
   */
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (authManager?.login) {
        const result = await authManager.login(username, password);
        if (result.success) {
          return res.json({
            success: true,
            data: {
              token: result.token,
              user: result.user,
            }
          });
        } else {
          return res.status(401).json({
            success: false,
            error: result.error || 'Invalid credentials',
            code: 'UNAUTHORIZED'
          });
        }
      }

      // 默认测试用户
      if (username === 'admin' && password === 'admin123') {
        return res.json({
          success: true,
          data: {
            token: 'test_token_' + Date.now(),
            user: {
              id: 'user_1',
              username: 'admin',
              role: 'admin',
              email: 'admin@example.com',
            }
          }
        });
      }

      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'UNAUTHORIZED'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/auth/logout
   * 用户登出
   */
  router.post('/logout', async (req, res) => {
    try {
      if (authManager?.logout && req.user) {
        await authManager.logout(req.user.sub);
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/auth/refresh
   * 刷新 Token
   */
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token is required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (authManager?.refreshToken) {
        const result = await authManager.refreshToken(refreshToken);
        if (result.success) {
          return res.json({
            success: true,
            data: { token: result.token }
          });
        }
      }

      res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'UNAUTHORIZED'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/user/profile
   * 获取用户信息
   */
  router.get('/profile', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
      }

      let profile = {
        id: req.user.sub,
        username: req.user.username,
        role: req.user.role,
        email: req.user.email,
      };

      if (userStore?.getById) {
        const user = await userStore.getById(req.user.sub);
        if (user) {
          profile = {
            ...profile,
            ...user,
            password: undefined, // 不返回密码
          };
        }
      }

      res.json({ success: true, data: profile });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/user/profile
   * 更新用户信息
   */
  router.put('/profile', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
      }

      const { email, nickname, avatar } = req.body;

      if (userStore?.update) {
        await userStore.update(req.user.sub, { email, nickname, avatar });
      }

      res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/user/change-password
   * 修改密码
   */
  router.post('/change-password', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
      }

      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Old password and new password are required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 8 characters',
          code: 'VALIDATION_ERROR'
        });
      }

      if (authManager?.changePassword) {
        const result = await authManager.changePassword(
          req.user.sub,
          oldPassword,
          newPassword
        );

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error || 'Failed to change password',
            code: 'PASSWORD_CHANGE_FAILED'
          });
        }
      }

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/users (Admin only)
   * 获取用户列表
   */
  router.get('/users', async (req, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      let users = [];
      if (userStore?.getAll) {
        users = await userStore.getAll();
        // 移除密码
        users = users.map(u => ({ ...u, password: undefined }));
      }

      res.json({ success: true, data: users });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/users (Admin only)
   * 创建用户
   */
  router.post('/users', async (req, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      const { username, password, email, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required',
          code: 'VALIDATION_ERROR'
        });
      }

      const user = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username,
        email,
        role: role || 'viewer',
        createdAt: Date.now(),
      };

      if (authManager?.createUser) {
        await authManager.createUser(user, password);
      } else if (userStore?.save) {
        await userStore.save({ ...user, password });
      }

      res.status(201).json({ success: true, data: { ...user, password: undefined } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/users/:id (Admin only)
   * 删除用户
   */
  router.delete('/users/:id', async (req, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      const { id } = req.params;

      // 防止删除自己
      if (id === req.user.sub) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete yourself',
          code: 'SELF_DELETE'
        });
      }

      if (userStore?.delete) {
        await userStore.delete(id);
      }

      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createUserRoutes;
