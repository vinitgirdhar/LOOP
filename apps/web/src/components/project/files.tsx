'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@/lib/hooks';
import { Avatar, Button, Card, Confirm, EmptyState, Field, Modal, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatBytes, formatDateTime, relativeTime } from '@/lib/format';

export interface FileRow {
  id: string;
  name: string;
  url: string;
  mime: string;
  size: number;
  version: number;
  createdAt: string;
  uploadedBy: { id: string; name: string; avatarUrl: string | null };
  folder: { id: string; name: string } | null;
}

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  _count: { files: number; children: number };
}

const iconFor = (mime: string) => {
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('zip')) return '🗜';
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  return '📄';
};

export function ProjectFiles({ workspaceId, projectId }: { workspaceId?: string; projectId?: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [versionsFor, setVersionsFor] = useState<FileRow | null>(null);
  const [deleting, setDeleting] = useState<FileRow | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');

  const scope = projectId ? `projectId=${projectId}` : '';
  const { data: folders, refetch: refetchFolders } = useQuery<FolderRow[]>(`/api/files/folders${scope ? `?${scope}` : ''}`, [projectId]);
  const { data: files, loading, refetch } = useQuery<FileRow[]>(
    `/api/files?${scope}${scope ? '&' : ''}${folderId ? `folderId=${folderId}` : 'root=true'}`,
    [projectId, folderId],
  );
  const { data: versions } = useQuery<FileRow[]>(versionsFor ? `/api/files/${versionsFor.id}/versions` : null, [versionsFor?.id]);

  const upload = async (list: FileList | null, replacesId?: string) => {
    if (!list || list.length === 0) return;
    const form = new FormData();
    Array.from(list).forEach((file) => form.append('files', file));
    if (projectId) form.append('projectId', projectId);
    if (folderId) form.append('folderId', folderId);
    if (replacesId) form.append('replacesId', replacesId);

    setUploading(true);
    try {
      await api.upload('/api/files', form);
      toast.success(`${list.length} file${list.length === 1 ? '' : 's'} uploaded`);
      void refetch();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-[13px]">
          <button type="button" onClick={() => setFolderId(null)} className={folderId === null ? 'font-semibold' : 'text-[var(--text-muted)] hover:underline'}>
            All files
          </button>
          {folderId && (
            <>
              <Icon.chevronRight width={13} height={13} className="text-[var(--text-faint)]" />
              <span className="font-semibold">{folders?.find((f) => f.id === folderId)?.name}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          {can('file.upload') && (
            <>
              <Button size="sm" onClick={() => setNewFolder(true)} icon={<Icon.folder width={14} height={14} />}>
                New folder
              </Button>
              <Button size="sm" variant="primary" loading={uploading} onClick={() => input.current?.click()} icon={<Icon.plus width={14} height={14} />}>
                Upload
              </Button>
              <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
            </>
          )}
        </div>
      </div>

      {folders && folders.length > 0 && folderId === null && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {folders
            .filter((folder) => !folder.parentId)
            .map((folder) => (
              <button key={folder.id} type="button" onClick={() => setFolderId(folder.id)} className="card flex items-center gap-2.5 p-3 text-left transition-colors hover:border-[var(--accent)]">
                <Icon.folder width={20} height={20} className="shrink-0 text-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{folder.name}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">{folder._count.files} files</span>
                </span>
              </button>
            ))}
        </div>
      )}

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (can('file.upload')) void upload(event.dataTransfer.files);
        }}
      >
        {loading && !files ? (
          <Skeleton className="h-48 w-full" />
        ) : !files || files.length === 0 ? (
          <EmptyState
            title="No files here"
            description={can('file.upload') ? 'Drag files onto this area, or use the upload button. Images, PDFs, video, ZIP and documents are accepted.' : 'Nothing has been uploaded yet.'}
            icon={<Icon.folder width={26} height={26} />}
          />
        ) : (
          <Card padded={false}>
            <ul className="divide-y">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-lg" aria-hidden>
                    {iconFor(file.mime)}
                  </span>
                  <button type="button" onClick={() => setPreview(file)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[13px] font-medium">{file.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {formatBytes(file.size)} · v{file.version} · {file.uploadedBy.name} · {relativeTime(file.createdAt)}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {file.version > 1 && (
                      <button type="button" onClick={() => setVersionsFor(file)} className="btn btn-ghost btn-sm" title="Version history">
                        v{file.version}
                      </button>
                    )}
                    <a href={file.url} target="_blank" rel="noreferrer" download className="btn btn-ghost btn-icon btn-sm" title="Download">
                      <Icon.download width={14} height={14} />
                    </a>
                    {can('file.delete') && (
                      <button type="button" onClick={() => setDeleting(file)} className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]" title="Delete">
                        <Icon.trash width={14} height={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name ?? ''} wide>
        {preview && (
          <div className="space-y-3">
            {preview.mime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.name} className="mx-auto max-h-[60vh] rounded-lg" />
            ) : preview.mime.startsWith('video/') ? (
              <video src={preview.url} controls className="mx-auto max-h-[60vh] w-full rounded-lg" />
            ) : preview.mime === 'application/pdf' ? (
              <iframe src={preview.url} title={preview.name} className="h-[60vh] w-full rounded-lg border" />
            ) : (
              <EmptyState title="No inline preview" description="Download the file to open it." />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-[var(--text-muted)]">
              <span>
                {formatBytes(preview.size)} · {preview.mime} · uploaded {formatDateTime(preview.createdAt)}
              </span>
              <a href={preview.url} target="_blank" rel="noreferrer" download className="btn btn-secondary btn-sm">
                <Icon.download width={14} height={14} /> Download
              </a>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(versionsFor)} onClose={() => setVersionsFor(null)} title="Version history">
        {!versions ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="divide-y">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={version.uploadedBy.name} size={24} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">v{version.version}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {version.uploadedBy.name} · {formatDateTime(version.createdAt)} · {formatBytes(version.size)}
                  </p>
                </div>
                <a href={version.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={newFolder}
        onClose={() => setNewFolder(false)}
        title="New folder"
        footer={
          <>
            <Button onClick={() => setNewFolder(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={folderName.trim().length < 1}
              onClick={async () => {
                try {
                  await api.post('/api/files/folders', { name: folderName.trim(), ...(projectId ? { projectId } : {}), ...(folderId ? { parentId: folderId } : {}) });
                  setFolderName('');
                  setNewFolder(false);
                  void refetchFolders();
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Folder name" required>
          <input className="input" value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus placeholder="Design assets" />
        </Field>
      </Modal>

      <Confirm
        open={Boolean(deleting)}
        title="Delete file"
        message={`"${deleting?.name}" will be removed for everyone. This cannot be undone.`}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.del(`/api/files/${deleting.id}`);
            toast.success('File deleted');
            setDeleting(null);
            void refetch();
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          }
        }}
      />
    </div>
  );
}
