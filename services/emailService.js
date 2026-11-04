const nodemailer = require('nodemailer');

const isEmailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = async () => {
  if (isEmailConfigured()) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Development/Test fallback when SMTP env credentials are not yet configured
  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️ SMTP credentials not found in .env. Creating test nodemailer account (Ethereal)...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      console.warn('Could not create Ethereal account, using console transport logger:', err.message);
      return {
        sendMail: async (mailOptions) => {
          console.log('\n✉️ --- [SIMULATED EMAIL DISPATCH] ---');
          console.log(`To: ${mailOptions.to}`);
          console.log(`Subject: ${mailOptions.subject}`);
          console.log(`Text:\n${mailOptions.text}`);
          console.log('-------------------------------------\n');
          return { messageId: 'simulated-dev-id' };
        },
      };
    }
  }

  const err = new Error('Email service is not configured (SMTP_* env vars missing)');
  err.code = 'EMAIL_NOT_CONFIGURED';
  throw err;
};

const sendPasswordResetEmail = async ({ to, fullname, resetUrl }) => {
  const appName = 'DexElearning';
  const displayName = (fullname || 'there').split(' ')[0];
  const transporter = await getTransporter();

  const sender = process.env.EMAIL_FROM || `"${appName}" <${process.env.SMTP_USER || 'noreply@dexelearning.com'}>`;

  const mailOptions = {
    from: sender,
    to,
    subject: `Password Reset Request - ${appName}`,
    text:
      `Hi ${displayName},\n\n` +
      `You requested a password reset for your ${appName} account.\n\n` +
      `Click the link below to set a new password:\n${resetUrl}\n\n` +
      `This link will expire in 1 hour.\n\n` +
      `If you didn't request a password reset, you can safely ignore this email — your account remains secure.\n\n` +
      `Best regards,\nThe ${appName} Team`,
    html: `
      <div style="font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #6d28d9; margin-top: 0; font-size: 22px;">Hi ${displayName} 👋</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          You requested to reset the password for your <strong>${appName}</strong> account.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}"
             style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #ffffff; text-decoration: none;
                    padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;
                    box-shadow: 0 4px 6px -1px rgba(109, 40, 217, 0.2);">
            Reset Password
          </a>
        </div>
        <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; font-size: 13px; color: #64748b;">
            🔒 For security, this link expires in <strong>60 minutes</strong> and can only be used once.
          </p>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          If the button above doesn't work, copy and paste this secure URL into your browser:<br/>
          <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">
          If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>`,
  };

  const info = await transporter.sendMail(mailOptions);

  if (nodemailer.getTestMessageUrl && info && info.messageId && info.messageId !== 'simulated-dev-id') {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📬 [Ethereal Email Preview URL]:', previewUrl);
    }
  }

  return info;
};

module.exports = {
  sendPasswordResetEmail,
  isEmailConfigured,
  getTransporter,
};
