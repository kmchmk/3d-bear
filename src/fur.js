import * as THREE from 'three'
import { FUR_MAP, FUR_MAP_LIMB } from './textures.js'

// Shell-fur material v2: each InstancedMesh instance is one "shell" displaced
// along vertex normals, bent toward a per-part groom direction, with
// per-strand length variation for a natural wispy silhouette.
export function makeFurMaterial({ furLength = 0.05, limb = false, uvScale = [1, 1], groom = [0, 0, 0] } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    vertexColors: true,
  })
  mat.defines = { USE_UV: '' }
  const uFurLength = { value: furLength }
  const uDensity = { value: 1.0 }
  const uUvScale = { value: new THREE.Vector2(uvScale[0], uvScale[1]) }
  const uGroom = { value: new THREE.Vector3(...groom) }

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFurLength = uFurLength
    shader.uniforms.uDensity = uDensity
    shader.uniforms.uUvScale = uUvScale
    shader.uniforms.uGroom = uGroom
    shader.uniforms.uFurMap = { value: limb ? FUR_MAP_LIMB : FUR_MAP }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFurLength;
        uniform vec3 uGroom;
        attribute float aLayer;
        varying float vLayer;
        float strandHash(vec3 p) {
          // sine-free hash (sin of large args loses precision -> streaks)
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        // per-shell normal jitter breaks up specular banding between shells
        {
          vec3 sp = floor(position * 14.0) + aLayer * 7.0;
          vec3 h = vec3(
            fract(sp.x * 0.1031 + sp.y * 0.11369 + sp.z * 0.13787),
            fract(sp.y * 0.0973 + sp.z * 0.10993 + sp.x * 0.12731),
            fract(sp.z * 0.11731 + sp.x * 0.10369 + sp.y * 0.09787)
          );
          h = fract(h * 17.0 + h.yzx * 13.0);
          objectNormal = normalize(objectNormal + (h - 0.5) * 0.55 * aLayer);
        }`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLayer = aLayer;
        {
          float h = strandHash(floor(position * 14.0) + 0.5);
          float len = uFurLength * (0.74 + 0.52 * h);
          vec3 dir = normalize(normal);
          float l = aLayer;
          // grow along the normal, then bend toward the groom direction
          transformed += dir * len * l;
          transformed += uGroom * (len * l * l);
        }`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uFurMap;
        uniform float uDensity;
        uniform vec2 uUvScale;
        varying float vLayer;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float strandA = texture2D(uFurMap, vUv * uUvScale).a;
        // fade shells toward silhouettes to avoid grazing-angle streaking
        float rim = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float rimFade = smoothstep(0.03, 0.24, rim);
        if (strandA * uDensity * rimFade < vLayer) discard;
        // dark roots (AO), warm golden tips
        diffuseColor.rgb *= mix(vec3(0.5, 0.44, 0.4), vec3(1.16, 1.1, 0.98), vLayer);
        diffuseColor.rgb *= mix(vec3(1.06, 1.0, 0.94), vec3(1.0), strandA);
        // subtle warm variation between strands
        float warm = fract(sin(dot(floor(vUv * uUvScale * 36.0), vec2(127.1, 311.7))) * 43758.5453);
        diffuseColor.rgb *= vec3(1.0 + (warm - 0.5) * 0.1, 1.0, 1.0 - (warm - 0.5) * 0.12);`
      )
  }
  mat.customProgramCacheKey = () => 'puppy-fur-' + (limb ? 'limb' : 'body')
  return mat
}

// Builds skin + shells for a furry part. Geometry must have position/normal/uv
// and vertex colours already painted. Returns a group containing both meshes.
export function makeFurPart(geometry, { layers = 14, furLength = 0.05, limb = false, uvScale = [1, 1], groom = [0, 0, 0] } = {}) {
  const group = new THREE.Group()
  const furMat = makeFurMaterial({ furLength, limb, uvScale, groom })

  // skin: plain material, slightly darkened so gaps between strands read as roots
  const skinMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  })
  skinMat.color.setScalar(0.55)
  const skin = new THREE.Mesh(geometry, skinMat)
  skin.castShadow = true
  group.add(skin)

  const g = geometry.clone()
  const layerVals = new Float32Array(layers)
  for (let i = 0; i < layers; i++) layerVals[i] = (i + 1) / layers
  g.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layerVals, 1))
  const shells = new THREE.InstancedMesh(g, furMat, layers)
  const id = new THREE.Matrix4()
  for (let i = 0; i < layers; i++) shells.setMatrixAt(i, id)
  shells.instanceMatrix.needsUpdate = true
  shells.frustumCulled = false
  group.add(shells)

  return group
}
