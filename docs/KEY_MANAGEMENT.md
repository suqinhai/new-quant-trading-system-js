# API 密钥安全管理指南

## 概述

本系统提供 AES-256-GCM 加密存储方案，用于保护交易所 API 密钥和其他敏感凭证。

## 安全架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   主密码        │────▶│   PBKDF2派生    │────▶│   加密密钥      │
│ (MASTER_KEY)    │     │  (100000次迭代)  │     │  (256-bit)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API密钥       │────▶│  AES-256-GCM    │────▶│  .keys.enc      │
│   (明文)        │     │     加密        │     │  (加密文件)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 快速开始

### 1. 生成主密码

```bash
node scripts/keyManager.js generate
```

输出示例：
```
📋 生成的主密码 / Generated master password:

   aB3$kL9@mN7#pQ2!xR5&yT8...

   强度 / Strength: strong
   得分 / Score: 8/8
```

### 2. 加密 API 密钥

```bash
node scripts/keyManager.js encrypt
```

按提示输入：
- 选择从 `.env` 读取或手动输入密钥
- 输入并确认主密码（至少12位，包含大小写字母、数字和特殊字符）

加密后生成 `.keys.enc` 文件。

### 3. 配置主密码环境变量

**Linux/macOS:**
```bash
export MASTER_KEY="your_secure_master_password"
```

**Windows (PowerShell):**
```powershell
$env:MASTER_KEY="your_secure_master_password"
```

**Windows (CMD):**
```cmd
set MASTER_KEY=your_secure_master_password
```

### 4. 验证配置

```bash
node scripts/keyManager.js verify
```

## 密钥管理命令

| 命令 | 描述 |
|------|------|
| `encrypt` | 加密 API 密钥并保存到 `.keys.enc` |
| `decrypt` | 解密并显示存储的密钥 |
| `verify` | 验证加密文件完整性 |
| `generate` | 生成安全的随机主密码 |
| `rotate` | 轮换主密码 |

## 密钥轮换

定期轮换主密码是安全最佳实践。建议每 90 天轮换一次。

```bash
node scripts/keyManager.js rotate
```

轮换流程：
1. 输入当前主密码
2. 输入并确认新主密码
3. 系统自动备份旧文件并重新加密

备份文件命名格式：`.keys.enc.backup.<timestamp>`

## 在代码中使用

### 加载加密密钥

```javascript
import { loadEncryptedKeys, getMasterPassword } from './src/utils/crypto.js';

const masterPassword = getMasterPassword();
const keys = loadEncryptedKeys(masterPassword);

// 使用密钥
const binanceApiKey = keys.binance.apiKey;
const binanceSecret = keys.binance.secret;
```

### 使用加密的环境变量

在 `.env` 中可以存储加密值：

```env
BINANCE_API_KEY=ENC(base64_encrypted_value)
```

解密：

```javascript
import { decryptValue, getMasterPassword } from './src/utils/crypto.js';

const encrypted = process.env.BINANCE_API_KEY;
const apiKey = decryptValue(encrypted, getMasterPassword());
```

## 安全最佳实践

### 主密码管理

- 使用密码管理器存储主密码
- 不要将主密码写入代码或配置文件
- 不要在命令行历史中留下主密码
- 考虑使用环境变量或安全的密钥管理服务

### 文件安全

- `.keys.enc` 已加入 `.gitignore`，永远不会被提交
- 定期备份 `.keys.enc` 文件到安全位置
- 备份主密码到离线安全存储

### 密钥权限

- 仅授予 API 密钥必要的最小权限
- 对于交易所 API：
  - 只读：仅需查看账户余额和市场数据
  - 交易：需要执行买卖操作
  - 提现：**强烈不建议启用**

### 密钥轮换策略

| 场景 | 建议轮换周期 |
|------|-------------|
| 常规运维 | 每 90 天 |
| 人员变动 | 立即 |
| 安全事件 | 立即 |
| 系统升级 | 评估后决定 |

## 文件说明

| 文件 | 描述 | Git跟踪 |
|------|------|---------|
| `.env` | 环境配置（占位符） | 否 |
| `.env.example` | 配置模板 | 是 |
| `.keys.enc` | 加密的API密钥 | 否 |
| `.keys.enc.backup.*` | 密钥备份 | 否 |

## 故障排除

### 解密失败

```
❌ 解密失败，主密码可能不正确
```

检查：
1. 主密码是否正确
2. `.keys.enc` 文件是否损坏
3. 尝试从备份恢复

### 找不到加密文件

```
❌ 未找到加密密钥文件
```

解决：
```bash
node scripts/keyManager.js encrypt
```

### 密码强度不足

```
❌ 密码强度不足 / Password too weak: weak
```

要求：
- 最少 12 个字符
- 包含大写字母 (A-Z)
- 包含小写字母 (a-z)
- 包含数字 (0-9)
- 包含特殊字符 (!@#$%^&* 等)

## 紧急情况

### 密钥泄露

1. **立即**在交易所后台禁用/删除泄露的 API 密钥
2. 创建新的 API 密钥
3. 运行 `node scripts/keyManager.js encrypt` 加密新密钥
4. 轮换主密码
5. 检查账户是否有异常活动

### 主密码遗忘

如果遗忘主密码且没有备份：
1. 无法恢复加密的密钥
2. 需要在交易所重新生成 API 密钥
3. 重新运行加密流程

## 相关文件

- `src/utils/crypto.js` - 加密模块实现
- `scripts/keyManager.js` - 密钥管理工具
- `src/config/ConfigManager.js` - 配置管理器
