// ─────────────────────────────────────────────────────────────
//  WebGL2 renderer — real 3D, full resolution.
//  • The house grid becomes geometry: walls, floors, ceilings,
//    door frames with lintels, doors that swing on hinges, and
//    furniture built from boxes.
//  • Lighting: baked lamp visibility (so light doesn't bleed
//    through walls) + normal-mapped relief + a flashlight
//    spotlight with specular highlights + exponential fog.
//  • HDR → bloom → ACES tone mapping → colour grade, vignette,
//    chromatic aberration and animated film grain.
// ─────────────────────────────────────────────────────────────

import { hdTextures, MATERIAL, noiseCanvas } from './texhd.js';
import { ROOM_DEFS, ROOM_IDS, FLOOR, WALL, DOOR, BLOCK } from './world.js';

const LM = 4;           // lightmap samples per tile
const WALL_H = 1.3;   // ceiling height (game logic uses 1; we scale the eye to match)
const DOOR_H = 1.0;
const EYE = 1.24;     // eye-height scale

// ── tiny matrix library (column-major) ──
const M4 = {
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  lookAt(e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  trsY(x, y, z, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]);
  },
  I: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
};

// ── shaders ──
const SCENE_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV;
layout(location=3) in vec3 aTan; layout(location=4) in vec3 aBit;
uniform mat4 uVP, uModel;
out vec3 vW, vN, vT, vB; out vec2 vUV;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  mat3 m = mat3(uModel);
  vW = w.xyz; vN = normalize(m * aNor); vT = normalize(m * aTan); vB = normalize(m * aBit); vUV = aUV;
  gl_Position = uVP * w;
}`;

const LIGHTING = `
uniform sampler2D uLM; uniform vec2 uLMSize;
uniform vec3 uCam, uFPos, uFDir; uniform float uFlash;
uniform vec4 uL[10]; uniform vec3 uLC[10]; uniform int uNL;
uniform float uFog, uHaze;
uniform sampler2D uNoise;
// light scattered by dust in the flashlight beam, between the eye and this point
vec3 inscatter(vec3 W) {
  vec3 rd = W - uCam; float L = length(rd); rd /= L; L = min(L, 7.0);
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float acc = 0.0;
  for (int i = 0; i < 7; i++) {
    float t = (float(i) + j) / 7.0 * L;
    vec3 d = uCam + rd * t - uFPos; float dl = length(d) + 0.001;
    float c = smoothstep(0.93, 0.99, dot(d / dl, uFDir));
    acc += c / (1.0 + dl * dl * 0.5);
  }
  return vec3(1.0, 0.92, 0.78) * acc * L / 7.0 * uFlash * uHaze;
}
vec3 shade(vec3 alb, vec3 n, vec3 geomN, vec3 W, vec2 mat, float minLight) {
  vec3 lm = texture(uLM, (W.xz + geomN.xz * 0.16) / uLMSize).rgb * 3.0;
  lm = max(lm, vec3(minLight));
  vec3 dsum = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    if (i >= uNL) break;
    vec3 L = uL[i].xyz - W; float d = length(L);
    float w = max(0.0, 1.0 - d / uL[i].w);
    dsum += L / max(d, 0.001) * w * dot(uLC[i], vec3(0.333));
  }
  float relief = length(dsum) > 0.001 ? clamp(dot(n, normalize(dsum)) * 0.6 + 0.55, 0.3, 1.2) : 1.0;
  vec3 col = alb * lm * relief;
  // flashlight: a spotlight from just below the eyes
  vec3 Lf = uFPos - W; float fd = length(Lf); Lf /= fd;
  float ca = dot(-Lf, uFDir);
  float cone = smoothstep(0.905, 0.975, ca) + smoothstep(0.70, 0.905, ca) * 0.16;
  // a real torch blows out up close; ease it off inside arm's reach so faces and walls keep their detail
  float att = uFlash * 4.2 / (1.0 + fd * fd * 0.16) * mix(0.42, 1.0, smoothstep(0.5, 2.4, fd));
  float nl = max(dot(n, Lf), 0.0);
  vec3 V = normalize(uCam - W), H = normalize(Lf + V);
  float sp = pow(max(dot(n, H), 0.0), mat.y) * mat.x;
  col += (alb * nl + sp * 0.6) * vec3(1.0, 0.93, 0.8) * cone * att;
  return col * exp(-length(uCam - W) * uFog) + inscatter(W);
}`;

const SCENE_FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vT, vB; in vec2 vUV;
uniform sampler2D uAlb, uNrm; uniform vec2 uMat; uniform float uEmis; uniform float uWallH;
${LIGHTING}
out vec4 o;
void main() {
  vec4 a = texture(uAlb, vUV);
  // break up the per-tile repetition with world-space grime, plus fine detail up close
  vec2 wp = abs(vN.y) > 0.5 ? vW.xz * 0.11 : vec2((vW.x + vW.z) * 0.11, vW.y * 0.16);
  vec3 nz = texture(uNoise, wp).rgb;
  float streak = abs(vN.y) > 0.5 ? 1.0 : mix(0.82, 1.05, texture(uNoise, vec2((vW.x + vW.z) * 0.5, vW.y * 0.05)).b);
  float detail = texture(uNoise, vUV * 5.0).g;
  a.rgb *= mix(0.7, 1.12, nz.r) * streak * (0.9 + detail * 0.2);
  vec3 tn = texture(uNrm, vUV).xyz * 2.0 - 1.0;
  vec3 n = normalize(tn.x * vT + tn.y * vB + tn.z * vN);
  vec3 col = shade(a.rgb, n, vN, vW, uMat, 0.0);
  // soft contact shadow where walls meet the floor and ceiling
  if (abs(vN.y) < 0.5) col *= mix(0.45, 1.0, smoothstep(0.0, 0.22, vW.y)) * mix(0.6, 1.0, smoothstep(0.0, 0.25, uWallH - vW.y));
  col += a.rgb * (1.0 - a.a) * 2.0 * uEmis;
  o = vec4(col, 1.0);
}`;

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
uniform mat4 uVP; uniform vec3 uCenter; uniform vec2 uSize; uniform vec3 uRight; uniform float uFlip;
out vec2 vUV; out vec3 vW;
void main() {
  vec3 p = uCenter + uRight * (aCorner.x - 0.5) * uSize.x + vec3(0.0, aCorner.y * uSize.y, 0.0);
  vW = p;
  vUV = vec2(uFlip > 0.5 ? 1.0 - aCorner.x : aCorner.x, 1.0 - aCorner.y);
  gl_Position = uVP * vec4(p, 1.0);
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vW;
uniform sampler2D uAlb, uGlow, uSNrm; uniform float uAlpha, uMinLight, uCut; uniform vec3 uRight;
${LIGHTING}
out vec4 o;
void main() {
  vec4 a = texture(uAlb, vUV);
  if (a.a < uCut) discard;
  vec3 N = normalize(vec3(uCam.x - vW.x, 0.0, uCam.z - vW.z));
  vec3 tn = texture(uSNrm, vUV).xyz * 2.0 - 1.0;
  vec3 n = normalize(tn.x * uRight + tn.y * vec3(0.0, -1.0, 0.0) + tn.z * N);
  // cloth and skin are matte: only a faint sheen, so dark clothes stay dark in the beam
  vec3 col = shade(a.rgb, n, N, vW, vec2(0.025, 12.0), uMinLight);
  // a cold rim where the silhouette turns away from you
  float rim = pow(1.0 - max(dot(n, N), 0.0), 3.0);
  col += a.rgb * rim * (0.2 + uFlash * 0.45) * vec3(0.7, 0.8, 1.0);
  vec4 g = texture(uGlow, vUV);
  col += g.rgb * g.a * 4.0;
  o = vec4(col, a.a * uAlpha);
}`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vW;
uniform vec3 uColor;
out vec4 o;
void main() {
  float r = length(vUV - 0.5) * 2.0;
  float core = exp(-r * r * 40.0) * 6.0, halo = exp(-r * r * 5.0) * 0.6 * max(0.0, 1.0 - r);
  o = vec4(uColor * (core + halo), 1.0);
}`;

const DECAL_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
uniform mat4 uVP; uniform vec3 uCenter; uniform vec2 uSize;
out vec2 vUV;
void main() { vUV = aCorner; gl_Position = uVP * vec4(uCenter + vec3((aCorner.x - 0.5) * uSize.x, 0.004, (aCorner.y - 0.5) * uSize.y), 1.0); }`;
const DECAL_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform float uStrength;
out vec4 o;
void main() { float r = length(vUV - 0.5) * 2.0; o = vec4(0.0, 0.0, 0.0, pow(max(0.0, 1.0 - r * r), 1.6) * uStrength); }`;

const DUST_VS = `#version 300 es
layout(location=0) in vec3 aSeed;
uniform mat4 uVP; uniform vec3 uCam, uFPos, uFDir; uniform float uTime, uFlash, uScale;
out float vB;
void main() {
  vec3 box = vec3(5.0, 1.3, 5.0);
  vec3 drift = vec3(sin(uTime * 0.13 + aSeed.y * 6.0) * 0.3, uTime * 0.02 + sin(uTime * 0.3 + aSeed.x * 9.0) * 0.05, cos(uTime * 0.11 + aSeed.z * 5.0) * 0.3);
  vec3 p = mod(aSeed * box + drift - uCam * vec3(1.0, 0.0, 1.0), box) - box * vec3(0.5, 0.0, 0.5) + uCam * vec3(1.0, 0.0, 1.0);
  vec3 d = p - uFPos; float dl = length(d);
  vB = smoothstep(0.9, 0.985, dot(d / dl, uFDir)) * uFlash / (1.0 + dl * dl * 0.6);
  vec4 c = uVP * vec4(p, 1.0);
  gl_Position = c;
  gl_PointSize = clamp(uScale * 0.012 / c.w, 1.0, 4.0);
}`;
const DUST_FS = `#version 300 es
precision highp float;
in float vB;
out vec4 o;
void main() { float r = length(gl_PointCoord - 0.5) * 2.0; o = vec4(vec3(1.0, 0.92, 0.8) * vB * pow(max(0.0, 1.0 - r), 2.0) * 0.8, 1.0); }`;

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
out vec2 vUV;
void main() { vUV = aCorner; gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0); }`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) c += texture(uTex, vUV + vec2(x, y) * uTexel).rgb;
  c /= 9.0;
  o = vec4(max(c - 0.75, 0.0), 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;
out vec4 o;
void main() {
  float w[5] = float[](0.227, 0.194, 0.121, 0.054, 0.016);
  vec3 c = texture(uTex, vUV).rgb * w[0];
  for (int i = 1; i < 5; i++) { c += texture(uTex, vUV + uDir * float(i)).rgb * w[i]; c += texture(uTex, vUV - uDir * float(i)).rgb * w[i]; }
  o = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom;
uniform float uTime, uGrain, uRed, uDesat, uAberr, uExposure;
uniform vec2 uRes;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec2 c = vUV - 0.5; float r = length(c);
  vec2 off = c * uAberr * r;
  vec3 col = vec3(texture(uScene, vUV + off).r, texture(uScene, vUV).g, texture(uScene, vUV - off).b);
  col += texture(uBloom, vUV).rgb * 0.85;
  col = aces(col * uExposure);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), uDesat);
  col += (0.35 - l) * vec3(-0.02, 0.005, 0.025) * (1.0 - l);          // cold shadows
  col = mix(col, col * vec3(1.15, 0.82, 0.78), uRed);
  col *= 1.0 - 0.72 * smoothstep(0.32, 0.95, r);                       // vignette
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  o = vec4(col, 1.0);
}`;

const FINAL_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime, uGrain, uSharp;
out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  // FXAA: smooth jagged edges along their direction
  vec2 px = 1.0 / uRes;
  vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 nw = texture(uTex, vUV + vec2(-1.0, -1.0) * px).rgb, ne = texture(uTex, vUV + vec2(1.0, -1.0) * px).rgb;
  vec3 sw = texture(uTex, vUV + vec2(-1.0, 1.0) * px).rgb, se = texture(uTex, vUV + vec2(1.0, 1.0) * px).rgb;
  vec3 m = texture(uTex, vUV).rgb;
  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * px;
  vec3 A = 0.5 * (texture(uTex, vUV + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, vUV + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 B = A * 0.5 + 0.25 * (texture(uTex, vUV - dir * 0.5).rgb + texture(uTex, vUV + dir * 0.5).rgb);
  float lb = dot(B, L);
  vec3 col = (lb < lmin || lb > lmax) ? A : B;
  // contrast-adaptive sharpening: crisp detail back after anti-aliasing and upscaling,
  // backed off on edges that are already high-contrast so nothing rings
  vec3 n4 = texture(uTex, vUV + vec2(0.0, -px.y)).rgb + texture(uTex, vUV + vec2(0.0, px.y)).rgb + texture(uTex, vUV + vec2(-px.x, 0.0)).rgb + texture(uTex, vUV + vec2(px.x, 0.0)).rgb;
  float amp = clamp(min(lmin, 1.0 - lmax) / max(lmax, 1e-3), 0.0, 1.0);
  col = max(col + (col - n4 * 0.25) * uSharp * sqrt(amp), 0.0);
  // fine grain, strongest in the shadows like real film, gone in the highlights
  float lum = dot(col, L);
  col += (hash(vUV * uRes + fract(uTime) * 97.0) - 0.5) * uGrain * (1.0 - smoothstep(0.1, 0.7, lum));
  col += (hash(vUV * uRes * 1.37 + 3.1) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

// ── furniture built from boxes: [part offset x, y(bottom), z, size x, y, z, material] ──
const iron = 'iron', wood = 'woodDark', linen = 'linen', fabric = 'fabric', enamel = 'enamel';
function bedParts() {
  const p = [];
  const L = 1.5, Wd = 1.0;
  for (const [x, z, h] of [[-Wd / 2, -L / 2, 0.82], [Wd / 2, -L / 2, 0.82], [-Wd / 2, L / 2, 0.5], [Wd / 2, L / 2, 0.5]]) p.push([x, 0, z, 0.045, h, 0.045, iron]);
  p.push([0, 0.75, -L / 2, Wd, 0.035, 0.035, iron], [0, 0.5, -L / 2, Wd, 0.03, 0.03, iron], [0, 0.44, L / 2, Wd, 0.03, 0.03, iron]);
  for (let i = 1; i < 7; i++) p.push([-Wd / 2 + (i * Wd) / 7, 0.3, -L / 2, 0.018, 0.45, 0.018, iron]);
  p.push([0, 0.24, 0, Wd, 0.05, L, iron]);
  p.push([0, 0.29, 0, Wd - 0.04, 0.15, L - 0.06, fabric]);
  p.push([0, 0.44, -L / 2 + 0.22, 0.62, 0.08, 0.26, linen]);
  p.push([0.02, 0.44, 0.22, Wd - 0.02, 0.035, 0.92, linen]);
  return p;
}
const MODELS = {
  bed: { parts: bedParts() },
  nightstand: { parts: [[0, 0, 0, 0.52, 0.48, 0.42, wood], [0, 0.48, 0, 0.12, 0.03, 0.12, 'brass'], [0, 0.5, 0, 0.03, 0.2, 0.03, 'brass'], [0, 0.66, 0, 0.26, 0.05, 0.26, 'shade'], [0, 0.71, 0, 0.22, 0.05, 0.22, 'shade'], [0, 0.76, 0, 0.17, 0.04, 0.17, 'shade']] },
  crib: {
    parts: [[0, 0.3, 0, 1.0, 0.06, 0.6, wood], [0, 0.32, 0, 0.94, 0.06, 0.54, linen],
      ...[[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].map(([x, z]) => [x, 0, z, 0.05, 0.86, 0.05, wood]),
      [0, 0.8, -0.3, 1.0, 0.04, 0.04, wood], [0, 0.8, 0.3, 1.0, 0.04, 0.04, wood],
      ...Array.from({ length: 9 }, (_, i) => [-0.4 + i * 0.1, 0.36, -0.3, 0.022, 0.45, 0.022, wood]),
      ...Array.from({ length: 9 }, (_, i) => [-0.4 + i * 0.1, 0.36, 0.3, 0.022, 0.45, 0.022, wood])],
  },
  table: {
    parts: [[0, 0.47, 0, 1.25, 0.05, 0.82, wood], [0, 0.5, 0, 1.32, 0.012, 0.9, linen],
      ...[[-0.55, -0.34], [0.55, -0.34], [-0.55, 0.34], [0.55, 0.34]].map(([x, z]) => [x, 0, z, 0.06, 0.47, 0.06, wood]),
      [-0.2, 0.512, 0.05, 0.26, 0.015, 0.26, enamel]],
  },
  chair: {
    parts: [[0, 0.4, 0, 0.44, 0.045, 0.42, wood],
      ...[[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].map(([x, z]) => [x, 0, z, 0.04, 0.4, 0.04, wood]),
      [-0.19, 0.44, 0.18, 0.04, 0.5, 0.04, wood], [0.19, 0.44, 0.18, 0.04, 0.5, 0.04, wood], [0, 0.82, 0.18, 0.42, 0.08, 0.035, wood], [0, 0.62, 0.18, 0.42, 0.05, 0.03, wood]],
  },
  bathtub: {
    parts: [[0, 0.07, 0, 0.68, 0.09, 1.52, 'tubOuter'], [0, 0.15, 0, 0.78, 0.38, 1.65, 'tubOuter'], [0, 0.535, 0, 0.64, 0.006, 1.5, 'tubInside'],
      [0.36, 0.53, 0, 0.06, 0.035, 1.65, enamel], [-0.36, 0.53, 0, 0.06, 0.035, 1.65, enamel], [0, 0.53, 0.8, 0.78, 0.035, 0.06, enamel], [0, 0.53, -0.8, 0.78, 0.035, 0.06, enamel],
      ...[[-0.3, -0.68], [0.3, -0.68], [-0.3, 0.68], [0.3, 0.68]].map(([x, z]) => [x, 0, z, 0.09, 0.08, 0.09, 'brass']),
      [0.41, 0.42, 0.3, 0.012, 0.86, 1.05, 'curtain'], [0.41, 1.28, 0, 0.02, 0.02, 1.65, iron]],
  },
  sink: { parts: [[0, 0, 0, 0.14, 0.68, 0.14, enamel], [0, 0.66, 0, 0.52, 0.12, 0.42, enamel], [0, 0.78, -0.16, 0.04, 0.1, 0.04, 'brass']] },
  sidetable: { parts: [[0, 0.48, 0, 0.46, 0.04, 0.36, wood], ...[[-0.19, -0.14], [0.19, -0.14], [-0.19, 0.14], [0.19, 0.14]].map(([x, z]) => [x, 0, z, 0.035, 0.48, 0.035, wood]), [0, 0.52, 0, 0.04, 0.11, 0.04, linen]] },
  toolbox: { parts: [[0, 0, 0, 0.56, 0.26, 0.3, 'redPaint'], [0, 0.26, 0, 0.3, 0.03, 0.03, iron], [0, 0.08, -0.155, 0.07, 0.08, 0.02, 'brass']] },
};
// which way each piece of furniture faces (radians)
const YAW = { bed: 0, nightstand: 0, crib: 0, table: 0, bathtub: 0, sink: 0, sidetable: 0, toolbox: 0 };

export class Renderer3D {
  static supported() {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  }

  constructor(canvas, { scale = 1 } = {}) {
    this.cv = canvas;
    this.scale = scale;
    const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' }));
    this.floatFB = !!gl.getExtension('EXT_color_buffer_float');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.prog = {
      scene: this.#program(SCENE_VS, SCENE_FS),
      sprite: this.#program(SPRITE_VS, SPRITE_FS),
      glow: this.#program(SPRITE_VS, GLOW_FS),
      bright: this.#program(QUAD_VS, BRIGHT_FS),
      blur: this.#program(QUAD_VS, BLUR_FS),
      comp: this.#program(QUAD_VS, COMPOSITE_FS),
      final: this.#program(QUAD_VS, FINAL_FS),
      decal: this.#program(DECAL_VS, DECAL_FS),
      dust: this.#program(DUST_VS, DUST_FS),
    };
    // unit quad for sprites and full-screen passes
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.tex = {};
    const hd = hdTextures();
    for (const [name, t] of Object.entries(hd)) this.tex[name] = { alb: this.#texture(t.albedo, true), nrm: this.#texture(t.normal, false) };
    this.noise = this.#texture(noiseCanvas(), false);
    this.flatNormal = this.#solid([128, 128, 255, 255]);
    // floating dust: random seeds in a unit box, wrapped around the camera in the shader
    this.dustVao = gl.createVertexArray();
    gl.bindVertexArray(this.dustVao);
    const seeds = new Float32Array(500 * 3).map(() => Math.random());
    const db = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, db);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.uPos = new Float32Array(40);
    this.uCol = new Float32Array(30);
    this.dynScale = 1;
    this.frameTimes = [];
    this.lastFrame = performance.now();
    this.lastResize = 0;
    this.black = this.#solid([0, 0, 0, 0]);
    this.spriteTex = new WeakMap();
    this.time = 0;
  }

  // ── GL helpers ──
  #program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 5).join('\n'));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u: new Proxy(u, { get: (t, k) => (k in t ? t[k] : null) }) };
  }

  #texture(canvas, srgb) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }

  #solid(rgba) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
    return t;
  }

  #spriteTexture(img) {
    if (!img) return null;
    let t = this.spriteTex.get(img);
    if (t) return t;
    const gl = this.gl;
    const mk = (canvas, srgb = true) => {
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tx;
    };
    t = { alb: mk(img.canvas), glow: img.glowCanvas ? mk(img.glowCanvas) : this.black, nrm: img.normalCanvas ? mk(img.normalCanvas, false) : this.flatNormal };
    this.spriteTex.set(img, t);
    return t;
  }

  /** Furniture with a 3D model isn't drawn as a billboard. */
  handles(spriteName) { return !!MODELS[spriteName]; }

  // ═════════════ world geometry ═════════════
  setWorld(world, lights) {
    const gl = this.gl;
    this.world = world;
    this.lights = lights;
    this.batches = new Map();
    const B = (name) => {
      if (!this.batches.has(name)) this.batches.set(name, { pos: [], nor: [], uv: [], tan: [], bit: [], idx: [] });
      return this.batches.get(name);
    };
    // generic quad: centre c, normal n, right r, up u, width w, height h, uv scale
    const face = (name, c, n, r, u, w, h, us = 1, uo = [0, 0], vs = us) => {
      const b = B(name), base = b.pos.length / 3;
      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      for (const [a, bb] of corners) {
        b.pos.push(c[0] + r[0] * a * w + u[0] * bb * h, c[1] + r[1] * a * w + u[1] * bb * h, c[2] + r[2] * a * w + u[2] * bb * h);
        b.nor.push(...n); b.tan.push(...r); b.bit.push(-u[0], -u[1], -u[2]);
        b.uv.push(uo[0] + (a + 0.5) * w * us, uo[1] + (0.5 - bb) * h * vs);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    this.face = face;
    const roomName = (i) => ROOM_IDS[world.room[i] >= 0 ? world.room[i] : 3];
    const isOpen = (x, y) => world.inside(x, y) && (world.kind[world.i(x, y)] === FLOOR || world.kind[world.i(x, y)] === DOOR);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      if (!isOpen(x, y)) continue;
      const i = world.i(x, y), room = ROOM_DEFS[roomName(i)];
      const isDoor = world.kind[i] === DOOR;
      const ceilH = isDoor ? DOOR_H : WALL_H;
      // floor & ceiling (texture repeats once per tile, in world space)
      face(room.floor, [x + 0.5, 0, y + 0.5], [0, 1, 0], [1, 0, 0], [0, 0, -1], 1, 1, 1, [x, y]);
      face(room.ceil, [x + 0.5, ceilH, y + 0.5], [0, -1, 0], [1, 0, 0], [0, 0, 1], 1, 1, 1, [x, -y]);
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!world.inside(nx, ny)) continue;
        const ni = world.i(nx, ny), nk = world.kind[ni];
        const n = [-dx, 0, -dy];
        const r = [n[2], 0, -n[0]];
        const c = [x + 0.5 + dx * 0.5, WALL_H / 2, y + 0.5 + dy * 0.5];
        if (nk === WALL || nk === BLOCK) {
          const tex = nk === BLOCK ? world.blockTex[ni] : (world.override[ni] ?? room.wall);
          face(this.tex[tex] ? tex : room.wall, c, n, r, [0, 1, 0], 1, WALL_H, 1, [0, 0], 1 / WALL_H);
          if (world.override[ni]) this.overrideFaces = (this.overrideFaces ?? 0) + 1;
        } else if (isDoor || world.kind[ni] === DOOR) {
          // lintel strip above the door opening, seen from the room side
          const other = world.kind[ni] === DOOR ? world.room[i] : world.room[ni];
          if (world.kind[ni] === DOOR && !isDoor) {
            const ri = ROOM_DEFS[roomName(i)];
            face(ri.wall, [c[0], (DOOR_H + WALL_H) / 2, c[2]], n, r, [0, 1, 0], 1, WALL_H - DOOR_H, 1, [0, 0], 1 / WALL_H);
          }
          void other;
        }
      }
    }
    // furniture
    for (const o of world.objects) {
      const m = MODELS[o.sprite];
      if (!m) continue;
      let yaw = YAW[o.sprite] ?? 0;
      if (o.sprite === 'chair') {
        const t = world.objects.find((q) => q.sprite === 'table' && Math.hypot(q.x - o.x, q.y - o.y) < 2);
        yaw = t ? Math.atan2(t.x - o.x, -(t.y - o.y)) + Math.PI : 0;
      }
      for (const [px, py, pz, sx, sy, sz, mat] of m.parts) this.#box(mat, o.x, o.y, yaw, px, py, pz, sx, sy, sz);
    }
    // door casings: trim around each opening, on both sides
    for (const d of world.doors) {
      for (const side of [-1, 1]) {
        if (d.axis === 'x') {
          const z = d.y + 0.5 + side * 0.515;
          this.#box('woodDark', d.x + 0.5, z, 0, -0.47, 0, 0, 0.07, DOOR_H + 0.03, 0.035);
          this.#box('woodDark', d.x + 0.5, z, 0, 0.47, 0, 0, 0.07, DOOR_H + 0.03, 0.035);
          this.#box('woodDark', d.x + 0.5, z, 0, 0, DOOR_H, 0, 1.0, 0.09, 0.035);
        } else {
          const x = d.x + 0.5 + side * 0.515;
          this.#box('woodDark', x, d.y + 0.5, 0, 0, 0, -0.47, 0.035, DOOR_H + 0.03, 0.07);
          this.#box('woodDark', x, d.y + 0.5, 0, 0, 0, 0.47, 0.035, DOOR_H + 0.03, 0.07);
          this.#box('woodDark', x, d.y + 0.5, 0, 0, DOOR_H, 0, 0.035, 0.09, 1.0);
        }
      }
    }
    // hanging lamps: cord, socket, bulb (and a shade in the kitchen)
    for (const l of lights) {
      if (['moon', 'boiler', 'nightlight'].includes(l.id)) continue;
      const by = WALL_H - 0.3;
      this.#box('iron', l.x, l.y, 0, 0, by + 0.06, 0, 0.012, WALL_H - by - 0.06, 0.012);
      this.#box('iron', l.x, l.y, 0, 0, by + 0.03, 0, 0.04, 0.04, 0.04);
      this.#box('bulb', l.x, l.y, 0, 0, by - 0.035, 0, 0.05, 0.065, 0.05);
      if (l.id === 'kitchen') { this.#box('shade', l.x, l.y, 0, 0, by + 0.02, 0, 0.32, 0.03, 0.32); this.#box('shade', l.x, l.y, 0, 0, by + 0.05, 0, 0.18, 0.05, 0.18); }
      if (l.id === 'foyer') for (const [ax, az] of [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) this.#box('brass', l.x, l.y, 0, ax / 2, by + 0.02, az / 2, Math.abs(ax) + 0.015, 0.015, Math.abs(az) + 0.015);
    }
    // soft contact shadows under furniture
    this.shadows = world.objects.filter((o) => MODELS[o.sprite]).map((o) => {
      const xs = MODELS[o.sprite].parts.map((p) => Math.abs(p[0]) + p[3] / 2), zs = MODELS[o.sprite].parts.map((p) => Math.abs(p[2]) + p[5] / 2);
      return { x: o.x, y: o.y, w: Math.max(...xs) * 2 + 0.35, h: Math.max(...zs) * 2 + 0.35, k: 0.7 };
    });
    this.#upload();
    this.#doorMesh();
    this.#buildLightmaps();
  }

  #box(mat, ox, oz, yaw, px, py, pz, sx, sy, sz) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (x, z) => [x * c - z * s, x * s + z * c];
    const [cx, cz] = rot(px, pz);
    const C = [ox + cx, py + sy / 2, oz + cz];
    const X = [c, 0, s], Z = [-s, 0, c], Y = [0, 1, 0];
    const neg = (v) => [-v[0], -v[1], -v[2]];
    const add = (a, v, k) => [a[0] + v[0] * k, a[1] + v[1] * k, a[2] + v[2] * k];
    const us = 1.6;
    this.face(mat, add(C, X, sx / 2), X, neg(Z), Y, sz, sy, us);
    this.face(mat, add(C, X, -sx / 2), neg(X), Z, Y, sz, sy, us);
    this.face(mat, add(C, Z, sz / 2), Z, X, Y, sx, sy, us);
    this.face(mat, add(C, Z, -sz / 2), neg(Z), neg(X), Y, sx, sy, us);
    this.face(mat, add(C, Y, sy / 2), Y, X, neg(Z), sx, sz, us);
    if (py > 0.02) this.face(mat, add(C, Y, -sy / 2), neg(Y), X, Z, sx, sz, us);
  }

  #upload() {
    const gl = this.gl;
    this.draws = [];
    for (const [name, b] of this.batches) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      [[b.pos, 3], [b.nor, 3], [b.uv, 2], [b.tan, 3], [b.bit, 3]].forEach(([arr, size], loc) => {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      });
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(b.idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.draws.push({ name, vao, count: b.idx.length });
    }
  }

  #doorMesh() {
    // a door slab in local space: x 0..0.94 (hinge at 0), y 0..DOOR_H, z ±0.035
    const saved = this.batches;
    this.batches = new Map();
    const t = 0.035, w = 0.94;
    this.face('door', [w / 2, DOOR_H / 2, t], [0, 0, 1], [1, 0, 0], [0, 1, 0], w, DOOR_H, 1 / w, [0, 0], 1 / DOOR_H);
    this.face('door', [w / 2, DOOR_H / 2, -t], [0, 0, -1], [-1, 0, 0], [0, 1, 0], w, DOOR_H, 1 / w, [0, 0], 1 / DOOR_H);
    this.face('woodDark', [w, DOOR_H / 2, 0], [1, 0, 0], [0, 0, -1], [0, 1, 0], t * 2, DOOR_H);
    this.face('woodDark', [0, DOOR_H / 2, 0], [-1, 0, 0], [0, 0, 1], [0, 1, 0], t * 2, DOOR_H);
    this.face('woodDark', [w / 2, DOOR_H, 0], [0, 1, 0], [1, 0, 0], [0, 0, -1], w, t * 2);
    const keep = this.draws;
    this.#upload();
    this.doorDraws = this.draws;
    this.draws = keep;
    this.batches = saved;
  }

  #buildLightmaps() {
    const gl = this.gl, world = this.world;
    this.lw = world.w * LM; this.lh = world.h * LM;
    this.amb = new Float32Array(this.lw * this.lh * 3);
    for (let sy = 0; sy < this.lh; sy++) for (let sx = 0; sx < this.lw; sx++) {
      const ci = world.i((sx / LM) | 0, (sy / LM) | 0);
      const r = world.room[ci] >= 0 ? world.room[ci] : -1;
      const a = r >= 0 ? ROOM_DEFS[ROOM_IDS[r]].ambient : [0, 0, 0];
      const o = (sy * this.lw + sx) * 3;
      this.amb[o] = a[0] * 2.4; this.amb[o + 1] = a[1] * 2.4; this.amb[o + 2] = a[2] * 2.4;
    }
    this.lightMaps = this.lights.map((l) => {
      const m = new Float32Array(this.lw * this.lh);
      const x0 = Math.max(0, Math.floor((l.x - l.rad) * LM)), x1 = Math.min(this.lw - 1, Math.ceil((l.x + l.rad) * LM));
      const y0 = Math.max(0, Math.floor((l.y - l.rad) * LM)), y1 = Math.min(this.lh - 1, Math.ceil((l.y + l.rad) * LM));
      for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
        const wx = (sx + 0.5) / LM, wy = (sy + 0.5) / LM, d = Math.hypot(wx - l.x, wy - l.y);
        if (d > l.rad) continue;
        const k = world.kind[world.i(Math.floor(wx), Math.floor(wy))];
        if (k === WALL || k === BLOCK) continue;
        if (!world.los(l.x, l.y, wx, wy)) continue;
        m[sy * this.lw + sx] = (1 - d / l.rad) ** 1.6 * 1.6 + (d < 1 ? (1 - d) * 0.5 : 0);
      }
      return m;
    });
    this.lmData = new Uint8Array(this.lw * this.lh * 4);
    this.lmTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lmTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.lw, this.lh, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lmData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  #updateLightmap() {
    const n = this.lw * this.lh;
    this.R ??= new Float32Array(this.amb.length);
    const R = this.R;
    R.set(this.amb);
    this.lights.forEach((l, li) => {
      if (l.level < 0.03) return;
      const m = this.lightMaps[li], r = l.c[0] * l.level, g = l.c[1] * l.level, b = l.c[2] * l.level;
      for (let i = 0; i < n; i++) { const v = m[i]; if (v) { R[i * 3] += v * r; R[i * 3 + 1] += v * g; R[i * 3 + 2] += v * b; } }
    });
    const d = this.lmData;
    for (let i = 0; i < n; i++) {
      d[i * 4] = Math.min(255, (R[i * 3] / 3) * 255); d[i * 4 + 1] = Math.min(255, (R[i * 3 + 1] / 3) * 255); d[i * 4 + 2] = Math.min(255, (R[i * 3 + 2] / 3) * 255); d[i * 4 + 3] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lmTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.lw, this.lh, gl.RGBA, gl.UNSIGNED_BYTE, d);
  }

  // ═════════════ frame buffers ═════════════
  #resize() {
    const gl = this.gl;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.scale * this.dynScale;
    const w = Math.max(320, Math.round(this.cv.clientWidth * dpr)), h = Math.max(180, Math.round(this.cv.clientHeight * dpr));
    if (this.cv.width === w && this.cv.height === h && this.fb) return;
    this.cv.width = w; this.cv.height = h;
    const mkTarget = (tw, th, depth) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, this.floatFB ? gl.RGBA16F : gl.RGBA8, tw, th, 0, gl.RGBA, this.floatFB ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (depth) {
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, tw, th);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      return { tex, fb, w: tw, h: th };
    };
    this.fb = mkTarget(w, h, true);
    this.ldr = mkTarget(w, h, false);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    this.bloomA = mkTarget(bw, bh, false);
    this.bloomB = mkTarget(bw, bh, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ═════════════ frame ═════════════
  /**
   * @param cam {x, y, a, z, pitch, flash}  (same as the 2D renderer)
   * @param sprites [{img, x, y, w, h, z, alpha, glow, flip}]
   * @param fx {redness, grain, desat, aberration}
   */
  render(cam, sprites, fx = {}) {
    const gl = this.gl;
    // dynamic resolution: drop render scale if frames run long, recover when there's headroom
    const now = performance.now();
    this.frameTimes.push(now - this.lastFrame);
    this.lastFrame = now;
    if (this.frameTimes.length > 40) this.frameTimes.shift();
    if (this.frameTimes.length === 40 && now - this.lastResize > 1500) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / 40;
      const next = avg > 20 ? Math.max(0.7, this.dynScale - 0.08) : avg < 14.5 ? Math.min(1, this.dynScale + 0.05) : this.dynScale;
      if (next !== this.dynScale) { this.dynScale = next; this.lastResize = now; this.frameTimes.length = 0; }
    }
    this.#resize();
    this.#updateLightmap();
    this.time += 1 / 60;
    const W = this.cv.width, H = this.cv.height;

    // camera
    const pitch = Math.max(-1.1, Math.min(1.1, cam.pitch * 0.0065));
    const fx3 = Math.cos(cam.a) * Math.cos(pitch), fy3 = Math.sin(pitch), fz3 = Math.sin(cam.a) * Math.cos(pitch);
    const eye = [cam.x, cam.z * EYE, cam.y];
    const roll = cam.roll ?? 0;
    const rx = -Math.sin(cam.a), rz = Math.cos(cam.a);
    const view = M4.lookAt(eye, [eye[0] + fx3, eye[1] + fy3, eye[2] + fz3], [rx * Math.sin(roll), Math.cos(roll), rz * Math.sin(roll)]);
    const proj = M4.persp(((cam.fov ?? 58) * Math.PI) / 180, W / H, 0.02, 60);
    const VP = M4.mul(proj, view);
    const right = [-Math.sin(cam.a), 0, Math.cos(cam.a)];
    // the flashlight sits a little below and right of the eyes
    const fpos = [eye[0] + right[0] * 0.08, eye[1] - 0.06, eye[2] + right[2] * 0.08];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const lightU = (P) => {
      gl.uniformMatrix4fv(P.u.uVP, false, VP);
      gl.uniform3fv(P.u.uCam, eye);
      gl.uniform3fv(P.u.uFPos, fpos);
      gl.uniform3fv(P.u.uFDir, [fx3, fy3, fz3]);
      gl.uniform1f(P.u.uFlash, cam.flash ?? 0);
      gl.uniform1f(P.u.uFog, 0.075);
      gl.uniform2f(P.u.uLMSize, this.world.w, this.world.h);
      gl.uniform1f(P.u.uHaze, 0.022);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.noise);
      gl.uniform1i(P.u.uNoise, 3);
      const Ls = this.lights.slice(0, 10);
      const pos = this.uPos, col = this.uCol;
      Ls.forEach((l, i) => { pos.set([l.x, WALL_H - 0.2, l.y, l.rad], i * 4); col.set([l.c[0] * l.level, l.c[1] * l.level, l.c[2] * l.level], i * 3); });
      gl.uniform4fv(P.u.uL, pos);
      gl.uniform3fv(P.u.uLC, col);
      gl.uniform1i(P.u.uNL, Ls.length);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.lmTex);
      gl.uniform1i(P.u.uLM, 2);
    };

    // ── world ──
    const S = this.prog.scene;
    gl.useProgram(S.p);
    lightU(S);
    gl.uniform1i(S.u.uAlb, 0);
    gl.uniform1i(S.u.uNrm, 1);
    gl.uniform1f(S.u.uEmis, 1);
    gl.uniform1f(S.u.uWallH, WALL_H);
    const drawBatch = (d, model) => {
      const t = this.tex[d.name] ?? this.tex.plaster;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.alb);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.nrm);
      const m = MATERIAL[d.name] ?? [0.12, 12];
      gl.uniform2f(S.u.uMat, m[0], m[1]);
      gl.uniformMatrix4fv(S.u.uModel, false, model);
      gl.bindVertexArray(d.vao);
      gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_INT, 0);
    };
    for (const d of this.draws) drawBatch(d, M4.I);
    // doors swing on their hinges
    gl.disable(gl.CULL_FACE);
    for (const door of this.world.doors) {
      const swing = door.open * 1.65;
      const model = door.axis === 'x'
        ? M4.trsY(door.x + 0.03, 0, door.y + 0.5, swing)
        : M4.trsY(door.x + 0.5, 0, door.y + 0.03, -Math.PI / 2 - swing);
      for (const d of this.doorDraws) {
        const name = d.name === 'door' && door.kind === 'basement' ? 'doorBasement' : d.name;
        drawBatch({ ...d, name }, model);
      }
    }

    // ── contact shadows on the floor ──
    {
      const D = this.prog.decal;
      gl.useProgram(D.p);
      gl.uniformMatrix4fv(D.u.uVP, false, VP);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.quad);
      const shadow = (x, y, w, h, k) => { gl.uniform3f(D.u.uCenter, x, 0, y); gl.uniform2f(D.u.uSize, w, h); gl.uniform1f(D.u.uStrength, k); gl.drawArrays(gl.TRIANGLES, 0, 6); };
      for (const sh of this.shadows) shadow(sh.x, sh.y, sh.w, sh.h, sh.k);
      for (const sp of sprites) if (sp.img && (sp.z ?? 0) < 0.05 && (sp.alpha ?? 1) > 0.2) shadow(sp.x, sp.y, sp.w * 1.1, sp.w * 0.9, 0.55 * Math.min(1, sp.alpha ?? 1));
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // ── sprites: cut-out first, then see-through ghosts back to front ──
    const P = this.prog.sprite;
    gl.useProgram(P.p);
    lightU(P);
    gl.uniform1i(P.u.uAlb, 0);
    gl.uniform1i(P.u.uGlow, 1);
    gl.uniform1i(P.u.uSNrm, 4);
    gl.uniform3fv(P.u.uRight, right);
    gl.bindVertexArray(this.quad);
    const list = sprites.filter((s) => s.img && (s.alpha ?? 1) > 0.01)
      .map((s) => ({ s, d: (s.x - cam.x) ** 2 + (s.y - cam.y) ** 2 }))
      .sort((a, b) => b.d - a.d);
    const drawSprite = (s) => {
      const t = this.#spriteTexture(s.img);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.alb);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.glow);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t.nrm);
      gl.uniform3f(P.u.uCenter, s.x, s.z ?? 0, s.y);
      gl.uniform2f(P.u.uSize, s.w, s.h);
      gl.uniform1f(P.u.uFlip, s.flip ? 1 : 0);
      gl.uniform1f(P.u.uAlpha, Math.min(1, s.alpha ?? 1));
      gl.uniform1f(P.u.uMinLight, (s.glow ?? 0) * 0.55);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    gl.uniform1f(P.u.uCut, 0.5);
    for (const { s } of list) if ((s.alpha ?? 1) >= 0.99) drawSprite(s);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(P.u.uCut, 0.02);
    for (const { s } of list) if ((s.alpha ?? 1) < 0.99) drawSprite(s);

    // ── bulbs glow ──
    const G = this.prog.glow;
    gl.useProgram(G.p);
    gl.uniformMatrix4fv(G.u.uVP, false, VP);
    gl.uniform3fv(G.u.uRight, right);
    gl.uniform1f(G.u.uFlip, 0);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const l of this.lights) {
      if (l.id === 'moon' || l.id === 'boiler' || l.level < 0.05) continue;
      const size = l.id === 'nightlight' ? 0.18 : 0.34;
      gl.uniform3f(G.u.uCenter, l.x, l.id === 'nightlight' ? 0.12 : WALL_H - 0.16 - size / 2, l.y);
      gl.uniform2f(G.u.uSize, size, size);
      gl.uniform3f(G.u.uColor, l.c[0] * l.level, l.c[1] * l.level * 0.95, l.c[2] * l.level * 0.85);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // eyes in the dark
    for (const s of sprites) {
      if (!s.halo || (s.halo.k ?? 1) < 0.02) continue;
      const h = s.halo, k = h.k ?? 1;
      for (const sg of [-1, 1]) {
        gl.uniform3f(G.u.uCenter, s.x + right[0] * h.sep * sg, h.z - h.size / 2, s.y + right[2] * h.sep * sg);
        gl.uniform2f(G.u.uSize, h.size, h.size);
        gl.uniform3f(G.u.uColor, h.c[0] * k * 0.5, h.c[1] * k * 0.5, h.c[2] * k * 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
    const candle = this.world.objects.find((o) => o.sprite === 'sidetable');
    if (candle) {
      const fl = 0.8 + Math.sin(this.time * 23) * 0.08 + Math.sin(this.time * 7.3) * 0.1;
      gl.uniform3f(G.u.uCenter, candle.x, 0.6, candle.y);
      gl.uniform2f(G.u.uSize, 0.12, 0.12);
      gl.uniform3f(G.u.uColor, 1.0 * fl, 0.62 * fl, 0.25 * fl);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // ── dust drifting through the flashlight beam ──
    if ((cam.flash ?? 0) > 0.05) {
      const U = this.prog.dust;
      gl.useProgram(U.p);
      gl.uniformMatrix4fv(U.u.uVP, false, VP);
      gl.uniform3fv(U.u.uCam, eye);
      gl.uniform3fv(U.u.uFPos, fpos);
      gl.uniform3fv(U.u.uFDir, [fx3, fy3, fz3]);
      gl.uniform1f(U.u.uTime, this.time);
      gl.uniform1f(U.u.uFlash, cam.flash);
      gl.uniform1f(U.u.uScale, H);
      gl.bindVertexArray(this.dustVao);
      gl.drawArrays(gl.POINTS, 0, 500);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // ── bloom ──
    const Q = (prog, target, setup) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
      setup(prog.u);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    Q(this.prog.bright, this.bloomA, (u) => { bind(0, this.fb.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexel, 1 / W, 1 / H); });
    for (let i = 0; i < 2; i++) {
      Q(this.prog.blur, this.bloomB, (u) => { bind(0, this.bloomA.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1.5 / this.bloomA.w, 0); });
      Q(this.prog.blur, this.bloomA, (u) => { bind(0, this.bloomB.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 1.5 / this.bloomA.h); });
    }
    // ── composite ──
    Q(this.prog.comp, this.ldr, (u) => {
      bind(0, this.fb.tex); bind(1, this.bloomA.tex);
      gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uBloom, 1);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform1f(u.uGrain, (fx.grain ?? 10) / 255 * 0.7);
      gl.uniform1f(u.uRed, Math.min(0.8, fx.redness ?? 0));
      gl.uniform1f(u.uDesat, fx.desat ?? 0.2);
      gl.uniform1f(u.uAberr, fx.aberration ?? 0.012);
      gl.uniform1f(u.uExposure, 1.35);
      gl.uniform2f(u.uRes, W, H);
    });
    Q(this.prog.final, null, (u) => {
      bind(0, this.ldr.tex);
      gl.uniform1i(u.uTex, 0);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform1f(u.uGrain, (fx.grain ?? 10) / 255 * 0.9);
      gl.uniform1f(u.uSharp, 0.45 + (1 - this.scale * this.dynScale) * 0.9);
    });
  }
}
