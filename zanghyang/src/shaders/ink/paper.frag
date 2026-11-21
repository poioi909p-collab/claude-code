// 한지 생성 (리사이즈 시 1회): R=밝기, G=높이(두께·결), B=섬유 방향(0..1 → 0..π), A=흡수도
uniform vec2 uSize;   // CSS px
uniform float uSeed;
in vec2 vUv;
out vec4 fragColor;

float ridge(float n, float sharp) {
  return pow(max(0.0, 1.0 - abs(n * 2.0 - 1.0)), sharp);
}

void main() {
  vec2 p = vUv * uSize;          // CSS 픽셀 좌표 — 기기 밀도와 무관한 섬유 굵기
  vec2 s = vec2(uSeed, uSeed * 1.7);

  // 닥섬유: 짧고 가늘게 휘어진 결이 여러 방향으로 얽힌다
  float fib = 0.0;
  float best = 0.0;
  float bestAng = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float ang = hash12(vec2(fi, uSeed)) * 3.14159;
    vec2 q = rot2(ang) * p;
    // 큰 휘어짐 + 잔물결
    q += 26.0 * vec2(fbm3(p * 0.004 + s + fi), fbm3(p * 0.004 - s + fi * 3.1));
    q += 5.0 * vec2(vnoise(p * 0.03 + fi * 7.0), vnoise(p * 0.03 - fi * 5.0));
    float sc = 0.75 + 0.5 * hash12(vec2(fi, 7.0));
    float n = vnoise(vec2(q.x * 0.011 * sc, q.y * 0.075 * sc) + fi * 13.7);
    float r = ridge(n, 9.0);
    float seg = smoothstep(0.5, 0.8, vnoise(q * vec2(0.008, 0.03) + fi * 5.3 + s));
    float f = r * seg;
    fib += f * (0.45 + 0.55 * hash12(vec2(fi, 3.0)));
    if (f > best) { best = f; bestAng = ang; }
  }
  fib = clamp(fib, 0.0, 1.2);

  // 드문 굵은 섬유 다발 (반투명)
  float bundle = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 q = rot2(hash12(vec2(fi, 31.0 + uSeed)) * 3.14159) * p;
    q += 40.0 * vec2(fbm3(p * 0.003 + fi + 20.0), fbm3(p * 0.003 - fi - 20.0));
    float n = vnoise(vec2(q.x * 0.006, q.y * 0.03) + fi * 9.0 + 40.0);
    bundle += ridge(n, 5.0) * smoothstep(0.62, 0.9, vnoise(q * vec2(0.004, 0.012) + fi + 9.0));
  }
  bundle = clamp(bundle, 0.0, 1.0);

  // 구름무늬: 펄프 두께의 불균일 (지합)
  float cloud = fbm(p * 0.0026 + s * 2.0);
  float cloudFine = fbm3(p * 0.014 + s);
  float thick = cloud * 0.65 + cloudFine * 0.35;

  // 아주 고운 표면 알갱이
  float grainF = vnoise(p * 0.8 + s) * 0.55 + vnoise(p * 2.1 - s) * 0.45;

  // 드문 티끌 (껍질 조각)
  float speck = smoothstep(0.9, 0.97, vnoise(p * 0.12 + s * 4.0)) * smoothstep(0.72, 0.92, vnoise(p * 0.013 + 3.0));

  float lum = 0.6;
  lum += (thick - 0.5) * -0.2;
  lum += fib * 0.042 + bundle * 0.05;
  lum += (grainF - 0.5) * 0.045;
  lum -= speck * 0.28;

  float height = clamp(0.5 + (thick - 0.5) * 0.7 + fib * 0.22 + bundle * 0.25 + (grainF - 0.5) * 0.25, 0.0, 1.0);

  float flowAng = fbm3(p * 0.002 + 11.0) * 6.2831;
  float ang = mix(mod(flowAng, 3.14159), bestAng, smoothstep(0.05, 0.35, best));

  float absorb = clamp(0.3 + (1.0 - thick) * 0.6 + fib * 0.05, 0.0, 1.0);

  fragColor = vec4(clamp(lum, 0.0, 1.0), height, ang / 3.14159, absorb);
}
