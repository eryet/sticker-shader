/*
 * renderer.js — WebGL2 sticker renderer.
 *
 * Draws die-cut stickers (image + white border) as tilted quads with a
 * holographic foil material: rainbow interference bands driven by the view
 * angle, metallic tint, glitter facets, paper grain, a bevelled rim, specular
 * highlight and a soft drop shadow. A second "full image" layer is used while
 * a sticker is being cut out: it shows the whole photo and dissolves the
 * background inward with an iridescent front once the mask is known.
 *
 * Every material parameter is a uniform so knob changes are free; only the
 * cutout itself is rebuilt on the CPU. Textures are created per sticker.
 */
window.StickerRenderer = (() => {
  'use strict';

  const VERT = `#version 300 es
  precision highp float;
  in vec2 aPos;
  uniform mat3 uRot;
  uniform vec2 uSize;
  uniform vec2 uOffset;
  uniform vec3 uCenter;
  uniform vec2 uStage;
  uniform float uCamDist;
  out vec2 vUv; out vec3 vPos; out vec3 vN; out vec3 vT; out vec3 vB;
  void main() {
    vec3 local = vec3(aPos * uSize + uOffset, 0.0);
    vec3 p = uRot * local + uCenter;
    vN = uRot * vec3(0.0, 0.0, 1.0);
    vT = uRot * vec3(1.0, 0.0, 0.0);
    vB = uRot * vec3(0.0, 1.0, 0.0);
    vPos = p;
    vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y);
    float wv = (uCamDist - p.z) / uCamDist;
    gl_Position = vec4(p.xy / (uStage * 0.5), 0.0, wv);
  }`;

  const FRAG = `#version 300 es
  precision highp float;
  in vec2 vUv; in vec3 vPos; in vec3 vN; in vec3 vT; in vec3 vB;
  out vec4 fragColor;

  uniform sampler2D uImage;
  uniform sampler2D uSDF;
  uniform sampler2D uFull;
  uniform vec2 uTexSize;
  uniform vec3 uCamPos;
  uniform vec3 uLightPos;
  uniform float uTime;
  uniform int uMode;            // 0 sticker, 1 shadow, 2 full-image reveal layer
  uniform int uRectShape;       // 1: the shape is the whole quad (full-image layer shadow)
  uniform int uHasMask;
  uniform vec2 uFullSize;       // full-image layer size in px
  uniform vec4 uAtlasRect;      // sticker atlas origin/size inside the full image (px)
  uniform float uFront;         // dissolve front: px outside the die-cut
  uniform float uProcessing;    // 1 while the image is being analysed
  uniform float uLayerAlpha;
  uniform float uSelected;
  uniform float uBorderWidth;
  uniform vec3 uBorderColor;
  uniform float uBorderHolo;
  uniform float uHoloIntensity, uHoloSpread, uBandScale, uPatternAngle, uHueShift, uSaturation, uMetallic, uShimmer;
  uniform int uPattern;
  uniform float uGlitter, uGlitterScale, uGlitterDensity, uGlitterSharp;
  uniform float uGloss, uSpec, uGrain, uBevel, uBevelWidth, uFresnel, uFlake;
  uniform float uInkBright, uInkSat, uInkFoil;
  uniform float uShadowBlur, uShadowSpread, uShadowOpacity;
  uniform float uDiffuse;

  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec2 hash22(vec2 p) { float h = hash21(p); return vec2(h, hash21(p + h + 19.19)); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
  vec3 rainbow(float t) {
    vec3 a = hsv2rgb(vec3(fract(t), 1.0, 1.0));
    vec3 b = 0.5 + 0.5 * cos(6.28318 * (vec3(t) + vec3(0.0, 0.33, 0.67)));
    return mix(a, b, 0.35);
  }
  float pattern(vec2 uv, int type, float scale, float ang, float sweep) {
    vec2 c = (uv - 0.5) * vec2(uTexSize.x / uTexSize.y, 1.0);
    float ca = cos(ang), sa = sin(ang);
    vec2 r = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    if (type == 1) return r.x * scale;
    if (type == 2) return length(c) * scale;
    if (type == 3) { vec2 q = abs(fract(r * scale) - 0.5); return q.x + q.y; }
    if (type == 4) return 0.25 * (sin(r.x * scale * 6.2832) + sin(r.y * scale * 6.2832));
    if (type == 5) return length(fract(r * scale) - 0.5) * 1.6;
    if (type == 6) { vec2 cell = floor(r * scale); return hash21(cell) * 0.8 + (hash21(cell + 3.7) - 0.5) * 2.0 * sweep; }
    if (type == 7) return (r.x + 0.12 * sin(r.y * scale * 2.5)) * scale * 0.6;
    if (type == 8) { vec2 q = fract(r * scale) - 0.5; return atan(q.y, q.x) / 6.2832; }
    return 0.0;
  }

  void main() {
    /* ---------------- full-image reveal layer ---------------- */
    if (uMode == 2) {
      vec4 img = texture(uFull, vUv);
      vec2 fpx = vUv * uFullSize;
      float dOut = -1e4;
      if (uHasMask == 1) {
        vec2 auv = (fpx - uAtlasRect.xy) / uAtlasRect.zw;
        float s = texture(uSDF, clamp(auv, 0.0, 1.0)).r;
        vec2 dq = max(vec2(0.0), abs(auv - 0.5) - 0.5) * uAtlasRect.zw;
        dOut = -(s + uBorderWidth) + length(dq);
      }
      float n = vnoise(fpx / 18.0) * 0.6 + vnoise(fpx / 6.0) * 0.4;
      float d = dOut + (n - 0.5) * 34.0;
      float gone = smoothstep(uFront - 5.0, uFront + 5.0, d);
      float alpha = img.a * (1.0 - gone) * uLayerAlpha;
      vec3 col = img.rgb;
      if (uHasMask == 1) {
        // iridescent front that eats the background inward
        float g = exp(-abs(d - uFront) / 9.0) * (1.0 - gone);
        float darken = smoothstep(uFront - 90.0, uFront + 10.0, d) * 0.35;   // the doomed band cools down
        col = mix(col, col * 0.7 + vec3(0.02, 0.03, 0.06), darken);
        col += rainbow(dOut * 0.012 + uTime * 0.2 + n * 0.25) * g * 1.3;
        alpha = max(alpha, g * 0.8 * uLayerAlpha * img.a);
      }
      if (uProcessing > 0.0) {
        // scanning shimmer while the models run
        float band = fract(uTime * 0.32);
        float p = (vUv.x * 0.75 + vUv.y * 0.55) - band * 1.55 + 0.25;
        float sh = exp(-p * p / 0.004) * uProcessing;
        col += rainbow(p * 3.0 + uTime * 0.1) * sh * 0.35 + sh * 0.25;
      }
      fragColor = vec4(col * alpha, alpha);
      return;
    }

    float sdf;
    if (uRectShape == 1) { vec2 e = min(vUv, 1.0 - vUv) * uFullSize; sdf = min(e.x, e.y); }
    else sdf = texture(uSDF, vUv).r;
    float edge = sdf + uBorderWidth;
    float px = max(fwidth(sdf), 1e-4);

    /* ---------------- shadow ---------------- */
    if (uMode == 1) {
      float d = edge + uShadowSpread;
      float a = smoothstep(-uShadowBlur, uShadowBlur, d) * uShadowOpacity;
      fragColor = vec4(0.0, 0.0, 0.0, a);
      return;
    }

    /* ---------------- sticker ---------------- */
    float stickerA = clamp(edge / px + 0.5, 0.0, 1.0);
    float ring = uSelected * (1.0 - smoothstep(0.7 * px, 1.6 * px, abs(edge + 5.0 * px)));
    if (stickerA <= 0.002 && ring <= 0.002) discard;

    vec4 img = texture(uImage, vUv);           // premultiplied
    vec3 ink = img.rgb; float inkA = img.a;
    float lum = dot(ink, vec3(0.299, 0.587, 0.114));
    ink = mix(vec3(lum), ink, uInkSat) * uInkBright;
    vec3 base = uBorderColor * (1.0 - inkA) + ink;
    float holoHere = mix(uBorderHolo, 1.0, inkA);

    // --- normals: bevelled rim + paper grain ---
    vec2 tx = 1.0 / uTexSize;
    float gx = texture(uSDF, vUv + vec2(tx.x, 0.0)).r - texture(uSDF, vUv - vec2(tx.x, 0.0)).r;
    float gy = texture(uSDF, vUv + vec2(0.0, tx.y)).r - texture(uSDF, vUv - vec2(0.0, tx.y)).r;
    vec2 g = vec2(gx, -gy) * 0.5;
    float bevelT = 1.0 - smoothstep(0.0, max(uBevelWidth, 0.01), edge);
    vec2 nBevel = -g * bevelT * uBevel * 2.5;
    vec2 gp = vUv * uTexSize / 7.0;
    float n1 = vnoise(gp), n2 = vnoise(gp + vec2(0.9, 0.0)), n3 = vnoise(gp + vec2(0.0, 0.9));
    vec2 nGrain = vec2(n2 - n1, n3 - n1) * uGrain * 1.4;
    vec3 Ns = normalize(vN + vT * nBevel.x + vB * nBevel.y);
    vec3 N = normalize(vN + vT * (nBevel.x + nGrain.x) + vB * (nBevel.y + nGrain.y));

    vec3 V = normalize(uCamPos - vPos);
    vec3 L = normalize(uLightPos - vPos);
    vec3 H = normalize(L + V);
    float NdotL = max(dot(N, L), 0.0);
    float NdotV = max(dot(Ns, V), 0.0);
    float NdotH = max(dot(N, H), 0.0);
    float NsdotH = max(dot(Ns, H), 0.0);
    vec3 R = reflect(-V, Ns);

    // --- holographic foil ---
    float sweep = (R.x * 1.1 + R.y * 0.8) * uHoloSpread;
    float pat = pattern(vUv, uPattern, uBandScale, uPatternAngle, sweep);
    float fl = vnoise(vUv * uTexSize / 9.0) * 0.7 + vnoise(vUv * uTexSize / 3.5) * 0.3;
    float flake = mix(1.0, 0.45 + 1.1 * fl, uFlake);
    float t = sweep + pat + uHueShift + uTime * uShimmer * 0.15;
    vec3 rb = rainbow(t);
    rb = mix(vec3(dot(rb, vec3(0.3333))), rb, uSaturation);
    float band = pow(NsdotH, mix(1.5, 16.0, uGloss));
    float baseLum = dot(base, vec3(0.299, 0.587, 0.114));
    float inkGate = mix(1.0, mix(smoothstep(0.0, 0.85, baseLum), 1.0, 1.0 - inkA), uInkFoil);
    float holoMask = uHoloIntensity * (0.3 + 0.7 * band) * flake * holoHere * inkGate;

    vec3 col = base * (1.0 - uDiffuse + uDiffuse * (0.35 + 0.65 * NdotL));
    col = mix(col, col * (0.3 + 1.4 * rb), uMetallic * holoHere * flake * inkGate);
    col += rb * holoMask * (0.55 + 0.45 * (1.0 - uMetallic)) * (1.0 - 0.4 * col);

    // --- glitter facets ---
    if (uGlitter > 0.001) {
      vec2 gq = vUv * uTexSize / max(uGlitterScale, 1.0);
      vec2 cell = floor(gq);
      vec2 hh = hash22(cell);
      vec3 fn = normalize(vec3((hh - 0.5) * 1.1, 1.0));
      vec3 Ht = normalize(vec3(dot(H, vT), dot(H, vB), dot(H, vN)));
      float sp = pow(max(dot(fn, Ht), 0.0), 30.0 + 160.0 * uGlitterSharp);
      float present = step(1.0 - uGlitterDensity, hash21(cell + 7.31));
      float shape = 1.0 - smoothstep(0.10, 0.45, length(fract(gq) - 0.5));
      col += sp * present * shape * uGlitter * mix(vec3(1.0), rb, 0.5) * holoHere * 2.4;
    }

    // --- specular + fresnel rim ---
    col += uSpec * pow(NdotH, 24.0 + 120.0 * uGloss) * mix(vec3(1.0), rb, 0.35);
    col += uFresnel * pow(1.0 - NdotV, 3.0) * rb;

    float m = max(col.r, max(col.g, col.b));
    col = mix(col, col / m, smoothstep(1.0, 1.8, m));
    col = clamp(col, 0.0, 1.0);

    // selection ring sits outside the die-cut
    vec3 ringCol = vec3(0.965, 0.77, 0.27);
    float ringA = ring * (1.0 - stickerA);
    fragColor = vec4(col * stickerA + ringCol * ringA, stickerA + ringA);
  }`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile error: ' + log);
    }
    return sh;
  }

  function link(gl, vs, fs) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
    return prog;
  }

  const PATTERN_IDS = { none: 0, linear: 1, radial: 2, prism: 3, crosshatch: 4, lens: 5, facets: 6, waves: 7, pinwheel: 8 };

  function rotationMatrix(rx, ry, rz) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    const Rx = [1, 0, 0, 0, cx, sx, 0, -sx, cx];
    const Ry = [cy, 0, -sy, 0, 1, 0, sy, 0, cy];
    const Rz = [cz, sz, 0, -sz, cz, 0, 0, 0, 1];
    const mul = (A, B) => {
      const o = new Array(9);
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
        o[c * 3 + r] = A[r] * B[c * 3] + A[3 + r] * B[c * 3 + 1] + A[6 + r] * B[c * 3 + 2];
      }
      return o;
    };
    return new Float32Array(mul(Rz, mul(Rx, Ry)));
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.gl = gl;
      this.prog = link(gl, VERT, FRAG);
      this.u = {};
      const count = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) { const info = gl.getActiveUniform(this.prog, i); this.u[info.name] = gl.getUniformLocation(this.prog, info.name); }
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.vao = vao;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      this.clearColor = [0, 0, 0, 0];
      // a 1x1 fallback so samplers are always bound
      this.blank = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.blank);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      this.blankSdf = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.blankSdf);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([-1e4]));
    }

    /* ---------------------------------------------------------------- */
    /* Textures                                                           */
    /* ---------------------------------------------------------------- */

    /* atlas: {canvas (premultiplied RGBA), sdf: Float32Array, w, h} → texture set */
    createTextures(atlas) {
      const gl = this.gl;
      const img = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      const sdf = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sdf);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, atlas.w, atlas.h, 0, gl.RED, gl.FLOAT, atlas.sdf);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return { img, sdf, w: atlas.w, h: atlas.h };
    }

    deleteTextures(t) {
      if (!t) return;
      this.gl.deleteTexture(t.img); this.gl.deleteTexture(t.sdf);
    }

    /* Straight-alpha RGBA texture of a canvas (the full photo for the reveal layer). */
    createImageTexture(canvas) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      return { tex, w: canvas.width, h: canvas.height };
    }

    deleteImageTexture(t) { if (t) this.gl.deleteTexture(t.tex); }

    /* ---------------------------------------------------------------- */
    /* Drawing                                                            */
    /* ---------------------------------------------------------------- */

    /* view: { stageW, stageH, camDist, light: [x,y,z], time } */
    beginFrame(view, clear) {
      const gl = this.gl, u = this.u;
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      if (clear !== false) {
        gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.uniform1i(u.uImage, 0); gl.uniform1i(u.uSDF, 1); gl.uniform1i(u.uFull, 2);
      gl.uniform2f(u.uStage, view.stageW, view.stageH);
      gl.uniform1f(u.uCamDist, view.camDist);
      gl.uniform3f(u.uCamPos, 0, 0, view.camDist);
      gl.uniform3fv(u.uLightPos, view.light);
      gl.uniform1f(u.uTime, view.time || 0);
      this.view = view;
    }

    setMaterial(s) {
      const gl = this.gl, u = this.u;
      gl.uniform1f(u.uBorderWidth, s.borderWidth);
      gl.uniform3fv(u.uBorderColor, hexToRgb(s.borderColor));
      gl.uniform1f(u.uBorderHolo, s.borderHolo);
      gl.uniform1f(u.uHoloIntensity, s.holoIntensity);
      gl.uniform1f(u.uHoloSpread, s.holoSpread);
      gl.uniform1f(u.uBandScale, s.bandScale);
      gl.uniform1f(u.uPatternAngle, s.patternAngle * Math.PI / 180);
      gl.uniform1f(u.uHueShift, s.hueShift);
      gl.uniform1f(u.uSaturation, s.saturation);
      gl.uniform1f(u.uMetallic, s.metallic);
      gl.uniform1f(u.uShimmer, s.shimmer);
      gl.uniform1i(u.uPattern, PATTERN_IDS[s.pattern] || 0);
      gl.uniform1f(u.uGlitter, s.glitter);
      gl.uniform1f(u.uGlitterScale, s.glitterScale);
      gl.uniform1f(u.uGlitterDensity, s.glitterDensity);
      gl.uniform1f(u.uGlitterSharp, s.glitterSharp);
      gl.uniform1f(u.uGloss, s.gloss);
      gl.uniform1f(u.uSpec, s.specular);
      gl.uniform1f(u.uGrain, s.grain);
      gl.uniform1f(u.uBevel, s.bevel);
      gl.uniform1f(u.uBevelWidth, s.bevelWidth);
      gl.uniform1f(u.uFresnel, s.fresnel);
      gl.uniform1f(u.uFlake, s.flake);
      gl.uniform1f(u.uInkBright, s.inkBrightness);
      gl.uniform1f(u.uInkSat, s.inkSaturation);
      gl.uniform1f(u.uInkFoil, s.inkFoil);
      gl.uniform1f(u.uShadowBlur, s.shadowBlur);
      gl.uniform1f(u.uShadowSpread, s.shadowSpread);
      gl.uniform1f(u.uShadowOpacity, s.shadowOpacity);
      gl.uniform1f(u.uDiffuse, s.diffuse);
    }

    _geometry(pose, rotScale) {
      const gl = this.gl, u = this.u;
      const k = rotScale == null ? 1 : rotScale;
      gl.uniformMatrix3fv(u.uRot, false, rotationMatrix(pose.rotX * k, pose.rotY * k, pose.rotZ));
      gl.uniform2f(u.uSize, pose.width, pose.height);
      gl.uniform2f(u.uOffset, pose.offset ? pose.offset[0] : 0, pose.offset ? pose.offset[1] : 0);
    }

    /*
     * Draw one sticker. t: texture set, pose: { x, y, z, rotX, rotY, rotZ, width, height },
     * s: material settings, opts: { selected, shadow: { dx, dy, scale } | null }
     */
    drawSticker(t, pose, s, opts) {
      const gl = this.gl, u = this.u;
      opts = opts || {};
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.img);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.sdf);
      gl.uniform2f(u.uTexSize, t.w, t.h);
      gl.uniform1i(u.uRectShape, 0);
      gl.uniform1i(u.uHasMask, 1);
      gl.uniform1f(u.uSelected, opts.selected ? 1 : 0);
      this.setMaterial(s);
      if (s.shadowOpacity > 0.001 && opts.shadow) {
        gl.uniform1i(u.uMode, 1);
        this._geometry({ ...pose, width: pose.width * opts.shadow.scale, height: pose.height * opts.shadow.scale }, 0.35);
        gl.uniform3f(u.uCenter, pose.x + opts.shadow.dx, pose.y + opts.shadow.dy, pose.z - 40);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.uniform1i(u.uMode, 0);
      this._geometry(pose);
      gl.uniform3f(u.uCenter, pose.x, pose.y, pose.z);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /*
     * Draw the full-image layer used while a sticker is being extracted.
     * full: image texture, t: sticker texture set or null, pose: quad of the full image
     * (with `offset` relative to the sticker centre), opts: { atlasRect: [x,y,w,h],
     * front, processing, alpha, borderWidth, shadow: {dx,dy,scale,opacity,blur,spread} | null }
     */
    drawFullLayer(full, t, pose, opts) {
      const gl = this.gl, u = this.u;
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, full.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t ? t.sdf : this.blankSdf);
      gl.uniform2f(u.uFullSize, full.w, full.h);
      gl.uniform1i(u.uHasMask, t ? 1 : 0);
      const r = opts.atlasRect || [0, 0, 1, 1];
      gl.uniform4f(u.uAtlasRect, r[0], r[1], r[2], r[3]);
      gl.uniform1f(u.uFront, opts.front);
      gl.uniform1f(u.uProcessing, opts.processing || 0);
      gl.uniform1f(u.uLayerAlpha, opts.alpha == null ? 1 : opts.alpha);
      gl.uniform1f(u.uBorderWidth, opts.borderWidth || 0);
      if (opts.shadow && opts.shadow.opacity > 0.001) {
        gl.uniform1i(u.uMode, 1);
        gl.uniform1i(u.uRectShape, 1);
        gl.uniform1f(u.uShadowOpacity, opts.shadow.opacity);
        gl.uniform1f(u.uShadowBlur, opts.shadow.blur);
        gl.uniform1f(u.uShadowSpread, opts.shadow.spread);
        gl.uniform1f(u.uBorderWidth, 0);
        this._geometry({ ...pose, width: pose.width * opts.shadow.scale, height: pose.height * opts.shadow.scale }, 0.35);
        gl.uniform3f(u.uCenter, pose.x + opts.shadow.dx, pose.y + opts.shadow.dy, pose.z - 40);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform1f(u.uBorderWidth, opts.borderWidth || 0);
      }
      gl.uniform1i(u.uMode, 2);
      gl.uniform1i(u.uRectShape, 0);
      this._geometry(pose);
      gl.uniform3f(u.uCenter, pose.x, pose.y, pose.z);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    resize(w, h) {
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      this.gl.viewport(0, 0, w, h);
    }

    /*
     * Render into an offscreen buffer and return a canvas with straight-alpha
     * pixels. opts: { width, height, background: hex|null, draw(view) } — `draw`
     * issues drawSticker/drawFullLayer calls with a view sized to the buffer.
     */
    renderToCanvas(opts) {
      const gl = this.gl;
      const W = Math.max(1, Math.round(opts.width)), H = Math.max(1, Math.round(opts.height));
      const fbo = gl.createFramebuffer();
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, W, H);
      const prevClear = this.clearColor;
      if (opts.background) { const c = hexToRgb(opts.background); this.clearColor = [c[0], c[1], c[2], 1]; }
      else this.clearColor = [0, 0, 0, 0];
      opts.draw({ stageW: W, stageH: H });
      const pixels = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
      this.clearColor = prevClear;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      const id = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        const src = (H - 1 - y) * W * 4, dst = y * W * 4;
        for (let x = 0; x < W * 4; x += 4) {
          const a = pixels[src + x + 3];
          if (a === 0) { id.data[dst + x + 3] = 0; continue; }
          const k = 255 / a;
          id.data[dst + x] = Math.min(255, pixels[src + x] * k);
          id.data[dst + x + 1] = Math.min(255, pixels[src + x + 1] * k);
          id.data[dst + x + 2] = Math.min(255, pixels[src + x + 2] * k);
          id.data[dst + x + 3] = a;
        }
      }
      ctx.putImageData(id, 0, 0);
      return out;
    }
  }

  Renderer.PATTERNS = Object.keys(PATTERN_IDS);
  Renderer.hexToRgb = hexToRgb;
  return Renderer;
})();
