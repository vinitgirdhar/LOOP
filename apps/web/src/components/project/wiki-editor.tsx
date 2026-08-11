'use client';

import { useMemo, useRef, useState } from 'react';
import { Button, Card, Field } from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/providers/toast';
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown';
import { cx } from '@/lib/format';

interface EditablePage {
  id: string;
  title: string;
  content: string;
  isShared: boolean;
}

const TOOLBAR: { label: string; title: string; wrap: [string, string]; block?: boolean }[] = [
  { label: 'H2', title: 'Heading', wrap: ['## ', ''], block: true },
  { label: 'B', title: 'Bold', wrap: ['**', '**'] },
  { label: 'I', title: 'Italic', wrap: ['*', '*'] },
  { label: '</>', title: 'Inline code', wrap: ['`', '`'] },
  { label: '{ }', title: 'Code block', wrap: ['```\n', '\n```'], block: true },
  { label: '•', title: 'Bullet list', wrap: ['- ', ''], block: true },
  { label: '1.', title: 'Numbered list', wrap: ['1. ', ''], block: true },
  { label: '“', title: 'Quote', wrap: ['> ', ''], block: true },
  { label: 'Link', title: 'Link', wrap: ['[', '](https://)'] },
  { label: '▦', title: 'Table', wrap: ['| Column | Column |\n| --- | --- |\n| Value | Value |', ''], block: true },
];

/**
 * Markdown editor with a live preview. Markdown is converted to HTML on save
 * and the API sanitises it, so the stored document is always safe to render.
 */
export function WikiEditor({ page, onSaved, onCancel }: { page: EditablePage; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(page.title);
  const [markdown, setMarkdown] = useState(() => htmlToMarkdown(page.content));
  const [isShared, setIsShared] = useState(page.isShared);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const html = useMemo(() => markdownToHtml(markdown), [markdown]);

  const applyFormat = (wrap: [string, string], block?: boolean) => {
    const element = textarea.current;
    if (!element) return;
    const { selectionStart: start, selectionEnd: end, value } = element;
    const selected = value.slice(start, end);
    const prefix = block && start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const next = `${value.slice(0, start)}${prefix}${wrap[0]}${selected}${wrap[1]}${value.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => {
      element.focus();
      const caret = start + prefix.length + wrap[0].length + selected.length;
      element.setSelectionRange(caret, caret);
    });
  };

  return (
    <Card padded={false}>
      <div className="space-y-3 border-b p-4">
        <Field label="Title" required>
          <input className="input text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          Share with clients
          <span className="text-[11px] text-[var(--text-muted)]">(also controls what AI retrieval may surface to them)</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {TOOLBAR.map((item) => (
          <button
            key={item.title}
            type="button"
            title={item.title}
            onClick={() => applyFormat(item.wrap, item.block)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-inset)] hover:text-[var(--text)]"
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={cx('rounded-md px-2 py-1 text-xs font-medium', !preview ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)]')}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={cx('rounded-md px-2 py-1 text-xs font-medium', preview ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)]')}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="p-4">
        {preview ? (
          <div className="prose-loop min-h-64" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <textarea
            ref={textarea}
            className="textarea min-h-64 font-mono text-[13px] leading-relaxed"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder={'# Heading\n\nWrite in markdown. Tables, code fences and images all work.'}
            spellCheck
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <p className="text-[11px] text-[var(--text-faint)]">Saving creates a new version you can restore later.</p>
        <div className="flex gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={title.trim().length < 1}
            onClick={async () => {
              setSaving(true);
              try {
                await api.patch(`/api/wiki/${page.id}`, { title: title.trim(), content: html, isShared });
                onSaved();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setSaving(false);
              }
            }}
          >
            Save page
          </Button>
        </div>
      </div>
    </Card>
  );
}
