uniform sampler2D uTexture;
uniform float uValue;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = uValue * texture(uTexture, vUv);
}
