import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '@loop/db';
import { env, features } from '../env.js';
import { ah, badRequest, conflict, created, forbidden, notFound, ok, parse, unauthorized } from '../lib/http.js';
import {
  hashPassword,
  randomOtp,
  randomToken,
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../lib/crypto.js';
import {
  REFRESH_COOKIE,
  assertSameSiteRequest,
  clearOAuthStateCookie,
  clearRefreshCookie,
  setOAuthStateCookie,
  setRefreshCookie,
  OAUTH_STATE_COOKIE,
} from '../lib/cookies.js';
import { mails, sendMail } from '../lib/mailer.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { cacheDel, cacheGet, cacheSet } from '../lib/redis.js';
import { cleanText } from '../lib/sanitize.js';

export const authRouter: Router = Router();

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number');

const emailRule = z.string().email('Enter a valid email').max(200).toLowerCase().trim();

// ───────────────────────── session helpers ─────────────────────────

async function issueSession(userId: string, email: string, isPlatformAdmin: boolean, req: { ip?: string; get(h: string): string | undefined }) {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken(sessionId, userId);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash: sha256(refreshToken),
      userAgent: req.get('user-agent')?.slice(0, 250) ?? null,
      ip: req.ip ?? null,
      expiresAt,
    },
  });

  const accessToken = signAccessToken({ sub: userId, email, admin: isPlatformAdmin, sid: sessionId });
  return { accessToken, refreshToken, sessionId };
}

const publicUser = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  emailVerifiedAt: true,
  isPlatformAdmin: true,
  twoFactorOn: true,
  timezone: true,
  createdAt: true,
} as const;

async function mePayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUser });
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: {
      id: true,
      role: true,
      workspace: { select: { id: true, name: true, slug: true, logoUrl: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });
  return { user, memberships };
}

// ───────────────────────── register / verify ─────────────────────────

authRouter.post(
  '/register',
  authLimiter,
  ah(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().min(2).max(80), email: emailRule, password: passwordRule }),
      req.body,
    );

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict('An account with that email already exists');

    const user = await prisma.user.create({
      data: { name: cleanText(body.name), email: body.email, passwordHash: await hashPassword(body.password) },
      select: publicUser,
    });

    await issueVerification(user.id, user.email);
    await audit({ req, actorId: user.id, action: 'auth.register', entity: 'user', entityId: user.id });

    return created(res, { user, message: 'Check your email for the verification code' });
  }),
);

async function issueVerification(userId: string, email: string) {
  const token = randomToken();
  const otp = randomOtp();
  await prisma.verificationToken.deleteMany({ where: { userId, type: 'EMAIL_VERIFY' } });
  await prisma.verificationToken.create({
    data: {
      userId,
      type: 'EMAIL_VERIFY',
      tokenHash: sha256(token),
      otp,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const link = `${env.WEB_URL}/verify-email?token=${token}`;
  await sendMail({ to: email, subject: 'Verify your Loop account', html: mails.verify(link, otp) });
}

authRouter.post(
  '/resend-verification',
  authLimiter,
  ah(async (req, res) => {
    const { email } = parse(z.object({ email: emailRule }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always 200 — never leak which emails exist.
    if (user && !user.emailVerifiedAt) await issueVerification(user.id, user.email);
    return ok(res, { message: 'If that account needs verifying, a new code is on its way' });
  }),
);

authRouter.post(
  '/verify-email',
  authLimiter,
  ah(async (req, res) => {
    const body = parse(
      z.object({ token: z.string().optional(), email: emailRule.optional(), otp: z.string().length(6).optional() }),
      req.body,
    );

    const record = body.token
      ? await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(body.token) } })
      : body.email && body.otp
        ? await prisma.verificationToken.findFirst({
            where: { type: 'EMAIL_VERIFY', otp: body.otp, user: { email: body.email }, usedAt: null },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    if (!record || record.usedAt || record.expiresAt < new Date() || record.type !== 'EMAIL_VERIFY') {
      throw badRequest('That verification link or code is invalid or has expired');
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    await audit({ req, actorId: record.userId, action: 'auth.email_verified', entity: 'user', entityId: record.userId });
    return ok(res, { message: 'Email verified — you can sign in now' });
  }),
);

// ───────────────────────── login ─────────────────────────

authRouter.post(
  '/login',
  authLimiter,
  ah(async (req, res) => {
    const body = parse(z.object({ email: emailRule, password: z.string().min(1) }), req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('Email or password is incorrect');
    }
    if (user.isSuspended) throw forbidden('This account is suspended');

    if (user.twoFactorOn && user.twoFactorSecret) {
      const ticket = randomToken(24);
      await cacheSet(`2fa:${sha256(ticket)}`, user.id, 300);
      return ok(res, { twoFactorRequired: true, ticket });
    }

    const { accessToken, refreshToken } = await issueSession(user.id, user.email, user.isPlatformAdmin, req);
    setRefreshCookie(res, refreshToken);
    await audit({ req, actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, meta: { method: 'password' } });
    return ok(res, { accessToken, ...(await mePayload(user.id)) });
  }),
);

authRouter.post(
  '/login/2fa',
  authLimiter,
  ah(async (req, res) => {
    const body = parse(z.object({ ticket: z.string().min(10), code: z.string().min(6).max(6) }), req.body);
    const key = `2fa:${sha256(body.ticket)}`;
    const userId = await cacheGet(key);
    if (!userId) throw unauthorized('That login attempt expired, start again');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) throw unauthorized('Two-factor is not set up');
    if (!authenticator.verify({ token: body.code, secret: user.twoFactorSecret })) {
      throw unauthorized('That code is not right');
    }

    await cacheDel(key);
    const { accessToken, refreshToken } = await issueSession(user.id, user.email, user.isPlatformAdmin, req);
    setRefreshCookie(res, refreshToken);
    await audit({ req, actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, meta: { method: '2fa' } });
    return ok(res, { accessToken, ...(await mePayload(user.id)) });
  }),
);

// ───────────────────────── Google OAuth ─────────────────────────

authRouter.get(
  '/google',
  ah(async (req, res) => {
    if (!features.google) throw badRequest('Google sign-in is not configured on this deployment');
    const state = randomToken(16);
    setOAuthStateCookie(res, state);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.API_URL}/api/auth/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return res.redirect(url.toString());
  }),
);

interface GoogleClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

authRouter.get(
  '/google/callback',
  ah(async (req, res) => {
    const fail = (reason: string) => res.redirect(`${env.WEB_URL}/login?error=${encodeURIComponent(reason)}`);
    if (!features.google) return fail('Google sign-in is not configured');

    const { code, state } = req.query as { code?: string; error?: string; state?: string };
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    clearOAuthStateCookie(res);
    if (!code || !state || !cookieState || state !== cookieState) return fail('Sign-in was cancelled or expired');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${env.API_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return fail('Google rejected the sign-in');

    const { id_token: idToken } = (await tokenRes.json()) as { id_token?: string };
    if (!idToken) return fail('Google did not return an identity token');

    // The token came straight from Google's endpoint over TLS, so the payload is trusted.
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString()) as GoogleClaims;
    if (!claims.email) return fail('Google account has no email');

    const user = await prisma.user.upsert({
      where: { email: claims.email.toLowerCase() },
      create: {
        email: claims.email.toLowerCase(),
        name: claims.name ?? claims.email.split('@')[0]!,
        googleId: claims.sub,
        avatarUrl: claims.picture ?? null,
        emailVerifiedAt: new Date(),
      },
      update: {
        googleId: claims.sub,
        emailVerifiedAt: new Date(),
        ...(claims.picture ? { avatarUrl: claims.picture } : {}),
      },
    });
    if (user.isSuspended) return fail('This account is suspended');

    const { refreshToken } = await issueSession(user.id, user.email, user.isPlatformAdmin, req);
    setRefreshCookie(res, refreshToken);
    await audit({ req, actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, meta: { method: 'google' } });
    // No token in the URL — the SPA calls /auth/refresh which reads the httpOnly cookie.
    return res.redirect(`${env.WEB_URL}/auth/callback`);
  }),
);

// ───────────────────────── refresh / logout ─────────────────────────

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    assertSameSiteRequest(req);
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No session');

    let payload: { sid: string; sub: string };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      throw unauthorized('Session expired');
    }

    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, email: true, isPlatformAdmin: true, isSuspended: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      clearRefreshCookie(res);
      throw unauthorized('Session expired');
    }

    // Refresh token reuse: someone replayed an old token — kill every session.
    if (session.refreshTokenHash !== sha256(token)) {
      await prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit({ req, actorId: session.userId, action: 'auth.token_reuse_detected', entity: 'session', entityId: session.id });
      clearRefreshCookie(res);
      throw unauthorized('Session expired');
    }
    if (session.user.isSuspended) throw forbidden('This account is suspended');

    const rotated = signRefreshToken(session.id, session.userId);
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(rotated), lastUsedAt: new Date() },
    });
    setRefreshCookie(res, rotated);

    const accessToken = signAccessToken({
      sub: session.userId,
      email: session.user.email,
      admin: session.user.isPlatformAdmin,
      sid: session.id,
    });
    return ok(res, { accessToken, ...(await mePayload(session.userId)) });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    assertSameSiteRequest(req);
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        const { sid } = verifyRefreshToken(token);
        await prisma.session.update({ where: { id: sid }, data: { revokedAt: new Date() } }).catch(() => null);
      } catch {
        /* already invalid */
      }
    }
    clearRefreshCookie(res);
    return ok(res, { message: 'Signed out' });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  ah(async (req, res) => {
    await prisma.session.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    await audit({ req, action: 'auth.logout_all', entity: 'user', entityId: req.user!.id });
    return ok(res, { message: 'Signed out on every device' });
  }),
);

// ───────────────────────── sessions ─────────────────────────

authRouter.get(
  '/sessions',
  requireAuth,
  ah(async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return ok(
      res,
      sessions.map((s) => ({ ...s, current: s.id === req.user!.sessionId })),
    );
  }),
);

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  ah(async (req, res) => {
    const result = await prisma.session.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw notFound('Session not found');
    if (req.params.id === req.user!.sessionId) clearRefreshCookie(res);
    return ok(res, { message: 'Session revoked' });
  }),
);

// ───────────────────────── password ─────────────────────────

authRouter.post(
  '/forgot-password',
  authLimiter,
  ah(async (req, res) => {
    const { email } = parse(z.object({ email: emailRule }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = randomToken();
      const otp = randomOtp();
      await prisma.verificationToken.deleteMany({ where: { userId: user.id, type: 'PASSWORD_RESET' } });
      await prisma.verificationToken.create({
        data: {
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: sha256(token),
          otp,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await sendMail({
        to: user.email,
        subject: 'Reset your Loop password',
        html: mails.reset(`${env.WEB_URL}/reset-password?token=${token}`, otp),
      });
    }
    return ok(res, { message: 'If that email is registered, a reset link is on its way' });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        token: z.string().optional(),
        email: emailRule.optional(),
        otp: z.string().length(6).optional(),
        password: passwordRule,
      }),
      req.body,
    );

    const record = body.token
      ? await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(body.token) } })
      : body.email && body.otp
        ? await prisma.verificationToken.findFirst({
            where: { type: 'PASSWORD_RESET', otp: body.otp, usedAt: null, user: { email: body.email } },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    if (!record || record.usedAt || record.expiresAt < new Date() || record.type !== 'PASSWORD_RESET') {
      throw badRequest('That reset link or code is invalid or has expired');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(body.password), emailVerifiedAt: new Date() },
      }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Password changed → every existing session dies.
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    await audit({ req, actorId: record.userId, action: 'auth.password_reset', entity: 'user', entityId: record.userId });
    return ok(res, { message: 'Password updated — sign in with your new password' });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), password: passwordRule }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!user.passwordHash) throw badRequest('This account signs in with Google — set a password from your profile first');
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw badRequest('Current password is wrong');

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null, id: { not: req.user!.sessionId } },
      data: { revokedAt: new Date() },
    });
    await audit({ req, action: 'auth.password_changed', entity: 'user', entityId: user.id });
    return ok(res, { message: 'Password changed — other devices were signed out' });
  }),
);

// ───────────────────────── profile ─────────────────────────

authRouter.get('/me', requireAuth, ah(async (req, res) => ok(res, await mePayload(req.user!.id))));

authRouter.patch(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80).optional(),
        avatarUrl: z.string().url().max(500).nullable().optional(),
        timezone: z.string().max(60).optional(),
      }),
      req.body,
    );
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { ...(body.name ? { name: cleanText(body.name) } : {}), ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}), ...(body.timezone ? { timezone: body.timezone } : {}) },
    });
    return ok(res, await mePayload(req.user!.id));
  }),
);

// ───────────────────────── 2FA (owners & admins) ─────────────────────────

authRouter.post(
  '/2fa/setup',
  requireAuth,
  ah(async (req, res) => {
    const eligible =
      req.user!.isPlatformAdmin ||
      (await prisma.workspaceMember.count({ where: { userId: req.user!.id, role: 'OWNER' } })) > 0;
    if (!eligible) throw forbidden('Two-factor is available to workspace owners and admins');

    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorSecret: secret, twoFactorOn: false } });
    const uri = authenticator.keyuri(req.user!.email, 'Loop', secret);
    return ok(res, { secret, otpauthUrl: uri, qrDataUrl: await QRCode.toDataURL(uri) });
  }),
);

authRouter.post(
  '/2fa/enable',
  requireAuth,
  ah(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().length(6) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!user.twoFactorSecret) throw badRequest('Run setup first');
    if (!authenticator.verify({ token: code, secret: user.twoFactorSecret })) throw badRequest('That code is not right');

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorOn: true } });
    await audit({ req, action: 'auth.2fa_enabled', entity: 'user', entityId: user.id });
    return ok(res, { message: 'Two-factor authentication is on' });
  }),
);

authRouter.post(
  '/2fa/disable',
  requireAuth,
  ah(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().length(6) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!user.twoFactorSecret || !authenticator.verify({ token: code, secret: user.twoFactorSecret })) {
      throw badRequest('That code is not right');
    }
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorOn: false, twoFactorSecret: null } });
    await audit({ req, action: 'auth.2fa_disabled', entity: 'user', entityId: user.id });
    return ok(res, { message: 'Two-factor authentication is off' });
  }),
);
