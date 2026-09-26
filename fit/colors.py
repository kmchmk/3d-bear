"""Coat colours from pixel statistics (no AI).

For one fitted view, sample landmark-relative regions in the photo and in a browser
render from the fitted camera, both in the same normalised coordinates (silhouette
height + nose anchor). Each palette entry is then scaled, in linear light, by
photo/render so the rendered coat matches the photo under the site's own lighting.

  python3 fit/colors.py <view> <render.png>   → updates src/palette.json
"""
import sys, json, cv2, numpy as np

view, render_path = sys.argv[1], sys.argv[2]
prof = json.load(open('fit/data/profiles.json'))[view]
pal_path = 'src/palette.json'
pal = json.load(open(pal_path))

def srgb_to_lin(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_hex(l):
    c = np.where(l <= 0.0031308, l * 12.92, 1.055 * np.power(np.clip(l, 0, 1), 1 / 2.4) - 0.055)
    return '#' + ''.join(f'{int(round(v * 255)):02x}' for v in np.clip(c, 0, 1))
def hex_to_lin(h): return srgb_to_lin(np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float))

# Regions in normalised coords, from the TARGET landmarks: (u, v) = ((x - nose_x)/H, (y - top)/H)
lm = prof['target']['lm']
eyes = [e for e in lm['eyes'] if e]
E = np.mean(eyes, axis=0); N = np.array(lm['nose'])
e = abs(eyes[0][0] - eyes[1][0]) if len(eyes) == 2 else 0.06
regions = {                      # palette key: list of sample points
    'ginger': [E + [0, -0.9 * e], E + [-1.1 * e, -1.4 * e], E + [1.1 * e, -1.4 * e]],
    'mask': [(E + N) / 2],
    'cream': [E + [-1.1 * e, 0.9 * e], E + [1.1 * e, 0.9 * e]],
    'bib': [np.array([0, 0.5])],
    'leg': [np.array([-0.09, 0.8]), np.array([0.09, 0.8])],
    'white': [np.array([-0.1, 0.965]), np.array([0.1, 0.965])],
}

def sample(img, anchor, pts, rad):
    top, H, ax = anchor['top'], anchor['H'], anchor['ax']
    out = []
    for u, v in pts:
        x, y = int(round(ax + u * H)), int(round(top + v * H))
        r = max(2, int(rad * H))
        patch = img[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].reshape(-1, 3)[:, ::-1].astype(float)
        out.append(np.median(patch, axis=0))
    return srgb_to_lin(np.mean(out, axis=0))

photo = cv2.imread(f'fit/data/{view}_img.jpg')
pa = dict(prof['target']['anchor']); s = photo.shape[0] / pa['h']
pa = {k: pa[k] * s for k in ('top', 'H', 'ax')}
rend = cv2.imread(render_path)
ra = dict(prof['render']['anchor']); s = rend.shape[0] / ra['h']
ra = {k: ra[k] * s for k in ('top', 'H', 'ax')}

vis_p, vis_r = photo.copy(), rend.copy()
report = {}
for key, pts in regions.items():
    cp = sample(photo, pa, pts, 0.012); cr = sample(rend, ra, pts, 0.012)
    ratio = np.clip(cp / np.maximum(cr, 1e-4), 0.5, 2.0)
    targets = {'ginger': ['ginger', 'gingerDeep', 'gingerLight'], 'mask': ['mask', 'maskDark'], 'cream': ['cream'], 'bib': ['cream'], 'leg': ['gingerLight'], 'white': ['white']}[key]
    report[key] = {'photo': lin_to_hex(cp), 'render': lin_to_hex(cr), 'ratio': [round(float(v), 3) for v in ratio]}
    for t in targets:
        # Several regions may feed one entry (cream: cheeks + bib); take the geometric mean.
        report.setdefault('_apply', {}).setdefault(t, []).append(ratio)
    for img, a in ((vis_p, pa), (vis_r, ra)):
        for u, v in pts:
            cv2.circle(img, (int(a['ax'] + u * a['H']), int(a['top'] + v * a['H'])), max(3, int(0.012 * a['H'])), (0, 255, 0), 1)
for t, rs in report.pop('_apply').items():
    ratio = np.exp(np.mean(np.log(rs), axis=0))
    pal[t] = lin_to_hex(np.clip(hex_to_lin(pal[t]) * ratio, 0, 1))
json.dump(pal, open(pal_path, 'w'), indent=1)
h = 480
cv2.imwrite('fit/data/colors_check.jpg', np.hstack([cv2.resize(vis_p, (int(vis_p.shape[1] * h / vis_p.shape[0]), h)), cv2.resize(vis_r, (int(vis_r.shape[1] * h / vis_r.shape[0]), h))]))
print(json.dumps(report, indent=1))
