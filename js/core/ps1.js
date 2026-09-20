/**
 * OFFICE HOURS — PS1 render core.
 *
 * Everything in the show draws through this module. It reproduces the five things
 * that actually make 1997 hardware look like 1997 hardware:
 *
 *   1. Vertex snapping    — clip-space XY quantised to the 384x216 raster grid, so
 *                           geometry visibly judders and seams pop as the camera moves.
 *   2. Affine texture UVs — `uv * w` / `w` defeats the GPU's perspective correction,
 *                           which is what makes PS1 textures swim across a floor.
 *   3. Gouraud lighting   — all lighting is per-VERTEX, interpolated as one colour.
 *                           Flat faces get one wash of light, not a gradient.
 *   4. Low internal res   — the scene renders into a 384x216 nearest-filtered target
 *                           that is then point-upscaled to the canvas.
 *   5. 15-bit dither      — 4x4 Bayer threshold + 5-bits-per-channel quantisation,
 *                           which gives PS1 gradients their crunchy banding.
 *
 * No three.js lighting chunks are used; the shaders are written out in full.
 *
 * @module core/ps1
 */

import * as THREE from 'three';

/**
 * Internal render width in pixels. The whole show — 3D and DOM UI — is laid out
 * in this design space.
 * @type {number}
 */
export const VIRTUAL_W = 384;

/**
 * Internal render height in pixels (16:9 against {@link VIRTUAL_W}).
 * @type {number}
 */
export const VIRTUAL_H = 216;

/** Hard cap on point lights the Gouraud shader supports. @type {number} */
const MAX_LIGHTS = 4;

/**
 * Every live PS1 material. `updatePS1Lights` walks this once a frame to make sure
 * each material is pointing at the shared light/fog uniform objects (cheap: the
 * objects are shared, so the actual values are written exactly once).
 * @type {Set<THREE.ShaderMaterial>}
 */
const liveMaterials = new Set();

/**
 * Shared uniform objects. Materials reference these *by object identity*, so a
 * single write here is seen by every material in the scene.
 */
const SHARED = {
  uLightPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLightColor: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  uLightRange: { value: [0, 0, 0, 0] },
  uLightCount: { value: 0 },
  uAmbient: { value: new THREE.Color(0, 0, 0) },
  uHemiSky: { value: new THREE.Color(0, 0, 0) },
  uHemiGround: { value: new THREE.Color(0, 0, 0) },
  uFogColor: { value: new THREE.Color(0, 0, 0) },
  uFogDensity: { value: 0 },
  uJitterScale: { value: 1 },
};

/** Scratch vectors so `updatePS1Lights` allocates nothing per frame. */
const _wp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _found = [];

/* ------------------------------------------------------------------------- *
 * Shaders
 * ------------------------------------------------------------------------- */

const VERT = `
precision highp float;

const float VW = ${VIRTUAL_W}.0;
const float VH = ${VIRTUAL_H}.0;

uniform vec3  uColor;
uniform vec3  uEmissive;
uniform float uJitter;
uniform float uJitterScale;
uniform float uUnlit;

uniform vec3  uLightPos[${MAX_LIGHTS}];
uniform vec3  uLightColor[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];
uniform float uLightCount;
uniform vec3  uAmbient;
uniform vec3  uHemiSky;
uniform vec3  uHemiGround;
uniform float uFogDensity;

varying vec3  vColor;
varying vec2  vUvA;
varying float vUvW;
varying vec2  vUvP;
varying float vFog;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  vec4 clip = projectionMatrix * mvPosition;

  // ---- 1. vertex snapping ------------------------------------------------
  // Quantise NDC xy onto the 384x216 raster grid, then lerp back toward the
  // exact position by (1 - jitter) so the wobble is dialable per material.
  if ( clip.w > 0.0001 ) {
    vec2 grid = vec2( VW, VH ) * 0.5;
    vec2 ndc = clip.xy / clip.w;
    vec2 snapped = floor( ndc * grid + 0.5 ) / grid;
    float k = clamp( uJitter * uJitterScale, 0.0, 1.0 );
    clip.xy = mix( ndc, snapped, k ) * clip.w;
  }
  gl_Position = clip;

  // ---- 2. affine texture mapping ----------------------------------------
  // Perspective-correct interpolation of (uv * w) divided by that of (w)
  // collapses to plain screen-linear interpolation of uv. That is the swim.
  vUvA = uv * clip.w;
  vUvW = clip.w;
  vUvP = uv;

  // ---- 3. gouraud lighting (per-vertex, one varying) --------------------
  vec3 vn = normalize( normalMatrix * normal );
  vec3 wn = normalize( mat3( modelMatrix ) * normal );

  vec3 lightSum = uAmbient + mix( uHemiGround, uHemiSky, wn.y * 0.5 + 0.5 );

  for ( int i = 0; i < ${MAX_LIGHTS}; i++ ) {
    float lightOn = step( float( i ) + 0.5, uLightCount );
    vec3 lp = ( viewMatrix * vec4( uLightPos[ i ], 1.0 ) ).xyz;
    vec3 toL = lp - mvPosition.xyz;
    float dist = max( length( toL ), 0.0001 );
    vec3 ld = toL / dist;
    float lrange = uLightRange[ i ];
    float atten = 1.0;
    if ( lrange > 0.0 ) {
      atten = clamp( 1.0 - dist / lrange, 0.0, 1.0 );
      atten *= atten;
    } else if ( lrange > -0.5 ) {
      atten = 1.0 / ( 1.0 + 0.08 * dist * dist );
    }
    // Slightly wrapped lambert: PS1 shading rarely went fully black on a
    // back face, and a hard terminator on a 12-poly torso reads as a bug.
    float nl = dot( vn, ld );
    float lambert = max( nl, 0.0 ) * 0.86 + max( nl * 0.5 + 0.5, 0.0 ) * 0.14;
    lightSum += lightOn * uLightColor[ i ] * ( lambert * atten );
  }

  vec3 shade = mix( lightSum, vec3( 1.0 ), uUnlit ) + uEmissive;
  vColor = clamp( uColor * shade, 0.0, 2.0 );

  // ---- per-vertex exponential fog ---------------------------------------
  float fd = uFogDensity * ( - mvPosition.z );
  vFog = clamp( 1.0 - exp( - fd * fd ), 0.0, 1.0 );
}
`;

const FRAG = `
precision highp float;

#ifdef USE_MAP
uniform sampler2D uMap;
#endif

uniform float uAffine;
uniform float uOpacity;
uniform float uAlphaTest;
uniform vec3  uFogColor;

varying vec3  vColor;
varying vec2  vUvA;
varying float vUvW;
varying vec2  vUvP;
varying float vFog;

void main() {
  vec4 texel = vec4( 1.0 );

  #ifdef USE_MAP
    vec2 auv = mix( vUvP, vUvA / max( vUvW, 0.0001 ), uAffine );
    texel = texture2D( uMap, auv );
  #endif

  float a = texel.a * uOpacity;
  if ( a < uAlphaTest ) discard;

  vec3 col = texel.rgb * vColor;
  col = mix( col, uFogColor, vFog );

  gl_FragColor = vec4( col, a );
}
`;

/* ------------------------------------------------------------------------- *
 * Materials
 * ------------------------------------------------------------------------- */

/** @type {Map<string, THREE.ShaderMaterial>} */
const materialCache = new Map();

/**
 * Normalises a colour-ish input into a THREE.Color.
 * @param {number|string|THREE.Color} c
 * @returns {THREE.Color}
 */
function toColor(c) {
  if (c instanceof THREE.Color) return c.clone();
  return new THREE.Color(c);
}

/**
 * Creates (or returns a cached) PS1 material: vertex-snapped, affine-UV,
 * Gouraud-lit in the vertex shader, per-vertex exponentially fogged.
 *
 * Extra options beyond the spec (`alphaTest`, `blending`, `depthWrite`,
 * `depthTest`, `cache`) are additive and safe to ignore.
 *
 * @param {Object} [o]
 * @param {number|string|THREE.Color} [o.color=0xffffff] base albedo
 * @param {THREE.Texture|null} [o.map=null] nearest-filtered canvas texture
 * @param {number|string|THREE.Color} [o.emissive=0x000000] self-lit amount (screens, signage)
 * @param {number} [o.jitter=1] 0 = no vertex snapping, 1 = full PS1 wobble
 * @param {boolean} [o.affine=true] affine (warping) texture mapping
 * @param {boolean} [o.transparent=false]
 * @param {number} [o.opacity=1]
 * @param {THREE.Side} [o.side=THREE.FrontSide]
 * @param {number} [o.unlit=0] 1 = ignore lighting entirely
 * @param {number} [o.alphaTest=0] discard threshold for cut-out textures
 * @param {'normal'|'additive'} [o.blending='normal'] additive for spell/flash quads
 * @param {boolean} [o.depthWrite] defaults to true unless `transparent` without `alphaTest`
 * @param {boolean} [o.depthTest=true]
 * @param {boolean} [o.cache=true] set false when you intend to mutate the uniforms
 * @returns {THREE.ShaderMaterial}
 */
export function ps1Material(o = {}) {
  const color = o.color === undefined ? 0xffffff : o.color;
  const map = o.map || null;
  const emissive = o.emissive === undefined ? 0x000000 : o.emissive;
  const jitter = o.jitter === undefined ? 1 : o.jitter;
  const affine = o.affine === undefined ? true : !!o.affine;
  const transparent = !!o.transparent;
  const opacity = o.opacity === undefined ? 1 : o.opacity;
  const side = o.side === undefined ? THREE.FrontSide : o.side;
  const unlit = o.unlit ? 1 : 0;
  const alphaTest = o.alphaTest === undefined ? 0 : o.alphaTest;
  const blending = o.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
  // Cut-outs (alphaTest) are not really transparent — they should still write depth.
  const depthWrite = o.depthWrite === undefined ? (!transparent || alphaTest > 0) : !!o.depthWrite;
  const depthTest = o.depthTest === undefined ? true : !!o.depthTest;
  const useCache = o.cache === undefined ? true : !!o.cache;

  const key = [
    toColor(color).getHexString(),
    map ? map.uuid : '-',
    toColor(emissive).getHexString(),
    jitter, affine ? 1 : 0, transparent ? 1 : 0, opacity, side, unlit,
    alphaTest, blending, depthWrite ? 1 : 0, depthTest ? 1 : 0,
  ].join('|');

  if (useCache) {
    const hit = materialCache.get(key);
    if (hit) return hit;
  }

  const uniforms = {
    uColor: { value: toColor(color) },
    uEmissive: { value: toColor(emissive) },
    uJitter: { value: jitter },
    uUnlit: { value: unlit },
    uAffine: { value: affine ? 1 : 0 },
    uOpacity: { value: opacity },
    uAlphaTest: { value: alphaTest },
    uJitterScale: SHARED.uJitterScale,
    uLightPos: SHARED.uLightPos,
    uLightColor: SHARED.uLightColor,
    uLightRange: SHARED.uLightRange,
    uLightCount: SHARED.uLightCount,
    uAmbient: SHARED.uAmbient,
    uHemiSky: SHARED.uHemiSky,
    uHemiGround: SHARED.uHemiGround,
    uFogColor: SHARED.uFogColor,
    uFogDensity: SHARED.uFogDensity,
  };
  if (map) uniforms.uMap = { value: map };

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    defines: map ? { USE_MAP: '' } : {},
    transparent,
    opacity,
    side,
    depthWrite,
    depthTest,
    blending,
    fog: false,
    lights: false,
    toneMapped: false,
  });

  mat.name = 'ps1';
  mat.userData.ps1 = true;
  mat.userData.ps1Key = useCache ? key : null;

  liveMaterials.add(mat);
  mat.addEventListener('dispose', () => {
    liveMaterials.delete(mat);
    if (mat.userData.ps1Key && materialCache.get(mat.userData.ps1Key) === mat) {
      materialCache.delete(mat.userData.ps1Key);
    }
  });

  if (useCache) materialCache.set(key, mat);
  return mat;
}

/**
 * Canvas-drawn texture, nearest-filtered, no mipmaps, repeat-wrapped.
 * Use this for ALL textures in the show — there are no image files.
 *
 * @param {number} w texture width in pixels (keep it small: 16..128)
 * @param {number} h texture height in pixels
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw painter
 * @returns {THREE.Texture}
 */
export function makeTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w | 0);
  canvas.height = Math.max(1, h | 0);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 1;
  tex.premultiplyAlpha = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Nudges the global vertex-wobble strength. 0 disables snapping everywhere,
 * 1 is the default, 2 doubles the per-material jitter (it still clamps at
 * fully-snapped).
 * @param {number} s 0..2
 * @returns {void}
 */
export function setJitterScale(s) {
  SHARED.uJitterScale.value = Math.min(2, Math.max(0, Number(s) || 0));
}

/**
 * Current global vertex-wobble strength.
 * @returns {number}
 */
export function getJitterScale() {
  return SHARED.uJitterScale.value;
}

/* ------------------------------------------------------------------------- *
 * Lights
 * ------------------------------------------------------------------------- */

/**
 * Walks the scene, collects up to four point lights plus ambient/hemisphere
 * terms and the fog settings, and pushes them into every live PS1 material.
 * Call once per frame BEFORE rendering.
 *
 * Directional lights are accepted too and become infinitely-distant,
 * non-attenuating lights.
 *
 * @param {THREE.Scene} scene
 * @returns {void}
 */
export function updatePS1Lights(scene) {
  if (!scene) return;

  // Light world positions must be current: the renderer would otherwise only
  // refresh them after we have already pushed uniforms.
  scene.updateMatrixWorld();

  _found.length = 0;
  let ambR = 0;
  let ambG = 0;
  let ambB = 0;
  let hemi = null;

  scene.traverse((obj) => {
    if (!obj.visible || !obj.isLight) return;
    if (obj.isAmbientLight) {
      ambR += obj.color.r * obj.intensity;
      ambG += obj.color.g * obj.intensity;
      ambB += obj.color.b * obj.intensity;
    } else if (obj.isHemisphereLight) {
      hemi = obj;
    } else if (obj.isPointLight || obj.isSpotLight) {
      _found.push(obj);
    } else if (obj.isDirectionalLight) {
      _found.push(obj);
    }
  });

  // Brightest first — the PS1 shader only has four slots.
  _found.sort((a, b) => b.intensity - a.intensity);

  const n = Math.min(MAX_LIGHTS, _found.length);
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const pos = SHARED.uLightPos.value[i];
    const col = SHARED.uLightColor.value[i];
    if (i >= n) {
      pos.set(0, 0, 0);
      col.setRGB(0, 0, 0);
      SHARED.uLightRange.value[i] = 0;
      continue;
    }
    const light = _found[i];
    light.getWorldPosition(_wp);
    if (light.isDirectionalLight) {
      // Treat as a sun: push it far away along its direction, no falloff.
      _dir.copy(_wp);
      if (light.target) {
        light.target.updateMatrixWorld();
        light.target.getWorldPosition(_tgt);
        _dir.sub(_tgt);
      }
      if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0);
      _dir.normalize().multiplyScalar(400);
      pos.copy(_dir);
      SHARED.uLightRange.value[i] = -1;
    } else {
      pos.copy(_wp);
      SHARED.uLightRange.value[i] = light.distance > 0 ? light.distance : 0;
    }
    col.copy(light.color).multiplyScalar(light.intensity);
  }
  SHARED.uLightCount.value = n;

  SHARED.uAmbient.value.setRGB(ambR, ambG, ambB);
  if (hemi) {
    SHARED.uHemiSky.value.copy(hemi.color).multiplyScalar(hemi.intensity);
    SHARED.uHemiGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
  } else {
    SHARED.uHemiSky.value.setRGB(0, 0, 0);
    SHARED.uHemiGround.value.setRGB(0, 0, 0);
  }

  const fog = scene.fog;
  if (fog) {
    SHARED.uFogColor.value.copy(fog.color);
    if (fog.isFogExp2) {
      SHARED.uFogDensity.value = fog.density;
    } else {
      // Linear fog: pick the exp2 density that reaches ~95% at `far`.
      SHARED.uFogDensity.value = fog.far > 0 ? 1.75 / fog.far : 0;
    }
  } else {
    SHARED.uFogDensity.value = 0;
  }

  // Re-point every material at the shared uniform objects. This is a handful of
  // identity checks per material per frame; the values themselves were written
  // exactly once above.
  for (const mat of liveMaterials) {
    const u = mat.uniforms;
    if (u.uLightPos === SHARED.uLightPos) continue;
    u.uLightPos = SHARED.uLightPos;
    u.uLightColor = SHARED.uLightColor;
    u.uLightRange = SHARED.uLightRange;
    u.uLightCount = SHARED.uLightCount;
    u.uAmbient = SHARED.uAmbient;
    u.uHemiSky = SHARED.uHemiSky;
    u.uHemiGround = SHARED.uHemiGround;
    u.uFogColor = SHARED.uFogColor;
    u.uFogDensity = SHARED.uFogDensity;
    u.uJitterScale = SHARED.uJitterScale;
  }
}

/* ------------------------------------------------------------------------- *
 * Post pipeline
 * ------------------------------------------------------------------------- */

const POST_VERT = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const POST_FRAG = `
precision highp float;

uniform sampler2D tDiffuse;
uniform vec2  uRes;
uniform float uSmear;
uniform float uLift;
uniform float uContrast;
uniform vec3  uShadowTint;

varying vec2 vUv;

// 4x4 ordered Bayer, built from two 2x2 levels. Returns [0, 15/16].
float bayer2( vec2 a ) {
  a = floor( a );
  return fract( a.x * 0.5 + a.y * a.y * 0.75 );
}
float bayer4( vec2 a ) {
  return bayer2( a * 0.5 ) * 0.25 + bayer2( a );
}

vec3 linearToSrgb( vec3 c ) {
  c = max( c, vec3( 0.0 ) );
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow( c, vec3( 0.41666667 ) ) - 0.055;
  return mix( lo, hi, step( vec3( 0.0031308 ), c ) );
}

void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;

  // Very slight horizontal chroma smear — composite-video flavour, luma intact.
  vec3 l = texture2D( tDiffuse, vec2( vUv.x - 1.0 / uRes.x, vUv.y ) ).rgb;
  const vec3 LUMA = vec3( 0.299, 0.587, 0.114 );
  vec3 smeared = vec3( dot( c, LUMA ) ) + ( l - vec3( dot( l, LUMA ) ) );
  c = mix( c, smeared, uSmear );

  c = linearToSrgb( c );

  // Crushed blacks, mild contrast — see the reference frames, they are dark.
  c = clamp( ( c - uLift ) * uContrast, 0.0, 1.0 );

  // A sickly fluorescent cast in the shadows (SPEC 10.5). It is deliberately
  // under one quantisation step, so the dither is what actually carries it.
  // Gated off absolute black so a full fade still reaches 0,0,0.
  float luma = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  float shadow = 1.0 - luma;
  c += uShadowTint * shadow * shadow * smoothstep( 0.0, 0.05, luma );
  c = clamp( c, 0.0, 1.0 );

  // 15-bit colour: 5 bits per channel with a 4x4 Bayer threshold. The dither
  // coordinate is the RENDER TARGET texel, not the canvas pixel, so the pattern
  // survives the nearest upscale as chunky blocks.
  float d = bayer4( floor( vUv * uRes ) );
  const float LEVELS = 31.0;
  c = floor( c * LEVELS + d ) / LEVELS;

  gl_FragColor = vec4( c, 1.0 );
}
`;

/**
 * @typedef {Object} PS1Pipeline
 * @property {(scene: THREE.Scene, camera: THREE.Camera) => void} render
 * @property {(w: number, h: number) => void} setDisplaySize
 * @property {() => void} dispose
 * @property {THREE.WebGLRenderTarget} target the 384x216 buffer holding the last composed frame
 */

/**
 * Wires the PS1 post chain onto a renderer: the scene renders into a fixed
 * 384x216 nearest-filtered render target, then a fullscreen pass applies the
 * 15-bit dithered quantisation and point-upscales it to the canvas.
 *
 * The pipeline owns the render target and the fullscreen pass; the caller owns
 * the renderer.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @returns {PS1Pipeline}
 */
export function createPS1Pipeline(renderer) {
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  renderer.setPixelRatio(1);

  /**
   * Two identical 384x216 buffers, used alternately. A single buffer would be
   * bound as the post pass's source while the next frame's scene render writes
   * into it, which WebGL rejects as a framebuffer feedback loop and silently
   * drops the draw. Ping-ponging costs 332KB and makes the state unambiguous.
   * @returns {THREE.WebGLRenderTarget}
   */
  function makeTarget() {
    const rt = new THREE.WebGLRenderTarget(VIRTUAL_W, VIRTUAL_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    rt.texture.generateMipmaps = false;
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.anisotropy = 1;
    return rt;
  }

  const targets = [makeTarget(), makeTarget()];
  let writeIndex = 0;

  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tDiffuse: { value: targets[0].texture },
      uRes: { value: new THREE.Vector2(VIRTUAL_W, VIRTUAL_H) },
      uSmear: { value: 0.14 },
      uLift: { value: 0.026 },
      uContrast: { value: 1.10 },
      uShadowTint: { value: new THREE.Color(0.004, 0.022, 0.011) },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeo, postMat);
  quad.frustumCulled = false;

  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let disposed = false;

  return {
    /** The 384x216 buffer the last frame was composed in. */
    get target() { return targets[writeIndex ^ 1]; },

    /**
     * Renders `scene` through the PS1 chain into the renderer's canvas.
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    render(scene, camera) {
      if (disposed) return;
      const rt = targets[writeIndex];
      writeIndex ^= 1;

      renderer.setRenderTarget(rt);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      renderer.setRenderTarget(null);
      postMat.uniforms.tDiffuse.value = rt.texture;
      renderer.clear(true, true, true);
      renderer.render(postScene, postCam);
    },

    /**
     * Sets the output drawing-buffer size. The 384x216 internal target is
     * unaffected — pass an integer multiple of 384x216 to keep the upscale
     * perfectly square.
     * @param {number} w
     * @param {number} h
     */
    setDisplaySize(w, h) {
      if (disposed) return;
      renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false);
    },

    /** Frees the render target and fullscreen pass. */
    dispose() {
      if (disposed) return;
      disposed = true;
      targets[0].dispose();
      targets[1].dispose();
      quadGeo.dispose();
      postMat.dispose();
      postScene.remove(quad);
    },
  };
}
