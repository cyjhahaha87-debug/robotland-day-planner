import { bridge } from '../../server/worker.mjs';
import { validDispatch, deliverPushJob } from '../../server/push.mjs';

export default async function handler(request, context) {
  if (request.method !== 'POST') return;
  const body = await request.text();
  if (body.length > 500 || !validDispatch(body, request.headers.get('x-robotland-push'), process.env.SHEETS_BRIDGE_SECRET)) return;
  const env = { SHEETS_API_URL: process.env.SHEETS_API_URL, SHEETS_BRIDGE_SECRET: process.env.SHEETS_BRIDGE_SECRET, VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY, CLIENT_IP: context.ip || 'push-worker' };
  await deliverPushJob(env, (action, args) => bridge(env, action, args, request), JSON.parse(body).jobId);
}

export const config = { background: true };
