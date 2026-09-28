#!/usr/bin/env python3
"""Export one sheet item as the client's Excel, and print the grid the board shows.

    python sheet-export.py <job-dir> --item shot_list|budget_sheet|timeline|concept_breakdown
                           [--client-dir <dir>] [--out <file.xlsx>] [--json]

Sources, per item:
    shot_list          <job>/shot-list.csv       client columns after the five pipeline columns
    budget_sheet       <job>/budget.xlsx         already the client's template, copied as is
                       <job>/budget.csv          fallback: a plain workbook
    timeline           <job>/timeline.xlsx | timeline.csv
    concept_breakdown  <job>/breakdown.xlsx | breakdown.csv
    call_sheet         <job>/call-sheets/day-{d}.xlsx, each day its own export (already in the client layout)
    talents|props|locations  <job>/registers/<item>.json, the rows people entered on the board
    audio              <job>/audio.md, one row per scene requirement (VO, BGM, SFX)

A client template wins; without one, the plugin's generic house template (templates/house/) is
used where there is one (shot list). Registers and audio have no template: they are written as a
clean sheet in the house style (the header row styled like the shot-list template's header).

When <client-dir>/templates/<name>.xlsx exists and the source is a CSV, the export is that
template with the rows written under its header row, so the client gets their own sheet with
their styles. Otherwise a plain workbook with the columns as they are. Unknown stays the word
unknown; nothing is ever written as zero. Exit 0 wrote · 1 no source · 2 usage.
"""
import argparse, csv, json, os, shutil, sys
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument('job')
ap.add_argument('--item', required=True, choices=['shot_list', 'budget_sheet', 'timeline', 'concept_breakdown', 'call_sheet', 'talents', 'props', 'locations', 'audio'])
ap.add_argument('--client-dir', default=None)
ap.add_argument('--out', default=None)
ap.add_argument('--json', action='store_true')
a = ap.parse_args()

SOURCES = {
    'shot_list': ('shot-list', ['shot-list.xlsx', 'shot-list.csv']),
    'budget_sheet': ('budget', ['budget.xlsx', 'budget.csv']),
    'timeline': ('timeline', ['timeline.xlsx', 'timeline.csv']),
    'concept_breakdown': ('breakdown', ['breakdown.xlsx', 'breakdown.csv']),
}
PIPELINE_COLS = {'shot_id', 'label', 'scene', 'panel', 'est_duration_s'}
HOUSE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates', 'house')
client_dir = a.client_dir or os.path.join(os.path.dirname(os.path.dirname(a.job)), 'client')

def house_style_from():
    for d in (os.path.join(client_dir, 'templates'), HOUSE):
        f = os.path.join(d, 'shot-list.xlsx')
        if os.path.exists(f):
            return openpyxl.load_workbook(f).active.cell(1, 1)
    return None

def clean_sheet(title, columns, rows, out):
    # A tidy workbook in the house style: the header styled like the shot-list template's, the
    # header row frozen, columns sized to their content. Blank stays the word unknown.
    from copy import copy
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = title[:31]
    ws.append(columns)
    optional = {i for i, c in enumerate(columns) if c.strip().lower() in ('notes', 'note', 'source')}
    for r in rows:
        ws.append([v if str(v).strip() != '' or i in optional else 'unknown' for i, v in enumerate(r)])
    ref = house_style_from()
    for c in ws[1]:
        if ref is not None:
            f = copy(ref.font); f.b = True
            c.font = f; c.fill = copy(ref.fill); c.border = copy(ref.border); c.alignment = copy(ref.alignment)
        else:
            c.font = openpyxl.styles.Font(bold=True)
    for i, col in enumerate(columns, start=1):
        width = max([len(str(col))] + [len(str(r[i - 1])) for r in rows if i - 1 < len(r)] + [8])
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = min(width + 2, 60)
    ws.freeze_panes = 'A2'
    wb.save(out)

def emit(result):
    if a.json:
        print(json.dumps(result))
    else:
        print('Exported ' + a.item + ': ' + str(result['rowCount']) + ' rows' + (' in the client template' if result['template'] else ' in the house style') + ' -> ' + result['export'])
    sys.exit(0)

REG_FIELDS = {'talents': ['name', 'picture', 'age', 'availability', 'cost', 'loading'], 'props': ['name', 'scene', 'source', 'have'], 'locations': ['name', 'address', 'availability', 'contact']}
if a.item in REG_FIELDS:
    src = os.path.join(a.job, 'registers', a.item + '.json')
    if not os.path.exists(src):
        print('no source on disk for ' + a.item + ' (registers/' + a.item + '.json: nothing landed from the board yet)', file=sys.stderr); sys.exit(1)
    reg = json.load(open(src, encoding='utf-8'))
    fields = reg.get('fields') or REG_FIELDS[a.item]
    columns = [f.replace('_', ' ').capitalize() for f in fields] + ['Notes']
    rows = [[str(r.get(f, '') if r.get(f) is not None else '') for f in fields] + [str(r.get('notes') or '')] for r in reg.get('rows', []) if any(str(r.get(f) or '').strip() for f in fields)]
    if reg.get('na'):
        rows = [['not applicable (decided by ' + str(reg.get('naBy') or 'a person') + ')'] + [''] * (len(columns) - 1)]
    out = a.out or os.path.join(a.job, 'exports', a.item + '.xlsx')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    clean_sheet(a.item.capitalize(), columns, rows, out)
    emit({'item': a.item, 'source': src.replace(os.sep, '/'), 'export': out.replace(os.sep, '/'), 'template': False, 'columns': columns, 'rows': rows[:400], 'rowCount': len(rows)})

if a.item == 'audio':
    src = os.path.join(a.job, 'audio.md')
    if not os.path.exists(src):
        print('no source on disk for audio (audio.md)', file=sys.stderr); sys.exit(1)
    columns, rows, scene = ['Scene', 'Type', 'Requirement', 'Source', 'Note'], [], ''
    for line in open(src, encoding='utf-8'):
        t = line.strip()
        if t.startswith('# ') and not t.lower().startswith('# questions'):
            scene = t[2:].strip()
        elif t.startswith('|') and not set(t) <= set('|-: '):
            cells = [c.strip() for c in t.strip('|').split('|')]
            if cells and cells[0].lower() in ('row', 'type'):
                continue
            if scene and len(cells) >= 2:
                rows.append([scene] + (cells + [''] * 4)[:4])
    out = a.out or os.path.join(a.job, 'exports', 'audio.xlsx')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    clean_sheet('Audio', columns, rows, out)
    emit({'item': 'audio', 'source': src.replace(os.sep, '/'), 'export': out.replace(os.sep, '/'), 'template': False, 'columns': columns, 'rows': rows[:400], 'rowCount': len(rows)})

if a.item == 'call_sheet':
    import glob, re
    days = sorted(glob.glob(os.path.join(a.job, 'call-sheets', 'day-*.xlsx')), key=lambda f: int(re.search(r'day-(\d+)', f).group(1)))
    if not days:
        print('no source on disk for call_sheet (call-sheets/day-{d}.xlsx)', file=sys.stderr); sys.exit(1)
    exp = os.path.join(a.job, 'exports'); os.makedirs(exp, exist_ok=True)
    outs = []
    for f in days:
        d = int(re.search(r'day-(\d+)', f).group(1))
        o = os.path.join(exp, 'call-sheet-day-%d.xlsx' % d)
        shutil.copyfile(f, o)
        ws = openpyxl.load_workbook(o).active
        grid = [['' if c.value is None else str(c.value) for c in r] for r in ws.iter_rows(max_row=min(ws.max_row, 200))]
        grid = [r for r in grid if any(v.strip() for v in r)]
        outs.append({'day': d, 'export': o.replace(os.sep, '/'), 'rows': grid[:200]})
    first = outs[0]
    width = max(len(r) for r in first['rows']) if first['rows'] else 0
    emit({'item': 'call_sheet', 'source': ', '.join(os.path.relpath(f, a.job).replace(os.sep, '/') for f in days), 'export': first['export'], 'exports': [o['export'] for o in outs], 'days': outs,
          'template': True, 'columns': ['' for _ in range(width)], 'rows': first['rows'], 'rowCount': sum(len(o['rows']) for o in outs)})

name, candidates = SOURCES[a.item]
src = next((os.path.join(a.job, c) for c in candidates if os.path.exists(os.path.join(a.job, c))), None)
if not src:
    print('no source on disk for ' + a.item + ' (' + ', '.join(candidates) + ')', file=sys.stderr)
    sys.exit(1)
template = os.path.join(client_dir, 'templates', name + '.xlsx')
if not os.path.exists(template) and os.path.exists(os.path.join(HOUSE, name + '.xlsx')):
    template = os.path.join(HOUSE, name + '.xlsx')
out = a.out or os.path.join(a.job, 'exports', name + '.xlsx')
os.makedirs(os.path.dirname(out), exist_ok=True)

def read_csv(p):
    with open(p, encoding='utf-8', newline='') as f:
        rows = [r for r in csv.reader(l for l in f if not l.startswith('#'))]
    rows = [r for r in rows if any(c.strip() for c in r)]
    return (rows[0], rows[1:]) if rows else ([], [])

def grid_of_xlsx(p, limit=400):
    ws = openpyxl.load_workbook(p, data_only=False).active
    rows = []
    for r in ws.iter_rows(min_row=1, max_row=min(ws.max_row, limit)):
        vals = ['' if c.value is None else str(c.value) for c in r]
        if any(v.strip() for v in vals):
            rows.append(vals)
    # trim trailing empty columns
    width = max((len(r) - next((i for i, v in enumerate(reversed(r)) if v.strip()), len(r))) for r in rows) if rows else 0
    return [r[:width] for r in rows]

used_template = False
if src.endswith('.xlsx'):
    shutil.copyfile(src, out)
    grid = grid_of_xlsx(out)
    # A client sheet often opens with a title block; the header is the first row with five or more filled cells.
    hi = next((i for i, r in enumerate(grid) if sum(1 for v in r if v.strip()) >= 5), 0)
    columns, rows = (grid[hi], grid[hi + 1:]) if grid else ([], [])
else:
    header, data = read_csv(src)
    keep = [i for i, h in enumerate(header) if h not in PIPELINE_COLS] if a.item == 'shot_list' and any(h in PIPELINE_COLS for h in header) else list(range(len(header)))
    columns = [header[i] for i in keep]
    rows = [[(r[i] if i < len(r) else '') for i in keep] for r in data]
    if os.path.exists(template):
        wb = openpyxl.load_workbook(template)
        ws = wb.active
        # The header row is the first row whose first non-empty cell matches the first column.
        head_row = next((r for r in range(1, min(ws.max_row, 30) + 1) if any(str(ws.cell(r, c).value or '').strip().lower() == columns[0].strip().lower() for c in range(1, ws.max_column + 1))), 1)
        col_of = {}
        for c in range(1, ws.max_column + 1):
            v = str(ws.cell(head_row, c).value or '').strip().lower()
            if v:
                col_of[v] = c
        # Clear the example rows under the header, then write.
        for r in range(head_row + 1, ws.max_row + 1):
            for c in range(1, ws.max_column + 1):
                ws.cell(r, c).value = None
        for i, row in enumerate(rows):
            for j, col in enumerate(columns):
                c = col_of.get(col.strip().lower())
                if c:
                    ws.cell(head_row + 1 + i, c).value = row[j] if row[j] != '' else 'unknown'
        wb.save(out)
        used_template = True
    else:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = name
        ws.append(columns)
        for row in rows:
            ws.append([v if v != '' else 'unknown' for v in row])
        wb.save(out)

result = {'item': a.item, 'source': src.replace(os.sep, '/'), 'export': out.replace(os.sep, '/'), 'template': used_template or src.endswith('.xlsx'),
          'columns': columns, 'rows': rows[:400], 'rowCount': len(rows)}
if a.json:
    print(json.dumps(result))
else:
    print('Exported ' + a.item + ': ' + str(len(rows)) + ' rows, ' + str(len(columns)) + ' columns' + (' in the client template' if result['template'] else ' as a plain workbook') + ' -> ' + result['export'])
