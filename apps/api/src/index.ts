import { createServer } from 'node:http';
import { prisma } from '@loop/db';
import { createApp } from './app.js';
import { env, features } from './env.js';
import { logger } from './lib/logger.js';
import { createSocketServer } from './realtime/socket.js';
import { startScheduler } from './jobs/scheduler.js';
import { startKeepAlive } from './jobs/keepAlive.js';
import { ensureVectorIndex } from './services/rag.js';

async function main() {
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  await ensureVectorIndex();
  startScheduler();
  startKeepAlive();

  httpServer.listen(env.PORT, () => {
    logger.info(`Loop API listening on ${env.API_URL} (${env.NODE_ENV})`);
    logger.info(`  docs      ${env.API_URL}/api/docs`);
    logger.info(`  ai        frontier=${features.groq ? env.GROQ_MODEL : 'off'} fallback=${features.gemini ? env.GEMINI_MODEL : 'off'}`);
    logger.info(`  storage   ${features.cloudinary ? 'cloudinary' : 'local disk'}`);
    logger.info(`  email     ${features.email ? 'resend' : 'console'}`);
    logger.info(`  redis     ${features.redis ? 'connected' : 'in-process fallback'}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    io.close();
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', reason));
}

main().catch((error: unknown) => {
  logger.error('failed to start', error instanceof Error ? error.stack : error);
  process.exit(1);
});
