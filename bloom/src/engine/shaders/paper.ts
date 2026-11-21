import { NOISE } from './noise';

// Procedural cold-press watercolour paper.
// r: surface height (0 = valley, 1 = peak)
// g: local permeability / sizing variation
// b: large-scale cloudiness
// a: fine tooth (granulation)
export const PAPER_FS = /* glsl */ `#version 300 es
precision highp float;
uniform float uPxPerCss;
uniform vec2 uSeed;
out vec4 o;
${NOISE}
void main() {
  vec2 p = gl_FragCoord.xy / uPxPerCss + uSeed;

  // Cold press: irregular rounded bumps a few pixels wide.
  vec2 q = p + 3.0 * vec2(fbm2(p * 0.06), fbm2(p * 0.06 + 5.2));
  float c1 = worley(q / 7.5);
  float c2 = worley(q / 3.6 + 11.0);
  float bumps = 1.0 - smoothstep(0.05, 0.95, c1);
  float small = 1.0 - smoothstep(0.0, 0.9, c2);

  // Felt fibres: short anisotropic streaks in random directions.
  float a1 = vnoise(p * 0.02) * 6.283;
  mat2 R = mat2(cos(a1), -sin(a1), sin(a1), cos(a1));
  vec2 fp = R * p;
  float fibre = vnoise(vec2(fp.x * 0.09, fp.y * 1.1));
  float grain = vnoise(p * 1.4);

  float h = 0.48 * bumps + 0.24 * small + 0.16 * fibre + 0.12 * grain;
  h = clamp((h - 0.18) / 0.7, 0.0, 1.0);

  float perm = fbm(p * 0.045 + 31.0);
  float cloud = fbm(p * 0.0045 + 7.0);
  // fine tooth for granulation: pigment specks settle in these pits
  float tooth = 0.55 * vnoise(p * 0.85) + 0.3 * vnoise(p * 1.9 + 4.0) + 0.15 * (1.0 - c2);
  o = vec4(h, perm, cloud, tooth);
}`;
