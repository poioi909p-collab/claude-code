import { NOISE } from './noise';

// Instanced "brush" stamps. Each instance paints water + pigment into the
// simulation with additive blending. Shapes are signed-distance-ish fields
// with noisy edges so that nothing ever looks like a vector graphic.
//
// Instance layout (5 x vec4):
//  a0: x, y, angle, type          (css px, radians)
//  a1: len, wid, k, e             (size; profile skew; roundness exponent)
//  a2: absR, absG, absB, amount   (pigment absorbance, concentration)
//  a3: water, seed, rim, grad
//  a4: ruffle, notch/vein, bend, soft
//
// Types: 0 dab (ellipse), 1 petal, 2 leaf, 3 arc (rose crescent)

export const STAMP_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 a0;
layout(location = 2) in vec4 a1;
layout(location = 3) in vec4 a2;
layout(location = 4) in vec4 a3;
layout(location = 5) in vec4 a4;
uniform vec2 uCss;
uniform float uMinSoft;
out vec2 vLocal;
out vec2 vWorld;
flat out vec4 v0;
flat out vec4 v1;
flat out vec4 v2;
flat out vec4 v3;
flat out vec4 v4;
void main() {
  float type = a0.w;
  float len = a1.x, wid = a1.y;
  float pad = max(a4.w, uMinSoft) + 3.0;
  vec2 lo, hi;
  if (type < 0.5) {
    float r = 1.0 + a4.x * 0.6;
    lo = -vec2(len, wid) * r - pad;
    hi = vec2(len, wid) * r + pad;
  } else if (type < 2.5) {
    float side = wid * (0.5 + a4.x) + abs(a4.z) * len;
    lo = vec2(-pad - 0.05 * len, -side - pad);
    hi = vec2(len * (1.0 + a4.x * 0.4) + pad, side + pad);
  } else {
    float R = len * (1.0 + a4.x) + wid + pad;
    lo = vec2(-R);
    hi = vec2(R);
  }
  vec2 L = mix(lo, hi, aCorner);
  float ca = cos(a0.z), sa = sin(a0.z);
  vec2 world = a0.xy + vec2(ca * L.x - sa * L.y, sa * L.x + ca * L.y);
  vLocal = L;
  vWorld = world;
  v0 = a0; v1 = a1; v2 = a2; v3 = a3; v4 = vec4(a4.xyz, max(a4.w, uMinSoft));
  gl_Position = vec4(world.x / uCss.x * 2.0 - 1.0, 1.0 - world.y / uCss.y * 2.0, 0.0, 1.0);
}`;

export const STAMP_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vWorld;
flat in vec4 v0;
flat in vec4 v1;
flat in vec4 v2;
flat in vec4 v3;
flat in vec4 v4;
layout(location = 0) out vec4 oWater;
layout(location = 1) out vec4 oPig;
${NOISE}

const float PI = 3.14159265;

float halfWidth(float u, float wid, float k, float e) {
  float uc = clamp(u, 0.0, 1.0);
  return 0.5 * wid * pow(max(sin(PI * pow(uc, k)), 0.0), e);
}

void main() {
  float type = v0.w;
  float len = v1.x, wid = v1.y, k = v1.z, e = v1.w;
  float seed = v3.y;
  float ruffle = v4.x, notch = v4.y, bend = v4.z, soft = max(v4.w, 0.6);
  vec2 L = vLocal;
  float d;            // signed distance-ish (css px), negative inside
  float u = 0.5;      // parameter along shape for gradients
  float veinMul = 1.0;
  float size = min(len, wid);

  if (type < 0.5) {
    // ellipse dab, ragged with world-space noise so neighbouring dabs agree
    vec2 q = L / vec2(len, wid);
    float r = length(q);
    float n = fbm(vWorld / max(size * 1.1, 2.0) + seed * 0.0) - 0.5;
    d = (r - 1.0 - ruffle * n) * size;
    u = r;
  } else if (type < 2.5) {
    float y = L.y;
    float x = L.x;
    float un = x / len;
    y -= bend * len * un * un;
    float side = y > 0.0 ? 0.0 : 13.7;
    float rn = vnoise(vec2(un * 4.5 + side, seed * 3.1)) - 0.5;
    float yn = y / max(wid, 1.0);
    float tipN = vnoise(vec2(yn * 5.0, seed * 5.7)) - 0.5;
    float lenEff = len * (1.0 + ruffle * 0.5 * tipN);
    if (type < 1.5) {
      // petal notch at the tip
      lenEff *= 1.0 - notch * (1.0 - smoothstep(0.0, 0.2, abs(yn)));
    }
    u = x / lenEff;
    float hw = halfWidth(u, wid, k, e) * (1.0 + ruffle * 1.6 * rn);
    float hw2 = halfWidth(u + 0.01, wid, k, e) * (1.0 + ruffle * 1.6 * rn);
    float slope = (hw2 - hw) / (0.01 * lenEff);
    d = (abs(y) - hw) / sqrt(1.0 + slope * slope);
    if (u < 0.0) d = max(d, -x);
    if (u > 1.0) d = max(d, x - lenEff);
    if (type > 1.5 && notch > 0.0) {
      // lighter midrib on leaves
      float mid = 1.0 - smoothstep(0.3, 1.1 + 0.03 * wid, abs(y));
      veinMul = 1.0 - notch * mid * smoothstep(0.02, 0.2, u) * (1.0 - smoothstep(0.75, 0.95, u));
    }
  } else {
    // crescent arc around (x, y): radius len, thickness wid, half-span k
    float r = length(L);
    float ang = atan(L.y, L.x);
    float t = ang / max(k, 0.05);
    float rn = vnoise(vec2(ang * 2.2 + seed, seed * 1.3)) - 0.5;
    float R = len * (1.0 + ruffle * rn);
    float hw = 0.5 * wid * pow(max(1.0 - t * t, 0.0), e);
    d = abs(r - R) - hw;
    // let the outer edge of the arc be slightly fuller than the inner edge
    if (r > R) d -= 0.15 * hw;
    u = clamp((r - R) / max(wid, 1.0) + 0.5, 0.0, 1.0);
  }

  // Small world-space irregularity on every edge.
  float edgeAmp = min(0.5 + 0.035 * size, 2.2);
  d += (fbm(vWorld * 0.07 + seed * 7.3) - 0.5) * 2.0 * edgeAmp + (vnoise(vWorld * 0.3) - 0.5) * 0.5;

  float cov = 1.0 - smoothstep(-soft, soft * 0.35, d);
  if (cov <= 0.0) discard;

  float rimW = max(2.5, 0.12 * size);
  float rimF;
  if (v3.z >= 0.0) {
    rimF = 1.0 + v3.z * smoothstep(-rimW, 0.0, d);
  } else {
    // outline mode: a dried, darker edge just inside the silhouette,
    // fading toward the petal base so overlaps stay clean
    float band = smoothstep(-rimW * 1.1, -rimW * 0.25, d);
    float tipward = type > 0.5 && type < 2.5 ? smoothstep(0.12, 0.55, u) : 1.0;
    rimF = -v3.z * band * tipward;
  }
  float grad = v3.w;
  float gradMul = max(1.0 + grad * (clamp(u, 0.0, 1.0) - 0.5) * 1.6, 0.15);
  float body = 0.72 + 0.56 * fbm(vWorld * 0.035 + seed * 3.0);

  float amt = v2.w * cov * rimF * gradMul * body * veinMul;
  float water = v3.x * cov * (0.8 + 0.4 * fbm2(vWorld * 0.05 + seed));
  oWater = vec4(water, 0.0, 0.0, 0.0);
  oPig = vec4(v2.rgb * amt, amt);
}`;
