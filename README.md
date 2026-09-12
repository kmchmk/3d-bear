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
- Cream bib and socks, chocolate muzzle, hazel irises, and collar accessories.
- Planted paws, local chest breathing, eyelid closure, ear twitches, and tail motion.
- Orbit/zoom, four camera views, motion pause, and optional turntable.
- Reduced-motion preferences pause the character initially.
- Lower fur density and pixel ratio on small/touch devices; adaptive resolution
  reduces GPU load if rendering falls behind.

## Offline sculpt workflow

Mac:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/sculpt_bear.py
```

Linux (same flags, same script — install once, e.g. Blender 4.2 LTS):

```sh
curl -o /tmp/blender.tar.xz https://mirrors.dotsrc.org/blender/release/Blender4.2/blender-4.2.0-linux-x64.tar.xz
tar -xf /tmp/blender.tar.xz -C /tmp/
/tmp/blender-4.2.0-linux-x64/blender --background --factory-startup --python scripts/sculpt_bear.py
```

`scripts/implicit_surface.py` creates smooth anatomical volumes. Blender cleans,
optimizes, and exports them through `scripts/sculpt_bear.py`. An editable local
copy is saved to `.review/bear-sculpt.blend`. Regeneration replaces the geometry
JSON; rebuilding the website does not regenerate the sculpt. Never hand-edit
`src/sculpted-meshes.json` — regen only via the Blender command above.

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

## Iteration loop (photorealism work program)

Every iteration must end with ALL of these green:

1. `npm run build` clean, and `dist/` contains only JS/JSON/HTML (no photos,
   video, or audio — reference media is git-ignored and never ships).
2. Zero browser console errors.
3. `window.petBear()` produces nonzero tail rotation.
4. A 390px-wide mobile load reaches ready state.
5. Fresh desktop screenshots in strict order `default,face,side` (any other
   order corrupts the default framing): serve with
   `npx vite preview --port 4173 --strictPort`, capture with headless Chrome +
   `--enable-unsafe-swiftshader` (plain headless Chrome has no WebGL here),
   freeze the pose via the `window.__bear` rig before capture.
6. An INDEPENDENT rater scores the new renders against the reference photos
   (harsh, evidence-first: pixel-proof bullets before numbers, 1–10 per
   category). Never self-rate. Save only the best set to
   `.review/result-YYYY-MM-DD-{default,face,side,mobile}.png`.

Status (2026-09-12): Phase 3 wedge resculpt landed (narrower skull, tapered
muzzle, leaner legs, hock definition, high tail set) — independently rated
4.1/10, up from ~2.6/10. Remaining gaps: eye shape/placement, coat strand
read, mitten paws. Next: push past 4/10 toward 5/10 via eye architecture and
procedural paw/toe separation.
