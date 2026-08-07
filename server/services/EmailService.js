'use strict';

const { Resend } = require('resend');

class EmailService {
  constructor({ apiKey, from, appName = 'SiteWise' }) {
    this._from = from;
    this._appName = appName;
    this._resend = apiKey ? new Resend(apiKey) : null;
  }

  get configured() {
    return !!this._resend;
  }

  async sendPasswordReset({ to, resetUrl, name }) {
    if (!this._resend) throw new Error('Email is not configured (missing RESEND_API_KEY)');

    const greeting = name ? `Hi ${name},` : 'Hi,';
    const html = EmailService._resetHtml({ greeting, resetUrl, appName: this._appName });
    const text =
      `${greeting}\n\nWe received a request to reset your ${this._appName} password.\n` +
      `Reset it here (link expires in 1 hour):\n${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`;

    const { data, error } = await this._resend.emails.send({
      from: this._from,
      to: [to],
      subject: `Reset your ${this._appName} password`,
      html,
      text,
    });

    if (error) {
      const err = new Error(error.message || 'Failed to send email');
      err.cause = error;
      throw err;
    }
    return data;
  }

  static _resetHtml({ greeting, resetUrl, appName }) {
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background:#233154;padding:22px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:bold;">${appName}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 14px;color:#1e293b;font-size:15px;">${greeting}</p>
          <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.55;">
            We received a request to reset your ${appName} password. Click the button below to choose a new one.
            This link expires in <strong>1 hour</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
            <tr><td style="border-radius:8px;background:#2563eb;">
              <a href="${resetUrl}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:8px;">Reset password</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;color:#64748b;font-size:12px;line-height:1.5;">
            If the button doesn't work, paste this link into your browser:
          </p>
          <p style="margin:0 0 18px;word-break:break-all;font-size:12px;">
            <a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a>
          </p>
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
            If you didn't request this, you can safely ignore this email. Your password won't change.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
          <span style="color:#94a3b8;font-size:11px;">${appName} &middot; Passion and Precision</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }
}

module.exports = EmailService;