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

## Reference photos

The album is used only as a modelling reference. No photos are bundled or loaded
by the site, and image and video files are git-ignored.
