precision highp float;
precision highp sampler2D;
uniform sampler2D uState;
uniform sampler2D uField;
uniform ivec2 uTex;
uniform float uSize;
uniform float uBright;
uniform float uDt60;
out vec3 vColor;
out float vAlpha;
uniform vec3 uCool;
uniform vec3 uWarm;
void main() {
  int id = gl_VertexID;
  ivec2 c = ivec2(id % uTex.x, id / uTex.x);
  vec4 s = texelFetch(uState, c, 0);
  vec4 f = texture(uField, s.xy);
  float sp = length(s.zw);
  float warm = clamp(f.z / max(f.w, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  float wk = smoothstep(0.55, 1.0, warm) * smoothstep(0.05, 0.4, f.w);
  float ck = smoothstep(0.45, 0.0, warm) * smoothstep(0.05, 0.4, f.w);
  vec3 col = mix(vec3(1.0), uCool, ck * 0.6);
  col = mix(col, uWarm, wk * 0.85);
  // 개체마다 밝기가 조금씩 다르게
  float rnd = fract(sin(float(id) * 12.9898) * 43758.5453);
  vColor = col;
  vAlpha = uDt60 * uBright * (0.3 + 2.2 * smoothstep(0.0, 0.5, sp)) * (0.55 + 0.9 * rnd);
  gl_PointSize = uSize * (0.8 + 0.5 * rnd);
  gl_Position = vec4(s.xy * 2.0 - 1.0, 0.0, 1.0);
}
