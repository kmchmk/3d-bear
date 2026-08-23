# Bear · 3D Puppy

An interactive, real-time 3D rendering of Bear — a fluffy puppy — built with Three.js.
The model is 100% procedural (no external assets): geometry, fur, and textures are all
generated in code at load time.

![Bear](https://img.shields.io/badge/Three.js-r170-blue)

## Features

- **Shell-fur rendering** — layered alpha-tested fur shells with per-shell normal
  jitter for a soft, fluffy look
- **Procedural textures** — fur strand masks and eye catchlights generated on canvas
  at startup (zero asset downloads)
- **Idle animations** — breathing, tail wagging with excitement bursts, ear twitches,
  blinking, panting tongue, and look-around behavior
- **Full 3D controls** — drag to rotate, scroll/pinch to zoom (mouse + touch)
- **Mobile-ready** — adaptive quality (fewer fur shells, clamped pixel ratio),
  adaptive resolution scaling, portrait-aware camera framing

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

The project is a standard Vite app — Vercel auto-detects it.

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

Or connect the repo in the Vercel dashboard — build command `npm run build`,
output directory `dist`.

## Structure

```
index.html          page shell + styles
src/main.js         scene, lighting, controls, animation loop
src/puppy.js        procedural puppy model (geometry + painted vertex colors)
src/fur.js          shell-fur material system
src/textures.js     generated fur-strand and eye textures
```
