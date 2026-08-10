-- ============================================================================
-- 0011 · Realtime and Storage
-- ============================================================================
-- Replaces apps/api/src/realtime/* (Socket.io) and apps/api/src/lib/storage.ts
-- (Cloudinary + local disk).
--
-- Realtime broadcasts respect RLS, so a subscription is not a way around a
-- policy: a CLIENT listening on `messages` receives nothing, because their
-- select policy on that table matches no rows.
-- ============================================================================

-- ─────────────────────────── realtime ───────────────────────────

-- Only the tables the UI actually re-renders from. Adding the whole schema
-- here would push every audit row and embedding to every connected client.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.ai_suggestions;
alter publication supabase_realtime add table public.activity_log;
alter publication supabase_realtime add table public.comments;

-- An UPDATE event carries only the changed columns unless the table records a
-- full previous image. The board needs the old status to animate a card from
-- one column to another, so those two get REPLICA IDENTITY FULL.
alter table public.tasks replica identity full;
alter table public.messages replica identity full;

-- ─────────────────────────── storage ───────────────────────────

-- Private bucket: every download goes through a signed URL, so a leaked path
-- is not a leaked file. 25 MB matches the old multer limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  26214400,
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
    'application/zip', 'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4', 'video/webm'
  ]
)
on conflict (id) do nothing;

-- Avatars and workspace logos are world-readable, so they can be rendered
-- straight from a public URL without a round trip for a signature.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

/**
 * Every attachment object is stored under '<workspace_id>/…', so the first
 * path segment is the tenant key. These policies read it back out and check
 * membership against it — the same rule the attachments table enforces, which
 * keeps the object and the row describing it from ever disagreeing.
 */
create policy attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.app_has_permission(((storage.foldername(name))[1])::uuid, 'file.read')
  );

create policy attachments_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.app_has_permission(((storage.foldername(name))[1])::uuid, 'file.upload')
    and owner_id = (select auth.uid()::text)
  );

create policy attachments_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner_id = (select auth.uid()::text)
      or public.app_has_permission(((storage.foldername(name))[1])::uuid, 'file.delete')
    )
  );

-- Avatars: anyone may look, you may only write your own folder.
create policy avatars_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
