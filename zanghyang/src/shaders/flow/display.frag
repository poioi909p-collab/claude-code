// 흐름실 표시: 먹색 바탕 위로 오래 노출된 빛의 결
uniform sampler2D uTrail;
uniform vec3 uPaper;
uniform float uAspect;
uniform float uTime;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 ink = vec3(0.043, 0.043, 0.047);
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  ink *= 0.9 + 0.2 * fbm3(p * 1.2 + uTime * 0.006);
  vec3 tr = texture(uTrail, vUv).rgb;
  vec3 light = (1.0 - exp(-tr * 1.1)) * uPaper;
  fragColor = vec4(ink + light, 1.0);
}
