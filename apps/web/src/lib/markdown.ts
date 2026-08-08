/**
 * Tiny markdown → HTML converter.
 *
 * Wiki pages accept markdown and are stored as HTML, which the API sanitises
 * on write. A full markdown library would be ~40kB in the bundle for a feature
 * set this page does not use, so this covers exactly what the editor toolbar
 * can produce: headings, emphasis, code, fences, links, images, lists,
 * blockquotes, tables and rules.
 */

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, code: string) => `<code>${escapeHtml(code)}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');
}

export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let inFence = false;
  let fenceLang = '';
  let fenceBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inQuote = false;
  let tableBuffer: string[] = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push('</blockquote>');
      inQuote = false;
    }
  };
  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.map((row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
    const [header, divider, ...body] = rows;
    if (header && divider && /^:?-{2,}:?$/.test(divider[0]?.replace(/\s/g, '') ?? '')) {
      out.push('<table><thead><tr>');
      header.forEach((cell) => out.push(`<th>${inline(escapeHtml(cell))}</th>`));
      out.push('</tr></thead><tbody>');
      body.forEach((row) => {
        out.push('<tr>');
        row.forEach((cell) => out.push(`<td>${inline(escapeHtml(cell))}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table>');
    } else {
      tableBuffer.forEach((row) => out.push(`<p>${inline(escapeHtml(row))}</p>`));
    }
    tableBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // fenced code
    const fence = line.match(/^```(\w*)$/);
    if (fence) {
      if (inFence) {
        out.push(`<pre><code${fenceLang ? ` class="language-${fenceLang}"` : ''}>${escapeHtml(fenceBuffer.join('\n'))}</code></pre>`);
        fenceBuffer = [];
        inFence = false;
        fenceLang = '';
      } else {
        closeList();
        closeQuote();
        flushTable();
        inFence = true;
        fenceLang = fence[1] ?? '';
      }
      continue;
    }
    if (inFence) {
      fenceBuffer.push(raw);
      continue;
    }

    // tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      closeList();
      closeQuote();
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    if (line.trim() === '') {
      closeList();
      closeQuote();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]!))}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeList();
      closeQuote();
      out.push('<hr />');
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      if (!inQuote) {
        out.push('<blockquote>');
        inQuote = true;
      }
      out.push(`<p>${inline(escapeHtml(quote[1]!))}</p>`);
      continue;
    }
    closeQuote();

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const wanted = bullet ? 'ul' : 'ol';
      if (listType !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        listType = wanted;
      }
      out.push(`<li>${inline(escapeHtml((bullet ?? numbered)![1]!))}</li>`);
      continue;
    }
    closeList();

    out.push(`<p>${inline(escapeHtml(line))}</p>`);
  }

  if (inFence) out.push(`<pre><code>${escapeHtml(fenceBuffer.join('\n'))}</code></pre>`);
  flushTable();
  closeList();
  closeQuote();

  return out.join('\n');
}

/** Rough inverse, used to load an existing HTML page back into the editor. */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';
  return html
    .replace(/\r/g, '')
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (_, code: string) => `\n\`\`\`\n${decode(code)}\n\`\`\`\n`)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, '\n#### $1\n')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (_, inner: string) =>
      `\n${inner.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '> $1\n')}`,
    )
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, '- $1\n')
    .replace(/<\/?(ul|ol)[^>]*>/g, '\n')
    .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/g, '![$2]($1)')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/g, '*$1*')
    .replace(/<s[^>]*>([\s\S]*?)<\/s>/g, '~~$1~~')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<hr\s*\/?>/g, '\n---\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '\n$1\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => decode(line).trimEnd())
    .join('\n')
    .trim();
}

const decode = (value: string) =>
  value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
