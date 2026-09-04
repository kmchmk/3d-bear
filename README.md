# Bear · 3D portrait

An interactive Three.js study of Bear, using the supplied photographs and video as
anatomy, coat, and movement references. This is a procedural model, not a scanned
or photogrammetric reconstruction; photographic identity is still approximate.

## Run

```sh
npm install
npm run dev
```

`npm run build` generates the Vite production bundle in `dist`.
`npm run preview` serves that bundle locally.

## Rendering and motion

- A continuous implicit body surface joins the chest, pelvis, neck, and forelegs.
- A lofted skull continues into the nasal bridge and muzzle, with a separate jaw.
- Area-sampled, tapered hair geometry replaces the previous layered fur masks.
  The muzzle has short fur; cheeks, chest, and tail have longer grooming.
- Model-space facial markings, gray-green irises with planar UVs, textured nose
  leather, cupped ears, a flattened tongue, and the blue tag / burgundy bell.
- Chest breathing deforms only the upper body, leaving the paws planted.
  Head turns, blinks, small ear movements, panting, and intermittent tail wags
  are independently timed. Petting briefly increases the tail wag.
- Neutral studio lighting, color-managed standard materials, and filtered shadows.
- Orbit, zoom, four view presets, motion pause, and an explicit turntable control.
  Reduced-motion preferences pause the character initially.
- A lower fiber count and pixel ratio are used on small or touch screens.

## References

- `IMG_0391.JPG`: seated proportions, muzzle profile, ears, paws, chest, and tag.
- `IMG_0470.JPG`: facial mask, eye color, nose, tongue, and coat distribution.
- `IMG_9934.heic`: indoor body and tail proportions.
- `IMG_9934.mov` and `bear_video.mp4`: small head turns, panting, planted paws,
  and tail motion.

The original files are preserved as local modeling references. All media files
are covered by case-insensitive Git ignore patterns. Reference media is blocked
by the development server, and public-directory copying is disabled for builds.
The website renders only the procedural 3D model and generated textures.

## Source

- `src/anatomy.js`: smooth anatomical volumes and surface extraction.
- `src/puppy.js`: head, body assembly, facial details, coat markings, and rig.
- `src/fur.js`: deterministic area sampling and tapered, groomed fibers.
- `src/textures.js`: iris and leather microtexture generation.
- `src/main.js`: scene, lighting, camera, animation, and interaction.
- `index.html`: animation and camera controls.

## Validation

The production build and live browser rendering were checked. Desktop and
390 × 844 phone-sized layouts, face/profile/front views, and pause/play
were exercised. Body surface positions and normals were
checked for finite values and outward triangle winding. Actual phone hardware
performance has not been measured.
