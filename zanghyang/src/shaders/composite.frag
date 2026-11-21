// 최종 합성: 전시실 전환(먹이 스며드는 디졸브) + 필름 그레인 + 비네트
uniform sampler2D tCur;
uniform sampler2D tPrev;
uniform float uProgress;
uniform float uMode;      // 0: 없음, 1: 먹 스밈, 2: 크로스페이드(동작 줄이기)
uniform float uTime;
uniform float uGrain;
uniform float uGrainSpeed;
uniform float uAspect;
uniform float uDpr;
uniform float uVignette;
uniform vec2 uOrigin;
uniform float uSeed;
in vec2 vUv;
out vec4 fragColor;

const vec3 INK = vec3(0.043, 0.043, 0.047);

// 섬유처럼 가늘고 긴 결
float fibers(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.1 + uSeed;
    vec2 q = rot2(a) * p;
    float n = vnoise(vec2(q.x * 3.0, q.y * 46.0) + float(i) * 11.3);
    f += pow(1.0 - abs(n * 2.0 - 1.0), 6.0);
  }
  return f / 3.0;
}

void main() {
  vec3 cur = texture(tCur, vUv).rgb;
  vec3 col = cur;

  if (uMode > 1.5) {
    col = mix(texture(tPrev, vUv).rgb, cur, smoothstep(0.0, 1.0, uProgress));
  } else if (uMode > 0.5) {
    vec3 prev = texture(tPrev, vUv).rgb;
    vec2 ap = vec2(vUv.x * uAspect, vUv.y);
    vec2 d = (vUv - uOrigin) * vec2(uAspect, 1.0);
    float maxD = length(vec2(max(uOrigin.x, 1.0 - uOrigin.x) * uAspect, max(uOrigin.y, 1.0 - uOrigin.y)));
    float r = length(d) / maxD;
    // 큰 덩어리의 일그러짐 + 모세관처럼 뻗는 섬유 결
    float lobes = fbm(ap * 2.1 + uSeed * 3.0);
    float ang = atan(d.y, d.x);
    float petals = vnoise(vec2(ang * 2.2 + uSeed, r * 1.5)) - 0.5;
    float fib = fibers(ap * 1.4);
    float field = r * (0.78 + 0.55 * lobes) + 0.16 * petals - 0.07 * fib;

    float p = uProgress;
    float inkFront = p * 1.75;
    float revealFront = max(0.0, (p - 0.3) / 0.7) * 1.8;

    // 앞선 먹: 경계에서 젖은 듯 어두워지며 번진다
    float ink = smoothstep(inkFront + 0.02, inkFront - 0.09, field);
    float wick = smoothstep(inkFront + 0.12, inkFront, field) * (1.0 - ink);
    vec3 wash = INK * (0.75 + 0.6 * fbm(ap * 5.0 + 1.3));
    vec3 a = prev * (1.0 - 0.35 * wick);
    a = mix(a, wash, ink);

    // 뒤따르는 드러남: 먹이 물러가며 새 전시실이 나타난다 (가장자리에 옅은 얼룩)
    float edge = revealFront - field;
    float reveal = smoothstep(-0.015, 0.075, edge + 0.02 * fib);
    float stain = smoothstep(0.0, 0.03, edge) * (1.0 - smoothstep(0.03, 0.24, edge));
    vec3 b = mix(cur, cur * mix(vec3(1.0), INK * 6.0, 0.35), stain * 0.45);
    col = mix(a, b, reveal);
  }

  // 비네트 (아주 약하게)
  vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0) / max(uAspect, 1.0);
  col *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(vc, vc) * 2.0);

  // 필름 그레인: CSS 픽셀 단위의 부드러운 알갱이, 중간 밝기에서 가장 강하게
  vec2 gp = gl_FragCoord.xy / max(uDpr * 0.85, 1.0);
  float ft = floor(uTime * uGrainSpeed);
  vec2 off = vec2(hash12(vec2(ft, 1.7)), hash12(vec2(ft, 9.1))) * 512.0;
  float g = vnoise(gp + off) + vnoise(gp * 1.7 - off) - 1.0;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float amt = uGrain * (0.45 + 0.55 * (1.0 - abs(lum * 2.0 - 1.0)));
  col += g * amt;
  // 디더 (밴딩 방지)
  col += (hash12(gl_FragCoord.xy + ft) - 0.5) / 255.0;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
