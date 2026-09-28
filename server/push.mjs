import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import webpush from 'web-push';

export function normalizePushSubscription(input) {
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new Error('Invalid subscription');
  const url = new URL(input.endpoint), host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'push.apple.com' || host.endsWith('.push.apple.com') || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Invalid push endpoint');
  if (!/^[A-Za-z0-9_-]{87}$/.test(input.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{22}$/.test(input.keys?.auth || '') || Buffer.from(input.keys.p256dh, 'base64url')[0] !== 4) throw new Error('Invalid push keys');
  return { endpoint: url.href, keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } };
}
export function pushConfigured(env) { return /^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY || '') && /^[A-Za-z0-9_-]{43}$/.test(env.VAPID_PRIVATE_KEY || '') && !!env.SHEETS_BRIDGE_SECRET; }
function signature(body, secret) { return createHmac('sha256', secret).update(body).digest('hex'); }
export function validDispatch(body, supplied, secret) {
  if (!secret || !/^[a-f0-9]{64}$/.test(supplied || '')) return false;
  if (!timingSafeEqual(Buffer.from(signature(body, secret), 'hex'), Buffer.from(supplied, 'hex'))) return false;
  try { const data = JSON.parse(body); return /^[a-zA-Z0-9-]{20,64}$/.test(data.jobId) && Number.isFinite(data.time) && Math.abs(Date.now() - data.time) < 900000; } catch { return false; }
}
export async function queuePushJob(jobId, env, fetcher = fetch) {
  if (!pushConfigured(env)) throw new Error('Push not configured');
  const body = JSON.stringify({ jobId, time: Date.now() });
  // Fixed trusted origin: never derive the dispatch destination from a request Host header.
  const response = await fetcher('https://robotland-trip.netlify.app/.netlify/functions/push-delivery-background', { method: 'POST', headers: { 'content-type': 'application/json', 'x-robotland-push': signature(body, env.SHEETS_BRIDGE_SECRET) }, body, signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (response.status !== 202) throw new Error('Push queue unavailable');
}
export async function deliverPushJob(env, callStore, jobId, send = webpush.sendNotification.bind(webpush), sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!pushConfigured(env)) throw new Error('Push not configured');
  const leaseKey = randomBytes(32).toString('hex');
  for (let batch = 0; batch < 30; batch++) {
    const claim = await callStore('pushClaim', { jobId, leaseKey });
    if (!claim.ok) throw new Error('Push store unavailable');
    if (claim.done || claim.busy) return;
    if (claim.waitMs) { await sleep(Math.min(claim.waitMs, 10000)); continue; }
    const delivered = [], expired = []; let failed = false;
    // Bounded parallel delivery; no notice body or subscriber endpoint is logged.
    for (let offset = 0; offset < claim.targets.length; offset += 8) {
      await Promise.all(claim.targets.slice(offset, offset + 8).map(async target => {
        let subscription;
        try { subscription = normalizePushSubscription(target.subscription); } catch { expired.push(target.id); return; }
        try {
          await send(subscription, JSON.stringify(claim.payload), { vapidDetails: { subject: 'https://robotland-trip.netlify.app/', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, TTL: Math.max(1, Math.min(900, Math.floor((claim.expiresAt - Date.now()) / 1000))), urgency: 'high', contentEncoding: 'aes128gcm', timeout: 8000 });
          delivered.push(target.id);
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) expired.push(target.id); else failed = true;
        }
      }));
    }
    const result = await callStore('pushComplete', { jobId, leaseKey, delivered, expired, failed });
    if (!result.ok || failed) throw new Error('Push delivery needs retry');
  }
  throw new Error('Push delivery batch limit reached');
}
