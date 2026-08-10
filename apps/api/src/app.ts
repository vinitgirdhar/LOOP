import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { prisma } from '@loop/db';
import { corsOrigins, env, features } from './env.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { ok } from './lib/http.js';
import { localUploadDir } from './lib/storage.js';
import { openapiDocument } from './docs/openapi.js';

import { authRouter } from './routes/auth.js';
import { inviteRouter, workspaceRouter } from './routes/workspaces.js';
import { projectRouter } from './routes/projects.js';
import { taskRouter } from './routes/tasks.js';
import { sprintRouter } from './routes/sprints.js';
import { wikiRouter } from './routes/wiki.js';
import { fileRouter } from './routes/files.js';
import { chatRouter } from './routes/chat.js';
import { calendarRouter, meetingRouter } from './routes/meetings.js';
import { timeRouter } from './routes/time.js';
import { notificationRouter } from './routes/notifications.js';
import { searchRouter } from './routes/search.js';
import { analyticsRouter, dashboardRouter } from './routes/analytics.js';
import { aiRouter } from './routes/ai.js';
import { adminRouter, integrationRouter } from './routes/admin.js';
import { webhookRouter } from './routes/webhooks.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON and uploaded files, never HTML that embeds them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          corsOrigins.includes(origin) ||
          (env.NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1')))
        ) {
          return callback(null, true);
        }
        callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(cookieParser());

  // Webhooks need the raw body for signature verification, so they go first.
  app.use('/api/webhooks', webhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(globalLimiter);

  // Local disk fallback for uploads when Cloudinary is not configured.
  if (!features.cloudinary) {
    app.use('/uploads', express.static(localUploadDir, { maxAge: '7d', index: false, dotfiles: 'deny' }));
  }

  app.get('/api/health', async (_req, res) => {
    let database = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    ok(res, {
      status: database === 'up' ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      environment: env.NODE_ENV,
      database,
      features,
    });
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument, { customSiteTitle: 'Loop API' }));
  app.get('/api/openapi.json', (_req, res) => res.json(openapiDocument));

  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspaceRouter);
  app.use('/api/invites', inviteRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/sprints', sprintRouter);
  app.use('/api/wiki', wikiRouter);
  app.use('/api/files', fileRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/meetings', meetingRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/time', timeRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/integrations', integrationRouter);
  app.use('/api/admin', adminRouter);

  app.get('/', (_req, res) => {
    res.json({ name: 'Loop API', docs: `${env.API_URL}/api/docs`, health: `${env.API_URL}/api/health` });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
