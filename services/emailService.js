const nodemailer = require('nodemailer');

const isEmailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const sendPasswordResetEmail = async ({ to, fullname, resetUrl }) => {
  if (!isEmailConfigured()) {
    const err = new Error('Email service is not configured (SMTP_* env vars missing)');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const appName = 'DexElearning';
  const displayName = (fullname || 'there').split(' ')[0];

  const info = await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || `"${appName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `Reset your ${appName} password`,
    text:
      `Hi ${displayName},\n\n` +
      `Someone (hopefully you) asked to reset the password for your ${appName} account.\n\n` +
      `Open this link to choose a new password (valid for 30 minutes):\n${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email — your password stays unchanged.\n\n` +
      `— ${appName} Team`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #7c3aed; margin-bottom: 8px;">Hi ${displayName} 👋</h2>
        <p>Someone (hopefully you) asked to reset the password for your <strong>${appName}</strong> account.</p>
        <p style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}"
             style="background: linear-gradient(135deg, #7c3aed, #9333ea); color: #ffffff; text-decoration: none;
                    padding: 12px 28px; border-radius: 999px; font-weight: bold; display: inline-block;">
            Reset My Password
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">
          This link expires in <strong>30 minutes</strong>. If the button doesn't work, paste this link into your browser:<br/>
          <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>
      </div>`,
  });

  return info;
};

module.exports = { sendPasswordResetEmail, isEmailConfigured };
