#!/usr/bin/env python
"""Word documents into Markdown the directors can read.

    python docx-text.py <file-or-folder> [...]

Clients hand over briefs, decks and scripts as .docx. The Read tool cannot open one, so the
intake would index the file name and never its contents. This writes `<name>.md` beside every
.docx it is given (folders are walked), keeping paragraph order, headings, table rows and list
items, and reports what it wrote. Standard library only; no python-docx. Exit 0 wrote, 1 a file
failed, 2 usage, 3 nothing to do.
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'


def para_text(p):
    out = []
    for node in p.iter():
        if node.tag == W + 't':
            out.append(node.text or '')
        elif node.tag == W + 'tab':
            out.append('\t')
        elif node.tag in (W + 'br', W + 'cr'):
            out.append('\n')
    return ''.join(out)


def para_style(p):
    ppr = p.find('w:pPr', NS)
    if ppr is None:
        return None, False
    st = ppr.find('w:pStyle', NS)
    style = st.get(W + 'val') if st is not None else None
    is_list = ppr.find('w:numPr', NS) is not None
    return style, is_list


def heading_level(style):
    if not style:
        return 0
    m = re.match(r'(?i)heading\s*(\d)', style) or re.match(r'(?i)heading(\d)', style)
    if m:
        return int(m.group(1))
    if style.lower() in ('title',):
        return 1
    if style.lower() in ('subtitle',):
        return 2
    return 0


def convert(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find('w:body', NS)
    lines = []
    for el in body:
        if el.tag == W + 'p':
            text = para_text(el).strip()
            if not text:
                if lines and lines[-1] != '':
                    lines.append('')
                continue
            style, is_list = para_style(el)
            lvl = heading_level(style)
            if lvl:
                lines.append('#' * min(lvl, 6) + ' ' + text)
            elif is_list:
                lines.append('- ' + text)
            else:
                lines.append(text)
        elif el.tag == W + 'tbl':
            rows = []
            for tr in el.findall('w:tr', NS):
                cells = []
                for tc in tr.findall('w:tc', NS):
                    cells.append(' '.join(para_text(p).strip() for p in tc.findall('w:p', NS)).replace('|', '/').strip())
                rows.append(cells)
            if rows:
                width = max(len(r) for r in rows)
                rows = [r + [''] * (width - len(r)) for r in rows]
                lines.append('| ' + ' | '.join(rows[0]) + ' |')
                lines.append('|' + '---|' * width)
                for r in rows[1:]:
                    lines.append('| ' + ' | '.join(r) + ' |')
                lines.append('')
    media = [n for n in z.namelist() if n.startswith('word/media/')]
    head = '<!-- converted from ' + os.path.basename(path) + ' by docx-text.py; ' + str(len(media)) + ' embedded image(s) not extracted -->\n\n'
    text = head + re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip() + '\n'
    out = os.path.splitext(path)[0] + '.md'
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text)
    return out, len(text.split())


def main(argv):
    if not argv:
        print(__doc__.strip().split('\n')[2].strip())
        return 2
    targets = []
    for a in argv:
        if os.path.isdir(a):
            for d, _, files in os.walk(a):
                targets += [os.path.join(d, f) for f in files if f.lower().endswith('.docx') and not f.startswith('~$')]
        elif a.lower().endswith('.docx') and os.path.isfile(a):
            targets.append(a)
    if not targets:
        print('No .docx found.')
        return 3
    failed = 0
    for t in targets:
        try:
            out, words = convert(t)
            print('wrote ' + out.replace(os.sep, '/') + ' (' + str(words) + ' words)')
        except Exception as e:  # a bad file must not stop the rest
            failed += 1
            print('failed ' + t + ': ' + str(e))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
