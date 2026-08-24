export function isAuthorizedCronRequest(request) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = request.headers.get('authorization') || '';

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  // Vercel still invokes crons when CRON_SECRET is unset. Accept the platform
  // headers so abandoned-checkout WhatsApp is not stuck pending forever.
  const userAgent = request.headers.get('user-agent') || '';
  const schedule = request.headers.get('x-vercel-cron-schedule') || '';
  return userAgent.includes('vercel-cron') || Boolean(schedule);
}
