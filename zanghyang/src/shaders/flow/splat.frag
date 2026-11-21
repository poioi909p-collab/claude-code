// 손짓을 흐름장에 새긴다. MODE 0: 획 방향, 1: 머무름의 소용돌이
uniform vec2 uA;
uniform vec2 uB;
uniform float uAspect;
uniform float uRadius;
uniform vec4 uValue;   // MODE0: flow.xy, temp, weight / MODE1: spin, -, temp, weight
uniform vec2 uCaps;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 a = vec2(uA.x * uAspect, uA.y);
  vec2 b = vec2(uB.x * uAspect, uB.y);
  vec2 ab = b - a;
  float L2 = dot(ab, ab);
  float t = L2 > 1e-12 ? clamp(dot(p - a, ab) / L2, 0.0, 1.0) : 0.0;
  vec2 rel = p - (a + ab * t);
  float d = length(rel) / uRadius;
  if (d > 2.0) discard;
  float prof = exp(-d * d * 1.8);
#if MODE == 1
  vec2 tang = vec2(-rel.y, rel.x) / max(length(rel), 1e-4);
  float ring = smoothstep(0.0, 0.5, d) * prof;
  fragColor = vec4(tang * uValue.x * ring, uValue.z * uValue.w * ring, uValue.w * ring);
#else
  fragColor = vec4(uValue.xy * prof, uValue.z * uValue.w * prof, uValue.w * prof);
#endif
}
