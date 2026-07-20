function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertString(value, label, max = 20_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${label} must be a non-empty string no longer than ${max} characters`);
  }
}

function assertHttpUrl(value, label) {
  assertString(value, label, 4_096);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must use HTTP(S)`);
}

function assertDate(value, label) {
  if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD or null`);
  }
}

function assertEvidence(entries, label) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 12) {
    throw new Error(`${label} must contain 1-12 evidence entries`);
  }
  entries.forEach((entry, index) => {
    assertObject(entry, `${label}[${index}]`);
    assertString(entry.claim, `${label}[${index}].claim`, 2_000);
    assertHttpUrl(entry.url, `${label}[${index}].url`);
  });
}

export function parseAndValidateResearch(text, posts) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Researcher did not return valid JSON');
  }
  assertObject(value, 'research');
  if (!Array.isArray(value.sourcePosts) || value.sourcePosts.length !== posts.length) {
    throw new Error('Research must contain exactly one entry per preserved post');
  }
  const expected = new Set(posts.map((post) => post.url));
  const received = new Set();
  let totalCandidates = 0;

  value.sourcePosts.forEach((group, groupIndex) => {
    assertObject(group, `sourcePosts[${groupIndex}]`);
    assertHttpUrl(group.sourcePostUrl, `sourcePosts[${groupIndex}].sourcePostUrl`);
    if (!expected.has(group.sourcePostUrl) || received.has(group.sourcePostUrl)) {
      throw new Error('Research source post URLs must uniquely match preserved posts');
    }
    received.add(group.sourcePostUrl);
    if (!Array.isArray(group.candidates) || group.candidates.length > 12) {
      throw new Error('Each source post may contain at most 12 candidates');
    }
    totalCandidates += group.candidates.length;
    group.candidates.forEach((candidate, candidateIndex) => {
      const label = `sourcePosts[${groupIndex}].candidates[${candidateIndex}]`;
      assertObject(candidate, label);
      assertString(candidate.title, `${label}.title`, 1_000);
      assertHttpUrl(candidate.url, `${label}.url`);
      assertString(candidate.kind, `${label}.kind`, 100);
      assertDate(candidate.publicationDate, `${label}.publicationDate`);
      assertEvidence(candidate.evidence, `${label}.evidence`);
      assertObject(candidate.relevance, `${label}.relevance`);
      assertString(candidate.relevance.foundersOperators, `${label}.relevance.foundersOperators`, 2_000);
      assertString(candidate.relevance.pressPodcastBookers, `${label}.relevance.pressPodcastBookers`, 2_000);
      if (!Array.isArray(candidate.uncertainties) || candidate.uncertainties.length > 12) {
        throw new Error(`${label}.uncertainties must be an array with at most 12 entries`);
      }
      candidate.uncertainties.forEach((item, index) => assertString(item, `${label}.uncertainties[${index}]`, 1_000));
    });
  });
  if (!totalCandidates) throw new Error('Research must contain at least one candidate');
  return value;
}

export function parseAndValidateEditor(text, posts) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Editor did not return valid JSON');
  }
  assertObject(value, 'editor output');
  assertObject(value.validated, 'validated');
  if (!Array.isArray(value.validated.accepted) || !Array.isArray(value.validated.rejected)) {
    throw new Error('Validated output must contain accepted and rejected arrays');
  }
  if (value.validated.accepted.length > 24 || value.validated.rejected.length > 24) {
    throw new Error('Validated output contains too many items');
  }
  const postUrls = new Set(posts.map((post) => post.url));
  const acceptedUrls = new Set();
  value.validated.accepted.forEach((item, index) => {
    const label = `validated.accepted[${index}]`;
    assertObject(item, label);
    assertHttpUrl(item.sourcePostUrl, `${label}.sourcePostUrl`);
    if (!postUrls.has(item.sourcePostUrl)) throw new Error(`${label} references an unknown source post`);
    assertString(item.title, `${label}.title`, 1_000);
    assertHttpUrl(item.url, `${label}.url`);
    if (acceptedUrls.has(item.url)) throw new Error('Validated accepted URLs must be unique');
    acceptedUrls.add(item.url);
    assertString(item.kind, `${label}.kind`, 100);
    assertDate(item.publicationDate, `${label}.publicationDate`);
    assertEvidence(item.evidence, `${label}.evidence`);
    assertString(item.editorialUse, `${label}.editorialUse`, 2_000);
  });
  value.validated.rejected.forEach((item, index) => {
    const label = `validated.rejected[${index}]`;
    assertObject(item, label);
    assertHttpUrl(item.url, `${label}.url`);
    assertString(item.reason, `${label}.reason`, 2_000);
  });
  assertString(value.newsletterMarkdown, 'newsletterMarkdown', 100_000);
  if (!/^## Sources\s*$/m.test(value.newsletterMarkdown)) {
    throw new Error('Newsletter must contain a Sources section');
  }
  return value;
}
