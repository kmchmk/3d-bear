"""Classical (non-generative) segmentation of Bear from each reference photo.

GrabCut graph-cut segmentation, seeded by colour: coat-coloured pixels (orange/cream,
not green or grey) start as probable foreground; a border band is definite background.
Writes fit/data/<id>_mask.png (white = Bear) and a preview overlay for checking.
"""
import sys, os, cv2, numpy as np

OUT = 'fit/data'
H = 640                      # working height in pixels

def segment(path):
    img = cv2.imread(path) if isinstance(path, str) else path
    img = cv2.resize(img, (int(img.shape[1] * H / img.shape[0]), H), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = [hsv[..., i].astype(np.float32) for i in range(3)]
    # Coat: warm hue (OpenCV hue 0..180; orange ~5..25) with some saturation, or cream.
    warm = ((h >= 3) & (h <= 24) & (s > 60) & (v > 70))
    cream = ((h >= 8) & (h <= 28) & (s > 25) & (s <= 90) & (v > 150))
    mask = np.full(img.shape[:2], cv2.GC_PR_BGD, np.uint8)
    mask[warm | cream] = cv2.GC_PR_FGD
    b = 12
    mask[:b, :] = mask[-b:, :] = cv2.GC_BGD
    mask[:, :b] = mask[:, -b:] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # Keep the largest connected blob and fill holes.
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    if n > 1:
        k = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        fg = np.where(lab == k, 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    fg = np.zeros_like(fg); cv2.drawContours(fg, cnts, -1, 255, -1)
    return img, fg

def main(SRC):
  os.makedirs(OUT, exist_ok=True)
  for f in sorted(os.listdir(SRC)):
      if not f.endswith('.jpg'): continue
      key = f[:-4]
      img, fg = segment(os.path.join(SRC, f))
      cv2.imwrite(f'{OUT}/{key}_img.jpg', img)
      cv2.imwrite(f'{OUT}/{key}_mask.png', fg)
      over = img.copy(); over[fg == 0] = (over[fg == 0] * 0.3).astype(np.uint8)
      cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
      cv2.drawContours(over, cnts, -1, (0, 255, 0), 2)
      cv2.imwrite(f'{OUT}/{key}_check.jpg', over)
      print(key, img.shape, int((fg > 0).mean() * 100), '% fg')

if __name__ == '__main__':
    main(sys.argv[1])
