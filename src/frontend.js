function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const clientScript = `
const state = document.querySelector('[data-state]');
const issue = document.querySelector('[data-issue]');
const sources = document.querySelector('[data-sources]');
const sourcePosts = document.querySelector('[data-posts]');

function addLink(list, title, url, meta) {
  const li = document.createElement('li');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = title;
  const small = document.createElement('small');
  small.textContent = meta;
  li.append(anchor, small);
  list.append(li);
}

fetch('/api/latest', { headers: { accept: 'application/json' } })
  .then(async (response) => {
    if (!response.ok) throw new Error(response.status === 404 ? 'No completed run is published yet.' : 'The completed edition could not be loaded.');
    return response.json();
  })
  .then((data) => {
    state.textContent = 'Latest completed manual run · ' + new Date(data.run.completedAt).toLocaleString();
    issue.innerHTML = data.newsletterHtml;
    data.posts.forEach((post) => addLink(sourcePosts, post.title, post.url, [post.outlet, post.publicationDate].filter(Boolean).join(' · ')));
    data.validated.accepted.forEach((item) => addLink(sources, item.title, item.url, [item.kind, item.publicationDate].filter(Boolean).join(' · ')));
    document.body.classList.add('is-ready');
  })
  .catch((error) => {
    state.textContent = error.message;
    issue.innerHTML = '<h2>Awaiting a completed edition</h2><p>Run the local generation command, then restart the viewer.</p>';
  });
`;

export function renderHome(nonce) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="A public-safe editorial assessment of recent press coverage and adjacent sources.">
<title>Prommer Press Scout</title>
<style>
:root{color-scheme:light;--cream:#f2e7d1;--paper:#fffaf0;--rust:#a3482a;--rust-dark:#73301f;--navy:#102a3d;--ink:#2d3335;--line:#c9bda7}
*{box-sizing:border-box}html{background:var(--navy)}body{margin:0;color:var(--ink);background:radial-gradient(circle at 8% 5%,#fff8e8 0 8%,transparent 28%),linear-gradient(115deg,var(--cream),#e8d8ba);font:17px/1.65 Georgia,"Times New Roman",serif;min-height:100vh}
a{color:var(--rust-dark);text-decoration-thickness:1px;text-underline-offset:3px}a:hover{color:var(--rust)}
.masthead{padding:22px clamp(20px,6vw,80px);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #102a3d38;color:var(--navy)}.mark{font:800 12px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em;text-transform:uppercase}.edition{font-style:italic;color:var(--rust-dark)}
.hero{padding:clamp(58px,11vw,132px) clamp(20px,9vw,140px) clamp(52px,8vw,100px);position:relative;overflow:hidden}.hero:after{content:"PS";position:absolute;right:-.05em;bottom:-.35em;font:700 clamp(13rem,36vw,35rem)/1 "Iowan Old Style",Palatino,serif;color:#a3482a0c;pointer-events:none}.kicker{font:800 12px/1.3 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.18em;color:var(--rust)}h1,h2,h3{font-family:"Iowan Old Style","Palatino Linotype",Palatino,serif;color:var(--navy);line-height:1.04}h1{font-size:clamp(3.5rem,10vw,9rem);font-weight:500;letter-spacing:-.055em;max-width:1050px;margin:.18em 0}.dek{font-size:clamp(1.15rem,2vw,1.55rem);line-height:1.5;max-width:670px;margin:0}.status{display:inline-block;margin-top:34px;padding:10px 14px;border:1px solid var(--rust);color:var(--rust-dark);background:#fff8e899;font:700 11px/1.4 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.08em}
.layout{background:var(--paper);display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,340px);gap:clamp(36px,7vw,100px);padding:clamp(36px,7vw,96px) clamp(20px,9vw,140px);border-top:9px solid var(--rust)}.newsletter{max-width:780px}.newsletter h1{font-size:clamp(2.8rem,6vw,5.4rem);margin-top:0}.newsletter h2{font-size:clamp(1.8rem,3vw,2.8rem);margin-top:1.7em}.newsletter h3{font-size:1.35rem;margin-top:1.7em}.newsletter blockquote{border-left:4px solid var(--rust);margin-left:0;padding-left:22px;color:#53616a}.newsletter li+li{margin-top:.4em}.newsletter code{font-size:.9em}.newsletter pre{overflow:auto;background:var(--navy);color:var(--paper);padding:18px}.newsletter table{border-collapse:collapse;display:block;overflow:auto}.newsletter th,.newsletter td{border:1px solid var(--line);padding:8px 12px;text-align:left}
.rail{border-left:1px solid var(--line);padding-left:clamp(24px,4vw,50px)}.rail section+section{border-top:1px solid var(--line);margin-top:38px;padding-top:28px}.rail h2{font-size:1.4rem}.source-list{list-style:none;padding:0}.source-list li{margin:0 0 22px}.source-list a{font-weight:700;line-height:1.3;display:block}.source-list small{display:block;margin-top:5px;color:#6d6d65;font:700 10px/1.4 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.06em}.note{font-size:.9rem;color:#62645f}
footer{background:var(--navy);color:var(--cream);padding:34px clamp(20px,9vw,140px);display:flex;justify-content:space-between;gap:20px;font-size:.9rem}.is-ready .newsletter>*{animation:reveal .5s ease both}.is-ready .newsletter>*:nth-child(2){animation-delay:.06s}.is-ready .newsletter>*:nth-child(3){animation-delay:.12s}@keyframes reveal{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
@media(max-width:780px){.masthead{align-items:flex-start;gap:14px}.edition{text-align:right}.layout{grid-template-columns:1fr}.rail{border-left:0;border-top:1px solid var(--line);padding:30px 0 0}.hero{padding-top:70px}footer{flex-direction:column}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<header class="masthead"><span class="mark">Prommer Press Scout</span><span class="edition">Editorial assessment</span></header>
<section class="hero"><p class="kicker">Signal, context, consequence</p><h1>Beyond the headline.</h1><p class="dek">A compact editorial reading of recent public coverage, paired with independently checked papers, events, and conversations worth carrying forward.</p><p class="status" data-state>Loading the latest completed manual run…</p></section>
<main class="layout"><article class="newsletter" data-issue aria-live="polite"><h2>Opening the latest edition…</h2></article><aside class="rail"><section><p class="kicker">Original coverage</p><h2>The starting point</h2><ol class="source-list" data-posts></ol></section><section><p class="kicker">Checked by the editor</p><h2>Accepted sources</h2><ol class="source-list" data-sources></ol></section><section><p class="note">This is an independent assessment generated by a manual two-agent research and editorial run. It is not official content from the source site. Verify sources before publication.</p></section></aside></main>
<footer><span>Prommer Press Scout · public assessment artifact</span><span>No automatic generation. No public trigger.</span></footer>
<script nonce="${escapeHtml(nonce)}">${clientScript}</script>
</body></html>`;
}
