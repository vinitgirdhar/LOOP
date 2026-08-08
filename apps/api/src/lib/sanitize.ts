import sanitizeHtml from 'sanitize-html';

/**
 * Wiki pages accept rich text, so they are sanitised on write. Everything else
 * is stored as plain text and rendered as text on the client.
 */
export function cleanRichText(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'em', 'u', 's', 'code', 'pre',
      'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      code: ['class'],
      pre: ['class'],
      span: ['class'],
      div: ['class'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

/** Strips every tag — used for chat, comments, titles and anything echoed raw. */
export function cleanText(dirty: string): string {
  return sanitizeHtml(dirty, { allowedTags: [], allowedAttributes: {} }).trim();
}

/** Pulls @mentions out of a body so we can resolve them to user ids. */
export function extractMentionHandles(body: string): string[] {
  return [...new Set([...body.matchAll(/@([\w.+-]+)/g)].map((m) => m[1]!.toLowerCase()))];
}
