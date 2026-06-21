'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeUsPhone, formatUsPretty } = require('../src/util/phone');

test('normalizes American-style inputs to E.164', () => {
  const expected = '+16467871339';
  assert.equal(normalizeUsPhone('(646) 787-1339'), expected);
  assert.equal(normalizeUsPhone('646-787-1339'), expected);
  assert.equal(normalizeUsPhone('646.787.1339'), expected);
  assert.equal(normalizeUsPhone('6467871339'), expected);
  assert.equal(normalizeUsPhone('1 646 787 1339'), expected);
  assert.equal(normalizeUsPhone('+1 (646) 787-1339'), expected);
  assert.equal(normalizeUsPhone('+16467871339'), expected);
});

test('rejects invalid numbers', () => {
  assert.equal(normalizeUsPhone('12345'), null);
  assert.equal(normalizeUsPhone(''), null);
  assert.equal(normalizeUsPhone(null), null);
});

test('formats E.164 back to American display', () => {
  assert.equal(formatUsPretty('+16467871339'), '(646) 787-1339');
});
