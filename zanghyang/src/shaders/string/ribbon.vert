precision highp float;
in vec2 position;   // CSS px
in vec4 aux;        // side(-1..1), alpha, flash, temp
uniform vec2 uSize;
out vec4 vAux;
void main() {
  vAux = aux;
  vec2 c = position / uSize;
  gl_Position = vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0);
}
