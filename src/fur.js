import * as THREE from 'three'
import { FUR_MAP, FUR_MAP_LIMB } from './textures.js'

// Shell-fur material: MeshStandardMaterial extended so each instance of an
// InstancedMesh represents one "shell" displaced along vertex normals and
// alpha-masked by a strand texture. Layer 0 is the skin, higher layers are
// progressively sparser hair tips.
export function makeFurMaterial({ furLength = 0.05, limb = false, uvScale = [1, 1] } = {}) {
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

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFurLength = uFurLength
    shader.uniforms.uDensity = uDensity
    shader.uniforms.uUvScale = uUvScale
    shader.uniforms.uFurMap = { value: limb ? FUR_MAP_LIMB : FUR_MAP }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFurLength;
        attribute float aLayer;
        varying float vLayer;`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        // per-shell normal jitter breaks up specular banding between shells
        {
          vec3 seed = position * 91.17 + aLayer * 43.7;
          vec3 h = vec3(
            fract(sin(dot(seed.xy, vec2(12.9898, 78.233))) * 43758.5453),
            fract(sin(dot(seed.yz, vec2(39.3467, 11.135))) * 24634.6345),
            fract(sin(dot(seed.zx, vec2(69.1345, 53.5353))) * 97531.5313)
          );
          objectNormal = normalize(objectNormal + (h - 0.5) * 0.6 * aLayer);
        }`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLayer = aLayer;
        transformed += normalize(normal) * uFurLength * aLayer;`
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
        float rimFade = smoothstep(0.04, 0.3, rim);
        if (strandA * uDensity * rimFade < vLayer) discard;
        diffuseColor.rgb *= mix(0.68, 1.1, vLayer);
        diffuseColor.rgb *= mix(0.9, 1.0, strandA);`
      )
  }
  mat.customProgramCacheKey = () => 'puppy-fur-' + (limb ? 'limb' : 'body')
  return mat
}

// Builds skin + shells for a furry part. Geometry must have position/normal/uv
// and vertex colours already painted. Returns a group containing both meshes.
export function makeFurPart(geometry, { layers = 14, furLength = 0.05, limb = false, uvScale = [1, 1] } = {}) {
  const group = new THREE.Group()
  const furMat = makeFurMaterial({ furLength, limb, uvScale })

  // skin: plain material, slightly darkened so gaps between strands read as roots
  const skinMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  })
  skinMat.color.setScalar(0.72)
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
