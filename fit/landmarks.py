"""Pixel-rule landmark detection on each segmented photo (no learned models).

- ear tips: highest mask point in the left and right half of the head
- eyes: blue/grey-blue pixel clusters inside the upper part of the silhouette
  (Bear's eyes are the only blue on a ginger dog; the blue tag hangs lower)
- nose: darkest compact blob below the eyes
Writes fit/data/landmarks.json with pixel coordinates (image height = 640).
"""
import os, json, cv2, numpy as np

D = 'fit/data'
out = {}
for f in sorted(os.listdir(D)):
    if not f.endswith('_mask.png'): continue
    key = f[:-9]
    img = cv2.imread(f'{D}/{key}_img.jpg')
    m = cv2.imread(f'{D}/{key}_mask.png', 0) > 0
    ys, xs = np.nonzero(m)
    top, bot = ys.min(), ys.max()
    hgt = bot - top
    # Head band: top 40% of the silhouette.
    head = m.copy(); head[int(top + 0.40 * hgt):] = False
    hx = np.nonzero(head)[1]
    cx = int(np.median(hx))
    # Ear tips.
    ears = []
    for side in (slice(0, cx), slice(cx, m.shape[1])):
        sub = head[:, side]
        yy, xx = np.nonzero(sub)
        i = np.argmin(yy)
        ears.append([int(xx[i] + (side.start or 0)), int(yy[i])])
    # Eyes: blue-ish, below the ear tips, inside the head.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.int32)
    b, g, r = [img[..., i].astype(np.int32) for i in range(3)]
    # Eyes are the only low-saturation, not-bright, bluish-grey pixels inside the head:
    # fur is strongly orange (b - r ~ -100), cream is bright, the nose is saturated.
    sat, val = hsv[..., 1], hsv[..., 2]
    inner = cv2.erode(head.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    blue = (b - r > -40) & (sat < 100) & (val > 60) & (val < 215) & inner
    blue[: int(top + 0.12 * hgt)] = False
    blue = cv2.morphologyEx(blue.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(blue)
    blobs = sorted([(st[i, cv2.CC_STAT_AREA], cen[i]) for i in range(1, n)], key=lambda t: -t[0])[:2]
    eyes = sorted([[float(c[0]), float(c[1])] for _, c in blobs])
    # Nose: darkest blob in the head band below the eyes.
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (7, 7), 0).astype(np.float32)
    ey = np.mean([e[1] for e in eyes]) if eyes else top + 0.2 * hgt
    region = head.copy(); region[: int(ey + 4)] = False
    region = cv2.erode(region.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    g2 = np.where(region, gray, 1e9)
    thr = np.percentile(gray[region], 3)
    dark = (g2 <= thr).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark)
    k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    nose = [float(cen[k][0]), float(cen[k][1])]
    out[key] = {'size': [m.shape[1], m.shape[0]], 'earL': ears[0], 'earR': ears[1], 'eyes': eyes, 'nose': nose, 'top': int(top), 'bottom': int(bot)}
    vis = img.copy()
    for p in ears + eyes + [nose]:
        cv2.circle(vis, (int(p[0]), int(p[1])), 5, (0, 255, 0), 2)
    cv2.imwrite(f'{D}/{key}_lm.jpg', vis)
    print(key, out[key])
json.dump(out, open(f'{D}/landmarks.json', 'w'), indent=1)
