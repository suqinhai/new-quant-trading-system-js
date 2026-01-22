/**
 * 告警管理器
 * Alert Manager
 *
 * 负责系统告警的发送，支持多种告警渠道
 * Responsible for sending system alerts, supports multiple alert channels
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入 HTTP 请求库 / Import HTTP request library
import axios from 'axios'; // 导入模块 axios

// 导入邮件发送库 / Import email library
import nodemailer from 'nodemailer'; // 导入模块 nodemailer

/**
 * 告警管理器类
 * Alert Manager Class
 */
export class AlertManager extends EventEmitter { // 导出类 AlertManager
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 告警配置 / Alert configuration
    this.config = { // 设置 config
      // 是否启用邮件告警 / Whether to enable email alerts
      enableEmail: config.enableEmail || false, // 设置 enableEmail 字段

      // 是否启用 Telegram 告警 / Whether to enable Telegram alerts
      enableTelegram: config.enableTelegram || false, // 设置 enableTelegram 字段

      // 是否启用钉钉告警 / Whether to enable DingTalk alerts
      enableDingTalk: config.enableDingTalk || false, // 设置 enableDingTalk 字段

      // 是否启用 Webhook 告警 / Whether to enable Webhook alerts
      enableWebhook: config.enableWebhook || false, // 设置 enableWebhook 字段

      // 邮件配置 / Email configuration
      email: { // 设置 email 字段
        host: config.smtpHost || process.env.SMTP_HOST, // 读取环境变量 SMTP_HOST
        port: config.smtpPort || process.env.SMTP_PORT || 587, // 读取环境变量 SMTP_PORT
        user: config.smtpUser || process.env.SMTP_USER, // 读取环境变量 SMTP_USER
        pass: config.smtpPass || process.env.SMTP_PASS, // 读取环境变量 SMTP_PASS
        to: config.alertEmailTo || process.env.ALERT_EMAIL_TO, // 读取环境变量 ALERT_EMAIL_TO
      }, // 结束代码块

      // Telegram 配置 / Telegram configuration
      telegram: { // 设置 telegram 字段
        botToken: config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN, // 读取环境变量 TELEGRAM_BOT_TOKEN
        chatId: config.telegramChatId || process.env.TELEGRAM_CHAT_ID, // 读取环境变量 TELEGRAM_CHAT_ID
      }, // 结束代码块

      // 钉钉配置 / DingTalk configuration
      dingtalk: { // 设置 dingtalk 字段
        webhook: config.dingtalkWebhook || process.env.DINGTALK_WEBHOOK, // 读取环境变量 DINGTALK_WEBHOOK
        secret: config.dingtalkSecret || process.env.DINGTALK_SECRET, // 读取环境变量 DINGTALK_SECRET
      }, // 结束代码块

      // Webhook 配置 / Webhook configuration
      webhook: { // 设置 webhook 字段
        url: config.webhookUrl || process.env.ALERT_WEBHOOK_URL, // 读取环境变量 ALERT_WEBHOOK_URL
      }, // 结束代码块

      // 告警冷却时间 (毫秒) / Alert cooldown (milliseconds)
      cooldown: config.cooldown || 60000,  // 1 分钟
    }; // 结束代码块

    // 邮件发送器 / Email transporter
    this.emailTransporter = null; // 设置 emailTransporter

    // 告警历史 / Alert history
    this.alertHistory = []; // 设置 alertHistory

    // 告警冷却记录 / Alert cooldown records
    this.cooldownMap = new Map(); // 设置 cooldownMap

    // 初始化邮件发送器 / Initialize email transporter
    this._initEmailTransporter(); // 调用 _initEmailTransporter
  } // 结束代码块

  /**
   * 发送告警
   * Send alert
   * @param {Object} alert - 告警信息 / Alert information
   * @returns {Promise<Object>} 发送结果 / Send result
   */
  async send(alert) { // 执行语句
    const { // 解构赋值
      level = 'info',      // 告警级别: info, warning, error, critical / Alert level
      title,               // 告警标题 / Alert title
      message,             // 告警消息 / Alert message
      data = {},           // 附加数据 / Additional data
      channels = [],       // 指定渠道 (可选) / Specified channels (optional)
    } = alert; // 执行语句

    // 检查冷却 / Check cooldown
    const alertKey = `${level}:${title}`; // 定义常量 alertKey
    if (this._isInCooldown(alertKey)) { // 条件判断 this._isInCooldown(alertKey)
      console.log(`[AlertManager] 告警在冷却中，跳过 / Alert in cooldown, skipping: ${title}`); // 控制台输出
      return { skipped: true, reason: 'cooldown' }; // 返回结果
    } // 结束代码块

    // 创建告警记录 / Create alert record
    const alertRecord = { // 定义常量 alertRecord
      id: Date.now().toString(36) + Math.random().toString(36).substr(2), // 设置 id 字段
      level, // 执行语句
      title, // 执行语句
      message, // 执行语句
      data, // 执行语句
      timestamp: new Date().toISOString(), // 设置 timestamp 字段
      results: {}, // 设置 results 字段
    }; // 结束代码块

    // 确定发送渠道 / Determine channels to send
    const targetChannels = channels.length > 0 ? channels : this._getDefaultChannels(level); // 定义常量 targetChannels

    // 并行发送到各渠道 / Send to channels in parallel
    const sendPromises = []; // 定义常量 sendPromises

    if (targetChannels.includes('email') && this.config.enableEmail) { // 条件判断 targetChannels.includes('email') && this.conf...
      sendPromises.push( // 调用 sendPromises.push
        this._sendEmail(alertRecord).then(r => ({ channel: 'email', ...r })) // 调用 _sendEmail
      ); // 结束调用或参数
    } // 结束代码块

    if (targetChannels.includes('telegram') && this.config.enableTelegram) { // 条件判断 targetChannels.includes('telegram') && this.c...
      sendPromises.push( // 调用 sendPromises.push
        this._sendTelegram(alertRecord).then(r => ({ channel: 'telegram', ...r })) // 调用 _sendTelegram
      ); // 结束调用或参数
    } // 结束代码块

    if (targetChannels.includes('dingtalk') && this.config.enableDingTalk) { // 条件判断 targetChannels.includes('dingtalk') && this.c...
      sendPromises.push( // 调用 sendPromises.push
        this._sendDingTalk(alertRecord).then(r => ({ channel: 'dingtalk', ...r })) // 调用 _sendDingTalk
      ); // 结束调用或参数
    } // 结束代码块

    if (targetChannels.includes('webhook') && this.config.enableWebhook) { // 条件判断 targetChannels.includes('webhook') && this.co...
      sendPromises.push( // 调用 sendPromises.push
        this._sendWebhook(alertRecord).then(r => ({ channel: 'webhook', ...r })) // 调用 _sendWebhook
      ); // 结束调用或参数
    } // 结束代码块

    // 等待所有发送完成 / Wait for all sends to complete
    const results = await Promise.allSettled(sendPromises); // 定义常量 results

    // 处理结果 / Process results
    for (const result of results) { // 循环 const result of results
      if (result.status === 'fulfilled') { // 条件判断 result.status === 'fulfilled'
        alertRecord.results[result.value.channel] = { // 执行语句
          success: result.value.success, // 设置 success 字段
          error: result.value.error, // 设置 error 字段
        }; // 结束代码块
      } else { // 执行语句
        console.error('[AlertManager] 发送失败 / Send failed:', result.reason); // 控制台输出
      } // 结束代码块
    } // 结束代码块

    // 记录告警历史 / Record alert history
    this.alertHistory.push(alertRecord); // 访问 alertHistory

    // 设置冷却 / Set cooldown
    this._setCooldown(alertKey); // 调用 _setCooldown

    // 发出告警事件 / Emit alert event
    this.emit('alertSent', alertRecord); // 调用 emit

    console.log(`[AlertManager] 告警已发送 / Alert sent: ${level} - ${title}`); // 控制台输出

    return alertRecord; // 返回结果
  } // 结束代码块

  /**
   * 发送信息级别告警
   * Send info level alert
   */
  async info(title, message, data = {}) { // 执行语句
    return this.send({ level: 'info', title, message, data }); // 返回结果
  } // 结束代码块

  /**
   * 发送警告级别告警
   * Send warning level alert
   */
  async warning(title, message, data = {}) { // 执行语句
    return this.send({ level: 'warning', title, message, data }); // 返回结果
  } // 结束代码块

  /**
   * 发送错误级别告警
   * Send error level alert
   */
  async error(title, message, data = {}) { // 执行语句
    return this.send({ level: 'error', title, message, data }); // 返回结果
  } // 结束代码块

  /**
   * 发送紧急级别告警
   * Send critical level alert
   */
  async critical(title, message, data = {}) { // 执行语句
    return this.send({ level: 'critical', title, message, data }); // 返回结果
  } // 结束代码块

  /**
   * 获取告警历史
   * Get alert history
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 告警历史 / Alert history
   */
  getHistory(limit = 100) { // 调用 getHistory
    return this.alertHistory.slice(-limit); // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 初始化邮件发送器
   * Initialize email transporter
   * @private
   */
  _initEmailTransporter() { // 调用 _initEmailTransporter
    if (!this.config.enableEmail || !this.config.email.host) { // 条件判断 !this.config.enableEmail || !this.config.emai...
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      this.emailTransporter = nodemailer.createTransport({ // 设置 emailTransporter
        host: this.config.email.host, // 设置 host 字段
        port: this.config.email.port, // 设置 port 字段
        secure: this.config.email.port === 465, // 设置 secure 字段
        auth: { // 设置 auth 字段
          user: this.config.email.user, // 设置 user 字段
          pass: this.config.email.pass, // 设置 pass 字段
        }, // 结束代码块
      }); // 结束代码块

      console.log('[AlertManager] 邮件发送器初始化成功 / Email transporter initialized'); // 控制台输出
    } catch (error) { // 执行语句
      console.error('[AlertManager] 邮件发送器初始化失败 / Email transporter initialization failed:', error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 发送邮件
   * Send email
   * @private
   */
  async _sendEmail(alert) { // 执行语句
    if (!this.emailTransporter) { // 条件判断 !this.emailTransporter
      return { success: false, error: 'Email transporter not initialized' }; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 构建邮件内容 / Build email content
      const subject = `[${alert.level.toUpperCase()}] ${alert.title}`; // 定义常量 subject
      const html = this._buildEmailHtml(alert); // 定义常量 html

      // 发送邮件 / Send email
      await this.emailTransporter.sendMail({ // 等待异步结果
        from: this.config.email.user, // 设置 from 字段
        to: this.config.email.to, // 设置 to 字段
        subject, // 执行语句
        html, // 执行语句
      }); // 结束代码块

      return { success: true }; // 返回结果
    } catch (error) { // 执行语句
      console.error('[AlertManager] 邮件发送失败 / Email send failed:', error.message); // 控制台输出
      return { success: false, error: error.message }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 发送 Telegram 消息
   * Send Telegram message
   * @private
   */
  async _sendTelegram(alert) { // 执行语句
    const { botToken, chatId } = this.config.telegram; // 解构赋值

    if (!botToken || !chatId) { // 条件判断 !botToken || !chatId
      return { success: false, error: 'Telegram not configured' }; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 构建消息 / Build message
      const text = this._buildTelegramMessage(alert); // 定义常量 text

      // 发送消息 / Send message
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { // 等待异步结果
        chat_id: chatId, // 设置 chat_id 字段
        text, // 执行语句
        parse_mode: 'HTML', // 设置 parse_mode 字段
      }); // 结束代码块

      return { success: true }; // 返回结果
    } catch (error) { // 执行语句
      console.error('[AlertManager] Telegram 发送失败 / Telegram send failed:', error.message); // 控制台输出
      return { success: false, error: error.message }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 发送钉钉消息
   * Send DingTalk message
   * @private
   */
  async _sendDingTalk(alert) { // 执行语句
    const { webhook } = this.config.dingtalk; // 解构赋值

    if (!webhook) { // 条件判断 !webhook
      return { success: false, error: 'DingTalk not configured' }; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 构建消息 / Build message
      const message = { // 定义常量 message
        msgtype: 'markdown', // 设置 msgtype 字段
        markdown: { // 设置 markdown 字段
          title: alert.title, // 设置 title 字段
          text: this._buildDingTalkMessage(alert), // 设置 text 字段
        }, // 结束代码块
      }; // 结束代码块

      // 发送消息 / Send message
      await axios.post(webhook, message); // 等待异步结果

      return { success: true }; // 返回结果
    } catch (error) { // 执行语句
      console.error('[AlertManager] 钉钉发送失败 / DingTalk send failed:', error.message); // 控制台输出
      return { success: false, error: error.message }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 发送 Webhook
   * Send Webhook
   * @private
   */
  async _sendWebhook(alert) { // 执行语句
    const { url } = this.config.webhook; // 解构赋值

    if (!url) { // 条件判断 !url
      return { success: false, error: 'Webhook not configured' }; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 发送请求 / Send request
      await axios.post(url, { // 等待异步结果
        level: alert.level, // 设置 level 字段
        title: alert.title, // 设置 title 字段
        message: alert.message, // 设置 message 字段
        data: alert.data, // 设置 data 字段
        timestamp: alert.timestamp, // 设置 timestamp 字段
      }); // 结束代码块

      return { success: true }; // 返回结果
    } catch (error) { // 执行语句
      console.error('[AlertManager] Webhook 发送失败 / Webhook send failed:', error.message); // 控制台输出
      return { success: false, error: error.message }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 构建邮件 HTML
   * Build email HTML
   * @private
   */
  _buildEmailHtml(alert) { // 调用 _buildEmailHtml
    const levelColors = { // 定义常量 levelColors
      info: '#17a2b8', // 设置 info 字段
      warning: '#ffc107', // 设置 warning 字段
      error: '#dc3545', // 设置 error 字段
      critical: '#ff0000', // 设置 critical 字段
    }; // 结束代码块

    const color = levelColors[alert.level] || '#6c757d'; // 定义常量 color

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="background-color: ${color}; color: white; padding: 10px; border-radius: 5px;">
          <h2 style="margin: 0;">${alert.title}</h2>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa; border-radius: 5px; margin-top: 10px;">
          <p><strong>级别 / Level:</strong> ${alert.level.toUpperCase()}</p>
          <p><strong>时间 / Time:</strong> ${alert.timestamp}</p>
          <p><strong>消息 / Message:</strong></p>
          <p style="background-color: white; padding: 10px; border-radius: 3px;">${alert.message}</p>
          ${Object.keys(alert.data).length > 0 ? `
            <p><strong>附加数据 / Data:</strong></p>
            <pre style="background-color: white; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(alert.data, null, 2)}</pre>
          ` : ''}
        </div>
        <div style="margin-top: 20px; font-size: 12px; color: #6c757d;">
          量化交易系统告警 / Quant Trading System Alert
        </div>
      </div>
    `; // 执行语句
  } // 结束代码块

  /**
   * 构建 Telegram 消息
   * Build Telegram message
   * @private
   */
  _buildTelegramMessage(alert) { // 调用 _buildTelegramMessage
    const levelEmojis = { // 定义常量 levelEmojis
      info: 'ℹ️', // 设置 info 字段
      warning: '⚠️', // 设置 warning 字段
      error: '❌', // 设置 error 字段
      critical: '🚨', // 设置 critical 字段
    }; // 结束代码块

    const emoji = levelEmojis[alert.level] || '📢'; // 定义常量 emoji

    let text = `${emoji} <b>${alert.title}</b>\n\n`; // 定义变量 text
    text += `<b>级别:</b> ${alert.level.toUpperCase()}\n`; // 执行语句
    text += `<b>时间:</b> ${alert.timestamp}\n\n`; // 执行语句
    text += `<b>消息:</b>\n${alert.message}`; // 执行语句

    if (Object.keys(alert.data).length > 0) { // 条件判断 Object.keys(alert.data).length > 0
      text += `\n\n<b>数据:</b>\n<pre>${JSON.stringify(alert.data, null, 2)}</pre>`; // 执行语句
    } // 结束代码块

    return text; // 返回结果
  } // 结束代码块

  /**
   * 构建钉钉消息
   * Build DingTalk message
   * @private
   */
  _buildDingTalkMessage(alert) { // 调用 _buildDingTalkMessage
    const levelEmojis = { // 定义常量 levelEmojis
      info: '💡', // 设置 info 字段
      warning: '⚠️', // 设置 warning 字段
      error: '❌', // 设置 error 字段
      critical: '🚨', // 设置 critical 字段
    }; // 结束代码块

    const emoji = levelEmojis[alert.level] || '📢'; // 定义常量 emoji

    let text = `### ${emoji} ${alert.title}\n\n`; // 定义变量 text
    text += `- **级别:** ${alert.level.toUpperCase()}\n`; // 执行语句
    text += `- **时间:** ${alert.timestamp}\n\n`; // 执行语句
    text += `**消息:**\n\n${alert.message}`; // 执行语句

    if (Object.keys(alert.data).length > 0) { // 条件判断 Object.keys(alert.data).length > 0
      text += `\n\n**数据:**\n\n\`\`\`json\n${JSON.stringify(alert.data, null, 2)}\n\`\`\``; // 执行语句
    } // 结束代码块

    return text; // 返回结果
  } // 结束代码块

  /**
   * 获取默认渠道
   * Get default channels
   * @private
   */
  _getDefaultChannels(level) { // 调用 _getDefaultChannels
    // 根据级别返回默认渠道 / Return default channels based on level
    switch (level) { // 分支选择 level
      case 'critical': // 分支 'critical'
        return ['email', 'telegram', 'dingtalk', 'webhook']; // 返回结果
      case 'error': // 分支 'error'
        return ['email', 'telegram', 'dingtalk']; // 返回结果
      case 'warning': // 分支 'warning'
        return ['telegram', 'dingtalk']; // 返回结果
      default: // 默认分支
        return ['webhook']; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否在冷却中
   * Check if in cooldown
   * @private
   */
  _isInCooldown(key) { // 调用 _isInCooldown
    const lastTime = this.cooldownMap.get(key); // 定义常量 lastTime
    if (!lastTime) { // 条件判断 !lastTime
      return false; // 返回结果
    } // 结束代码块
    return Date.now() - lastTime < this.config.cooldown; // 返回结果
  } // 结束代码块

  /**
   * 设置冷却
   * Set cooldown
   * @private
   */
  _setCooldown(key) { // 调用 _setCooldown
    this.cooldownMap.set(key, Date.now()); // 访问 cooldownMap
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default AlertManager; // 默认导出
