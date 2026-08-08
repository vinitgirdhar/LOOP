import crypto from 'node:crypto';
import { Router, raw } from 'express';
import { prisma } from '@loop/db';
import { ah, badRequest, ok, unauthorized } from '../lib/http.js';
import { env, features } from '../env.js';
import { runGithubRules, type GithubSignal } from '../services/autopilot.js';
import { logger } from '../lib/logger.js';

export const webhookRouter: Router = Router();

/** Constant-time HMAC check against the shared secret GitHub signs with. */
function verifySignature(body: Buffer, signature: string | undefined): boolean {
  if (!features.github || !signature) return false;
  const digest = `sha256=${crypto.createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')}`;
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface GithubPayload {
  ref?: string;
  ref_type?: string;
  action?: string;
  repository?: { full_name?: string };
  sender?: { login?: string };
  head_commit?: { message?: string; url?: string };
  commits?: { message: string; url: string }[];
  pull_request?: { title?: string; html_url?: string; head?: { ref?: string }; merged?: boolean };
}

/**
 * GitHub → Auto-Pilot.
 *
 * The raw body is needed for the signature check, so this route is mounted
 * before the JSON body parser.
 */
webhookRouter.post(
  '/github',
  raw({ type: 'application/json', limit: '2mb' }),
  ah(async (req, res) => {
    const signature = req.get('x-hub-signature-256');
    const body = req.body as Buffer;

    if (features.github && !verifySignature(body, signature)) throw unauthorized('Invalid webhook signature');
    if (!features.github) logger.warn('GITHUB_WEBHOOK_SECRET is not set — accepting webhook without verification');

    const event = req.get('x-github-event') ?? 'unknown';
    const payload = JSON.parse(body.toString('utf8')) as GithubPayload;
    const repo = payload.repository?.full_name;
    if (!repo) throw badRequest('Payload has no repository');

    // Which workspaces have this repo connected?
    const integrations = await prisma.integration.findMany({ where: { provider: 'github', enabled: true } });
    const matches = integrations.filter((i) => (i.config as { repo?: string }).repo === repo);
    if (matches.length === 0) return ok(res, { ignored: true, reason: `No workspace is connected to ${repo}` });

    const actor = payload.sender?.login ?? 'someone';
    const signals: Omit<GithubSignal, 'workspaceId'>[] = [];

    if (event === 'create' && payload.ref_type === 'branch' && payload.ref) {
      signals.push({ repo, kind: 'branch_created', reference: payload.ref, url: null, actor });
    }
    if (event === 'push') {
      const branch = payload.ref?.replace('refs/heads/', '') ?? '';
      for (const commit of payload.commits ?? []) {
        signals.push({ repo, kind: 'push', reference: `${branch} ${commit.message}`, url: commit.url, actor });
      }
      if ((payload.commits ?? []).length === 0 && branch) {
        signals.push({ repo, kind: 'push', reference: branch, url: null, actor });
      }
    }
    if (event === 'pull_request') {
      const pr = payload.pull_request;
      const reference = `${pr?.head?.ref ?? ''} ${pr?.title ?? ''}`.trim();
      if (payload.action === 'opened' || payload.action === 'reopened' || payload.action === 'ready_for_review') {
        signals.push({ repo, kind: 'pull_request_opened', reference, url: pr?.html_url ?? null, actor });
      }
      if (payload.action === 'closed' && pr?.merged) {
        signals.push({ repo, kind: 'pull_request_merged', reference, url: pr?.html_url ?? null, actor });
      }
    }

    let suggestions = 0;
    for (const integration of matches) {
      for (const signal of signals) {
        suggestions += await runGithubRules({ ...signal, workspaceId: integration.workspaceId });
      }
    }

    return ok(res, { event, repo, signals: signals.length, suggestions });
  }),
);

/** Lets the demo work without a public tunnel: simulate a GitHub event from the UI. */
webhookRouter.post(
  '/github/simulate',
  ah(async (req, res) => {
    const { workspaceId, repo, kind, reference, actor } = req.body as Record<string, string>;
    if (!workspaceId || !reference) throw badRequest('workspaceId and reference are required');

    const suggestions = await runGithubRules({
      workspaceId,
      repo: repo ?? 'demo/repo',
      kind: (kind as GithubSignal['kind']) ?? 'pull_request_opened',
      reference,
      url: null,
      actor: actor ?? 'demo-bot',
    });
    return ok(res, { suggestions });
  }),
);
