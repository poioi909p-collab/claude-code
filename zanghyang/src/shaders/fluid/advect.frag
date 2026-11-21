// 속도장 자기 이류 + 소산
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float dt;
uniform float uDissipation;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * uTexel;
  vec2 v = texture(uVelocity, coord).xy / (1.0 + uDissipation * dt);
  fragColor = vec4(v, 0.0, 1.0);
}
