const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, OTP_TTL_MS } = require('./env');

const isValidEmailAddress = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
};

const hashOtpCode = (code) => {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
};

const getSmtpTransporter = () => {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error('SMTP configuration is incomplete (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === true || String(SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

async function sendOtpViaEmail({ destination, code }) {
  const transporter = getSmtpTransporter();
  const ttlMinutes = Math.max(1, Math.round(Number(OTP_TTL_MS || 10 * 60 * 1000) / 60000));

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: destination,
    subject: 'Your Notary Platform OTP Code',
    text: `Your verification code is ${code}. It expires in ${ttlMinutes} minutes.`,
    html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in ${ttlMinutes} minutes.</p>`,
  });

  return { messageId: info?.messageId || null };
}

module.exports = {
  isValidEmailAddress,
  hashOtpCode,
  sendOtpViaEmail,
};
