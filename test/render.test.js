import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/render.js';

test('renderMarkdown keeps editorial markup and strips active content', () => {
  const html = renderMarkdown('# Brief\n\n[Source](https://example.com)\n\n<script>alert(1)</script>');
  assert.match(html, /<h1>Brief<\/h1>/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<script|alert\(1\)/);
});

test('renderMarkdown rejects javascript links', () => {
  const html = renderMarkdown('[bad](javascript:alert(1))');
  assert.doesNotMatch(html, /javascript:/i);
});
