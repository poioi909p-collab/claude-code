// 파티클 초기 상태: xy=위치(uv), zw=속도
uniform float uSeed;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 h = hash22(gl_FragCoord.xy + uSeed);
  fragColor = vec4(h, 0.0, 0.0);
}
