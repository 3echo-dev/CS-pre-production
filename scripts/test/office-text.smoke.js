#!/usr/bin/env node
// office-text.py turns .docx, .pptx and .xlsx into Markdown the directors can read. This builds
// one minimal file of each kind (a zip of the XML parts, no Office needed), converts them, and
// checks the words, the slide order, the table cells and the sheet names come through.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'office-text.py');

// A stored (uncompressed) zip writer: enough for the converter's zipfile reader.
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8'), n = Buffer.from(name, 'utf8'), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n); offset += lh.length + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, end]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-office-'));
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
fs.writeFileSync(path.join(tmp, 'brief.docx'), zip({
  'word/document.xml': `<w:document xmlns:w="${W}"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Night Shift brief</w:t></w:r></w:p>
    <w:p><w:r><w:t>A sixty second film about </w:t></w:r><w:r><w:t>one nurse.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Deadline October</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Deliverable</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Length</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Main film</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>60s</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`,
}));
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const slide = (title, body) => `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;
fs.writeFileSync(path.join(tmp, 'deck.pptx'), zip({
  // Deck order is slide 2 first on purpose: the converter must follow sldIdLst, not file names.
  'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${PR}"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`,
  'ppt/slides/slide1.xml': slide('Second in the deck', 'Budget is a question'),
  'ppt/slides/slide2.xml': slide('Concept', 'Live pictures storyboard'),
  'ppt/notesSlides/notesSlide2.xml': `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Client prefers sketches for the trailer</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
}));
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
fs.writeFileSync(path.join(tmp, 'budget.xlsx'), zip({
  'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Lines" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${PR}"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
  'xl/sharedStrings.xml': `<sst xmlns="${S}"><si><t>Item</t></si><si><t>Cost</t></si><si><t>Talent loading</t></si></sst>`,
  'xl/worksheets/sheet1.xml': `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1200</v></c></row></sheetData></worksheet>`,
}));

const run = spawnSync('python', [SCRIPT, tmp], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, 'converter exit: ' + run.stdout + run.stderr);
const read = f => fs.readFileSync(path.join(tmp, f), 'utf8');

const doc = read('brief.md');
assert.ok(/^# Night Shift brief/m.test(doc), 'docx heading');
assert.ok(doc.includes('A sixty second film about one nurse.'), 'docx runs joined');
assert.ok(/^- Deadline October/m.test(doc), 'docx list item');
assert.ok(doc.includes('| Main film | 60s |'), 'docx table row');

const deck = read('deck.md');
assert.ok(deck.indexOf('### Concept') < deck.indexOf('### Second in the deck'), 'pptx follows deck order, not file names');
assert.ok(/^## Slide 1\n### Concept/m.test(deck), 'pptx slide numbering');
assert.ok(deck.includes('- Live pictures storyboard'), 'pptx body text');
assert.ok(deck.includes('Notes: Client prefers sketches for the trailer'), 'pptx speaker notes');

const xl = read('budget.md');
assert.ok(/^## Sheet: Lines/m.test(xl), 'xlsx sheet name');
assert.ok(xl.includes('| Item | Cost |'), 'xlsx header from shared strings');
assert.ok(xl.includes('| Talent loading |  | 1200 |'), 'xlsx keeps the blank column and the number');

assert.ok(run.stdout.split('\n').filter(l => l.startsWith('wrote ')).length === 3, 'three files reported');
const none = spawnSync('python', [SCRIPT, path.join(tmp, 'brief.md')], { encoding: 'utf8' });
assert.strictEqual(none.status, 3, 'nothing to do exits 3');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok   docx, pptx and xlsx convert to Markdown with headings, order, tables and notes intact');
console.log('office-text verification passed');
