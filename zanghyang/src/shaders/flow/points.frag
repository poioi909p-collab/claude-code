in vec3 vColor;
in float vAlpha;
out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = smoothstep(1.0, 0.2, dot(q, q));
  fragColor = vec4(vColor * vAlpha * a, 1.0);
}
