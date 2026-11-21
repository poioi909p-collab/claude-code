// 종이가 젖은 먹을 머금는다 (가산 블렌딩으로 마른 층에 더함)
uniform sampler2D uDye;
uniform sampler2D uPaper;
uniform float dt;
uniform float uAbsorb;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 c = texture(uDye, vUv);
  vec4 paper = texture(uPaper, vUv);
  float water = clamp(c.b, 0.0, 1.0);
  float k = uAbsorb * (0.5 + 0.9 * paper.a) * (1.15 - 0.6 * water) * dt;
  fragColor = vec4(c.rg * k, 0.0, 0.0);
}
