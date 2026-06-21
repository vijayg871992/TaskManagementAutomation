'use strict';

const express = require('express');
const otp = require('../../auth/otp');
const taskService = require('../../services/taskService');

const router = express.Router();

router.post('/request-otp', async (req, res) => {
  try {
    const result = await otp.requestOtp(req.body.phone);
    // Don't leak whether the number exists beyond the friendly message.
    res.json({ ok: result.ok, message: result.message });
  } catch (e) {
    console.error('request-otp error:', e);
    res.status(500).json({ ok: false, message: 'Could not send code. Try again.' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const user = await otp.verifyOtp(req.body.phone, req.body.code);
    if (!user) return res.status(401).json({ ok: false, message: 'Invalid or expired code.' });
    req.session.userId = user.id;
    res.json({ ok: true, user: { id: user.id, name: user.name } });
  } catch (e) {
    console.error('verify-otp error:', e);
    res.status(500).json({ ok: false, message: 'Verification failed.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await taskService.findUserById(req.session.userId);
  res.json({ user: user ? { id: user.id, name: user.name } : null });
});

module.exports = router;
