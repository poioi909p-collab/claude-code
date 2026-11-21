// 현: 미색 실, 튕긴 자리만 주홍으로 잠깐 달아오른다
uniform vec3 uPaper;
uniform vec3 uVermilion;
uniform float uGain;
uniform float uAA;   // 가장자리 부드러움 (side 단위)
in vec4 vAux;
out vec4 fragColor;
void main() {
  float side = abs(vAux.x);
  float a = 1.0 - smoothstep(1.0 - uAA, 1.0, side);
  vec3 cool = uPaper * vec3(0.93, 0.97, 1.03);
  vec3 warm = uPaper * vec3(1.03, 0.985, 0.93);
  vec3 base = mix(cool, warm, clamp(vAux.w * 0.5 + 0.5, 0.0, 1.0));
  float f = clamp(vAux.z * 1.25, 0.0, 1.0);
  vec3 col = mix(base, uVermilion * 1.15, f);
  fragColor = vec4(col * uGain, a * clamp(vAux.y + f * 0.5, 0.0, 1.0));
}
