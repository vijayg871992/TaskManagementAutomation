'use strict';

/**
 * Web Push notifications (free; VAPID). Sends to a user's subscribed devices so
 * they get an alert + sound when a task is assigned to them or someone replies.
 *
 * Gracefully no-ops if VAPID keys aren't configured or the user has no
 * subscription. iOS requires the PWA to be installed (Add to Home Screen, iOS 16.4+).
 */

const webpush = require('web-push');
const config = require('../config');
const { getKnex } = require('../db/knex');
const { nowUtcISO } = require('../util/time');

let configured = false;
function ensureConfigured() {
  if (configured) return config.push.publicKey && config.push.privateKey;
  if (config.push.publicKey && config.push.privateKey) {
    webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
    configured = true;
    return true;
  }
  return false;
}

async function saveSubscription(userId, sub) {
  if (!sub || !sub.endpoint || !sub.keys) return;
  const existing = await getKnex()('push_subscriptions').where({ endpoint: sub.endpoint }).first();
  if (existing) {
    await getKnex()('push_subscriptions').where({ id: existing.id }).update({
      user_id: userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    });
    return;
  }
  await getKnex()('push_subscriptions').insert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    created_at: nowUtcISO(),
  });
}

/** Send a notification to every device a user has subscribed. Fire-and-forget. */
async function sendToUser(userId, payload) {
  if (!ensureConfigured() || !userId) return;
  const subs = await getKnex()('push_subscriptions').where({ user_id: userId });
  await Promise.all(
    subs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err) {
        // 404/410 = subscription expired — clean it up.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await getKnex()('push_subscriptions').where({ id: s.id }).del();
        } else {
          console.error('push send error:', err.statusCode || err.message);
        }
      }
    })
  );
}

function getPublicKey() {
  return config.push.publicKey || '';
}

module.exports = { saveSubscription, sendToUser, getPublicKey };
