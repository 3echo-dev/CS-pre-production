#!/usr/bin/env python3
"""Export a storyboard version as a deck in the client's storyboard template (three panels a slide).

    python storyboard-pptx.py <job-dir> [--version N] [--client-dir <dir>] [--out <file.pptx>] [--json]

Template: <client-dir>/templates/storyboard.pptx, else the plugin's house template
(templates/house/storyboard.pptx). Its first slide is the pattern: three panel frames named
PANEL_FRAME_1..3, a number badge P{k}_NUMBER and five boxes per panel, P{k}_SHOT_SIZE,
P{k}_SHOT_DESCRIPTION, P{k}_SUPERS, P{k}_LOWER_3RD, P{k}_VO_SFX (house-templates names them; a
client deck with the same labels in the boxes is read by label and position).

What goes where, from storyboard/v{n}/panels.md in story order:
    picture           storyboard/v{n}/P{id}.png (a panel not drawn yet keeps the empty frame)
    number            the panel's place in story order, and its id
    SHOT SIZE         the camera column
    SHOT DESCRIPTION  the frame column, without its TO GENERATE / TO SHOOT / ASSET prefix
    SUPERS            on_screen_text
    LOWER 3RD         a "lower third:" or "L3:" note, else blank
    VO / SFX          the VO and SFX requirements of the panel's scene in audio.md, else blank

Exit 0 wrote · 1 no storyboard or no template · 2 usage
"""
import argparse, copy, glob, json, os, re, sys
from pptx import Presentation
from pptx.util import Pt

ap = argparse.ArgumentParser()
ap.add_argument('job')
ap.add_argument('--version', type=int, default=None)
ap.add_argument('--client-dir', default=None)
ap.add_argument('--out', default=None)
ap.add_argument('--json', action='store_true')
a = ap.parse_args()

HOUSE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates', 'house', 'storyboard.pptx')
client_dir = a.client_dir or os.path.join(os.path.dirname(os.path.dirname(a.job)), 'client')
template = os.path.join(client_dir, 'templates', 'storyboard.pptx')
if not os.path.exists(template):
    template = HOUSE
if not os.path.exists(template):
    print('no storyboard template (client or house)', file=sys.stderr); sys.exit(1)

vs = sorted(int(d[1:]) for d in os.listdir(os.path.join(a.job, 'storyboard')) if re.fullmatch(r'v\d+', d)) if os.path.isdir(os.path.join(a.job, 'storyboard')) else []
n = a.version or (vs[-1] if vs else None)
bdir = os.path.join(a.job, 'storyboard', 'v%d' % n) if n else None
if not bdir or not os.path.exists(os.path.join(bdir, 'panels.md')):
    print('no storyboard on disk (storyboard/v{n}/panels.md)', file=sys.stderr); sys.exit(1)

# The panel table.
panels, head = [], None
for line in open(os.path.join(bdir, 'panels.md'), encoding='utf-8'):
    t = line.strip()
    if not t.startswith('|') or set(t) <= set('|-: '):
        continue
    cells = [c.strip() for c in t.strip('|').split('|')]
    if head is None and cells and cells[0].lower() == 'panel':
        head = [c.lower().split(' ')[0] for c in cells]; continue
    if head and re.fullmatch(r'P\d{2,}', cells[0], re.I):
        panels.append(dict(zip(head, cells + [''] * (len(head) - len(cells)))))
num = lambda v: int(v) if str(v).strip().isdigit() else 10 ** 6
panels.sort(key=lambda p: (num(p.get('story_order')), p['panel']))

# VO and SFX per scene, from audio.md when it exists.
audio = {}
af = os.path.join(a.job, 'audio.md')
if os.path.exists(af):
    scene = None
    for line in open(af, encoding='utf-8'):
        t = line.strip()
        m = re.match(r'#\s*Scene\s+([^:]+)', t, re.I)
        if m: scene = m.group(1).strip(); continue
        if scene and t.startswith('|') and not set(t) <= set('|-: '):
            c = [x.strip() for x in t.strip('|').split('|')]
            if c and c[0].upper() in ('VO', 'SFX') and len(c) > 1 and c[1] and not c[1].lower().startswith('not applicable'):
                audio.setdefault(scene, []).append(c[0].upper() + ': ' + c[1])

def clean(v):
    v = (v or '').strip()
    return '' if v in ('—', '-', '–') else v
def desc(v):
    return re.sub(r'^(TO GENERATE|TO SHOOT|ASSET)\s*:\s*', '', clean(v), flags=re.I)
def lower3(notes):
    m = re.search(r'(?:lower third|lower 3rd|L3)\s*:\s*([^;|]+)', notes or '', re.I)
    return m.group(1).strip() if m else ''

prs = Presentation(template)
pattern = prs.slides[0]
LABELS = {'SHOT_SIZE': 'SHOT SIZE', 'SHOT_DESCRIPTION': 'SHOT DESCRIPTION', 'SUPERS': 'SUPERS', 'LOWER_3RD': 'LOWER 3RD', 'VO_SFX': 'VO / SFX'}

def boxes(slide):
    """Find each panel's frame, badge and five boxes: by name, else by label text and column."""
    found = {}
    named = {sh.name: sh for sh in slide.shapes}
    if 'PANEL_FRAME_1' in named:
        for k in (1, 2, 3):
            found[k] = {'frame': named.get('PANEL_FRAME_%d' % k), 'number': named.get('P%d_NUMBER' % k)}
            for key in LABELS: found[k][key] = named.get('P%d_%s' % (k, key))
        return found
    labelled = [sh for sh in slide.shapes if sh.has_text_frame and sh.text_frame.text.strip() in LABELS.values()]
    cols = sorted({sh.left for sh in labelled})
    frames = sorted([sh for sh in slide.shapes if sh.shape_type == 13], key=lambda s: s.left)
    for k in (1, 2, 3):
        found[k] = {'frame': frames[k - 1] if k - 1 < len(frames) else None, 'number': None}
        for key, lab in LABELS.items():
            found[k][key] = next((sh for sh in labelled if sh.text_frame.text.strip() == lab and cols and min(range(len(cols)), key=lambda i: abs(cols[i] - sh.left)) == k - 1), None)
    return found

def fill(shape, label, value, small=False):
    if shape is None: return
    tf = shape.text_frame
    p = tf.paragraphs[0]
    run0 = p.runs[0] if p.runs else p.add_run()
    run0.text = label + (': ' if value else '')
    run0.font.bold = True
    for extra in p.runs[1:]: extra._r.getparent().remove(extra._r)
    for extra in tf.paragraphs[1:]: extra._p.getparent().remove(extra._p)
    if value:
        r = p.add_run(); r.text = value; r.font.bold = False
        size = run0.font.size or Pt(9)
        if small and len(value) > 160: size = Pt(7)
        r.font.size = size; run0.font.size = size
    tf.word_wrap = True

def new_slide_like(src):
    s = prs.slides.add_slide(src.slide_layout)
    for ph in list(s.placeholders): ph._element.getparent().remove(ph._element)
    for sh in src.shapes:
        s.shapes._spTree.append(copy.deepcopy(sh._element))
    return s

groups = [panels[i:i + 3] for i in range(0, len(panels), 3)] or [[]]
slides = [pattern] + [new_slide_like(pattern) for _ in groups[1:]]
drawn = 0
for slide, group in zip(slides, groups):
    b = boxes(slide)
    for k in (1, 2, 3):
        parts = b[k]
        if k - 1 >= len(group):
            # An empty place on the last slide: clear it rather than leave labels with no panel.
            for key in ['frame', 'number'] + list(LABELS):
                sh = parts.get(key)
                if sh is not None: sh._element.getparent().remove(sh._element)
            continue
        p = group[k - 1]
        order = panels.index(p) + 1
        if parts.get('number') is not None:
            parts['number'].text_frame.paragraphs[0].runs[0].text = str(order) if parts['number'].text_frame.paragraphs[0].runs else str(order)
        img = next((f for f in (os.path.join(bdir, p['panel'] + ext) for ext in ('.png', '.jpg', '.jpeg', '.webp')) if os.path.exists(f)), None)
        fr = parts.get('frame')
        if img and fr is not None:
            from PIL import Image
            w, h = Image.open(img).size
            fw, fh = fr.width, fr.height
            scale = min(fw / w, fh / h)
            pw, ph = int(w * scale), int(h * scale)
            pic = slide.shapes.add_picture(img, fr.left + (fw - pw) // 2, fr.top + (fh - ph) // 2, pw, ph)
            # Put the picture where the frame was in the stacking order, so the number badge stays on top.
            fr._element.addprevious(pic._element)
            fr._element.getparent().remove(fr._element)
            drawn += 1
        elif fr is not None and fr.has_text_frame:
            fr.text_frame.text = p['panel'] + ' · not drawn yet'
            from pptx.dml.color import RGBColor
            for r in fr.text_frame.paragraphs[0].runs: r.font.color.rgb = RGBColor(0x59, 0x59, 0x59); r.font.size = Pt(11)
        fill(parts.get('SHOT_SIZE'), 'SHOT SIZE', clean(p.get('camera')))
        fill(parts.get('SHOT_DESCRIPTION'), 'SHOT DESCRIPTION', p['panel'] + ' · ' + desc(p.get('frame')), small=True)
        fill(parts.get('SUPERS'), 'SUPERS', clean(p.get('on_screen_text')))
        fill(parts.get('LOWER_3RD'), 'LOWER 3RD', lower3(p.get('notes')))
        fill(parts.get('VO_SFX'), 'VO / SFX', ' · '.join(audio.get(str(p.get('scene', '')).strip(), [])))

out = a.out or os.path.join(a.job, 'exports', 'storyboard-v%d.pptx' % n)
os.makedirs(os.path.dirname(out), exist_ok=True)
prs.save(out)
res = {'item': 'storyboard', 'version': n, 'export': out.replace(os.sep, '/'), 'template': template != HOUSE, 'panels': len(panels), 'drawn': drawn, 'slides': len(slides)}
if a.json: print(json.dumps(res))
else: print('Exported storyboard v%d: %d panels on %d slides (%d drawn) in the %s template -> %s' % (n, len(panels), len(slides), drawn, 'client' if res['template'] else 'house', res['export']))
