'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure, // false => STARTTLS on 587
      auth: { user: config.email.smtp.user, pass: config.email.smtp.pass },
    });
  }
  return transporter;
}

/** Real email transport — e.g. Office 365 / Outlook SMTP login. */
async function send({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({
    from: config.email.from,
    to,
    subject,
    html,
    text,
  });
  return { ok: true, provider: 'smtp', messageId: info.messageId };
}

module.exports = { send };
