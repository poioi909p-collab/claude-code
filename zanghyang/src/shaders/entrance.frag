// 입구: 거의 검은 화면, 아주 느린 먹 안개
uniform float uTime;
uniform float uAspect;
uniform float uFade;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float t = uTime * 0.018;
  vec2 q = vec2(fbm3(p * 1.4 + vec2(t, -t)), fbm3(p * 1.4 + vec2(-t, t * 0.7) + 5.2));
  float n = fbm(p * 1.1 + q * 1.6 + t);
  vec3 ink = vec3(0.043, 0.043, 0.047);
  vec3 col = ink + vec3(0.016, 0.015, 0.014) * smoothstep(0.35, 0.85, n) * uFade;
  fragColor = vec4(col, 1.0);
}
