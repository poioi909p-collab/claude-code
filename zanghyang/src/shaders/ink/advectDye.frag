// 젖은 먹 이류 + 섬유 방향 번짐(이방성 확산) + 종이 흡수
// R=안료, G=안료×색온도, B=물기
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform sampler2D uPaper;
uniform vec2 uSimTexel;
uniform vec2 uDyeTexel;
uniform float dt;
uniform float uAbsorb;
uniform float uDiffuse;
uniform float uWaterDecay;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - dt * vel * uSimTexel;
  vec4 paper = texture(uPaper, vUv);
  float ang = paper.b * 3.14159265;
  vec2 fd = vec2(cos(ang), sin(ang));
  vec4 c = texture(uSource, coord);
  float water = clamp(c.b, 0.0, 1.0);
  // 섬유를 따라 길게, 가로질러 짧게
  vec2 o1 = fd * uDyeTexel * (1.6 + 1.6 * paper.a);
  vec2 o2 = vec2(-fd.y, fd.x) * uDyeTexel * 0.9;
  vec4 n = texture(uSource, coord + o1) + texture(uSource, coord - o1)
         + texture(uSource, coord + o2) + texture(uSource, coord - o2);
  float D = clamp(uDiffuse * dt * water * (0.55 + 0.45 * paper.a), 0.0, 0.9);
  c = mix(c, n * 0.25, D);
  float k = uAbsorb * (0.5 + 0.9 * paper.a) * (1.15 - 0.6 * water) * dt;
  c.rg *= max(0.0, 1.0 - k);
  c.b *= exp(-uWaterDecay * dt);
  c.r = clamp(c.r, 0.0, 6.0);
  c.b = clamp(c.b, 0.0, 2.0);
  fragColor = c;
}
