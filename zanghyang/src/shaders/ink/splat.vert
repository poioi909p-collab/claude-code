precision highp float;
in vec2 position;
uniform vec4 uBox; // minx, miny, maxx, maxy (uv)
out vec2 vUv;
void main() {
  vUv = mix(uBox.xy, uBox.zw, position);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}
