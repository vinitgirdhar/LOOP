'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SOCKET_EVENTS } from '@loop/shared';
import { useQuery } from '@/lib/hooks';
import { Avatar, Button, CloseIcon, EmptyState, Field, Modal, Skeleton, Spinner } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { useRoom, useSocket, useSocketEvent } from '@/components/providers/socket';
import { api, apiErrorMessage } from '@/lib/api';
import { cx, formatBytes, relativeTime } from '@/lib/format';

interface Channel {
  id: string;
  name: string;
  topic: string | null;
  type: 'CHANNEL' | 'DM';
  isPrivate: boolean;
  unread: number;
  joined: boolean;
  project: { id: string; key: string; name: string } | null;
  members: { userId: string; user: { id: string; name: string; avatarUrl: string | null } }[];
  _count: { messages: number };
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  parentId: string | null;
  author: { id: string; name: string; avatarUrl: string | null };
  reactions: { emoji: string; userId: string }[];
  attachments: { id: string; name: string; url: string; mime: string; size: number }[];
  _count: { replies: number };
}

const QUICK_EMOJI = ['👍', '🎉', '👀', '🚀', '❤️', '😄'];

export function ChatWorkspace({ workspaceId, channelId }: { workspaceId: string; channelId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const { socket } = useSocket();

  const { data: channels, loading: loadingChannels, refetch: refetchChannels } = useQuery<Channel[]>('/api/chat/channels', [workspaceId]);
  const active = channelId ?? channels?.[0]?.id;

  const { data: fetched, loading, setData } = useQuery<Message[]>(active ? `/api/chat/channels/${active}/messages` : null, [active]);
  const [thread, setThread] = useState<Message | null>(null);
  const [creating, setCreating] = useState(false);
  const [showList, setShowList] = useState(!channelId);
  const [typing, setTyping] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useRoom('channel', active);

  useSocketEvent<Message>(SOCKET_EVENTS.messageNew, (message) => {
    setData((current) => {
      if (!current || message.parentId) return (current ?? []) as Message[];
      if (current.some((m) => m.id === message.id)) return current;
      return [...current, message];
    });
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }));
  });

  useSocketEvent<Message>(SOCKET_EVENTS.messageUpdate, (message) => {
    setData((current) => (current ?? []).map((m) => (m.id === message.id ? message : m)));
  });

  useSocketEvent<{ messageId: string; reactions: { emoji: string; userId: string }[] }>(SOCKET_EVENTS.reactionUpdate, ({ messageId, reactions }) => {
    setData((current) => (current ?? []).map((m) => (m.id === messageId ? { ...m, reactions } : m)));
  });

  useSocketEvent<{ channelId: string; userId: string; name: string; typing: boolean }>(SOCKET_EVENTS.typing, (event) => {
    if (event.channelId !== active || event.userId === user?.id) return;
    setTyping((current) => (event.typing ? [...new Set([...current, event.name])] : current.filter((n) => n !== event.name)));
    if (event.typing) setTimeout(() => setTyping((current) => current.filter((n) => n !== event.name)), 4000);
  });

  useEffect(() => {
    if (!active) return;
    void api.post(`/api/chat/channels/${active}/read`).then(() => refetchChannels());
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fetched?.length]);

  const channel = channels?.find((c) => c.id === active);
  const grouped = useMemo(() => groupByAuthor(fetched ?? []), [fetched]);

  const channelLabel = (row: Channel) =>
    row.type === 'DM' ? row.members.find((m) => m.userId !== user?.id)?.user.name ?? 'Direct message' : `#${row.name}`;

  return (
    <div className="flex h-[calc(100dvh-var(--header-h)-var(--safe-top)-var(--bottom-chrome))] lg:h-[calc(100dvh-var(--header-h))]">
      {/* Channel list */}
      <aside className={cx('w-full shrink-0 border-r bg-[var(--surface)] lg:w-64', showList ? 'block' : 'hidden lg:block')}>
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-[13px] font-semibold">Channels</p>
          <button type="button" onClick={() => setCreating(true)} className="btn btn-ghost btn-icon btn-sm" aria-label="New channel">
            <Icon.plus width={14} height={14} />
          </button>
        </div>
        <div className="scroll-thin h-[calc(100%-2.75rem)] overflow-y-auto p-1.5">
          {loadingChannels && !channels ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            (channels ?? []).map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  router.push(`/w/${workspaceId}/chat/${row.id}`);
                  setShowList(false);
                }}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                  row.id === active ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-inset)]',
                )}
              >
                {row.type === 'DM' ? (
                  <Avatar name={channelLabel(row)} src={row.members.find((m) => m.userId !== user?.id)?.user.avatarUrl} size={20} />
                ) : (
                  <span className="text-[var(--text-faint)]">#</span>
                )}
                <span className="min-w-0 flex-1 truncate">{row.type === 'DM' ? channelLabel(row) : row.name}</span>
                {row.unread > 0 && <span className="badge-count">{row.unread > 99 ? '99+' : row.unread}</span>}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className={cx('flex min-w-0 flex-1 flex-col', showList && 'hidden lg:flex')}>
        {!channel ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <EmptyState title="Pick a channel" description="Project channels are created automatically with each project." icon={<Icon.chat width={26} height={26} />} />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-2.5">
              <button type="button" onClick={() => setShowList(true)} className="btn btn-ghost btn-icon btn-sm lg:hidden" aria-label="Back to channels">
                <Icon.arrowLeft width={15} height={15} />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{channelLabel(channel)}</p>
                {channel.topic && <p className="truncate text-[11px] text-[var(--text-muted)]">{channel.topic}</p>}
              </div>
              <span className="ml-auto text-[11px] text-[var(--text-faint)]">{channel.members.length} members</span>
            </header>

            <div ref={scroller} className="scroll-thin flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {loading && !fetched ? (
                <Skeleton className="h-40 w-full" />
              ) : grouped.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">No messages yet — say hello.</p>
              ) : (
                grouped.map((group) => (
                  <div key={group.id} className="flex gap-2.5">
                    <Avatar seed={group.author.id} name={group.author.name} src={group.author.avatarUrl} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]">
                        <span className="font-semibold">{group.author.name}</span>{' '}
                        <span className="text-[10px] text-[var(--text-faint)]">{relativeTime(group.messages[0]!.createdAt)}</span>
                      </p>
                      {group.messages.map((message) => (
                        <MessageRow
                          key={message.id}
                          message={message}
                          currentUserId={user?.id}
                          onReact={async (emoji) => {
                            try {
                              await api.post(`/api/chat/messages/${message.id}/reactions`, { emoji });
                            } catch (caught: unknown) {
                              toast.error(apiErrorMessage(caught));
                            }
                          }}
                          onThread={() => setThread(message)}
                          onDelete={async () => {
                            await api.del(`/api/chat/messages/${message.id}`);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
              {typing.length > 0 && (
                <p className="flex items-center gap-2 text-[11px] italic text-[var(--text-muted)]">
                  <Spinner size={11} /> {typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing…
                </p>
              )}
            </div>

            <Composer
              channelId={channel.id}
              placeholder={channel.type === 'DM' ? `Message ${channelLabel(channel)}` : `Message #${channel.name}`}
              onTyping={(isTyping) => socket?.emit('typing', { channelId: channel.id, typing: isTyping })}
              onSent={() => requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }))}
            />
          </>
        )}
      </section>

      <ThreadDrawer thread={thread} channelId={active} onClose={() => setThread(null)} />
      <NewChannelModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); void refetchChannels(); router.push(`/w/${workspaceId}/chat/${id}`); }} />
    </div>
  );
}

function groupByAuthor(messages: Message[]) {
  const groups: { id: string; author: Message['author']; messages: Message[] }[] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    const withinWindow = last && new Date(message.createdAt).getTime() - new Date(last.messages[last.messages.length - 1]!.createdAt).getTime() < 5 * 60_000;
    if (last && last.author.id === message.author.id && withinWindow) last.messages.push(message);
    else groups.push({ id: message.id, author: message.author, messages: [message] });
  }
  return groups;
}

function MessageRow({
  message,
  currentUserId,
  onReact,
  onThread,
  onDelete,
}: {
  message: Message;
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onThread: () => void;
  onDelete: () => void;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const counts = message.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, reaction) => {
    acc[reaction.emoji] ??= { count: 0, mine: false };
    acc[reaction.emoji]!.count += 1;
    if (reaction.userId === currentUserId) acc[reaction.emoji]!.mine = true;
    return acc;
  }, {});

  if (message.deletedAt) return <p className="text-[13px] italic text-[var(--text-faint)]">Message deleted</p>;

  return (
    <div className="group relative">
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.body}</p>

      {message.attachments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {message.attachments.map((file) =>
            file.mime.startsWith('image/') ? (
              <a key={file.id} href={file.url} target="_blank" rel="noreferrer">
                {/* Signed storage URLs carry an expiry in the query string, so
                    caching them through the image optimiser would serve dead
                    links after the signature lapses. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.name} className="max-h-40 rounded-lg border" />
              </a>
            ) : (
              <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] hover:bg-[var(--bg-inset)]">
                <Icon.paperclip width={12} height={12} />
                {file.name} <span className="text-[var(--text-faint)]">{formatBytes(file.size)}</span>
              </a>
            ),
          )}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {Object.entries(counts).map(([emoji, info]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            className={cx('rounded-full border px-1.5 py-0.5 text-[11px] tabular-nums', info.mine ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]')}
          >
            {emoji} {info.count}
          </button>
        ))}

        <div className="flex items-center gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          <button type="button" onClick={() => setShowEmoji((v) => !v)} className="msg-action" aria-label="Add reaction">
            <Icon.smile width={14} height={14} />
          </button>
          <button type="button" onClick={onThread} className="msg-action" aria-label="Reply in thread">
            <Icon.reply width={14} height={14} />
            {message._count.replies > 0 && <span className="text-[11px] tabular-nums">{message._count.replies}</span>}
          </button>
          {message.author.id === currentUserId && (
            <button type="button" onClick={onDelete} className="msg-action text-[var(--danger)]" aria-label="Delete message">
              <Icon.trash width={14} height={14} />
            </button>
          )}
        </div>

        {showEmoji && (
          <div className="flex gap-0.5 rounded-lg border bg-[var(--surface)] px-1 py-0.5 shadow-[var(--shadow)]">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(emoji);
                  setShowEmoji(false);
                }}
                className="rounded px-1 text-sm hover:bg-[var(--bg-inset)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  channelId,
  placeholder,
  onTyping,
  onSent,
}: {
  channelId: string;
  placeholder: string;
  onTyping: (typing: boolean) => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Grow with the message up to five lines, then scroll inside. */
  const resize = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  const send = async () => {
    if (!body.trim() && files.length === 0) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('body', body);
      files.forEach((file) => form.append('files', file));
      await api.upload(`/api/chat/channels/${channelId}/messages`, form);
      setBody('');
      setFiles([]);
      requestAnimationFrame(resize);
      onTyping(false);
      onSent();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t bg-[var(--surface)] p-2 sm:p-2.5">
      {files.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <span key={index} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]">
              {file.name}
              <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <button type="button" onClick={() => input.current?.click()} className="btn btn-ghost btn-icon shrink-0" aria-label="Attach a file">
          <Icon.paperclip width={17} height={17} />
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
        <textarea
          ref={box}
          className="textarea min-h-[2.75rem] flex-1 resize-none py-2.5 leading-snug"
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            resize();
            onTyping(true);
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => onTyping(false), 2000);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" loading={sending} onClick={() => void send()} disabled={!body.trim() && files.length === 0} aria-label="Send message" className="shrink-0">
          <Icon.send width={16} height={16} />
        </Button>
      </div>
    </div>
  );
}

function ThreadDrawer({ thread, channelId, onClose }: { thread: Message | null; channelId?: string; onClose: () => void }) {
  const { data: replies, refetch } = useQuery<Message[]>(thread && channelId ? `/api/chat/channels/${channelId}/messages?parentId=${thread.id}` : null, [thread?.id, channelId]);
  const [body, setBody] = useState('');
  const toast = useToast();

  return (
    <Modal open={Boolean(thread)} onClose={onClose} title="Thread">
      {thread && (
        <div className="space-y-3">
          <div className="rounded-lg border bg-[var(--bg-inset)] p-3">
            <p className="text-[13px] font-semibold">{thread.author.name}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{thread.body}</p>
          </div>
          <ul className="space-y-2">
            {(replies ?? []).map((reply) => (
              <li key={reply.id} className="flex gap-2">
                <Avatar seed={reply.author.id} name={reply.author.name} src={reply.author.avatarUrl} size={24} />
                <div>
                  <p className="text-[12px] font-semibold">
                    {reply.author.name} <span className="text-[10px] font-normal text-[var(--text-faint)]">{relativeTime(reply.createdAt)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-[13px]">{reply.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!body.trim()) return;
              try {
                const form = new FormData();
                form.append('body', body);
                form.append('parentId', thread.id);
                await api.upload(`/api/chat/channels/${channelId}/messages`, form);
                setBody('');
                void refetch();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              }
            }}
          >
            <input className="input" placeholder="Reply…" value={body} onChange={(e) => setBody(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!body.trim()}>
              Reply
            </Button>
          </form>
        </div>
      )}
    </Modal>
  );
}

function NewChannelModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New channel"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={name.trim().length < 1}
            onClick={async () => {
              setLoading(true);
              try {
                const { data } = await api.post<{ id: string }>('/api/chat/channels', { name: name.trim(), topic: topic.trim() || undefined, isPrivate });
                setName('');
                setTopic('');
                onCreated(data.id);
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="design-review" autoFocus />
        </Field>
        <Field label="Topic">
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this channel for?" />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          Private — only invited members can read it
        </label>
      </div>
    </Modal>
  );
}

