import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const allowedTags = [
  'article', 'section', 'h1', 'h2', 'h3', 'h4', 'p', 'blockquote', 'ul', 'ol', 'li',
  'strong', 'em', 'code', 'pre', 'hr', 'br', 'a', 'sup', 'sub', 'table', 'thead', 'tbody',
  'tr', 'th', 'td'
];

export function sanitizeRenderedHtml(html) {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      code: ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: 'a',
        attribs: {
          ...attributes,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    }
  });
}

export function renderMarkdown(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('markdown must be a string');
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  return sanitizeRenderedHtml(raw);
}

export function renderNewsletterDocument(markdown, metadata) {
  const article = renderMarkdown(markdown);
  const title = escapeHtml(metadata.title || 'Prommer Press Scout');
  const generatedAt = escapeHtml(metadata.completedAt || '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<style>
:root{color-scheme:light;--cream:#f4ead6;--paper:#fffaf0;--navy:#10283b;--rust:#a9482a;--ink:#273039}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:18px/1.68 Georgia,serif}
main{width:min(760px,calc(100% - 32px));margin:48px auto;background:var(--paper);padding:clamp(28px,7vw,72px);border-top:8px solid var(--rust);box-shadow:0 18px 60px #10283b1c}
h1,h2,h3{color:var(--navy);font-family:"Iowan Old Style",Palatino,serif;line-height:1.08}h1{font-size:clamp(2.5rem,8vw,5rem)}a{color:var(--rust);text-underline-offset:3px}blockquote{border-left:4px solid var(--rust);margin-left:0;padding-left:24px;color:#4b5660}pre{overflow:auto;background:var(--navy);color:var(--paper);padding:18px}.meta{font:700 12px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.13em;color:var(--rust)}
</style>
</head>
<body><main><p class="meta">Latest completed manual run · ${generatedAt}</p>${article}</main></body>
</html>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
