// 결(흐름장): 천천히 번지고 천천히 잊힌다. rg=흐름, b=색온도×세기, a=세기
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uDecay;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 c = texture(uField, vUv);
  vec4 n = texture(uField, vUv + vec2(uTexel.x, 0.0)) + texture(uField, vUv - vec2(uTexel.x, 0.0))
         + texture(uField, vUv + vec2(0.0, uTexel.y)) + texture(uField, vUv - vec2(0.0, uTexel.y));
  c = mix(c, n * 0.25, 0.22);
  fragColor = c * uDecay;
}
