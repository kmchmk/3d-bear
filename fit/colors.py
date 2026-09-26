"""Coat colours from pixel statistics (no AI).

For one fitted view, sample landmark-relative regions in the photo and in a browser
render from the fitted camera, both in the same normalised coordinates (silhouette
height + nose anchor). Each palette entry is then scaled, in linear light, by
photo/render so the rendered coat matches the photo under the site's own lighting.

  python3 fit/colors.py <view> <render.png>   → updates src/palette.json
"""
import sys, json, cv2, numpy as np

view, render_path = sys.argv[1], sys.argv[2]
pal_path = 'src/palette.json'
pal = json.load(open(pal_path))

def srgb_to_lin(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_hex(l):
    c = np.where(l <= 0.0031308, l * 12.92, 1.055 * np.power(np.clip(l, 0, 1), 1 / 2.4) - 0.055)
    return '#' + ''.join(f'{int(round(v * 255)):02x}' for v in np.clip(c, 0, 1))
def hex_to_lin(h): return srgb_to_lin(np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float))

sys.path.insert(0, 'fit')
from segment import segment
from landmarks import detect

# Each image gets its own silhouette and landmarks from the same pixel rules, and
# regions are placed relative to them, so framing differences cannot shift samples.
def frame(img, known=None):
    img, m = segment(img)
    lm = detect(img, m > 0)
    if known:  # exact projected landmarks for a render from the fitted camera
        lm.update(known(img.shape[0]))
    eyes = sorted(lm['eyes'])
    E = np.mean(eyes, axis=0); N = np.array(lm['nose'])
    e = abs(eyes[1][0] - eyes[0][0])         # inter-eye distance in pixels
    H = lm['bottom'] - lm['top']
    mid = np.array([N[0], 0])
    pts = {
        'ginger': [E + [0, -0.7 * e], E + [-0.3 * e, -0.55 * e], E + [0.3 * e, -0.55 * e]],
        'mask': [E + (N - E) * 0.45],
        'cream': [np.array(eyes[0]) + [-0.1 * e, 0.85 * e], np.array(eyes[1]) + [0.1 * e, 0.85 * e]],
        'bib': [mid + [0, lm['top'] + 0.5 * H]],
        'leg': [mid + [-0.085 * H, lm['top'] + 0.8 * H], mid + [0.085 * H, lm['top'] + 0.8 * H]],
        'white': [mid + [-0.095 * H, lm['top'] + 0.965 * H], mid + [0.095 * H, lm['top'] + 0.965 * H]],
    }
    return img, pts, max(2, int(0.012 * H))

def sample(img, pts, r):
    out = []
    for x, y in pts:
        x, y = int(round(x)), int(round(y))
        patch = img[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].reshape(-1, 3)[:, ::-1].astype(float)
        out.append(np.median(patch, axis=0))
    return srgb_to_lin(np.mean(out, axis=0))

photo, ppts, prad = frame(cv2.imread(f'fit/data/{view}_img.jpg'))
prof = json.load(open('fit/data/profiles.json'))[view]['render']
def projected(h):
    a = prof['anchor']; k = h / a['h']
    px = lambda p: [(a['ax'] + p[0] * a['H']) * k, (a['top'] + p[1] * a['H']) * k]
    return {'eyes': [px(e) for e in prof['lm']['eyes']], 'nose': px(prof['lm']['nose'])}
rend, rpts, rrad = frame(cv2.imread(render_path), projected)
vis_p, vis_r = photo.copy(), rend.copy()
report = {}
for key in ppts:
    cp = sample(photo, ppts[key], prad); cr = sample(rend, rpts[key], rrad)
    ratio = np.clip(cp / np.maximum(cr, 1e-4), 0.4, 2.5)
    targets = {'ginger': ['ginger', 'gingerDeep', 'gingerLight'], 'mask': ['mask', 'maskDark'], 'cream': ['cream'], 'bib': ['cream'], 'leg': ['leg'], 'white': ['white']}[key]
    report[key] = {'photo': lin_to_hex(cp), 'render': lin_to_hex(cr), 'ratio': [round(float(v), 3) for v in ratio]}
    for t in targets:
        # Several regions may feed one entry (cream: cheeks + bib); take the geometric mean.
        report.setdefault('_apply', {}).setdefault(t, []).append(ratio)
    for img, pts, r in ((vis_p, ppts[key], prad), (vis_r, rpts[key], rrad)):
        for x, y in pts:
            cv2.circle(img, (int(x), int(y)), r, (0, 255, 0), 1)
for t, rs in report.pop('_apply').items():
    ratio = np.exp(np.mean(np.log(rs), axis=0))
    pal[t] = lin_to_hex(np.clip(hex_to_lin(pal[t]) * ratio, 0, 1))
json.dump(pal, open(pal_path, 'w'), indent=1)
h = 480
cv2.imwrite('fit/data/colors_check.jpg', np.hstack([cv2.resize(vis_p, (int(vis_p.shape[1] * h / vis_p.shape[0]), h)), cv2.resize(vis_r, (int(vis_r.shape[1] * h / vis_r.shape[0]), h))]))
print(json.dumps(report, indent=1))
