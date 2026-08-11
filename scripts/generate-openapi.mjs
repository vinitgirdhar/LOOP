#!/usr/bin/env node
/**
 * Builds the OpenAPI document from the route tree.
 *
 * Written as a generator rather than a hand-maintained YAML file for one
 * reason: a spec that is not derived from the code is wrong within a week, and
 * a wrong spec is worse than none because people trust it. This walks
 * `src/app/api`, finds every exported HTTP method, turns the directory into a
 * path with `{param}` segments, and lifts the block comment above each handler
 * as its summary — so documenting an endpoint means commenting it, which the
 * codebase already does.
 *
 * Run: npm run openapi
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'web', 'src', 'app', 'api');
const outFile = join(root, 'apps', 'web', 'src', 'lib', 'openapi.json');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Every route.ts under src/app/api. */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry === 'route.ts') found.push(full);
  }
  return found;
}

/** `projects/[projectId]/board` → `/api/projects/{projectId}/board` */
function toPath(file) {
  const segments = relative(apiDir, dirname(file)).split(sep).filter(Boolean);
  const path = segments.map((s) => (s.startsWith('[') ? `{${s.replace(/[[\]./]|\.\.\./g, '')}}` : s)).join('/');
  return `/api/${path}`;
}

/**
 * The block comment immediately above `export const GET = ...`.
 *
 * Handlers in this codebase are documented with a leading /** … *\/ or a run
 * of // lines. Both are lifted; the first sentence becomes the summary and the
 * rest becomes the description.
 */
function docFor(source, method) {
  const index = source.search(new RegExp(`export const ${method}\\b`));
  if (index === -1) return null;

  const before = source.slice(0, index);
  const block = before.match(/\/\*\*?([\s\S]*?)\*\/\s*$/);
  if (block) {
    const text = block[1]
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .join('\n')
      .trim();
    return text || null;
  }

  const lines = before.split('\n');
  const comment = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line === '') { if (comment.length) break; continue; }
    if (!line.startsWith('//')) break;
    comment.unshift(line.replace(/^\/\/\s?/, ''));
  }
  return comment.length ? comment.join('\n') : null;
}

const split = (doc) => {
  if (!doc) return { summary: null, description: null };
  const [first, ...rest] = doc.split(/\n\s*\n/);
  const summary = first.replace(/\s+/g, ' ').trim();
  return {
    summary: summary.length > 120 ? `${summary.slice(0, 117)}…` : summary,
    description: rest.join('\n\n').trim() || null,
  };
};

const paths = {};
const tags = new Map();

for (const file of walk(apiDir).sort()) {
  const source = readFileSync(file, 'utf8');
  const path = toPath(file);
  const group = path.split('/')[2] ?? 'root';

  const params = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));

  for (const method of METHODS) {
    if (!new RegExp(`export const ${method}\\b`).test(source)) continue;

    const { summary, description } = split(docFor(source, method));
    const isPublic = path.startsWith('/api/public/');

    paths[path] ??= {};
    paths[path][method.toLowerCase()] = {
      tags: [group],
      summary: summary ?? `${method} ${path}`,
      ...(description ? { description } : {}),
      // The workspace header is how every authenticated route resolves tenancy.
      parameters: [
        ...params,
        ...(isPublic
          ? []
          : [{ name: 'x-workspace-id', in: 'header', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Workspace the request applies to.' }]),
      ],
      ...(isPublic ? { security: [] } : {}),
      responses: {
        200: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } } },
        ...(isPublic
          ? {}
          : {
              401: { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
              403: { description: 'Forbidden by role or row level security', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            }),
        404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    };

    tags.set(group, true);
  }
}

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Loop API',
    version: '1.0.0',
    description: [
      'Every route returns the same envelope: `{ success, data, error?, code?, meta? }`.',
      '',
      'Authentication is a Supabase session cookie, set at sign-in and sent automatically by the browser.',
      'Row level security is the real boundary — a handler that forgets a check still cannot read another',
      'workspace, because the policy travels with the data.',
      '',
      'This document is generated from the route tree by `npm run openapi`. It is not hand-maintained.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Same origin as the app' }],
  tags: [...tags.keys()].sort().map((name) => ({ name })),
  components: {
    securitySchemes: {
      session: { type: 'apiKey', in: 'cookie', name: 'sb-access-token', description: 'Supabase session cookie, httpOnly.' },
    },
    schemas: {
      Envelope: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', const: true },
          data: { description: 'Endpoint-specific payload, camelCased.' },
          meta: {
            type: 'object',
            properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } },
          },
        },
      },
      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', const: false },
          error: { type: 'string' },
          code: { type: 'string', examples: ['unauthorized', 'forbidden', 'not_found', 'bad_request'] },
          details: {
            type: 'array',
            items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
    },
  },
  security: [{ session: [] }],
  paths,
};

writeFileSync(outFile, `${JSON.stringify(spec, null, 2)}\n`);

const operations = Object.values(paths).reduce((sum, item) => sum + Object.keys(item).length, 0);
console.log(`openapi: ${Object.keys(paths).length} paths, ${operations} operations → ${relative(root, outFile)}`);
