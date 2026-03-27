/**
 * Email Service
 * Handles OTP email sending via SMTP
 */

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = require('../utils/env');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function getSmtpTransporter() {
  if (!nodemailer) {
    throw new Error('nodemailer package is not installed');
  }
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error('SMTP configuration is incomplete');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendOtpViaEmail({ destination, code }) {
  if (!nodemailer || !SMTP_HOST) {
    throw new Error('Email service not configured');
  }

  const transporter = getSmtpTransporter();
  const mailOptions = {
    from: SMTP_FROM,
    to: destination,
    subject: 'Your Notary OTP Code',
    html: `
      <p>Your OTP code is: <strong>${code}</strong></p>
      <p>This code expires in 10 minutes.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  getSmtpTransporter,
  sendOtpViaEmail,
};
