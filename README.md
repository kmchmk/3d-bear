# Bear · 3D puppy

An interactive, stylized-realistic 3D model of Bear, a fluffy red Pomsky-type puppy,
built with Three.js and Vite. Drag to orbit, scroll/pinch to zoom, tap Bear to pet him.

## Run and deploy

```sh
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
npm run preview   # serve the build
```

Vercel: `vercel.json` selects the Vite framework, `npm run build`, output `dist`.
There are no server functions, environment variables or binary assets.

## How it works

- `src/sdf.js`: signed-distance primitives (ellipsoids, round cones, smooth
  union) and a surface-nets mesher. Bear is sculpted as SDFs and meshed in the
  browser at load time (~1 s), so there's no model file to ship.
- `src/bear.js`: the anatomy (sitting pose), plus per-vertex **markings**, **fur
  length** and **groom direction**, painted by position to match Bear's photos:
  red coat, cream bib and cheeks, white socks, cocoa muzzle mask, blue-grey eyes,
  ginger ears with cream insides, bushy tail, pink collar with a blue tag.
  Head, ears and tail are separate pivots for animation.
- `src/fur.js`: shell fur. Each skin mesh is redrawn as an `InstancedMesh`, with each
  shell pushed along the normal and combed. Procedural strands, clumping and
  alpha-to-coverage make the coat soft.
- `src/main.js`: lighting, camera views, idle behaviour (breathing, blinking, ear
  twitches, curious head tilts, looking at the pointer, panting, tail wag) and petting.

Mobile gets fewer fur shells and a coarser mesh; resolution also steps down
automatically if frames are slow.

Debug URL params: `?view=face|full|side`, `?still` (freeze motion), `?nofur`
(bare sculpt), `?q=0..1` (quality).

## Fitting the shape to photos (no AI in the loop)

The anatomy numbers in `src/shape.json` and the coat colours in `src/palette.json` are
fitted to Bear's photos by measurement, not by eye:

1. `fit/segment.py <photos>`: GrabCut graph-cut segmentation separates Bear from the
   background (seeded by coat-coloured pixels) → silhouette masks.
2. `fit/landmarks.py`: pixel rules find ear tips (highest silhouette points), eyes (the
   only low-saturation grey-blue pixels in the head) and the nose (darkest blob below the
   eyes). Where rules are unreliable (tongue and tag in 3/4 views), `fit/manual.json`
   holds one-time manual pixel coordinates.
3. `fit/fit.mjs`: renders the model's silhouette by ray-marching its distance field
   (`silhouetteSDF` in `src/bear.js`) from a virtual camera. It measures photo and render
   with the same function: row-by-row left/right extents and filled width, plus
   landmarks, all normalised by silhouette height. A pattern search then minimises the
   difference over the shape parameters and each photo's camera and head pose. Output:
   `src/shape.json` and `fit/data/report.json`.
4. `fit/colors.py <view> <render.png>`: samples landmark-relative regions (forehead,
   mask, cheeks, chest, legs, paws) in the photo and in a browser render from the fitted
   camera (`?fit=dist,elev,yaw,headYaw,headPitch,headRoll&still&clean`), and corrects
   each palette entry by the photo/render ratio in linear light.

```sh
python3 fit/segment.py /path/to/photos && python3 fit/landmarks.py
VIEWS=094,040,018,107 node fit/fit.mjs 25
python3 fit/plot.py profiles.png     # target vs render profiles
```

Photos and everything derived from them (`fit/data/`) stay local and are git-ignored.

## Reference photos

The album is used only as a modelling reference. No photos are bundled or loaded
by the site, and image and video files are git-ignored.
