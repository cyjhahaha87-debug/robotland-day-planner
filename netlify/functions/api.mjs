import { queuePushJob } from '../../server/push.mjs';
import { handleRequest } from '../../server/worker.mjs';

export default async function handler(request, context) {
  return handleRequest(request, {
    SHEETS_API_URL: process.env.SHEETS_API_URL,
    SHEETS_BRIDGE_SECRET: process.env.SHEETS_BRIDGE_SECRET,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    QUEUE_PUSH: jobId => queuePushJob(jobId, process.env),
    // Use the platform's address, not client-supplied proxy headers.
    CLIENT_IP: context.ip || 'netlify-unknown',
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
  });
}

export const config = { path: '/api/*' };
