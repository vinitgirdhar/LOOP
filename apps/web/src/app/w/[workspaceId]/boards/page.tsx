'use client';

import { use, useState } from 'react';
import { useQuery } from '@/lib/hooks';
import { api, apiErrorMessage } from '@/lib/api';
import { Page, PageHeader } from '@/components/page';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { WhiteboardCanvas } from '@/components/whiteboard/canvas';
import { normaliseScene, type Scene } from '@/lib/whiteboard';
import { cx, relativeTime } from '@/lib/format';

interface BoardSummary {
  id: string;
  title: string;
  kind: 'mindmap' | 'whiteboard';
  projectId: string | null;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

interface BoardDetail extends BoardSummary {
  scene: Scene;
}

export default function BoardsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { can } = useAuth();
  const toast = useToast();

  const { data, loading, error, refetch } = useQuery<BoardSummary[]>('/api/whiteboards', [workspaceId]);
  const [openId, setOpenId] = useState<string | null>(null);

  const boards = data ?? [];
  const editable = can('wiki.write');

  const create = async (kind: 'mindmap' | 'whiteboard') => {
    try {
      const { data: board } = await api.post<BoardDetail>('/api/whiteboards', { kind, title: kind === 'mindmap' ? 'New mind map' : 'New whiteboard' });
      await refetch();
      setOpenId(board.id);
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    }
  };

  if (openId) return <BoardEditor boardId={openId} onClose={() => { setOpenId(null); void refetch(); }} />;

  return (
    <Page>
      <PageHeader
        title="Boards"
        subtitle="Mind maps and whiteboards for the thinking that happens before a task exists."
        actions={
          editable && (
            <>
              <Button size="sm" icon={<Icon.sparkles width={15} height={15} />} onClick={() => create('mindmap')}>
                Mind map
              </Button>
              <Button variant="primary" size="sm" icon={<Icon.plus width={15} height={15} />} onClick={() => create('whiteboard')}>
                Whiteboard
              </Button>
            </>
          )
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && boards.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <EmptyState
          title="No boards yet"
          description="A mind map starts from one central idea and branches out. A whiteboard starts empty."
          action={editable ? <Button variant="primary" onClick={() => create('mindmap')}>Start a mind map</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              onClick={() => setOpenId(board.id)}
              className="card p-4 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center gap-2">
                <span className={cx('badge', board.kind === 'mindmap' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-inset)] text-[var(--text-muted)]')}>
                  {board.kind === 'mindmap' ? 'Mind map' : 'Whiteboard'}
                </span>
              </div>
              <p className="mt-2 truncate text-sm font-semibold">{board.title}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Edited {relativeTime(board.updatedAt)}
                {board.updatedBy && ` by ${board.updatedBy.name}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}

/** Loads the full scene only when a board is actually opened. */
function BoardEditor({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { data, loading, error, refetch } = useQuery<BoardDetail>(`/api/whiteboards/${boardId}`, [boardId]);

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <div className="p-4"><Skeleton className="h-[60vh]" /></div>;
  if (!data) return null;

  return (
    <div className="flex h-[calc(100dvh-var(--header-h)-var(--bottom-chrome))] flex-col lg:h-[calc(100dvh-var(--header-h))]">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button size="sm" icon={<Icon.arrowLeft width={14} height={14} />} onClick={onClose}>
          Boards
        </Button>
      </div>
      <WhiteboardCanvas boardId={boardId} title={data.title} initial={normaliseScene(data.scene)} />
    </div>
  );
}
