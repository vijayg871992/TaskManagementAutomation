'use strict';

const config = require('../config');

function transport() {
  if (config.email.provider === 'smtp') return require('./smtp');
  return require('./file');
}

async function send(message) {
  return transport().send(message);
}

module.exports = { send };
