/*
 * renderer.js — WebGL2 sticker renderer.
 *
 * Draws die-cut stickers (image + white border) as tilted quads with a
 * holographic foil material: rainbow interference bands driven by the view
 * angle, metallic tint, glitter facets, paper grain, a bevelled rim, specular
 * highlight and a soft cast shadow. A second "full image" layer is used while
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
  uniform float uFlipX;
  uniform float uPeel, uPeelInset, uCasterBase;
  uniform float uAttached, uDepthBias;
  uniform mat3 uAttachAxes;
  uniform vec3 uAttachOrigin;
  uniform vec2 uBendSize;
  uniform vec3 uCasterAxis;
  out vec2 vUv; out vec3 vPos; out vec3 vN; out vec3 vT; out vec3 vB;
  out float vCasterHeight;
  void main() {
    vec3 local = vec3(aPos * uSize + uOffset, 0.0);
    mat3 axes = mat3(1.0);
    vec2 bendSize = uSize;
    if (uAttached > .5) {
      // Map every icon vertex into the parent's unbent sheet, then apply
      // exactly the same curl. A tangent plane at the icon centre is not enough.
      axes = uAttachAxes;
      local = axes * local + uAttachOrigin;
      bendSize = uBendSize;
    }
    // A cylindrical bend rolls the upper-right corner back onto the sheet.
    // UVs remain attached to the paper; the same geometry projects its shadow.
    vN = uRot * axes[2];
    vT = uRot * axes[0] * (uFlipX > .5 ? -1.0 : 1.0);
    vB = uRot * axes[1];
    if (uPeel > .0001) {
      vec2 dir = normalize(vec2(1.0));
      float radius = max(min(bendSize.x, bendSize.y) * .23, .001);
      float crease = dot(bendSize * .5 + uOffset, dir) - min(bendSize.x, bendSize.y) * (uPeelInset + .60 * uPeel);
      float d = max(dot(local.xy, dir) - crease, 0.0);
      float angle = d / radius;
      local.xy += dir * (radius * sin(angle) - d);
      local.z = radius * (1.0 - cos(angle));
      float sn = sin(angle), cs = cos(angle);
      mat3 bend = mat3(vec3(.5 + .5 * cs, .5 * (cs - 1.0), sn * dir.x), vec3(.5 * (cs - 1.0), .5 + .5 * cs, sn * dir.y), vec3(-dir * sn, cs));
      vN = uRot * bend * axes[2];
      vT = uRot * bend * axes[0] * (uFlipX > .5 ? -1.0 : 1.0);
      vB = uRot * bend * axes[1];
    }
    vec3 p = uRot * local + uCenter;
    vCasterHeight = uCasterBase + dot(local, uCasterAxis);
    vPos = p;
    vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y);
    if (uFlipX > 0.5) vUv.x = 1.0 - vUv.x;
    float wv = (uCamDist - p.z) / uCamDist;
    gl_Position = vec4(p.xy / (uStage * 0.5), -p.z / uCamDist - uDepthBias * wv, wv);
  }`;

  const FRAG = `#version 300 es
  precision highp float;
  in vec2 vUv; in vec3 vPos; in vec3 vN; in vec3 vT; in vec3 vB;
  in float vCasterHeight;
  out vec4 fragColor;

  uniform sampler2D uImage;
  uniform sampler2D uSDF;
  uniform sampler2D uFull;
  uniform sampler2D uSecondImage, uAssemblyBase;
  uniform float uRipple, uLenticular, uImageMix, uAssemblyPhoto, uOpacity;
  uniform vec2 uRippleOrigin;
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
  uniform vec3 uBorderColor2, uBorderColor3;
  uniform int uBorderStyle;
  uniform float uBorderAngle;
  uniform float uBorderHolo;
  uniform float uHoloIntensity, uHoloSpread, uBandScale, uPatternAngle, uHueShift, uSaturation, uMetallic, uShimmer;
  uniform int uPattern;
  uniform float uGlitter, uGlitterScale, uGlitterDensity, uGlitterSharp;
  uniform float uGloss, uSpec, uGrain, uBevel, uBevelWidth, uFresnel, uFlake;
  uniform float uSoftHighlights;
  uniform float uPreserveAlpha;
  uniform float uInkBright, uInkSat, uInkFoil;
  uniform float uShadowBlur, uShadowSpread, uShadowOpacity;
  uniform vec3 uShadowHeight;
  uniform float uFlipX;
  uniform float uShadowRef;     // shadow: the resting height, at which Softness and Opacity apply as set
  uniform float uDiffuse;
  uniform int uMaterial;
  uniform float uMaterialDepth, uMaterialTexture, uMaterialScale, uMaterialOpacity, uArtworkOpacity, uMaterialShine;
  uniform vec3 uMaterialTint;
  uniform float uPearl;
  uniform float uPeel, uFoilReveal, uSurfacePhase, uAttached;

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
  vec3 borderColour(vec2 uv) {
    if (uBorderStyle == 0) return uBorderColor;
    vec2 aspect = uTexSize / max(uTexSize.x, uTexSize.y);
    vec2 q = (uv - 0.5) * aspect;
    float t;
    if (uBorderStyle >= 3) {
      t = fract(atan(q.y, q.x) / 6.2831853 - uBorderAngle / 6.2831853 + 0.5);
      if (uBorderStyle == 4) return rainbow(t);
      // Close the conic gradient by blending the last colour back to the first.
      if (t < 0.3333333) return mix(uBorderColor, uBorderColor2, t * 3.0);
      if (t < 0.6666667) return mix(uBorderColor2, uBorderColor3, t * 3.0 - 1.0);
      return mix(uBorderColor3, uBorderColor, t * 3.0 - 2.0);
    }
    if (uBorderStyle == 2) t = length(q) / max(length(aspect * 0.5), 0.001);
    else {
      vec2 direction = vec2(cos(uBorderAngle), sin(uBorderAngle));
      t = dot(q, direction) / max(dot(abs(direction), aspect), 0.001) + 0.5;
    }
    t = clamp(t, 0.0, 1.0);
    return t < 0.5 ? mix(uBorderColor, uBorderColor2, t * 2.0) : mix(uBorderColor2, uBorderColor3, t * 2.0 - 1.0);
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
    if (type == 9) {
      // Broken triangular prisms: each face catches a different colour and angle.
      vec2 q = r * scale, cell = floor(q), f = fract(q);
      float side = step(f.x, f.y);
      float face = hash21(cell + side * 31.7);
      return face * 1.7 + dot(f, hash22(cell + side * 9.3) - .5) * .5 + (face - .5) * sweep * 1.4;
    }
    if (type == 10) {
      // Long, folded aurora curtains, with coherent flowing colour.
      vec2 q = r * scale;
      return q.x * .28 + sin(q.y * 1.6 + sin(q.x * .8)) * .3 + sin(q.x * 2.1 + q.y * .6) * .16;
    }
    if (type == 11) {
      // Voronoi fragments, with bright colour changes along the fracture seams.
      vec2 q = r * scale, cell = floor(q), f = fract(q);
      float near = 10.0, next = 10.0, face = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 off = vec2(x, y), delta = off + .15 + hash22(cell + off) * .7 - f;
        float d = dot(delta, delta);
        if (d < near) { next = near; near = d; face = hash21(cell + off + 5.7); }
        else next = min(next, d);
      }
      float seam = 1.0 - smoothstep(.015, .085, next - near);
      return face * .95 + seam * .45 + (face - .5) * sweep * 1.8;
    }
    if (type == 12) {
      vec2 q = r * scale, cell = floor(q), p = fract(q) - .5;
      float rotation = hash21(cell) * 6.2832;
      float a = atan(p.y, p.x) + rotation;
      float folded = abs(mod(a + .6283185, 1.256637) - .6283185);
      float starEdge = .31 * .135 * sin(.6283185) / max(.135 * sin(.6283185 - folded) + .31 * sin(folded), .001);
      float aa = max(.008, fwidth(length(p)));
      float star = 1.0 - smoothstep(starEdge - aa, starEdge + aa, length(p));
      return q.x * .035 + star * (.4 + hash21(cell + 2.3) * .5) + star * sweep * .5;
    }
    if (type == 13) {
      vec2 q = r * scale;
      float rings = length(q + vec2(.38, -.2));
      float secondary = length(q - vec2(.42, .3));
      return rings * .8 + sin(secondary * 7.0) * .12;
    }
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

    /* ---------------- shadow ---------------- */
    if (uMode == 1) {
      // the quad is the die-cut projected onto the page (see _shadowPass); this pixel's caster sits at
      // height h, so the parts of a tilted or lifted sticker that are farther from the page throw a
      // softer, lighter shadow while the edge touching down stays crisp. one distance-field sample.
      float h = max(uPeel > .0001 ? vCasterHeight : uShadowHeight.x + uShadowHeight.y * (vUv.x - 0.5) * (uFlipX > 0.5 ? -1.0 : 1.0) + uShadowHeight.z * (vUv.y - 0.5), 0.0);
      float k = clamp((h + 6.0) / (uShadowRef + 6.0), 0.3, 3.0);
      float blur = uShadowBlur * k;
      float a = smoothstep(-blur, blur, edge + uShadowSpread) * uShadowOpacity * mix(1.0, 0.55, clamp((k - 1.0) * 0.5, 0.0, 1.0));
      if (a < 0.003) discard;
      fragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
      return;
    }

    /* ---------------- sticker ---------------- */
    vec2 mq = vUv * uTexSize / max(uMaterialScale, 0.1);
    if (uMaterial == 8) edge -= vnoise(mq / 2.5) * uMaterialTexture * 2.0;
    float px = max(fwidth(sdf), 1e-4);
    float stickerA = clamp(edge / px + 0.5, 0.0, 1.0);
    float ring = uSelected * (1.0 - smoothstep(0.7 * px, 1.6 * px, abs(edge + 5.0 * px)));
    if (stickerA <= 0.002 && ring <= 0.002) discard;

    if (uMode == 3) {
      if (uPreserveAlpha > .5) {
        float borderOnly = uBorderWidth > 0.0 ? 1.0 - smoothstep(-px * .5, px * .5, sdf) : 0.0;
        stickerA *= max(texture(uImage, vUv).a, borderOnly);
      }
      if (stickerA < .5) discard;
      fragColor = vec4(0.0); return;
    }
    // Decorations are printed on the front of the parent's sheet. They do
    // not acquire a second paper backing when that sheet rolls over.
    if (uAttached > .5 && dot(vN, uCamPos - vPos) <= 0.0) discard;

    // The reverse of the curled sheet is warm, unprinted adhesive paper.
    if (uPeel > .001 && dot(vN, uCamPos - vPos) < 0.0) {
      vec3 backN = -normalize(vN);
      float light = .72 + .28 * max(dot(backN, normalize(uLightPos - vPos)), 0.0);
      float fiber = vnoise(vUv * uTexSize / 2.5);
      vec3 backing = vec3(1.0, .95, .87) * light * (.97 + .03 * fiber);
      fragColor = vec4(backing * stickerA, stickerA) * uOpacity;
      return;
    }

    // A damped wave refracts the print and tilts the reflected light, while
    // the original die and coverage keep the silhouette and holes intact.
    vec2 printUv = vUv, rippleNormal = vec2(0.0);
    if (uRipple > .001) {
      vec2 aspect = uTexSize / min(uTexSize.x, uTexSize.y);
      vec2 delta = (vUv - uRippleOrigin) * aspect;
      float distance = length(delta), travel = uSurfacePhase * 1.65;
      float envelope = smoothstep(0.0, .06, uSurfacePhase) * (1.0 - smoothstep(.65, 1.0, uSurfacePhase));
      float band = exp(-pow((distance - travel) / .23, 2.0));
      float wave = sin((distance - travel) * 34.0) * band * envelope * uRipple;
      vec2 direction = delta / max(distance, .001);
      float inside = smoothstep(0.0, 8.0, sdf);
      printUv += direction / aspect * wave * .018 * inside;
      rippleNormal = direction * vec2(1.0, -1.0) * wave * .7;
    }
    vec4 original = texture(uImage, vUv), img = texture(uImage, printUv);
    if (uRipple > .001) img = vec4(img.rgb / max(img.a, .001) * original.a, original.a);
    if (uAssemblyPhoto < .9999) img = mix(texture(uAssemblyBase, vUv), img, uAssemblyPhoto);
    if (uLenticular > .001) {
      // Use the full gesture for the image change. Lens detail fades out
      // below pixel size, keeping small stickers and moving cards stable.
      float progress = clamp(uImageMix, 0.0, 1.0);
      float lens = vUv.x * 180.0;
      float resolved = 1.0 - smoothstep(1.0, 3.14159, fwidth(lens));
      float rib = sin(lens) * .025 * uLenticular * resolved * (4.0 * progress * (1.0 - progress));
      float flip = smoothstep(0.0, 1.0, progress + rib);
      vec4 second = texture(uSecondImage, vUv);
      vec3 secondInk = second.rgb / max(second.a, .001) * original.a;
      img = vec4(mix(img.rgb, secondInk, flip), original.a);
    }
    vec3 border = borderColour(vUv);
    vec3 ink = img.rgb; float inkA = img.a;
    if (uPreserveAlpha > 0.5) {
      float borderOnly = uBorderWidth > 0.0 ? 1.0 - smoothstep(-px * 0.5, px * 0.5, sdf) : 0.0;
      stickerA *= max(inkA, borderOnly);
      ink = inkA > 0.001 ? ink / inkA : border;
    }
    float lum = dot(ink, vec3(0.299, 0.587, 0.114));
    ink = mix(vec3(lum), ink, uInkSat) * uInkBright;
    vec3 base = border * (1.0 - inkA) + ink;
    if (uPreserveAlpha > 0.5) base = ink;
    if (uMaterial > 0) {
      // Work in straight colour, then composite print over its substrate.
      // Keep the atlas coverage, including genuine holes, separate from opacity.
      vec3 printColour = uPreserveAlpha > 0.5 ? ink : ink / max(inkA, 0.001);
      float printA = inkA * uArtworkOpacity;
      bool translucent = uMaterial <= 3 || uMaterial == 9 || uMaterial == 10;
      vec3 substrate = translucent ? uMaterialTint : mix(border, uMaterialTint, uMaterial == 7 || uMaterial == 12 || uMaterial == 13 ? 0.85 : 0.3);
      float substrateA = translucent ? uMaterialOpacity : 1.0;
      float combinedA = printA + substrateA * (1.0 - printA);
      base = (printColour * printA + substrate * substrateA * (1.0 - printA)) / max(combinedA, 0.001);
      stickerA *= combinedA;
    }
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
    float raised = 1.0 - smoothstep(0.0, 10.0 + uMaterialDepth * 42.0, edge);
    float thread = 0.0;
    if (uMaterial > 0) {
      nGrain *= .35;
      nBevel = nBevel * .25 - g * raised * uMaterialDepth * (uMaterial == 5 ? 2.4 : 1.35);
      if (uMaterial == 4) nBevel += (vUv - 0.5) * vec2(1.0, -1.0) * uMaterialDepth * 0.6;
      if (uMaterial == 2 || uMaterial == 8 || uMaterial == 5) {
        vec2 q = mq / (uMaterial == 8 ? 2.0 : 3.5);
        nGrain = vec2(vnoise(q + vec2(.7, 0)) - vnoise(q), vnoise(q + vec2(0, .7)) - vnoise(q)) * uMaterialTexture * (uMaterial == 2 ? .5 : .18);
      }
      if (uMaterial == 6) {
        // Alternating satin stitches, with a narrow perpendicular edge seam.
        float stitch = sin((mq.x + sin(floor(mq.y / 9.0)) * 2.0) * 2.1);
        float seam = 1.0 - smoothstep(2.0, 8.0, abs(edge - 5.0));
        float seamThread = sin((mq.x + mq.y) * 1.5);
        thread = mix(stitch * .65 + sin(mq.y * .7) * .35, seamThread, seam);
        nGrain = vec2(thread, sin(mq.y * .7)) * uMaterialTexture * .4;
      }
      if (uMaterial == 7) nGrain = vec2(0, vnoise(vec2(mq.x / 90.0, mq.y * 1.6)) - .5) * uMaterialTexture * .35;
      if (uMaterial == 9) {
        // A thin, gently wrinkled interference sheet rather than foil bands.
        vec2 q = mq / 42.0;
        nGrain = vec2(vnoise(q + vec2(.12, 0)) - vnoise(q), vnoise(q + vec2(0, .12)) - vnoise(q)) * uMaterialTexture * 1.8;
        nBevel *= .2;
      }
      if (uMaterial == 10) {
        nBevel += (vUv - .5) * vec2(1, -1) * uMaterialDepth * .9;
        nGrain = vec2(0);
      }
      if (uMaterial == 11) {
        vec2 q = mq / 5.0;
        nGrain = vec2(vnoise(q + vec2(.5, 0)) - vnoise(q), vnoise(q + vec2(0, .5)) - vnoise(q)) * uMaterialTexture * .13;
      }
      if (uMaterial == 12) {
        nGrain = (hash22(floor(mq / 1.4)) - .5) * uMaterialTexture * .28;
      }
      if (uMaterial == 13) {
        vec2 weave = vec2(mq.x + mq.y, mq.y - mq.x) / 14.0;
        float direction = step(2.0, mod(floor(weave.x) + floor(weave.y), 4.0));
        float crossThread = mix(fract(weave.x), fract(weave.y), direction);
        thread = sin(crossThread * 3.14159);
        nGrain = mix(vec2(cos(crossThread * 3.14159), 0), vec2(0, cos(crossThread * 3.14159)), direction) * uMaterialTexture * .35;
      }
    }
    nBevel += rippleNormal;
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
    vec3 reflection = rb * holoMask * (0.55 + 0.45 * (1.0 - uMetallic)) * (1.0 - 0.4 * col);
    float detailGate = mix(1.0, inkGate, uSoftHighlights);
    if (uFoilReveal > .001 && uSurfacePhase >= 0.0) {
      // Travel off the sheet at both ends, leaving a quiet pause at the seam.
      float travel = smoothstep(.08, .84, uSurfacePhase);
      float along = vUv.x * .78 + (1.0 - vUv.y) * .22;
      float delta = along - mix(-.30, 1.30, travel);
      float beam = exp(-pow(delta / .085, 2.0));
      float wake = exp(-pow((delta + .10) / .18, 2.0));
      vec3 spectral = rainbow(pat * .65 + delta * 2.5 + uHueShift + .08);
      vec2 q = vUv * uTexSize / 34.0, cell = floor(q);
      vec2 star = fract(q) - (.25 + hash22(cell) * .5);
      float glint = exp(-abs(star.x) * 100.0 - abs(star.y) * 12.0) + exp(-abs(star.y) * 100.0 - abs(star.x) * 12.0);
      float spark = glint * step(.62, hash21(cell + 6.2)) * wake;
      float envelope = smoothstep(.03, .15, uSurfacePhase) * (1.0 - smoothstep(.83, .96, uSurfacePhase));
      reflection += ((spectral * .95 + vec3(.16)) * beam + spectral * wake * .20 + vec3(1.0, .94, 1.0) * spark * 1.6) * uFoilReveal * envelope * holoHere * detailGate;
    }
    if (uMaterial > 0) {
      if (uMaterial <= 3) {
        float rim = exp(-max(edge, 0.0) / (1.5 + uMaterialDepth * 4.0));
        float innerRim = uMaterial == 3 ? exp(-abs(edge - (5.0 + uMaterialDepth * 8.0)) / 1.4) * .5 : 0.0;
        float streak = pow(max(0.0, 1.0 - abs(dot(R.xy, vec2(.8, .6)) + (vUv.x + vUv.y - 1.0) * .35)), uMaterial == 2 ? 12.0 : 55.0);
        float sheetLight = vUv.x * .8 + vUv.y * .6 - .6 + dot(R.xy, vec2(.22, .16));
        float strip = exp(-pow((sheetLight - .08) / .055, 2.0)) + .35 * exp(-pow((sheetLight + .04) / .018, 2.0));
        reflection += vec3(1.0) * (streak * .4 + strip * (uMaterial == 2 ? .08 : .42) + (rim + innerRim) * (.3 + .7 * NdotL)) * uMaterialShine;
        // A polished rim catches light even when the base is nearly clear.
        stickerA = max(stickerA, clamp(edge / px + .5, 0.0, 1.0) * (rim + innerRim) * uMaterialShine * .6);
        if (uMaterial == 2) col *= 1.0 + (vnoise(mq / 1.8) - .5) * uMaterialTexture * .12;
      } else if (uMaterial == 4) {
        reflection += vec3(1.0) * (pow(NsdotH, 18.0) * .7 + pow(1.0 - NdotV, 2.0) * .5) * uMaterialShine;
        col *= 1.0 - raised * uMaterialDepth * .06;
      } else if (uMaterial == 5) {
        col *= .92 + .08 * NdotL;
        reflection += vec3(1.0) * pow(NsdotH, 9.0) * .24 * uMaterialShine;
      } else if (uMaterial == 6) {
        col *= 1.0 + thread * uMaterialTexture * .23;
        col *= 1.0 - raised * uMaterialDepth * .2;
        reflection += vec3(1.0) * pow(NdotH, 12.0) * .12 * uMaterialShine;
      } else if (uMaterial == 7) {
        float scratch = vnoise(vec2(mq.x / 110.0, mq.y * 1.8));
        col *= .78 + scratch * .32 * uMaterialTexture;
        float brushed = pow(max(0.0, 1.0 - abs(dot(H, vB))), 14.0);
        reflection += mix(uMaterialTint, vec3(1.0), .7) * brushed * .65 * uMaterialShine;
      } else if (uMaterial == 8) {
        float fibers = vnoise(mq / vec2(1.2, 7.0)) * .6 + vnoise(mq / 2.2) * .4;
        col *= 1.0 + (fibers - .55) * uMaterialTexture * .45;
      } else if (uMaterial == 9) {
        float film = vnoise(mq / 55.0) * uMaterialTexture;
        vec3 interference = .55 + .45 * cos(vec3(0, 2.1, 4.2) + (1.0 - NdotV) * 16.0 + dot(R.xy, vec2(2.2, 3.1)) + film * 5.0);
        float rim = exp(-max(edge, 0.0) / (1.2 + uMaterialDepth * 2.0));
        reflection += mix(uMaterialTint, interference, .8) * (.28 + .55 * pow(NdotH, 7.0)) * uMaterialShine;
        reflection += vec3(1) * (rim * .45 + pow(NdotH, 65.0) * .3) * uMaterialShine;
      } else if (uMaterial == 10) {
        // Tinted volume, a soft raised edge, and sparse suspended air bubbles.
        col *= mix(vec3(1), uMaterialTint, (.16 + raised * uMaterialDepth * .22));
        vec2 cell = floor(mq / 26.0), bubble = fract(mq / 26.0) - (.25 + hash22(cell) * .5);
        float radius = .065 + hash21(cell + 8.0) * .06;
        float ringBubble = exp(-abs(length(bubble) - radius) * 105.0) * step(.64, hash21(cell + 3.0)) * uMaterialTexture;
        reflection += mix(uMaterialTint, vec3(1), .75) * (pow(NsdotH, 22.0) * .85 + raised * .22 + ringBubble * .45) * uMaterialShine;
        col *= 1.0 - raised * uMaterialDepth * .12;
      } else if (uMaterial == 11) {
        float speck = smoothstep(.78, .92, vnoise(mq / 1.7));
        col *= 1.0 - speck * uMaterialTexture * .55;
        col *= 1.0 - raised * uMaterialDepth * .12;
        reflection += vec3(1, .97, .9) * (pow(NdotH, 38.0) * .8 + pow(NsdotH, 8.0) * .16) * uMaterialShine;
      } else if (uMaterial == 12) {
        float nap = vnoise(mq / vec2(2.0, 9.0));
        col *= .73 + nap * uMaterialTexture * .24;
        col *= 1.0 - raised * uMaterialDepth * .2;
        float sheen = pow(1.0 - NdotV, .65) + pow(1.0 - abs(dot(H, vT)), 8.0) * .2;
        reflection += mix(uMaterialTint, vec3(1), .6) * sheen * .5 * uMaterialShine;
      } else if (uMaterial == 13) {
        float filaments = .5 + .5 * sin((mq.x + mq.y) * 2.0);
        col *= 1.0 - uMaterialTexture * (.2 + .38 * (1.0 - thread) + .08 * filaments);
        float weaveHighlight = pow(NdotH, 22.0) * (.3 + thread * .6);
        reflection += mix(uMaterialTint, vec3(1), .7) * weaveHighlight * .55 * uMaterialShine;
      }
    }
    reflection += mix(vec3(1.0, .78, .9), vec3(.72, .9, 1.0), .5 + .5 * sin(R.x * 7.0 + R.y * 5.0)) * uPearl * (.2 + .8 * pow(1.0 - NdotV, 1.5));

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
      reflection += sp * present * shape * uGlitter * mix(vec3(1.0), rb, 0.5) * holoHere * 2.4 * detailGate;
    }

    // --- specular + fresnel rim ---
    reflection += uSpec * pow(NdotH, 24.0 + 120.0 * uGloss) * mix(vec3(1.0), rb, 0.35) * detailGate;
    reflection += uFresnel * pow(1.0 - NdotV, 3.0) * rb * detailGate;

    if (uSoftHighlights > 0.5) {
      // Blend the combined reflection with the print instead of clipping each
      // channel. White foil retains its colour, and the highlight has a smooth
      // shoulder even when glitter and specular peaks land on the same pixel.
      col /= max(1.0, max(col.r, max(col.g, col.b)));
      float peak = max(reflection.r, max(reflection.g, reflection.b));
      col = (col + reflection) / (1.0 + peak);
    } else {
      col += reflection;
      float m = max(col.r, max(col.g, col.b));
      col = mix(col, col / max(m, 1e-5), smoothstep(1.0, 1.8, m));
    }
    col = clamp(col, 0.0, 1.0);

    // selection ring sits outside the die-cut
    vec3 ringCol = vec3(1.0, 0.56, 0.72);
    float ringA = ring * (1.0 - stickerA);
    fragColor = vec4(col * stickerA + ringCol * ringA, stickerA + ringA) * uOpacity;
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

  const PATTERN_IDS = { none: 0, linear: 1, radial: 2, prism: 3, crosshatch: 4, lens: 5, facets: 6, waves: 7, pinwheel: 8, shards: 9, aurora: 10, ice: 11, stars: 12, diffraction: 13 };
  const BORDER_STYLE_IDS = { solid: 0, linear: 1, radial: 2, conic: 3, rainbow: 4 };

  /* Rz * Rx * Ry, column-major, written into `out` (no allocation: this runs twice per sticker per frame). */
  function rotationMatrix(rx, ry, rz, out) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    const m = out || new Float32Array(9);
    m[0] = cz * cy - sz * sx * sy; m[1] = sz * cy + cz * sx * sy; m[2] = -cx * sy;
    m[3] = -sz * cx;               m[4] = cz * cx;               m[5] = sx;
    m[6] = cz * sy + sz * sx * cy; m[7] = sz * sy - cz * sx * cy; m[8] = cx * cy;
    return m;
  }
  const ROT = new Float32Array(9), ROT_SHADOW = new Float32Array(9);

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  const rgbCache = new Map();
  function rgbOf(hex) {
    let c = rgbCache.get(hex);
    if (!c) { c = new Float32Array(hexToRgb(hex)); if (rgbCache.size > 256) rgbCache.clear(); rgbCache.set(hex, c); }
    return c;
  }

  function surfacePeriod(s) { return 4 / Math.max(.5, Math.min(2, Number(s.surfaceSpeed) || 1)); }
  function surfaceState(s, phase) {
    const amount = Math.max(0, Math.min(1, Number(s.surfaceAmount ?? .8) || 0));
    if (phase < 0 || phase > 1 || !Number.isFinite(phase)) return { peel: 0, foil: 0 };
    const ease = (a, b) => { const x = Math.max(0, Math.min(1, (phase - a) / (b - a))); return x * x * x * (x * (x * 6 - 15) + 10); };
    return { peel: s.surfaceEffect === 'peel' ? amount * ease(.06, .40) * (1 - ease(.52, .91)) : 0, foil: s.surfaceEffect === 'foil-reveal' ? amount * 1.8 : 0 };
  }

  const SURFACE_EFFECTS = ['foil-reveal', 'peel', 'ripple', 'lenticular', 'assembly'];
  function assemblyState(phase, index = 0, count = 1, amount = 1) {
    if (!(phase >= 0 && phase <= 1) || amount <= 0) return { opacity: 1, lift: 0, scale: 1, angle: 0 };
    const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const start = index === 0 ? .015 : index === 1 ? .16 : .28 + .23 * (index - 2) / Math.max(1, count - 2);
    const t = Math.max(0, Math.min(1, (phase - start) / .18));
    const arrival = smooth(t), exit = smooth((phase - .86) / .14);
    const lift = (1 - arrival + exit) * amount;
    const spring = Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI) * .07 * amount;
    return { opacity: arrival * (1 - exit), lift, scale: 1 - lift * .14 + spring, angle: lift * (index % 2 ? -.13 : .11) };
  }
  function assemblyPose(pose, state) {
    const m = pose.rotation || rotationMatrix(pose.rotX, pose.rotY, pose.rotZ);
    const rotation = new Float32Array(9), c = Math.cos(state.angle), sn = Math.sin(state.angle);
    for (let j = 0; j < 3; j++) { rotation[j] = m[j] * c + m[3 + j] * sn; rotation[3 + j] = -m[j] * sn + m[3 + j] * c; rotation[6 + j] = m[6 + j]; }
    return { ...pose, rotation, y: pose.y + pose.height * state.lift * .2, z: pose.z + pose.height * state.lift * .12,
      width: pose.width * state.scale, height: pose.height * state.scale, scale: (pose.scale || 1) * state.scale, opacity: (pose.opacity ?? 1) * state.opacity };
  }

  function peelInset(t, s) { return Math.max(0, (t?.corner?.[s.flipX ? 1 : 0] || 0) - (s.borderWidth || 0)) / Math.max(1, Math.min(t?.w || 1, t?.h || 1)); }
  function peelPoint(x, y, width, height, amount, inset = 0) {
    const unit = Math.SQRT1_2, radius = Math.max(Math.min(width, height) * .23, .001);
    const crease = (width + height) * .5 * unit - Math.min(width, height) * (amount > 0 ? inset + .60 * amount : 0);
    const d = amount > .0001 ? Math.max((x + y) * unit - crease, 0) : 0, angle = d / radius, sn = Math.sin(angle), cs = Math.cos(angle), delta = (radius * sn - d) * unit;
    return { x: x + delta, y: y + delta, z: radius * (1 - cs), rotation: new Float32Array([.5 + .5 * cs, .5 * (cs - 1), sn * unit, .5 * (cs - 1), .5 + .5 * cs, sn * unit, -sn * unit, -sn * unit, cs]) };
  }
  function bindSurface(pose, surface) {
    const p = surface.pose.rotation || rotationMatrix(surface.pose.rotX, surface.pose.rotY, surface.pose.rotZ);
    const m = pose.rotation || rotationMatrix(pose.rotX, pose.rotY, pose.rotZ);
    const axes = new Float32Array(9), d = [pose.x - surface.pose.x, pose.y - surface.pose.y, pose.z - surface.pose.z];
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) axes[col * 3 + row] = p[row * 3] * m[col * 3] + p[row * 3 + 1] * m[col * 3 + 1] + p[row * 3 + 2] * m[col * 3 + 2];
    const origin = [0, 1, 2].map(i => p[i * 3] * d[0] + p[i * 3 + 1] * d[1] + p[i * 3 + 2] * d[2]);
    return { ...pose, surface: { ...surface, axes, origin } };
  }

  // CPU counterpart of the shared sheet deformation, also used for picking.
  function surfaceVertex(pose, u, v, amount, inset) {
    const attached = pose.surface, sheet = attached?.pose || pose;
    const m = sheet.rotation || rotationMatrix(sheet.rotX, sheet.rotY, sheet.rotZ);
    let x = (u - .5) * pose.width, y = (.5 - v) * pose.height;
    if (attached) {
      const a = attached.axes, o = attached.origin;
      const px = a[0] * x + a[3] * y + o[0]; y = a[1] * x + a[4] * y + o[1]; x = px;
      amount = attached.amount; inset = attached.inset;
    }
    const p = peelPoint(x, y, sheet.width, sheet.height, amount, inset), n = p.rotation;
    return { x: sheet.x + m[0] * p.x + m[3] * p.y + m[6] * p.z,
      y: sheet.y + m[1] * p.x + m[4] * p.y + m[7] * p.z,
      z: sheet.z + m[2] * p.x + m[5] * p.y + m[8] * p.z,
      nx: m[0] * n[6] + m[3] * n[7] + m[6] * n[8],
      ny: m[1] * n[6] + m[4] * n[7] + m[7] * n[8],
      nz: m[2] * n[6] + m[5] * n[7] + m[8] * n[8] };
  }

  // Invert the rendered mesh for picking. Walk triangles in reverse draw order
  // so the rolled-over corner wins over the portion of paper beneath it.
  function hitSurface(pose, camDist, x, y, amount, inset, flip) {
    const steps = (pose.surface?.amount ?? amount) > .0001 ? 40 : 1, points = [];
    for (let j = 0; j <= steps; j++) for (let i = 0; i <= steps; i++) {
      const p = surfaceVertex(pose, i / steps, 1 - j / steps, amount, inset);
      const w = (camDist - p.z) / camDist;
      points.push({ x: p.x / w, y: p.y / w, z: p.z, facing: -p.nx * p.x - p.ny * p.y + p.nz * (camDist - p.z), w, u: i / steps, v: 1 - j / steps });
    }
    const hits = [];
    const triangle = (a, b, c) => {
      const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y); if (Math.abs(den) < 1e-8) return;
      let A = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den;
      let B = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den; let C = 1 - A - B;
      if (A < -1e-6 || B < -1e-6 || C < -1e-6) return;
      A /= a.w; B /= b.w; C /= c.w; const sum = A + B + C;
      const u = (A * a.u + B * b.u + C * c.u) / sum, v = (A * a.v + B * b.v + C * c.v) / sum;
      if (pose.surface && A * a.facing + B * b.facing + C * c.facing <= 0) return;
      hits.push({ u: flip ? 1 - u : u, v, z: (A * a.z + B * b.z + C * c.z) / sum });
    };
    for (let j = steps - 1; j >= 0; j--) for (let i = steps - 1; i >= 0; i--) {
      const a = points[j * (steps + 1) + i], b = points[j * (steps + 1) + i + 1], c = points[(j + 1) * (steps + 1) + i], d = points[(j + 1) * (steps + 1) + i + 1];
      triangle(b, d, c); triangle(a, b, c);
    }
    return hits.sort((a, b) => b.z - a.z);
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
      // Shared mesh, used only for peeling; ordinary stickers keep their quad.
      this.peelVao = gl.createVertexArray(); gl.bindVertexArray(this.peelVao);
      const mesh = [], steps = 40;
      for (let y = 0; y < steps; y++) for (let x = 0; x < steps; x++) {
        const x0 = x / steps - .5, x1 = (x + 1) / steps - .5, y0 = y / steps - .5, y1 = (y + 1) / steps - .5;
        mesh.push(x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1);
      }
      const meshBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.peelCount = mesh.length / 2;
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
      const sdf = this._sdfTexture(atlas.sdf, atlas.w, atlas.h);
      // an optional second drawing with the same silhouette (an icon with its eyes closed)
      const blink = atlas.blink ? this._pictureTexture(atlas.blink) : null;
      // an animated picture: the frames after the first (each a picture and its own die), and when each frame of the loop ends (ms)
      let frames = null, frameEnds = null, period = 0;
      if (atlas.frames && atlas.frames.length) {
        frames = atlas.frames.map((fr) => ({ img: this._pictureTexture(fr.canvas), sdf: fr.sdf ? this._sdfTexture(fr.sdf, atlas.w, atlas.h) : null }));
        const durations = atlas.durations && atlas.durations.length === frames.length + 1 ? atlas.durations : frames.concat([null]).map(() => 100);
        frameEnds = durations.map((ms) => (period += Math.max(20, ms)));
      }
      // Distance from each upper atlas corner to the nearest visible diagonal
      // support line. This keeps the curl on the artwork, even on padded cutouts.
      const corner = [Infinity, Infinity];
      const bounds = [atlas.w, atlas.h, 0, 0];
      for (let y = 0; y < atlas.h; y++) for (let x = 0; x < atlas.w; x++) if (atlas.sdf[y * atlas.w + x] >= 0) {
        corner[0] = Math.min(corner[0], atlas.w - 1 - x + y); corner[1] = Math.min(corner[1], x + y);
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[2] = Math.max(bounds[2], x + 1); bounds[3] = Math.max(bounds[3], y + 1);
      }
      const assemblyBase = atlas.assemblyBase ? this._pictureTexture(atlas.assemblyBase) : null;
      const second = atlas.second ? this._pictureTexture(atlas.second) : null;
      return { img, sdf, blink, frames, frameEnds, period, assemblyBase, second, bounds: bounds[2] > bounds[0] ? bounds.map((v, i) => v / (i % 2 ? atlas.h : atlas.w)) : [0, 0, 1, 1], w: atlas.w, h: atlas.h, corner: corner.map(v => Number.isFinite(v) ? v / Math.SQRT2 : 0), preserveAlpha: !!atlas.preserveAlpha };
    }

    /* a signed distance field (px, positive inside), on unit 1 */
    _sdfTexture(data, w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    }

    /* a premultiplied RGBA picture, mipmapped, on unit 0 */
    _pictureTexture(canvas) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      return tex;
    }

    deleteTextures(t) {
      if (!t) return;
      this.gl.deleteTexture(t.img); this.gl.deleteTexture(t.sdf);
      if (t.blink) this.gl.deleteTexture(t.blink);
      if (t.second) this.gl.deleteTexture(t.second);
      if (t.assemblyBase) this.gl.deleteTexture(t.assemblyBase);
      if (t.frames) for (const f of t.frames) { this.gl.deleteTexture(f.img); if (f.sdf) this.gl.deleteTexture(f.sdf); }
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
      gl.uniform1i(u.uSecondImage, 3); gl.uniform1i(u.uAssemblyBase, 4);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.blank);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.blank);
      gl.uniform2f(u.uStage, view.stageW, view.stageH);
      gl.uniform1f(u.uCamDist, view.camDist);
      gl.uniform3f(u.uCamPos, 0, 0, view.camDist);
      gl.uniform3fv(u.uLightPos, view.light);
      gl.uniform1f(u.uTime, view.time || 0);
      this.view = view;
    }

    setMaterial(s) {
      const gl = this.gl, u = this.u;
      const shine = Math.max(0, Math.min(100, s.lightStrength ?? 65)) / 100;
      const material = ['vinyl', 'glass', 'frosted', 'acrylic', 'resin', 'puffy', 'embroidery', 'metal', 'paper', 'iridescent', 'jelly', 'ceramic', 'velvet', 'carbon'].indexOf(s.material || 'vinyl');
      const finish = s.materialFinish || 'natural';
      if ((material > 0 && finish === 'natural') || !['natural', 'custom'].includes(finish)) {
        s = { ...s, holoIntensity: 0, metallic: 0, glitter: 0, specular: [6, 8, 12].includes(material) ? .03 : .4, fresnel: .1, gloss: .65 };
        if (finish === 'matte') Object.assign(s, { specular: 0, fresnel: 0 });
        if (finish === 'gloss') Object.assign(s, { specular: 1.1, gloss: .85, fresnel: .25 });
        if (finish === 'holographic') Object.assign(s, { holoIntensity: .85, saturation: .9, metallic: .15 });
        if (finish === 'glitter') Object.assign(s, { glitter: 1.3, glitterDensity: .65, glitterScale: 5 });
      }
      gl.uniform1i(u.uMaterial, Math.max(0, material));
      gl.uniform1f(u.uMaterialDepth, s.materialDepth ?? .3);
      gl.uniform1f(u.uMaterialTexture, s.materialTexture ?? .2);
      gl.uniform1f(u.uMaterialScale, s.materialScale ?? 1);
      gl.uniform1f(u.uMaterialOpacity, s.materialOpacity ?? 1);
      gl.uniform1f(u.uArtworkOpacity, s.artworkOpacity ?? 1);
      gl.uniform3fv(u.uMaterialTint, rgbOf(s.materialTint || '#ffffff'));
      gl.uniform1f(u.uMaterialShine, finish === 'matte' ? 0 : shine);
      gl.uniform1f(u.uPearl, finish === 'pearl' ? shine * 1.4 : 0);
      gl.uniform1f(u.uSoftHighlights, s.softHighlights === false ? 0 : 1);
      gl.uniform1f(u.uBorderWidth, s.borderWidth);
      gl.uniform3fv(u.uBorderColor, rgbOf(s.borderColor));
      gl.uniform3fv(u.uBorderColor2, rgbOf(s.borderColor2 || '#ffb7d5'));
      gl.uniform3fv(u.uBorderColor3, rgbOf(s.borderColor3 || '#8bdcff'));
      gl.uniform1i(u.uBorderStyle, BORDER_STYLE_IDS[s.borderStyle] || 0);
      gl.uniform1f(u.uBorderAngle, (Number(s.borderAngle) || 0) * Math.PI / 180);
      gl.uniform1f(u.uBorderHolo, s.borderHolo);
      gl.uniform1f(u.uHoloIntensity, s.holoIntensity * shine);
      gl.uniform1f(u.uHoloSpread, s.holoSpread);
      gl.uniform1f(u.uBandScale, s.bandScale);
      gl.uniform1f(u.uPatternAngle, s.patternAngle * Math.PI / 180);
      gl.uniform1f(u.uHueShift, s.hueShift);
      gl.uniform1f(u.uSaturation, s.saturation);
      gl.uniform1f(u.uMetallic, s.metallic * shine);
      gl.uniform1f(u.uShimmer, s.shimmer);
      gl.uniform1i(u.uPattern, PATTERN_IDS[s.pattern] || 0);
      gl.uniform1f(u.uGlitter, s.glitter * shine);
      gl.uniform1f(u.uGlitterScale, s.glitterScale);
      gl.uniform1f(u.uGlitterDensity, s.glitterDensity);
      gl.uniform1f(u.uGlitterSharp, s.glitterSharp);
      gl.uniform1f(u.uGloss, s.gloss);
      gl.uniform1f(u.uSpec, s.specular * shine);
      gl.uniform1f(u.uGrain, s.grain);
      gl.uniform1f(u.uBevel, s.bevel);
      gl.uniform1f(u.uBevelWidth, s.bevelWidth);
      gl.uniform1f(u.uFresnel, s.fresnel * shine);
      gl.uniform1f(u.uFlake, s.flake);
      gl.uniform1f(u.uInkBright, s.inkBrightness);
      gl.uniform1f(u.uInkSat, s.inkSaturation);
      gl.uniform1f(u.uInkFoil, s.inkFoil);
      gl.uniform1f(u.uShadowBlur, s.shadowBlur);
      gl.uniform1f(u.uShadowSpread, s.shadowSpread);
      gl.uniform1f(u.uShadowOpacity, s.shadowOpacity * ((material > 0 && material <= 3) || material === 9 || material === 10 ? .25 + .75 * Math.max(s.materialOpacity ?? 1, s.artworkOpacity ?? 1) : 1));
      gl.uniform1f(u.uDiffuse, s.diffuse);
    }

    _geometry(pose) {
      const gl = this.gl, u = this.u;
      const sheet = pose.surface?.pose || pose;
      gl.uniformMatrix3fv(u.uRot, false, sheet.rotation || rotationMatrix(sheet.rotX, sheet.rotY, sheet.rotZ, ROT));
      gl.uniform2f(u.uSize, pose.width, pose.height);
      gl.uniform2f(u.uOffset, pose.offset ? pose.offset[0] : 0, pose.offset ? pose.offset[1] : 0);
      gl.uniform1f(u.uAttached, pose.surface ? 1 : 0);
      if (pose.surface) {
        gl.uniformMatrix3fv(u.uAttachAxes, false, pose.surface.axes);
        gl.uniform3fv(u.uAttachOrigin, pose.surface.origin);
        gl.uniform2f(u.uBendSize, sheet.width, sheet.height);
      }
    }

    _drawSurface() {
      const gl = this.gl;
      gl.bindVertexArray(this.peeling ? this.peelVao : this.vao);
      gl.drawArrays(this.peeling ? gl.TRIANGLES : gl.TRIANGLE_STRIP, 0, this.peeling ? this.peelCount : 4);
    }

    /*
     * The shadow pass: the sticker's silhouette cast onto the page by a distant light.
     * A point of the sticker at height h lands on the page shifted by dir * h, so the
     * cast outline is the tilted quad's axes sheared by the light direction: a flat
     * quad, no extra fragment work, and a tilted sticker's shadow stretches away from
     * its lifted edge and tucks under the edge that touches down. The fragment shader
     * gets each point's height for the softness (see uShadowHeight).
     * sh: { dir: [x, y] page px per px of height, h0: height of the sticker centre,
     *       ref: resting height, scale: outline growth }
     */
    _shadowPass(pose, sh) {
      const gl = this.gl, u = this.u;
      const m = pose.rotation || rotationMatrix(pose.rotX, pose.rotY, pose.rotZ, ROT), S = ROT_SHADOW;
      const dx = sh.dir[0], dy = sh.dir[1], tz = m[2], bz = m[5], k = sh.scale || 1;
      S[0] = m[0] + dx * tz; S[1] = m[1] + dy * tz; S[2] = 0;
      S[3] = m[3] + dx * bz; S[4] = m[4] + dy * bz; S[5] = 0;
      S[6] = m[6] + dx * m[8]; S[7] = m[7] + dy * m[8]; S[8] = 0;
      const ox = pose.offset ? pose.offset[0] : 0, oy = pose.offset ? pose.offset[1] : 0;
      gl.uniformMatrix3fv(u.uRot, false, S);
      gl.uniform2f(u.uSize, pose.width * k, pose.height * k);
      gl.uniform2f(u.uOffset, ox, oy);
      gl.uniform3f(u.uCenter, pose.x + dx * sh.h0, pose.y + dy * sh.h0, pose.z - sh.h0);
      gl.uniform1f(u.uShadowRef, sh.ref);
      gl.uniform3f(u.uShadowHeight, sh.h0 + tz * ox + bz * oy, tz * pose.width, -bz * pose.height);
      gl.uniform1f(u.uCasterBase, sh.h0);
      gl.uniform3f(u.uCasterAxis, tz / k, bz / k, m[8] / k);
      gl.uniform1i(u.uMode, 1);
      this._drawSurface();
    }

    /*
     * Draw one sticker. t: texture set, pose: { x, y, z, rotX, rotY, rotZ, width, height },
     * s: material settings, opts: { selected, shadow: (see _shadowPass) | null }
     */
    drawSticker(t, pose, s, opts) {
      const gl = this.gl, u = this.u;
      opts = opts || {};
      const attached = pose.surface;
      const occluded = attached && attached.amount > .0001;
      if (occluded) {
        // Depth is scoped to this sheet, so unrelated stickers retain their
        // existing layer order. The prepass never changes the colour buffer.
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
        gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.colorMask(false, false, false, false);
        this.drawSticker(attached.tex, attached.pose, attached.settings, { surfacePhase: attached.phase, depthOnly: true });
        gl.colorMask(true, true, true, true); gl.depthMask(false);
      }
      gl.uniform1f(u.uPreserveAlpha, t.preserveAlpha ? 1 : 0);
      gl.uniform1f(u.uFlipX, s.flipX ? 1 : 0);
      const phase = opts.surfacePhase ?? (s.surfaceTrigger && s.surfaceTrigger !== 'loop' ? -1 : ((this.view.time || 0) / surfacePeriod(s)) % 1);
      const effect = surfaceState(s, phase);
      const amount = Math.max(0, Math.min(1, Number(s.surfaceAmount ?? .8) || 0)), active = phase >= 0 && phase <= 1;
      gl.uniform1f(u.uOpacity, opts.depthOnly ? 1 : pose.opacity ?? 1);
      gl.uniform1f(u.uRipple, active && s.surfaceEffect === 'ripple' ? amount : 0);
      gl.uniform2fv(u.uRippleOrigin, opts.surfaceOrigin || [.5, .5]);
      gl.uniform1f(u.uLenticular, t.second && s.surfaceEffect === 'lenticular' && (active || opts.surfaceMix != null) ? amount : 0);
      gl.uniform1f(u.uImageMix, opts.surfaceMix ?? (active ? .5 - .5 * Math.cos(phase * Math.PI * 2) : 0));
      gl.uniform1f(u.uAssemblyPhoto, t.assemblyBase ? opts.assemblyPhoto ?? 1 : 1);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, t.second || t.img);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t.assemblyBase || t.img);
      this.peeling = (attached?.amount ?? effect.peel) > .0001;
      gl.uniform1f(u.uPeel, attached?.amount ?? effect.peel);
      gl.uniform1f(u.uPeelInset, attached?.inset ?? peelInset(t, s));
      gl.uniform1f(u.uDepthBias, attached ? .00015 : 0);
      gl.uniform1f(u.uAttached, attached ? 1 : 0);
      gl.uniform1f(u.uFoilReveal, effect.foil * Math.max(0, Math.min(100, s.lightStrength ?? 65)) / 100);
      gl.uniform1f(u.uSurfacePhase, phase);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.img);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.sdf);
      gl.uniform2f(u.uTexSize, t.w, t.h);
      gl.uniform1i(u.uRectShape, 0);
      gl.uniform1i(u.uHasMask, 1);
      gl.uniform1f(u.uSelected, opts.selected ? 1 : 0);
      this.setMaterial(s);
      // An affixed decoration shares its parent's lift and cast shadow.
      if (!attached && !opts.depthOnly && s.shadowOpacity > 0.001 && opts.shadow) this._shadowPass(pose, opts.shadow);
      gl.uniform1i(u.uMode, opts.depthOnly ? 3 : 0);
      this._geometry(pose);
      const sheet = attached?.pose || pose;
      gl.uniform3f(u.uCenter, sheet.x, sheet.y, sheet.z);
      this._drawSurface();
      if (occluded) { gl.disable(gl.DEPTH_TEST); gl.depthMask(true); }
    }

    /*
     * Draw the full-image layer used while a sticker is being extracted.
     * full: image texture, t: sticker texture set or null, pose: quad of the full image
     * (with `offset` relative to the sticker centre), opts: { atlasRect: [x,y,w,h],
     * front, processing, alpha, borderWidth, shadow: (see _shadowPass) + {opacity,blur,spread} | null }
     */
    drawFullLayer(full, t, pose, opts) {
      const gl = this.gl, u = this.u;
      this.peeling = false; gl.uniform1f(u.uPeel, 0);
      gl.uniform1f(u.uAttached, 0); gl.uniform1f(u.uDepthBias, 0); gl.uniform1f(u.uOpacity, 1);
      gl.uniform1f(u.uFlipX, 0);
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
        gl.uniform1i(u.uRectShape, 1);
        gl.uniform1f(u.uShadowOpacity, opts.shadow.opacity);
        gl.uniform1f(u.uShadowBlur, opts.shadow.blur);
        gl.uniform1f(u.uShadowSpread, opts.shadow.spread);
        gl.uniform1f(u.uBorderWidth, 0);
        this._shadowPass(pose, opts.shadow);
        gl.uniform1f(u.uBorderWidth, opts.borderWidth || 0);
      }
      gl.uniform1i(u.uMode, 2);
      gl.uniform1i(u.uRectShape, 0);
      this._geometry(pose);
      gl.uniform3f(u.uCenter, pose.x, pose.y, pose.z);
      this._drawSurface();
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
      const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      gl.viewport(0, 0, W, H);
      const prevClear = this.clearColor;
      if (opts.background) { const c = hexToRgb(opts.background); this.clearColor = [c[0], c[1], c[2], 1]; }
      else this.clearColor = [0, 0, 0, 0];
      opts.draw({ stageW: W, stageH: H });
      const pixels = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); gl.deleteRenderbuffer(depth);
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
  Renderer.rotationMatrix = rotationMatrix;
  Renderer.surfacePeriod = surfacePeriod;
  Renderer.surfaceState = surfaceState;
  Renderer.SURFACE_EFFECTS = SURFACE_EFFECTS;
  Renderer.assemblyState = assemblyState;
  Renderer.assemblyPose = assemblyPose;
  Renderer.peelInset = peelInset;
  Renderer.peelPoint = peelPoint;
  Renderer.bindSurface = bindSurface;
  Renderer.surfaceVertex = surfaceVertex;
  Renderer.hitSurface = hitSurface;
  return Renderer;
})();
