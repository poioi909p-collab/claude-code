// 현실 배경: 깊은 먹색, 아주 느린 결, 튕김의 물결 (잔향)
uniform sampler2D uTrail;
uniform float uTime;
uniform float uAspect;
uniform vec2 uSize;          // CSS px
uniform vec4 uRipples[8];    // x, y (CSS px), 시작 시각, 세기
uniform vec3 uPaper;
uniform vec3 uVermilion;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec3 ink = vec3(0.043, 0.043, 0.047);
  // 비단처럼 아주 옅은 세로 결
  float silk = vnoise(vec2(p.x * 220.0, p.y * 3.0)) * 0.5 + vnoise(vec2(p.x * 60.0, p.y * 1.5 + 3.0)) * 0.5;
  float cloud = fbm3(p * 1.3 + uTime * 0.01);
  vec3 col = ink * (0.92 + 0.16 * cloud) + vec3(0.0035) * silk;

  // 물결: 튕긴 자리에서 퍼져 나가는 동심원
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float minDim = min(uSize.x, uSize.y);
  float rip = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 6.0) continue;
    vec2 dv = px - r.xy;
    float d = length(dv) * (1.0 + 0.06 * (vnoise(dv * 0.01 + r.z) - 0.5));
    float rad = age * minDim * 0.16;
    float w = minDim * (0.004 + age * 0.006);
    float ring = exp(-pow((d - rad) / w, 2.0));
    float ring2 = exp(-pow((d - rad * 0.72) / (w * 1.4), 2.0)) * 0.5;
    rip += (ring + ring2) * r.w * exp(-age * 0.75) * smoothstep(0.0, 0.15, age);
  }
  col += uPaper * rip * 0.024;

  // 잔상(트레일): 떨리는 실의 흐릿한 궤적
  vec3 tr = texture(uTrail, vUv).rgb;
  col += (1.0 - exp(-tr * 1.4)) * 0.55;
  fragColor = vec4(col, 1.0);
}
