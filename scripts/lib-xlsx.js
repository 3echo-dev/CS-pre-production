// Read the first sheet of an .xlsx into rows of strings, with no dependency.
//
// An xlsx is a zip of XML. The two checks that read the client's templates need cell text and
// nothing else, so this walks the zip's central directory, inflates sharedStrings.xml and
// sheet1.xml with zlib, and returns a grid. Formulas come back as their cached value, dates
// as their serial number, merged cells as one value in the top-left cell and blanks elsewhere.
//
// A .csv given to the same function is parsed as CSV, so a fixture or a client who works in
// Sheets can hand over either.
const fs = require('fs');
const zlib = require('zlib');

function entries(buf) {
  // End of central directory record, searched from the tail; the comment can push it back.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    out[name] = { method, csize, local };
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function read(buf, entry) {
  const off = entry.local;
  if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = buf.readUInt16LE(off + 26), extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.csize);
  if (entry.method === 0) return data.toString('utf8');
  if (entry.method === 8) return zlib.inflateRawSync(data).toString('utf8');
  throw new Error('unsupported zip method ' + entry.method);
}

const unescape = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = xml => unescape(xml.replace(/<[^>]+>/g, ''));

function sharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const ts = [];
    const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tre.exec(m[1]))) ts.push(unescape(t[1]));
    out.push(ts.join(''));
  }
  return out;
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetRows(xml, strings) {
  const rows = [];
  const rre = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let r;
  while ((r = rre.exec(xml))) {
    const cells = [];
    const cre = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cre.exec(r[1]))) {
      const idx = colIndex(c[1]);
      const attrs = c[2] || '', body = c[3] || '';
      const type = (attrs.match(/t="(\w+)"/) || [])[1];
      let value = '';
      if (type === 's') { const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; value = strings[Number(v)] || ''; }
      else if (type === 'inlineStr') value = textOf((body.match(/<is>([\s\S]*?)<\/is>/) || [, ''])[1]);
      else value = unescape((body.match(/<v>([\s\S]*?)<\/v>/) || [, ''])[1]);
      cells[idx] = value;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = []; let cur = '', q = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (q) { if (ch === '"' && raw[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map(s => s.trim()));
  }
  return rows;
}

/** Rows of the first sheet (or the CSV), every cell a trimmed string. */
function readRows(file) {
  if (/\.csv$/i.test(file)) return parseCsv(fs.readFileSync(file, 'utf8'));
  const buf = fs.readFileSync(file);
  const zip = entries(buf);
  const strings = zip['xl/sharedStrings.xml'] ? sharedStrings(read(buf, zip['xl/sharedStrings.xml'])) : [];
  const sheetName = Object.keys(zip).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('no worksheet in ' + file);
  return sheetRows(read(buf, zip[sheetName]), strings).map(r => r.map(c => String(c).trim()));
}

module.exports = { readRows, parseCsv };
