# Bear · 3D portrait

An interactive puppy built with Three.js and Vite. The head and body are sculpted
and optimized offline in Blender, using the root photographs and shared Beary
album as visual references. The resemblance remains an artistic reconstruction,
not a photographic scan.

## Run and deploy

```sh
npm install
npm run dev
npm run build
npm run preview
```

Vercel configuration is included: Vite framework, `npm run build`, output `dist`.
Blender and the reference media are not required on Vercel. The geometry-only
`src/sculpted-meshes.json` export is part of the application source. Vite splits
the model into a separate chunk so the loading screen can paint first.

## Model and rendering

- Smooth anatomical body and head surfaces with carved orbital hollows.
- Separate corneas, fur-covered eyelids, muzzle pads, jaw, ears, and tongue.
- Tapered groomed fibers with varied lengths, clumps, guard hairs, and sheen.
- Cream bib and socks, chocolate muzzle, gray-green irises, and collar accessories.
- Planted paws, local chest breathing, eyelid closure, ear twitches, and tail motion.
- Orbit/zoom, four camera views, motion pause, and optional turntable.
- Reduced-motion preferences pause the character initially.
- Lower fur density and pixel ratio on small/touch devices; adaptive resolution
  reduces GPU load if rendering falls behind.

## Offline sculpt workflow

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/sculpt_bear.py
```

`scripts/implicit_surface.py` creates smooth anatomical volumes. Blender cleans,
optimizes, and exports them through `scripts/sculpt_bear.py`. An editable local
copy is saved to `.review/bear-sculpt.blend`. Regeneration replaces the geometry
JSON; rebuilding the website does not regenerate the sculpt.

## Reference privacy

Root JPG/HEIC/MOV files and the shared album are modeling references only. No real
photos or videos are displayed, loaded, or copied into the production website.
Image/video/audio formats and Blender intermediates are ignored, including
uppercase extensions. Vite public-directory copying is disabled and reference
media is denied by the development server.

## Validation scope

Production build, mesh data, browser rendering, responsive framing, and animation
controls are checked locally. Phone-sized browser checks do not constitute real
phone GPU testing. Deployment to a live Vercel project is a separate step.
