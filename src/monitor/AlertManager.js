/**
 * 告警管理器
 * Alert Manager
 *
 * 负责系统告警的发送，支持多种告警渠道
 * Responsible for sending system alerts, supports multiple alert channels
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入 HTTP 请求库 / Import HTTP request library
import axios from 'axios';

// 导入邮件发送库 / Import email library
import nodemailer from 'nodemailer';

/**
 * 告警管理器类
 * Alert Manager Class
 */
export class AlertManager extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 告警配置 / Alert configuration
    this.config = {
      // 是否启用邮件告警 / Whether to enable email alerts
      enableEmail: config.enableEmail || false,

      // 是否启用 Telegram 告警 / Whether to enable Telegram alerts
      enableTelegram: config.enableTelegram || false,

      // 是否启用钉钉告警 / Whether to enable DingTalk alerts
      enableDingTalk: config.enableDingTalk || false,

      // 是否启用 Webhook 告警 / Whether to enable Webhook alerts
      enableWebhook: config.enableWebhook || false,

      // 邮件配置 / Email configuration
      email: {
        host: config.smtpHost || process.env.SMTP_HOST,
        port: config.smtpPort || process.env.SMTP_PORT || 587,
        user: config.smtpUser || process.env.SMTP_USER,
        pass: config.smtpPass || process.env.SMTP_PASS,
        to: config.alertEmailTo || process.env.ALERT_EMAIL_TO,
      },

      // Telegram 配置 / Telegram configuration
      telegram: {
        botToken: config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
        chatId: config.telegramChatId || process.env.TELEGRAM_CHAT_ID,
      },

      // 钉钉配置 / DingTalk configuration
      dingtalk: {
        webhook: config.dingtalkWebhook || process.env.DINGTALK_WEBHOOK,
        secret: config.dingtalkSecret || process.env.DINGTALK_SECRET,
      },

      // Webhook 配置 / Webhook configuration
      webhook: {
        url: config.webhookUrl || process.env.ALERT_WEBHOOK_URL,
      },

      // 告警冷却时间 (毫秒) / Alert cooldown (milliseconds)
      cooldown: config.cooldown || 60000,  // 1 分钟
    };

    // 邮件发送器 / Email transporter
    this.emailTransporter = null;

    // 告警历史 / Alert history
    this.alertHistory = [];

    // 告警冷却记录 / Alert cooldown records
    this.cooldownMap = new Map();

    // 初始化邮件发送器 / Initialize email transporter
    this._initEmailTransporter();
  }

  /**
   * 发送告警
   * Send alert
   * @param {Object} alert - 告警信息 / Alert information
   * @returns {Promise<Object>} 发送结果 / Send result
   */
  async send(alert) {
    const {
      level = 'info',      // 告警级别: info, warning, error, critical / Alert level
      title,               // 告警标题 / Alert title
      message,             // 告警消息 / Alert message
      data = {},           // 附加数据 / Additional data
      channels = [],       // 指定渠道 (可选) / Specified channels (optional)
    } = alert;

    // 检查冷却 / Check cooldown
    const alertKey = `${level}:${title}`;
    if (this._isInCooldown(alertKey)) {
      console.log(`[AlertManager] 告警在冷却中，跳过 / Alert in cooldown, skipping: ${title}`);
      return { skipped: true, reason: 'cooldown' };
    }

    // 创建告警记录 / Create alert record
    const alertRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      level,
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
      results: {},
    };

    // 确定发送渠道 / Determine channels to send
    const targetChannels = channels.length > 0 ? channels : this._getDefaultChannels(level);

    // 并行发送到各渠道 / Send to channels in parallel
    const sendPromises = [];

    if (targetChannels.includes('email') && this.config.enableEmail) {
      sendPromises.push(
        this._sendEmail(alertRecord).then(r => ({ channel: 'email', ...r }))
      );
    }

    if (targetChannels.includes('telegram') && this.config.enableTelegram) {
      sendPromises.push(
        this._sendTelegram(alertRecord).then(r => ({ channel: 'telegram', ...r }))
      );
    }

    if (targetChannels.includes('dingtalk') && this.config.enableDingTalk) {
      sendPromises.push(
        this._sendDingTalk(alertRecord).then(r => ({ channel: 'dingtalk', ...r }))
      );
    }

    if (targetChannels.includes('webhook') && this.config.enableWebhook) {
      sendPromises.push(
        this._sendWebhook(alertRecord).then(r => ({ channel: 'webhook', ...r }))
      );
    }

    // 等待所有发送完成 / Wait for all sends to complete
    const results = await Promise.allSettled(sendPromises);

    // 处理结果 / Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        alertRecord.results[result.value.channel] = {
          success: result.value.success,
          error: result.value.error,
        };
      } else {
        console.error('[AlertManager] 发送失败 / Send failed:', result.reason);
      }
    }

    // 记录告警历史 / Record alert history
    this.alertHistory.push(alertRecord);

    // 设置冷却 / Set cooldown
    this._setCooldown(alertKey);

    // 发出告警事件 / Emit alert event
    this.emit('alertSent', alertRecord);

    console.log(`[AlertManager] 告警已发送 / Alert sent: ${level} - ${title}`);

    return alertRecord;
  }

  /**
   * 发送信息级别告警
   * Send info level alert
   */
  async info(title, message, data = {}) {
    return this.send({ level: 'info', title, message, data });
  }

  /**
   * 发送警告级别告警
   * Send warning level alert
   */
  async warning(title, message, data = {}) {
    return this.send({ level: 'warning', title, message, data });
  }

  /**
   * 发送错误级别告警
   * Send error level alert
   */
  async error(title, message, data = {}) {
    return this.send({ level: 'error', title, message, data });
  }

  /**
   * 发送紧急级别告警
   * Send critical level alert
   */
  async critical(title, message, data = {}) {
    return this.send({ level: 'critical', title, message, data });
  }

  /**
   * 获取告警历史
   * Get alert history
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 告警历史 / Alert history
   */
  getHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 初始化邮件发送器
   * Initialize email transporter
   * @private
   */
  _initEmailTransporter() {
    if (!this.config.enableEmail || !this.config.email.host) {
      return;
    }

    try {
      this.emailTransporter = nodemailer.createTransport({
        host: this.config.email.host,
        port: this.config.email.port,
        secure: this.config.email.port === 465,
        auth: {
          user: this.config.email.user,
          pass: this.config.email.pass,
        },
      });

      console.log('[AlertManager] 邮件发送器初始化成功 / Email transporter initialized');
    } catch (error) {
      console.error('[AlertManager] 邮件发送器初始化失败 / Email transporter initialization failed:', error.message);
    }
  }

  /**
   * 发送邮件
   * Send email
   * @private
   */
  async _sendEmail(alert) {
    if (!this.emailTransporter) {
      return { success: false, error: 'Email transporter not initialized' };
    }

    try {
      // 构建邮件内容 / Build email content
      const subject = `[${alert.level.toUpperCase()}] ${alert.title}`;
      const html = this._buildEmailHtml(alert);

      // 发送邮件 / Send email
      await this.emailTransporter.sendMail({
        from: this.config.email.user,
        to: this.config.email.to,
        subject,
        html,
      });

      return { success: true };
    } catch (error) {
      console.error('[AlertManager] 邮件发送失败 / Email send failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 发送 Telegram 消息
   * Send Telegram message
   * @private
   */
  async _sendTelegram(alert) {
    const { botToken, chatId } = this.config.telegram;

    if (!botToken || !chatId) {
      return { success: false, error: 'Telegram not configured' };
    }

    try {
      // 构建消息 / Build message
      const text = this._buildTelegramMessage(alert);

      // 发送消息 / Send message
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });

      return { success: true };
    } catch (error) {
      console.error('[AlertManager] Telegram 发送失败 / Telegram send failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 发送钉钉消息
   * Send DingTalk message
   * @private
   */
  async _sendDingTalk(alert) {
    const { webhook } = this.config.dingtalk;

    if (!webhook) {
      return { success: false, error: 'DingTalk not configured' };
    }

    try {
      // 构建消息 / Build message
      const message = {
        msgtype: 'markdown',
        markdown: {
          title: alert.title,
          text: this._buildDingTalkMessage(alert),
        },
      };

      // 发送消息 / Send message
      await axios.post(webhook, message);

      return { success: true };
    } catch (error) {
      console.error('[AlertManager] 钉钉发送失败 / DingTalk send failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 发送 Webhook
   * Send Webhook
   * @private
   */
  async _sendWebhook(alert) {
    const { url } = this.config.webhook;

    if (!url) {
      return { success: false, error: 'Webhook not configured' };
    }

    try {
      // 发送请求 / Send request
      await axios.post(url, {
        level: alert.level,
        title: alert.title,
        message: alert.message,
        data: alert.data,
        timestamp: alert.timestamp,
      });

      return { success: true };
    } catch (error) {
      console.error('[AlertManager] Webhook 发送失败 / Webhook send failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 构建邮件 HTML
   * Build email HTML
   * @private
   */
  _buildEmailHtml(alert) {
    const levelColors = {
      info: '#17a2b8',
      warning: '#ffc107',
      error: '#dc3545',
      critical: '#ff0000',
    };

    const color = levelColors[alert.level] || '#6c757d';

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
    `;
  }

  /**
   * 构建 Telegram 消息
   * Build Telegram message
   * @private
   */
  _buildTelegramMessage(alert) {
    const levelEmojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };

    const emoji = levelEmojis[alert.level] || '📢';

    let text = `${emoji} <b>${alert.title}</b>\n\n`;
    text += `<b>级别:</b> ${alert.level.toUpperCase()}\n`;
    text += `<b>时间:</b> ${alert.timestamp}\n\n`;
    text += `<b>消息:</b>\n${alert.message}`;

    if (Object.keys(alert.data).length > 0) {
      text += `\n\n<b>数据:</b>\n<pre>${JSON.stringify(alert.data, null, 2)}</pre>`;
    }

    return text;
  }

  /**
   * 构建钉钉消息
   * Build DingTalk message
   * @private
   */
  _buildDingTalkMessage(alert) {
    const levelEmojis = {
      info: '💡',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };

    const emoji = levelEmojis[alert.level] || '📢';

    let text = `### ${emoji} ${alert.title}\n\n`;
    text += `- **级别:** ${alert.level.toUpperCase()}\n`;
    text += `- **时间:** ${alert.timestamp}\n\n`;
    text += `**消息:**\n\n${alert.message}`;

    if (Object.keys(alert.data).length > 0) {
      text += `\n\n**数据:**\n\n\`\`\`json\n${JSON.stringify(alert.data, null, 2)}\n\`\`\``;
    }

    return text;
  }

  /**
   * 获取默认渠道
   * Get default channels
   * @private
   */
  _getDefaultChannels(level) {
    // 根据级别返回默认渠道 / Return default channels based on level
    switch (level) {
      case 'critical':
        return ['email', 'telegram', 'dingtalk', 'webhook'];
      case 'error':
        return ['email', 'telegram', 'dingtalk'];
      case 'warning':
        return ['telegram', 'dingtalk'];
      default:
        return ['webhook'];
    }
  }

  /**
   * 检查是否在冷却中
   * Check if in cooldown
   * @private
   */
  _isInCooldown(key) {
    const lastTime = this.cooldownMap.get(key);
    if (!lastTime) {
      return false;
    }
    return Date.now() - lastTime < this.config.cooldown;
  }

  /**
   * 设置冷却
   * Set cooldown
   * @private
   */
  _setCooldown(key) {
    this.cooldownMap.set(key, Date.now());
  }
}

// 导出默认类 / Export default class
export default AlertManager;
