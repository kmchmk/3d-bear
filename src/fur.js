import * as THREE from 'three'

// Shell fur: the skin mesh is re-drawn N times as an InstancedMesh, each instance
// pushed a little further along the normal. The fragment shader keeps only the
// pixels that fall inside a procedural strand, which reads as a soft, fluffy coat.
//
// Per-vertex attributes that drive it:
//   color    — coat albedo (sRGB-linearised by three)
//   furLen   — strand length in model units (0 = bare skin, e.g. around the eyes)
//   furComb  — direction the coat lies in (model space), bends strands near the tips

export const furUniforms = {
  uTime: { value: 0 },
  uGravity: { value: new THREE.Vector3(0, -1, 0) },
  uWind: { value: new THREE.Vector3() },
}

export function createFurMaterial({ shells, density = 210, rim = 0.08, tipLight = 0.02 }) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    envMapIntensity: 0.6,
    metalness: 0,
  })
  material.alphaToCoverage = true
  material.onBeforeCompile = shader => {
    shader.uniforms.uShells = { value: shells }
    shader.uniforms.uDensity = { value: density }
    shader.uniforms.uRim = { value: rim }
    shader.uniforms.uTipLight = { value: tipLight }
    Object.assign(shader.uniforms, furUniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float furLen;
        attribute vec3 furComb;
        uniform float uShells;
        uniform vec3 uGravity;
        uniform vec3 uWind;
        uniform float uTime;
        varying float vH;
        varying float vLen;
        varying vec3 vRoot;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float furH = (float(gl_InstanceID) + 1.0) / uShells;
        // Tips lean with the coat so lighting follows the groom, not just the skin.
        objectNormal = normalize(objectNormal + furComb * furH * 0.6);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vH = furH;
        vLen = furLen;
        vRoot = position;
        float sway = sin(uTime * 1.7 + position.x * 9.0 + position.y * 7.0) * 0.5 + 0.5;
        vec3 bend = furComb * 0.85 + uGravity * 0.35 + uWind * sway;
        transformed += normal * furH * furLen + bend * furLen * furH * furH;`)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDensity;
        uniform float uRim;
        uniform float uTipLight;
        varying float vH;
        varying float vLen;
        varying vec3 vRoot;
        float furHash(vec3 p) {
          p = fract(p * vec3(443.897, 441.423, 437.195));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }
        // One jittered strand per cell; returns (distance to strand axis, strand length, tone).
        vec3 strand(vec3 q) {
          vec3 c = floor(q);
          vec3 f = fract(q);
          vec3 j = vec3(furHash(c), furHash(c + 17.3), furHash(c + 31.7));
          vec3 d = f - (0.3 + 0.4 * j);
          return vec3(length(d), 0.55 + 0.45 * furHash(c + 5.1), furHash(c + 9.9));
        }`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        if (vLen < 0.0035) discard;
        vec3 q = vRoot * uDensity;
        // Clumping: strands in a tuft converge toward its centre as they get longer.
        vec3 cq = vRoot * uDensity * 0.16;
        vec3 cc = floor(cq);
        vec3 clumpCentre = (cc + 0.3 + 0.4 * vec3(furHash(cc + 3.3), furHash(cc + 7.1), furHash(cc + 1.9))) / 0.16;
        q += (q - clumpCentre) * vH * 0.9;
        float clumpTone = furHash(cc + 2.2);
        vec3 sA = strand(q);
        vec3 sB = strand(q + 0.5);
        vec3 s = sA.x < sB.x ? sA : sB;
        float lenFrac = vH / s.y;
        float radius = 0.5 * pow(max(1.0 - lenFrac, 0.0), 0.7);
        float w = max(fwidth(s.x), 1e-3);
        float coverage = smoothstep(radius + w, radius - w, s.x);
        // Dense undercoat: the inner part of the coat is solid, only the outer part is strands.
        coverage = max(coverage, 1.0 - smoothstep(0.08, 0.2, vH));
        if (coverage < 0.02) discard;
        diffuseColor.a = coverage;
        float occlusion = mix(0.45, 1.0, pow(vH, 0.8));
        diffuseColor.rgb *= occlusion * (0.9 + 0.12 * s.z + 0.12 * clumpTone);
        diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.25 + 0.03, vec3(1.0)), vH * vH * uTipLight * 4.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += diffuseColor.rgb * fresnel * uRim * vH;`)
  }
  material.customProgramCacheKey = () => `fur-${shells}-${density}`
  return material
}

export function createFurMesh(geometry, { shells, density, rim, tipLight }) {
  const mesh = new THREE.InstancedMesh(geometry, createFurMaterial({ shells, density, rim, tipLight }), shells)
  const identity = new THREE.Matrix4()
  for (let i = 0; i < shells; i++) mesh.setMatrixAt(i, identity)
  mesh.frustumCulled = false
  mesh.receiveShadow = true
  return mesh
}
