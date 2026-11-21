// 먹실 표시: 한지 + 마른 먹 + 젖은 먹
uniform sampler2D uPaper;
uniform sampler2D uDye;
uniform sampler2D uDried;
uniform vec2 uDyeTexel;
uniform vec3 uPaperCol;
uniform vec3 uCool;
uniform vec3 uWarm;
#ifdef POSTER
uniform sampler2D uText;
uniform vec3 uVermilion;
#endif
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 paper = texture(uPaper, vUv);
  float h = paper.g;
  // 두꺼운 곳은 살짝 따뜻하고 어둡게 — 한지의 구름무늬
  vec3 pc = uPaperCol * (0.9 + 0.17 * paper.r);
  pc *= mix(vec3(1.0), vec3(0.995, 0.982, 0.958), smoothstep(0.4, 0.8, h));
  float fiber = clamp((paper.r - 0.6) * 18.0, 0.0, 1.0);

  vec4 dr = texture(uDried, vUv);
  vec4 wt = texture(uDye, vUv);

  // 번짐이 멈춘 자리에 안료가 모인다 (테두리)
  vec2 o = uDyeTexel * 2.6;
  vec4 r1 = texture(uDried, vUv + vec2(o.x, 0.0));
  vec4 r2 = texture(uDried, vUv - vec2(o.x, 0.0));
  vec4 r3 = texture(uDried, vUv + vec2(0.0, o.y));
  vec4 r4 = texture(uDried, vUv - vec2(0.0, o.y));
  float ring = ((r1.r - r1.b) + (r2.r - r2.b) + (r3.r - r3.b) + (r4.r - r4.b)) * 0.25;
  float wetPart = dr.r - dr.b;
  float edge = clamp(wetPart - ring, 0.0, 0.6) * (1.0 - smoothstep(0.4, 1.4, wetPart)) * (1.0 - smoothstep(0.0, 0.25, dr.b));

  float pig = dr.r + wt.r * 1.15;
  float temp = (dr.g + wt.g) / max(dr.r + wt.r, 1e-3);

  // 물의 경계: 아주 옅은 먹은 종이결을 따라 끊기며 또렷한 가장자리를 만든다
  float th = 0.028 + 0.05 * (1.0 - paper.a) + 0.03 * fiber;
  float front = smoothstep(th, th + 0.045, pig);
  float body = 1.0 - exp(-pig * 1.55);
  float rim = front * (1.0 - smoothstep(th + 0.04, th + 0.3, pig));
  float dens = body * front + rim * 0.07 + edge * 0.9;
  // 담묵·중묵에서는 섬유가 먹을 덜 머금어 희게 비친다
  float mid = 1.0 - smoothstep(0.55, 0.95, dens);
  dens *= 1.0 - 0.32 * fiber * mid;
  // 안료 알갱이가 종이 골에 고인다
  dens *= 1.0 + (0.5 - h) * 0.28 * mid;
  dens = clamp(dens, 0.0, 1.0);

  vec3 inkCol = mix(uCool, uWarm, clamp(temp * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = mix(pc, inkCol, dens);
  // 젖은 종이: 약간 어둡고 차분하게
  col *= 1.0 - 0.06 * clamp(wt.b, 0.0, 1.0);
#ifdef POSTER
  // 주홍: 따뜻한 결의 실오라기
  float vm = (1.0 - exp(-dr.a * 2.2)) * (1.0 - 0.25 * fiber);
  col = mix(col, uVermilion * (0.93 + 0.1 * h), clamp(vm, 0.0, 0.92));
  // 글씨와 낙관 (캔버스) — 종이결이 비치도록
  vec4 tx = texture(uText, vUv);
  float ta = tx.a * (0.86 + 0.14 * smoothstep(0.3, 0.7, h)) * (1.0 - 0.12 * fiber);
  col = mix(col, tx.rgb, ta);
#endif
  fragColor = vec4(col, 1.0);
}
