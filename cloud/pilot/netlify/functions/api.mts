import { createHandler } from '../../lib/api.mts';
declare const Netlify: { env: { get(name: string): string | undefined } };
export default async (request: Request) => createHandler({
  url: Netlify.env.get('SUPABASE_URL'), key: Netlify.env.get('SUPABASE_PUBLISHABLE_KEY'),
})(request);
export const config = {
  path: '/api/*',
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
