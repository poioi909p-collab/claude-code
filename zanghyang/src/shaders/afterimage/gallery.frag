// 잔상실: 어두운 벽에 걸린 한 장
uniform sampler2D uPoster;
uniform vec4 uRect;      // 화면 uv (y 위쪽) x0,y0,x1,y1
uniform vec2 uStep;      // 포스터 uv 단위의 화면 1px
uniform float uAspect;
uniform float uTime;
uniform float uShow;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 ap = vec2(vUv.x * uAspect, vUv.y);
  vec3 col = vec3(0.043, 0.043, 0.047) * (0.92 + 0.14 * fbm3(ap * 1.1 + uTime * 0.004));
  vec2 c = (uRect.xy + uRect.zw) * 0.5;
  vec2 hs = (uRect.zw - uRect.xy) * 0.5;
  vec2 q = abs(vUv - c) - hs;
  q.x *= uAspect;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  // 작품을 비추는 은은한 빛
  col += vec3(0.05, 0.047, 0.043) * exp(-max(d, 0.0) * 7.0) * uShow;
  col *= 1.0 - 0.45 * exp(-max(d, 0.0) * 90.0) * step(0.0, d) * uShow; // 종이 바로 바깥의 그림자
  if (d < 0.0) {
    vec2 uv = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
    vec2 s = uStep * 0.5;
    vec3 p = texture(uPoster, uv + vec2(-s.x, -s.y) * 0.5).rgb + texture(uPoster, uv + vec2(s.x, -s.y) * 0.5).rgb
           + texture(uPoster, uv + vec2(-s.x, s.y) * 0.5).rgb + texture(uPoster, uv + vec2(s.x, s.y) * 0.5).rgb;
    p *= 0.25;
    col = mix(col, p, uShow);
  }
  fragColor = vec4(col, 1.0);
}
