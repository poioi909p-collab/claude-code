// 붓 한 마디(선분 캡슐) 스플랫 — 가산 블렌딩으로 대상 텍스처에 더한다.
// MODE 0: 젖은 먹(염료)  1: 마른 붓(종이에 바로)  2: 속도
uniform vec2 uA;
uniform vec2 uB;
uniform float uAspect;
uniform float uRadius;   // uv 높이 단위
uniform vec4 uValue;
uniform vec2 uS;         // 선분 시작/끝 누적 길이 (CSS px)
uniform vec2 uCaps;      // 시작 캡, 끝 캡
uniform float uDry;      // 0..1
uniform float uSeed;
uniform float uPx;       // uv 높이 1 = CSS px
uniform float uVerm;     // 1 이면 A 채널(주홍)에만
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 a = vec2(uA.x * uAspect, uA.y);
  vec2 b = vec2(uB.x * uAspect, uB.y);
  vec2 ab = b - a;
  float L2 = dot(ab, ab);
  float t = L2 > 1e-12 ? dot(p - a, ab) / L2 : 0.0;
#if MODE == 1
  // 마른 붓은 둥근 끝을 만들지 않는다 (털끝이 그대로 끊김)
  if (t < 0.0 || t > 1.0) discard;
#else
  if (t < 0.0 && uCaps.x < 0.5) discard;
  if (t > 1.0 && uCaps.y < 0.5) discard;
#endif
  float tc = clamp(t, 0.0, 1.0);
  vec2 c = a + ab * tc;
  vec2 rel = p - c;
  float d = length(rel) / uRadius;
  if (d > 1.7) discard;
  vec2 dir = L2 > 1e-12 ? ab * inversesqrt(L2) : vec2(1.0, 0.0);
  float u = (rel.x * dir.y - rel.y * dir.x) / uRadius;  // 획 가로 방향 -1..1
  float s = mix(uS.x, uS.y, tc);                         // 획 세로 방향 (px)

#if MODE == 2
  float prof = exp(-d * d * 1.6);
  fragColor = vec4(uValue.xy * prof, 0.0, 0.0);
#else
  // 붓털 모형: 가로(u)로는 털 뭉치와 가는 털, 세로(s)로는 먹이 닳아 끊긴다
  float rp = uRadius * uPx;                 // 반지름 px
  float hairs = clamp(rp * 0.45, 4.0, 22.0);
  float uw = u + 0.12 * (vnoise(vec2(s * 0.008, uSeed)) - 0.5);   // 털 결이 천천히 흔들림
  float clump = vnoise(vec2(uw * hairs * 0.35 + uSeed * 17.0, s * 0.0016));
  float fine = vnoise(vec2(uw * hairs * 1.6 + uSeed * 5.0, s * 0.0045 + uSeed));
  float load = clump * 0.55 + fine * 0.45;
  float skip = vnoise(vec2(uw * hairs * 0.6 + 3.0, s * 0.012));      // 종이 결에 걸려 끊기는 자리
  float th = 0.13 + 0.24 * uDry + 0.14 * uDry * abs(u) * abs(u) + 0.08 * uDry * skip;
  float hairMask = smoothstep(th - 0.06, th + 0.07, load);
  // 가장자리는 털끝처럼 들쭉날쭉
  float rag = (vnoise(vec2(s * 0.04, sign(u) * 7.0 + uSeed)) - 0.5) * 0.22 * (0.4 + uDry);
  float dr = d + rag;

  #if MODE == 0
    // 젖은 먹: 둥글고 묵직한 몸통
    float body = smoothstep(1.0, 0.62, dr);
    float prof = body * (0.78 + 0.22 * exp(-d * d * 3.0));
    prof *= mix(1.0, 0.6 + 0.4 * hairMask, 0.25 + 0.5 * uDry);
    fragColor = vec4(uValue.x * prof, uValue.x * uValue.y * prof, uValue.z * prof, 0.0);
  #else
    // 마른 붓 (갈필·비백): 경계가 또렷하고 흰 결이 갈라진다
    float body = smoothstep(1.0, 0.82, dr);
    float prof = body * hairMask * (0.85 + 0.15 * fine);
    // B 채널: 마른 붓 몫 (번짐 테두리 계산에서 제외), A 채널: 주홍
    fragColor = uVerm > 0.5 ? vec4(0.0, 0.0, 0.0, uValue.x * prof)
                            : vec4(uValue.x * prof, uValue.x * uValue.y * prof, uValue.x * prof, 0.0);
  #endif
#endif
}
