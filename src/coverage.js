import * as cheerio from 'cheerio';

function normalizeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function itemFromElement($, element, baseUrl) {
  const item = $(element);
  const headlineLink = item.find('.release-headline a[href]').first();
  const link = headlineLink.length ? headlineLink : item.find('a[href]').first();
  const url = normalizeUrl(link.attr('href'), baseUrl);
  if (!url) return null;

  const time = item.find('time').first();
  const datetime = cleanText(time.attr('datetime') || time.text() || '');
  const title = cleanText(headlineLink.text() || link.attr('aria-label') || link.text() || 'Untitled coverage');
  const outlet = cleanText(item.find('.release-outlet').first().text() || '');
  const summary = cleanText(
    item.find('.release-summary, .release-description, .release-excerpt').first().text() || ''
  );

  return {
    url,
    title,
    outlet,
    publicationDate: datetime || null,
    summary: summary || null,
    sourceHtml: $.html(item)
  };
}

export function extractCoveragePosts(html, pressPageUrl, limit = 2) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
  const $ = cheerio.load(html);
  const coverage = $('#coverage').first();
  if (!coverage.length) throw new Error('Press page is missing the #coverage section');

  const candidates = coverage.find('.release-item').toArray();
  if (!candidates.length) throw new Error('Coverage section contains no .release-item entries');

  const seen = new Set();
  const posts = [];
  for (const element of candidates) {
    const post = itemFromElement($, element, pressPageUrl);
    if (!post || seen.has(post.url)) continue;
    seen.add(post.url);
    posts.push(post);
    if (posts.length === limit) break;
  }

  if (!posts.length) throw new Error('Coverage section contains no usable HTTP(S) coverage URLs');
  return posts;
}

async function readBoundedBody(response, maxBytes) {
  if (!response.body) throw new Error('Press page response has no body');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`Press page exceeds the ${maxBytes}-byte input limit`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchPressPage(config, fetchImpl = fetch) {
  const initial = new URL(config.pressPageUrl);
  let current = initial;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'PrommerPressScout/0.1 (+public editorial assessment)'
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Press page redirect is missing a Location header');
      const next = new URL(location, current);
      if (next.origin !== initial.origin) throw new Error('Cross-origin press page redirect refused');
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`Press page request failed with HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('text/html')) throw new Error('Press page did not return HTML');
    return { html: await readBoundedBody(response, config.maxPressBytes), finalUrl: current.toString() };
  }

  throw new Error('Press page exceeded the redirect limit');
}
