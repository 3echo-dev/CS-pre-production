#!/usr/bin/env node
// The exports people download: the house templates carry no brand, registers and audio become a
// house-styled sheet, call sheets go out one file a day, the shot list falls back to the house
// template, the timeline is laid out for the project's year, and the storyboard fills the slide
// template three panels a slide.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const S = n => path.join(ROOT, 'scripts', n);
const PY = ['python', 'python3'].find(p => spawnSync(p, ['-c', 'import openpyxl, pptx'], { encoding: 'utf8' }).status === 0);
if (!PY) { console.log('skip python with openpyxl and python-pptx is not installed, so the exports cannot run here'); process.exit(0); }
const py = (args) => spawnSync(PY, args, { encoding: 'utf8' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-exports-'));
const job = path.join(tmp, 'workspaces', 'acme', 'jobs', 'job-1');
const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(job, rel)), { recursive: true }); fs.writeFileSync(path.join(job, rel), body); };

try {
  // 1. The house templates are generic: no studio, client or crew name anywhere in the files.
  const house = path.join(ROOT, 'templates', 'house');
  const scan = py(['-c', [
    'import zipfile, re, sys, os',
    "bad = re.compile(r'onedash|ministry of|final mile|graeme|zelysha|shahaff|melody|jingyan|cinegear|aarm|home team', re.I)",
    'hits = []',
    "for f in [x for x in os.listdir(sys.argv[1]) if x.endswith(('.xlsx', '.pptx'))]:",
    "    z = zipfile.ZipFile(os.path.join(sys.argv[1], f))",
    '    for n in z.namelist():',
    "        if n.endswith(('.xml', '.rels')) and bad.search(z.read(n).decode('utf8', 'ignore')): hits.append(f + ':' + n)",
    "    if any('/media/' in n for n in z.namelist()): hits.append(f + ': carries a picture')",
    'print(hits)',
  ].join('\n'), house]);
  assert.strictEqual(scan.stdout.trim(), '[]', 'house templates are brand-free and carry no pictures: ' + scan.stdout + scan.stderr);
  console.log('ok   the house templates carry no studio, client or crew name and no picture');

  // 2. Registers and audio: a house-styled sheet, blanks as unknown except notes.
  put('registers/talents.json', JSON.stringify({ fields: ['name', 'picture', 'age', 'availability', 'cost', 'loading'], rows: [{ name: 'Aisha', age: '8', availability: '12-14 Aug', cost: '', loading: 'unknown', notes: '' }] }));
  put('audio.md', '# Scene 1: flat, night\n| Row | Requirement | Source | Note |\n|---|---|---|---|\n| VO | Girl: I build the city | | |\n| SFX | kettle off-frame | SFX library | |\n# Questions\n- none\n');
  let r = py([S('sheet-export.py'), job, '--item', 'talents', '--json']);
  let out = JSON.parse(r.stdout);
  assert.deepStrictEqual(out.columns, ['Name', 'Picture', 'Age', 'Availability', 'Cost', 'Loading', 'Notes']);
  assert.deepStrictEqual(out.rows[0], ['Aisha', '', '8', '12-14 Aug', '', 'unknown', '']);
  const cells = py(['-c', "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([[c.value for c in r] for r in ws.iter_rows()]))", out.export]);
  const grid = JSON.parse(cells.stdout);
  assert.deepStrictEqual(grid[1], ['Aisha', 'unknown', '8', '12-14 Aug', 'unknown', 'unknown', null], 'a blank is the word unknown in the sheet, a blank note stays blank');
  r = py([S('sheet-export.py'), job, '--item', 'audio', '--json']);
  out = JSON.parse(r.stdout);
  assert.deepStrictEqual(out.rows.map(x => x.slice(0, 3)), [['Scene 1: flat, night', 'VO', 'Girl: I build the city'], ['Scene 1: flat, night', 'SFX', 'kettle off-frame']]);
  console.log('ok   registers and audio export as a house-styled sheet');

  // 3. Call sheets: one export a day, in day order.
  fs.mkdirSync(path.join(job, 'call-sheets'), { recursive: true });
  for (const d of [2, 1]) py(['-c', "import openpyxl,sys; wb=openpyxl.Workbook(); wb.active['A1']='DAY '+sys.argv[2]; wb.save(sys.argv[1])", path.join(job, 'call-sheets', 'day-' + d + '.xlsx'), String(d)]);
  r = py([S('sheet-export.py'), job, '--item', 'call_sheet', '--json']);
  out = JSON.parse(r.stdout);
  assert.deepStrictEqual(out.days.map(d => [d.day, path.basename(d.export), d.rows[0][0]]), [[1, 'call-sheet-day-1.xlsx', 'DAY 1'], [2, 'call-sheet-day-2.xlsx', 'DAY 2']]);
  console.log('ok   call sheets export one file a day, in day order');

  // 4. The shot list falls back to the house template when the client has none.
  put('shot-list.csv', 'shot_id,label,scene,panel,est_duration_s,Scene,Shot,Scene Description\nS1,1,1,P01,3,1,1,Girl on the floor\n');
  r = py([S('sheet-export.py'), job, '--item', 'shot_list', '--json']);
  out = JSON.parse(r.stdout);
  assert.strictEqual(out.template, true, 'written into the house shot-list template: ' + r.stdout + r.stderr);
  const head = py(['-c', "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([c.value for c in ws[1]][:13]))", out.export]);
  assert.strictEqual(JSON.parse(head.stdout)[12], 'Notes', 'with the template\'s thirteen columns');
  console.log('ok   the shot list uses the house template when the client has none');

  // 5. The timeline is laid out for the year asked.
  const tl = path.join(tmp, 'timeline-2027.xlsx');
  r = py([S('timeline-layout.py'), path.join(house, 'timeline.xlsx'), '--year', '2027', '--out', tl]);
  assert.strictEqual(r.status, 0, r.stderr);
  const jan = py(['-c', "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1])['Jan']; print(json.dumps([ws['A2'].value.year, [ws.cell(6,c).value for c in range(1,8)], ws['A31'].value, ws['C31'].value]))", tl]);
  assert.deepStrictEqual(JSON.parse(jan.stdout), [2027, [null, null, null, null, null, 1, 2], 31, 'Notes:'], '1 January 2027 is a Friday; the 31st is a Sunday on the sixth week');
  console.log('ok   the timeline template is laid out for the project year');

  // 6. The storyboard deck: three panels a slide, a drawn panel in its frame, the boxes filled.
  put('storyboard/v1/panels.md', '| panel | scene | story_order | shoot_order | frame | camera | on_screen_text | notes |\n|---|---|---|---|---|---|---|---|\n' +
    ['P01', 'P02', 'P03', 'P04'].map((p, i) => '| ' + p + ' | 1 | ' + (i + 1) + ' | | TO GENERATE: frame ' + p + ' | WS, static | ' + (i === 0 ? 'SUPER ONE' : '—') + ' | ' + (i === 1 ? 'lower third: Aisha, 8' : '') + ' |\n').join(''));
  py(['-c', "from PIL import Image; Image.new('RGB',(640,360),(200,100,50)).save(r'" + path.join(job, 'storyboard', 'v1', 'P01.png') + "')"]);
  r = py([S('storyboard-pptx.py'), job, '--json']);
  out = JSON.parse(r.stdout);
  assert.deepStrictEqual([out.panels, out.slides, out.drawn], [4, 2, 1], r.stdout + r.stderr);
  const deck = py(['-c', [
    'from pptx import Presentation; import sys, json',
    'p = Presentation(sys.argv[1]); s = p.slides[0]; n = {sh.name: sh for sh in s.shapes}',
    "print(json.dumps([n['P1_SUPERS'].text_frame.text, n['P2_LOWER_3RD'].text_frame.text, n['P1_SHOT_SIZE'].text_frame.text, sum(1 for sh in s.shapes if sh.shape_type == 13), sorted(sh.name for sh in p.slides[1].shapes if sh.name.startswith('P2_'))]))",
  ].join('\n'), out.export]);
  const [supers, l3, size, pics, second] = JSON.parse(deck.stdout);
  assert.strictEqual(supers, 'SUPERS: SUPER ONE');
  assert.strictEqual(l3, 'LOWER 3RD: Aisha, 8');
  assert.strictEqual(size, 'SHOT SIZE: WS, static');
  assert.strictEqual(pics, 1, 'the drawn panel is in its frame');
  assert.deepStrictEqual(second, [], 'the empty places on the last slide are cleared');
  console.log('ok   the storyboard fills the slide template three panels a slide');
  console.log('exports verification passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
