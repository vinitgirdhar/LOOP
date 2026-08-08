import cron from 'node-cron';
import { env, isProd } from '../env.js';
import { logger } from '../lib/logger.js';

/**
 * Render (and most free tiers) spin a web service down after ~15 minutes with
 * no inbound traffic, and the next request then pays a cold start.
 *
 * This job pings the service's own public health URL every 5 minutes. It keeps
 * an already-awake instance awake, which is the common case.
 *
 * It cannot *wake* a sleeping instance — nothing running inside a stopped
 * container can. That is what the GitHub Actions workflow in
 * .github/workflows/keep-alive.yml is for: it runs on GitHub's schedule and
 * hits the service from outside, so it works even after a spin-down.
 * Use both; they cover different failure modes.
 */
export function startKeepAlive(): void {
  const target = (env.KEEP_ALIVE_URL || env.API_URL).replace(/\/$/, '');

  if (!isProd) {
    logger.info('keep-alive disabled (development)');
    return;
  }
  if (target.includes('localhost') || target.includes('127.0.0.1')) {
    logger.warn('keep-alive skipped — KEEP_ALIVE_URL still points at localhost');
    return;
  }

  const ping = async () => {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const response = await fetch(`${target}/api/health`, {
        headers: { 'user-agent': 'loop-keep-alive/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      logger.debug(`keep-alive ${response.status} in ${Date.now() - started}ms`);
    } catch (error: unknown) {
      logger.warn('keep-alive ping failed', error instanceof Error ? error.message : error);
    }
  };

  cron.schedule('*/5 * * * *', () => void ping());
  // One ping shortly after boot so a fresh deploy is immediately warm.
  setTimeout(() => void ping(), 30_000);

  logger.info(`keep-alive pinging ${target}/api/health every 5 minutes`);
}
