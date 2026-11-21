import { NOISE } from './noise';

// One simulation step. Reads (water, wet pigment, dry pigment) and writes the
// next state into three MRT attachments. All pigment values are stored as
// optical absorbance (rgb) plus a mass channel (a) so that overlapping washes
// combine subtractively via Beer–Lambert (glazing never turns muddy-grey).
//
// Transport is conservative and flux based: every pixel computes the flux it
// exchanges with each neighbour using a formula that is antisymmetric in
// (i, j), so water and pigment are neither created nor lost.
export const SIM_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uWater;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform sampler2D uPaper;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDw;        // water diffusion
uniform float uCap;       // extra capillary pull of pigment toward thin water (edge darkening)
uniform float uDp;        // pigment diffusion inside water
uniform float uSpreadT;   // water level needed to wet dry paper
uniform float uEvap;      // base evaporation / s
uniform float uEvapEdge;  // extra evaporation at exposed edges / s
uniform float uDep;       // base deposition / s
uniform float uDepThin;   // extra deposition as the film thins / s
uniform float uGran;      // granulation strength
uniform float uLift;      // re-wetting lift of dry pigment / s
uniform float uAspect;
uniform vec3 uWash;       // (front radius, lift strength, fade strength)
uniform vec2 uWashCenter;
uniform float uWashDry;   // extra evaporation during the end of a wash
uniform float uTime;

layout(location = 0) out vec4 oWater;
layout(location = 1) out vec4 oWet;
layout(location = 2) out vec4 oDry;
${NOISE}

float condu(float wi, float wj, float pi, float pj) {
  float lo = min(wi, wj);
  float hi = max(wi, wj);
  float pm = 0.5 * (pi + pj);
  float both = smoothstep(0.003, 0.05, lo);
  float theta = uSpreadT * (0.75 + 0.7 * pm);
  float front = smoothstep(theta, theta + 0.18, hi) * (0.15 + 0.85 * (1.0 - pm));
  return max(both, front);
}

void main() {
  vec2 uv = vUv;
  vec4 W = texture(uWater, uv);
  float w = W.r;
  vec4 p = texture(uWet, uv);
  vec4 d = texture(uDry, uv);
  vec4 paper = texture(uPaper, uv);
  float h = paper.r;
  float pmI = paper.g;
  vec4 c = p / max(w, 0.02);

  float dw = 0.0;
  vec4 dp = vec4(0.0);
  float exposed = 0.0;

  vec2 offs[4] = vec2[4](vec2(uTexel.x, 0.0), vec2(-uTexel.x, 0.0), vec2(0.0, uTexel.y), vec2(0.0, -uTexel.y));
  for (int k = 0; k < 4; k++) {
    vec2 q = uv + offs[k];
    float wn = texture(uWater, q).r;
    vec4 pn = texture(uWet, q);
    float pmN = texture(uPaper, q).g;
    vec4 cn = pn / max(wn, 0.02);
    float g = condu(w, wn, pmI, pmN);
    float diff = w - wn;
    // water
    dw -= uDw * diff * g;
    // pigment carried by the water (upwind)
    float fp = uDw * diff * g;
    dp -= fp > 0.0 ? fp * c : fp * cn;
    // capillary pull toward the thinner film: the coffee-ring effect that
    // darkens the edges of a drying wash. Uses the relative difference so it
    // is weak inside a pool and strong where the film thins at the edge.
    float rel = clamp(diff / (w + wn + 0.04), -1.0, 1.0);
    float fc = uCap * rel * g * smoothstep(0.0, 0.08, max(w, wn));
    dp -= fc > 0.0 ? fc * p : fc * pn;
    // pigment diffusion inside the shared film
    float film = min(w, wn);
    float dif = uDp * film * g * (0.45 + 1.1 * 0.5 * (pmI + pmN));
    dp -= dif * (c - cn);
    exposed += 1.0 - smoothstep(0.0, 0.02, wn);
  }

  float wn = max(w + dw, 0.0);
  vec4 pnew = max(p + dp, vec4(0.0));

  // --- wash (clean the sheet with water) ---------------------------------
  if (uWash.x > 0.0) {
    vec2 wd = (uv - uWashCenter) * vec2(uAspect, 1.0);
    float wr = length(wd) + 0.18 * (fbm(uv * vec2(uAspect, 1.0) * 4.0 + uTime * 0.05) - 0.5);
    float washMask = 1.0 - smoothstep(uWash.x - 0.08, uWash.x, wr);
    wn = max(wn, washMask * 1.05);
    vec4 lifted = d * min(uWash.y * washMask * uDt, 1.0);
    d -= lifted;
    pnew += lifted;
    pnew *= 1.0 - min(uWash.z * washMask * uDt, 1.0);
  }

  // --- evaporation ---------------------------------------------------------
  float thin = 1.0 - smoothstep(0.0, 0.35, wn);
  float evap = uEvap * (0.75 + 0.5 * paper.b) * (1.0 + 1.4 * thin) + uEvapEdge * exposed * 0.25 + uWashDry;
  wn = max(wn - evap * uDt, 0.0);
  if (wn < 0.002) wn = 0.0;

  // --- re-wetting lifts a little dry pigment back into suspension ---------
  float wetNow = smoothstep(0.15, 0.6, wn);
  vec4 lift = d * min(uLift * wetNow * uDt, 1.0);
  d -= lift;
  pnew += lift;

  // --- deposition (pigment settles, faster in paper valleys) --------------
  float valley = 1.0 - h;
  float gran = 1.0 + uGran * (valley - 0.5) * 2.0;
  float rate = (uDep + uDepThin * (1.0 - smoothstep(0.0, 0.3, wn))) * max(gran, 0.05);
  float frac = wn <= 0.0 ? 1.0 : min(rate * uDt, 1.0);
  vec4 dep = pnew * frac;
  pnew -= dep;
  d += dep;

  oWater = vec4(min(wn, 1.6), 0.0, 0.0, 1.0);
  oWet = pnew;
  oDry = d;
}`;

// Copies the three state textures (used for undo snapshots).
export const COPY3_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
layout(location = 2) out vec4 oC;
void main() {
  oA = texture(uA, vUv);
  oB = texture(uB, vUv);
  oC = texture(uC, vUv);
}`;
