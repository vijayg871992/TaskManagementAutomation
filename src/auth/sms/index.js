'use strict';

const config = require('../../config');

function provider() {
  if (config.sms.provider === 'aloware') return require('./aloware');
  return require('./console');
}

async function sendSms(to, body) {
  return provider().sendSms(to, body);
}

module.exports = { sendSms };
