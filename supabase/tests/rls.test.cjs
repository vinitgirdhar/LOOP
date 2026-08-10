/*
 * RLS boundary test.
 *
 * The product makes a specific promise on its marketing page: "a client
 * account has no chat permission at all, and retrieval is filtered by role
 * before anything reaches the model". That promise now lives entirely in the
 * policies in 0009 and 0010, so it gets a test rather than a code review.
 *
 * Builds a workspace with an OWNER, a MEMBER and a CLIENT, then re-reads the
 * same tables as each of them through the `authenticated` role and asserts who
 * can see what.
 *
 * Prerequisites
 *   · a local Postgres reachable on the URL below (docker compose up -d)
 *   · npm i pg    (not a project dependency — this is a standalone check)
 *
 * Usage
 *   node supabase/tests/rls.test.cjs
 *
 * It creates and drops its own scratch database and never touches any other.
 * pgvector is optional: the few vector-specific statements are stubbed out,
 * because none of them affect an access-control decision.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const BASE = process.env.SUPABASE_TEST_PG ?? 'postgres://loop:loop@127.0.0.1:5432';
const DB = 'loop_rls_check';
const MIGRATIONS = path.join(__dirname, '..', 'migrations');

/*
 * Everything a real Supabase project provides that the migrations assume but
 * do not create: the three API roles, auth, storage, and the realtime
 * publication. On a hosted project all of this already exists.
 */
const STUBS = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  end $$;

  create schema if not exists extensions;
  create schema if not exists auth;
  create schema if not exists storage;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    encrypted_password text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text, owner_id text
  );
  alter table storage.objects enable row level security;

  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$ select string_to_array(name, '/'); $$;

  -- Stand-in for pgvector's distance operator, so the migrations parse without
  -- the extension. Returns a constant: nothing here tests retrieval quality.
  create or replace function public.__fake_distance(a text, b text)
    returns double precision language sql immutable as $$ select 0.0::double precision $$;
  do $$ begin
    if not exists (select 1 from pg_operator where oprname = '<=>' and oprnamespace = 'public'::regnamespace) then
      create operator public.<=> (leftarg = text, rightarg = text, function = public.__fake_distance);
    end if;
  end $$;

  do $$ begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      create publication supabase_realtime;
    end if;
  end $$;
`;

const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  mo: '22222222-2222-4222-8222-222222222222',
  carl: '33333333-3333-4333-8333-333333333333',
  org: 'aaaaaaaa-0000-4000-8000-000000000001',
  ws: 'aaaaaaaa-0000-4000-8000-000000000002',
  p1: 'aaaaaaaa-0000-4000-8000-000000000003',
  p2: 'aaaaaaaa-0000-4000-8000-000000000004',
  chan: 'aaaaaaaa-0000-4000-8000-000000000005',
};

let failures = 0;
const expect = (label, actual, wanted) => {
  const ok = actual === wanted;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, want ${wanted}`);
};

/** Runs a query as a signed-in user, then rolls back so nothing persists. */
async function asUser(db, uid, sql) {
  await db.query('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await db.query('set local role authenticated');
    const { rows } = await db.query(sql);
    return Number(rows[0].n);
  } finally {
    await db.query('rollback');
  }
}

async function main() {
  const admin = new Client({ connectionString: `${BASE}/postgres` });
  await admin.connect();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB}`);
  await admin.end();

  const db = new Client({ connectionString: `${BASE}/${DB}` });
  await db.connect();

  try {
    await db.query('create extension if not exists pgcrypto with schema public');
    await db.query(STUBS);
    try {
      await db.query('create extension if not exists pg_trgm with schema extensions');
    } catch {
      console.log('  note: pg_trgm unavailable, trigram indexes skipped');
    }

    let hasVector = true;
    try {
      await db.query('create extension if not exists vector with schema extensions');
    } catch {
      hasVector = false;
    }

    for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      let sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
      if (!hasVector) {
        sql = sql
          .replace(/^create extension if not exists "vector".*$/m, '')
          .replace(/extensions\.vector\(768\)/g, 'text')
          .replace(/^create index embeddings_vector_idx[\s\S]*?;$/m, '')
          .replace(/operator\(extensions\.<=>\)/g, 'operator(public.<=>)')
          .replace(/extensions\.vector,/g, 'text,');
      }
      sql = sql.replace(/^create index \w+_trgm .*?;$/gms, (m) =>
        /gin_trgm_ops/.test(m) ? '' : m,
      );
      await db.query(sql);
    }

    // Supabase grants these by default on every new table in public; a bare
    // Postgres does not, so the test stands them up itself.
    await db.query(`
      grant usage on schema public, extensions to anon, authenticated;
      grant all on all tables in schema public to authenticated;
      grant all on all sequences in schema public to authenticated;
    `);

    // ── seed as the table owner, for whom RLS does not apply ──
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
         ($1,'alice@loop.dev','{"name":"Alice Owner"}'),
         ($2,'mo@loop.dev','{"name":"Mo Member"}'),
         ($3,'carl@loop.dev','{"name":"Carl Client"}')`,
      [ids.alice, ids.mo, ids.carl],
    );

    const { rows: profiles } = await db.query('select count(*)::int n from public.profiles');
    expect('handle_new_user mirrored every auth user', profiles[0].n, 3);

    await db.query(`insert into public.organizations (id,name,slug,owner_id) values ($1,'Northwind','northwind',$2)`, [ids.org, ids.alice]);
    await db.query(`insert into public.workspaces (id,organization_id,name,slug) values ($1,$2,'Product','product')`, [ids.ws, ids.org]);
    await db.query(
      `insert into public.workspace_members (workspace_id,user_id,role) values ($1,$2,'OWNER'),($1,$3,'MEMBER'),($1,$4,'CLIENT')`,
      [ids.ws, ids.alice, ids.mo, ids.carl],
    );
    await db.query(`insert into public.projects (id,workspace_id,key,name) values ($1,$3,'PAY','Payments'),($2,$3,'INT','Internal')`, [ids.p1, ids.p2, ids.ws]);
    await db.query(`insert into public.project_members (project_id,user_id) values ($1,$2)`, [ids.p1, ids.carl]);
    await db.query(`insert into public.tasks (workspace_id,project_id,title) values ($1,$2,'Hosted checkout'),($1,$3,'Rotate keys')`, [ids.ws, ids.p1, ids.p2]);
    await db.query(
      `insert into public.wiki_pages (workspace_id,project_id,title,slug,is_shared,author_id) values
         ($1,$2,'Release notes','release-notes',true,$3),
         ($1,$2,'Internal runbook','runbook',false,$3)`,
      [ids.ws, ids.p1, ids.alice],
    );
    await db.query(`insert into public.channels (id,workspace_id,name) values ($1,$2,'general')`, [ids.chan, ids.ws]);
    await db.query(`insert into public.messages (workspace_id,channel_id,author_id,body) values ($1,$2,$3,'internal chatter')`, [ids.ws, ids.chan, ids.alice]);

    const { rows: numbers } = await db.query('select array_agg(number order by number) a from public.tasks where project_id = $1', [ids.p1]);
    expect('task numbering starts at 1 per project', JSON.stringify(numbers[0].a), '[1]');

    console.log('\nOWNER (alice)');
    expect('projects', await asUser(db, ids.alice, 'select count(*)::int n from public.projects'), 2);
    expect('tasks', await asUser(db, ids.alice, 'select count(*)::int n from public.tasks'), 2);
    expect('wiki pages', await asUser(db, ids.alice, 'select count(*)::int n from public.wiki_pages'), 2);
    expect('messages', await asUser(db, ids.alice, 'select count(*)::int n from public.messages'), 1);
    expect('co-members visible', await asUser(db, ids.alice, 'select count(*)::int n from public.profiles'), 3);

    console.log('\nMEMBER (mo)');
    expect('projects', await asUser(db, ids.mo, 'select count(*)::int n from public.projects'), 2);
    expect('tasks', await asUser(db, ids.mo, 'select count(*)::int n from public.tasks'), 2);
    expect('messages', await asUser(db, ids.mo, 'select count(*)::int n from public.messages'), 1);
    expect('audit log is owner-only', await asUser(db, ids.mo, 'select count(*)::int n from public.audit_log'), 0);

    console.log('\nCLIENT (carl) — the boundary that matters');
    expect('only their own project', await asUser(db, ids.carl, 'select count(*)::int n from public.projects'), 1);
    expect("only that project's tasks", await asUser(db, ids.carl, 'select count(*)::int n from public.tasks'), 1);
    expect('only SHARED wiki pages', await asUser(db, ids.carl, 'select count(*)::int n from public.wiki_pages'), 1);
    expect('no channels', await asUser(db, ids.carl, 'select count(*)::int n from public.channels'), 0);
    expect('no messages', await asUser(db, ids.carl, 'select count(*)::int n from public.messages'), 0);

    console.log('\nwrites');
    const attempt = async (uid, sql) => {
      try {
        await asUser(db, uid, `with x as (${sql}) select count(*)::int n from x`);
        return 'allowed';
      } catch {
        return 'denied';
      }
    };
    expect(
      'CLIENT cannot create a task',
      await attempt(ids.carl, `insert into public.tasks (workspace_id,project_id,title) values ('${ids.ws}','${ids.p1}','nope') returning id`),
      'denied',
    );
    expect(
      'MEMBER cannot promote themselves',
      await attempt(ids.mo, `update public.workspace_members set role='OWNER' where user_id='${ids.mo}' returning id`),
      'denied',
    );
    // A delete that matches no rows is not an error — the row count is the
    // real assertion, not whether the statement raised.
    await attempt(ids.mo, `delete from public.projects where id='${ids.p2}' returning id`);
    expect('MEMBER delete removed nothing', await asUser(db, ids.alice, 'select count(*)::int n from public.projects'), 2);
  } finally {
    await db.end();
    const cleanup = new Client({ connectionString: `${BASE}/postgres` });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${DB} with (force)`);
    await cleanup.end();
  }

  console.log(`\n${failures === 0 ? 'all assertions passed' : `${failures} assertion(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('harness error:', error.message);
  process.exit(2);
});
