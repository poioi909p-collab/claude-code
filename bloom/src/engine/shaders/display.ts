import { NOISE } from './noise';

// Composites the simulation onto the paper at display resolution.
// Paper is lit from the upper-left using its height map; pigment absorbance is
// turned into colour with Beer–Lambert so layers glaze transparently.
export const DISPLAY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uWater;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform sampler2D uPaper;
uniform vec2 uSimSize;
uniform vec2 uPaperTexel;
uniform vec3 uPaperColor;   // linear
uniform float uTime;
uniform float uWind;        // uv units
uniform float uHQ;          // 1 = export (smooth water too)
uniform float uAspect;
uniform float uFade;        // 0..1 extra blend toward clean paper (wash end)
out vec4 o;
${NOISE}

vec3 lin2srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Cubic B-spline in 4 bilinear taps: smooth upscaling without stair-steps.
vec4 sampleBS(sampler2D t, vec2 uv) {
  vec2 sp = uv * uSimSize - 0.5;
  vec2 i = floor(sp);
  vec2 f = sp - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (w1 / g0 - 0.5 + i) / uSimSize;
  vec2 h1 = (w3 / g1 + 1.5 + i) / uSimSize;
  return g0.y * (g0.x * texture(t, vec2(h0.x, h0.y)) + g1.x * texture(t, vec2(h1.x, h0.y)))
       + g1.y * (g0.x * texture(t, vec2(h0.x, h1.y)) + g1.x * texture(t, vec2(h1.x, h1.y)));
}

vec4 S(sampler2D t, vec2 uv) {
  return sampleBS(t, uv);
}

void main() {
  vec2 uv = vUv;
  float w = uHQ > 0.5 ? S(uWater, uv).r : texture(uWater, uv).r;
  float wetF = smoothstep(0.02, 0.45, w);

  // A breath of wind: only the still-wet paint sways.
  vec2 wind = vec2(0.0);
  if (uWind > 0.0) {
    float t = uTime;
    vec2 a = uv * vec2(uAspect, 1.0);
    wind = uWind * vec2(
      sin(t * 1.3 + a.y * 5.0 + 1.7 * sin(t * 0.37 + a.x * 2.0)),
      0.6 * sin(t * 0.9 + a.x * 4.0 + 1.3)
    ) * smoothstep(0.08, 0.7, w);
  }
  vec4 wet = S(uWet, uv + wind);
  vec4 dry = S(uDry, uv);

  vec4 pp = texture(uPaper, uv);
  float h = pp.r;
  float hx = texture(uPaper, uv + vec2(uPaperTexel.x, 0.0)).r - texture(uPaper, uv - vec2(uPaperTexel.x, 0.0)).r;
  float hy = texture(uPaper, uv + vec2(0.0, uPaperTexel.y)).r - texture(uPaper, uv - vec2(0.0, uPaperTexel.y)).r;
  vec3 n = normalize(vec3(-hx * 1.6, -hy * 1.6, 1.0));
  vec3 Ldir = normalize(vec3(-0.55, 0.65, 0.9));
  float lambert = dot(n, Ldir);
  float shade = 1.0 + 0.09 * (lambert - Ldir.z);

  // Granulation: pigment collects in the valleys of the paper.
  float valley = 0.35 * (1.0 - h) + 0.65 * (1.0 - pp.a);
  float dryMass = dry.a;
  float granAmt = 0.3 * smoothstep(0.02, 0.6, dryMass);
  vec3 Ad = dry.rgb * max(1.0 + granAmt * (valley - 0.5) * 2.4, 0.2);
  vec3 Aw = wet.rgb * 1.2;
  vec3 A = Ad + Aw;
  A = A / (1.0 + 0.09 * A);
  A *= 1.0 - uFade;

  vec3 paper = uPaperColor * (0.975 + 0.05 * pp.b) * (1.0 - 0.02 * (pp.a - 0.5));
  vec3 col = paper * exp(-A) * shade;

  // Wet paper reads a touch darker, with a faint sheen.
  col *= 1.0 - 0.075 * wetF;
  vec3 H = normalize(Ldir + vec3(0.0, 0.0, 1.0));
  col += wetF * 0.035 * pow(max(dot(n, H), 0.0), 24.0);

  // Soft vignette, slightly warm.
  vec2 vc = (uv - 0.5) * vec2(uAspect, 1.0) / max(uAspect, 1.0);
  float vig = smoothstep(0.35, 0.95, length(vc) * 1.25);
  col *= mix(vec3(1.0), vec3(0.93, 0.915, 0.9), vig);

  vec3 s = lin2srgb(max(col, 0.0));
  s += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  o = vec4(s, 1.0);
}`;
