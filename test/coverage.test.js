import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCoveragePosts } from '../src/coverage.js';

const html = `
<section id="coverage">
  <div class="release-item">
    <span class="release-outlet">Quote · Outlet One</span>
    <time datetime="2026-07-17">17 July 2026</time>
    <h3 class="release-headline"><a href="https://example.com/one#fragment">First story</a></h3>
    <p class="release-summary">First summary.</p>
  </div>
  <div class="release-item">
    <span class="release-outlet">Interview · Outlet Two</span>
    <time datetime="2026-07-13">13 July 2026</time>
    <h3 class="release-headline"><a href="/two">Second story</a></h3>
  </div>
</section>`;

test('extractCoveragePosts preserves order and normalizes URLs', () => {
  const posts = extractCoveragePosts(html, 'https://prommer.net/en/tech/press/', 2);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].title, 'First story');
  assert.equal(posts[0].url, 'https://example.com/one');
  assert.equal(posts[0].publicationDate, '2026-07-17');
  assert.equal(posts[1].url, 'https://prommer.net/two');
});

test('extractCoveragePosts fails closed when coverage markup changes', () => {
  assert.throws(() => extractCoveragePosts('<main>No coverage</main>', 'https://prommer.net/', 2), /#coverage/);
});
