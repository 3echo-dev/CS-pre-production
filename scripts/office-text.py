#!/usr/bin/env python
"""Office documents into Markdown the directors can read.

    python office-text.py <file-or-folder> [...]

Clients hand over briefs, decks, scripts and sheets as .docx, .pptx and .xlsx. The Read tool
opens text, PDF and images, not Office zips, so without this the intake would index a file name
and never its contents. For every Office file given (folders are walked) this writes `<name>.md`
beside it and reports what it wrote. Standard library only.

  .docx  paragraphs in order, headings, list items, tables
  .pptx  one section per slide in deck order: title, body text, tables, speaker notes
  .xlsx  one table per sheet, shared strings resolved, formulas shown by their cached value

Embedded images are counted, not extracted. Exit 0 wrote, 1 a file failed, 2 usage, 3 nothing to do.
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PR = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def md_table(rows):
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [[c.replace('|', '/').replace('\n', ' ').strip() for c in r] + [''] * (width - len(r)) for r in rows]
    out = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * width]
    out += ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
    out.append('')
    return out


# ---------------------------------------------------------------- docx
def w_para_text(p):
    out = []
    for node in p.iter():
        if node.tag == W + 't':
            out.append(node.text or '')
        elif node.tag == W + 'tab':
            out.append('\t')
        elif node.tag in (W + 'br', W + 'cr'):
            out.append('\n')
    return ''.join(out)


def w_heading(p):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        return 0, False
    st = ppr.find(W + 'pStyle')
    style = (st.get(W + 'val') if st is not None else '') or ''
    is_list = ppr.find(W + 'numPr') is not None
    m = re.match(r'(?i)heading\s*(\d)', style)
    if m:
        return int(m.group(1)), is_list
    if style.lower() == 'title':
        return 1, is_list
    if style.lower() == 'subtitle':
        return 2, is_list
    return 0, is_list


def convert_docx(z):
    body = ET.fromstring(z.read('word/document.xml')).find(W + 'body')
    lines = []
    for el in body:
        if el.tag == W + 'p':
            text = w_para_text(el).strip()
            if not text:
                if lines and lines[-1] != '':
                    lines.append('')
                continue
            lvl, is_list = w_heading(el)
            lines.append(('#' * min(lvl, 6) + ' ' + text) if lvl else ('- ' + text if is_list else text))
        elif el.tag == W + 'tbl':
            rows = [[' '.join(w_para_text(p).strip() for p in tc.findall(W + 'p')) for tc in tr.findall(W + 'tc')] for tr in el.findall(W + 'tr')]
            lines += md_table(rows)
    return lines


# ---------------------------------------------------------------- pptx
def a_texts(el):
    """Paragraph strings under a drawingml text body, in order."""
    paras = []
    for p in el.iter(A + 'p'):
        t = ''.join((r.text or '') for r in p.iter(A + 't'))
        if t.strip():
            paras.append(t.strip())
    return paras


def convert_pptx(z):
    names = z.namelist()
    # Deck order comes from presentation.xml's sldIdLst through the relationships file.
    pres = ET.fromstring(z.read('ppt/presentation.xml'))
    rels = ET.fromstring(z.read('ppt/_rels/presentation.xml.rels'))
    target = {rel.get('Id'): rel.get('Target') for rel in rels.iter(PR + 'Relationship')}
    order = []
    for sid in pres.iter(P + 'sldId'):
        t = target.get(sid.get(R + 'id'))
        if t:
            order.append('ppt/' + t.lstrip('/').replace('ppt/', '', 1) if not t.startswith('/') else t.lstrip('/'))
    if not order:
        order = sorted(n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n))
    lines = []
    for i, slide in enumerate(order, 1):
        if slide not in names:
            continue
        root = ET.fromstring(z.read(slide))
        lines.append('## Slide ' + str(i))
        for sp in root.iter(P + 'sp'):
            ph = sp.find('.//' + P + 'ph')
            kind = (ph.get('type') if ph is not None else '') or ''
            paras = a_texts(sp)
            if not paras:
                continue
            if kind in ('title', 'ctrTitle'):
                lines.append('### ' + ' '.join(paras))
            else:
                lines += ['- ' + p for p in paras]
        for tbl in root.iter(A + 'tbl'):
            rows = [[' '.join(a_texts(tc)) for tc in tr.findall(A + 'tc')] for tr in tbl.findall(A + 'tr')]
            lines += md_table(rows)
        notes = slide.replace('slides/slide', 'notesSlides/notesSlide')
        if notes in names:
            nparas = [p for p in a_texts(ET.fromstring(z.read(notes))) if not re.fullmatch(r'\d+', p)]
            if nparas:
                lines.append('Notes: ' + ' '.join(nparas))
        lines.append('')
    return lines


# ---------------------------------------------------------------- xlsx
def col_index(ref):
    m = re.match(r'([A-Z]+)', ref or '')
    n = 0
    for ch in (m.group(1) if m else ''):
        n = n * 26 + (ord(ch) - 64)
    return max(n - 1, 0)


def convert_xlsx(z):
    names = z.namelist()
    shared = []
    if 'xl/sharedStrings.xml' in names:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(S + 'si'):
            shared.append(''.join((t.text or '') for t in si.iter(S + 't')))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = {rel.get('Id'): rel.get('Target') for rel in rels.iter(PR + 'Relationship')}
    lines = []
    for sh in wb.iter(S + 'sheet'):
        t = target.get(sh.get(R + 'id'), '')
        path = t.lstrip('/') if t.startswith('/') else 'xl/' + t
        if path not in names:
            continue
        root = ET.fromstring(z.read(path))
        rows = []
        for row in root.iter(S + 'row'):
            cells = []
            for c in row.findall(S + 'c'):
                idx = col_index(c.get('r'))
                v = c.find(S + 'v')
                val = ''
                if c.get('t') == 's' and v is not None and v.text is not None:
                    val = shared[int(v.text)] if int(v.text) < len(shared) else ''
                elif c.get('t') == 'inlineStr':
                    val = ''.join((x.text or '') for x in c.iter(S + 't'))
                elif v is not None:
                    val = v.text or ''
                while len(cells) < idx:
                    cells.append('')
                cells.append(val)
            if any(x.strip() for x in cells):
                rows.append(cells)
        lines.append('## Sheet: ' + (sh.get('name') or path))
        lines += md_table(rows) if rows else ['(empty)', '']
    return lines


# ---------------------------------------------------------------- driver
KINDS = {'.docx': convert_docx, '.pptx': convert_pptx, '.xlsx': convert_xlsx}


def convert(path):
    ext = os.path.splitext(path)[1].lower()
    z = zipfile.ZipFile(path)
    lines = KINDS[ext](z)
    media = [n for n in z.namelist() if '/media/' in n]
    head = '<!-- converted from ' + os.path.basename(path) + ' by office-text.py; ' + str(len(media)) + ' embedded image(s) not extracted -->\n\n'
    text = head + re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip() + '\n'
    out = os.path.splitext(path)[0] + '.md'
    with open(out, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(text)
    return out, len(text.split())


def main(argv):
    if not argv:
        print('usage: office-text.py <file-or-folder> [...]   (.docx .pptx .xlsx)')
        return 2
    targets = []
    for a in argv:
        if os.path.isdir(a):
            for d, _, files in os.walk(a):
                targets += [os.path.join(d, f) for f in files if os.path.splitext(f)[1].lower() in KINDS and not f.startswith('~$')]
        elif os.path.isfile(a) and os.path.splitext(a)[1].lower() in KINDS:
            targets.append(a)
    if not targets:
        print('No .docx, .pptx or .xlsx found.')
        return 3
    failed = 0
    for t in sorted(targets):
        try:
            out, words = convert(t)
            print('wrote ' + out.replace(os.sep, '/') + ' (' + str(words) + ' words)')
        except Exception as e:  # a bad file must not stop the rest
            failed += 1
            print('failed ' + t + ': ' + str(e))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
