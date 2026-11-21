// 곱셈 블렌딩으로 서서히 옅어지는 잔향
uniform float uFactor;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = vec4(uFactor);
}
