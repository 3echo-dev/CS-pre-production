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

When <client-dir>/templates/<name>.xlsx exists and the source is a CSV, the export is that
template with the rows written under its header row, so the client gets their own sheet with
their styles. Otherwise a plain workbook with the columns as they are. Unknown stays the word
unknown; nothing is ever written as zero. Exit 0 wrote · 1 no source · 2 usage.
"""
import argparse, csv, json, os, shutil, sys
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument('job')
ap.add_argument('--item', required=True, choices=['shot_list', 'budget_sheet', 'timeline', 'concept_breakdown'])
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
name, candidates = SOURCES[a.item]
src = next((os.path.join(a.job, c) for c in candidates if os.path.exists(os.path.join(a.job, c))), None)
if not src:
    print('no source on disk for ' + a.item + ' (' + ', '.join(candidates) + ')', file=sys.stderr)
    sys.exit(1)
client_dir = a.client_dir or os.path.join(os.path.dirname(os.path.dirname(a.job)), 'client')
template = os.path.join(client_dir, 'templates', name + '.xlsx')
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
