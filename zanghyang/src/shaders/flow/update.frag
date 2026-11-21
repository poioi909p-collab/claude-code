// 파티클 갱신: 결을 따라 흐른다 + 아주 느린 컬 노이즈 + 기울기(중력)
uniform sampler2D uState;
uniform sampler2D uField;
uniform float dt;
uniform float uTime;
uniform float uAspect;
uniform vec2 uGravity;
uniform float uFrame;
uniform float uMotion;
in vec2 vUv;
out vec4 fragColor;

vec2 curlNoise(vec2 p) {
  float e = 0.08;
  float n1 = fbm3(p + vec2(0.0, e));
  float n2 = fbm3(p - vec2(0.0, e));
  float n3 = fbm3(p + vec2(e, 0.0));
  float n4 = fbm3(p - vec2(e, 0.0));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}

void main() {
  vec4 s = texture(uState, vUv);
  vec2 pos = s.xy;
  vec2 vel = s.zw;
  vec4 f = texture(uField, pos);
  vec2 ap = vec2(pos.x * uAspect, pos.y);
  float t = uTime * 0.035;
  vec2 drift = curlNoise(ap * 1.6 + vec2(t, -t * 0.7)) * 0.022;
  // 결이 강한 곳일수록 결에 단단히 붙는다
  float strength = clamp(f.a, 0.0, 1.0);
  vec2 target = f.xy + drift * (1.0 - 0.6 * strength) + uGravity * 0.11;
  float steer = 1.0 - exp(-dt * (2.2 + 6.0 * strength));
  vel = mix(vel, target, steer);
  float sp = length(vel);
  if (sp > 1.2) vel *= 1.2 / sp;
  pos += vel * uMotion * dt * vec2(1.0 / uAspect, 1.0);
  // 가장자리를 넘으면 반대편으로
  pos = fract(pos + 1.0);
  // 조용한 재탄생: 같은 자리에만 고이지 않도록
  float h = hash13(vec3(gl_FragCoord.xy, uFrame));
  if (h < dt * 0.05) {
    pos = hash22(gl_FragCoord.xy + uFrame * 1.37);
    vel = vec2(0.0);
  }
  fragColor = vec4(pos, vel);
}
