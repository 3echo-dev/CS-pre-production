#!/usr/bin/env node
// Queue the reference scout's board for the Scraper card: one document per reference row of
// references/board.md, and the per-site outcome (searched, found n, or a gap with its reason)
// on the scraper item, so the person sees which of their sites were reached before they choose.
// The choice itself never travels this way: the page writes it to refsel/ and land reads it back
// into references/selected.json. Run after the scout writes board.md, and after every revision.
//
//   node push-references.js <client> <job-id> [--print] [--json]
//
// --print writes nothing to the outbox; it prints the documents as JSON for a direct batch.
// Exit 0 queued · 2 usage · 3 no board.md
const fs = require('fs');
const path = require('path');
const ws = require('./lib-workspace.js');
const board = require('./lib-board.js');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const print = argv.includes('--print');
const { brand: client, jobId, dir } = ws.resolveJobArgs(argv, argv);
if (!client || !jobId) { console.error('usage: push-references.js <client> <job-id> [--print] [--json]'); process.exit(2); }

const file = path.join(dir, 'references', 'board.md');
if (!fs.existsSync(file)) { console.error('No references/board.md on disk yet.'); process.exit(3); }
const text = fs.readFileSync(file, 'utf8');

// Front matter: version and the sites the scout says it searched.
const fm = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
const fmVal = k => ((fm.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) || [])[1] || '').trim();
const version = Number(fmVal('version')) || 1;
const searched = fmVal('sites_searched').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);

// A markdown table under a heading: the rows as arrays of cells, header and rule skipped.
function tableUnder(heading) {
  const re = new RegExp('^#\\s+' + heading + '\\s*$', 'mi');
  const m = re.exec(text); if (!m) return [];
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(/^#\s+/m);
  const block = end >= 0 ? rest.slice(0, end) : rest;
  return block.split(/\r?\n/).filter(l => /^\|/.test(l)).map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    .filter(cells => cells.length > 1 && !cells.every(c => /^:?-+:?$/.test(c)));
}
const refRows = tableUnder('References').filter(c => /^\d+$/.test(c[0]));
const gapRows = tableUnder('Gaps').filter(c => c[0] && !/^Site$/i.test(c[0]));

// The roster the person gave, so a site with nothing found is still listed.
const rosterFile = path.join(ws.wsDir(client, argv), 'client', 'sites.md');
let roster = [];
try {
  roster = fs.readFileSync(rosterFile, 'utf8').split(/\r?\n/).filter(l => /^\|/.test(l))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim())).filter(c => c.length > 1 && !/^:?-+:?$/.test(c[0]) && !/^Site$/i.test(c[0]))
    .map(c => ({ name: c[0], url: c[1] || '' }));
} catch { roster = []; }

const refs = refRows.map(c => ({ n: Number(c[0]), title: c[1] || '', url: c[2] || '', retrieved: c[3] || '', site: c[4] || '', why: c[5] || '', selectedMark: c[6] || '' }));
const names = new Set([...roster.map(r => r.name), ...searched, ...refs.map(r => r.site), ...gapRows.map(g => g[0])].filter(Boolean));
const sameSite = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9]/g, '') === String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
const sites = [...names].map(name => {
  const count = refs.filter(r => sameSite(r.site, name)).length;
  const gap = gapRows.find(g => sameSite(g[0], name));
  const wasSearched = searched.some(s => sameSite(s, name));
  const status = count ? 'found' : gap ? 'gap' : wasSearched ? 'none' : 'not_searched';
  const r = roster.find(x => sameSite(x.name, name));
  return { name, url: r ? r.url : '', status, count, note: gap ? [gap[3] || gap[1] || '', gap[2] ? 'tried ' + gap[2] : ''].filter(Boolean).join(' · ') : '' };
});

const at = new Date().toISOString();
const docs = refs.map(r => ({ key: jobId, id: 'r' + String(r.n).padStart(2, '0'), n: r.n, title: r.title, url: r.url, retrieved: r.retrieved, site: r.site, why: r.why, version, updatedAt: at }));
const item = { key: jobId, sites, refCount: refs.length, refVersion: version, sitesAt: at };

(async () => {
  if (!print) {
    for (const d of docs) await board.call('reference', d, { argv });
    await board.call('scraper-sites', item, { argv });
  }
  const out = { project: jobId, version, queued: print ? 0 : docs.length, references: docs.length, sites, ...(print ? { documents: docs, scraper: item } : {}) };
  if (json || print) console.log(JSON.stringify(out, null, print ? 2 : 0));
  else console.log('Queued ' + docs.length + ' reference' + (docs.length === 1 ? '' : 's') + ' and the site outcome (' + sites.map(s => s.name + ': ' + (s.status === 'found' ? s.count + ' found' : s.status)).join(', ') + ') for the board. Run board-sync.js push next.');
})();