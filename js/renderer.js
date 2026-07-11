// WebGL2 renderer that ports the Unity shader "AR/SplitVideoAlphaMask".
// Each video frame is split left(color)/right(mask); mask's red channel is
// used as alpha. Straight (non-premultiplied) alpha blending, alpha-cutoff
// discard, optional bottom fade and horizontal mirror.
import { CONFIG } from './config.js?v=32';

const VERT_SRC = `#version 300 es
in vec2 aPos;
in vec2 aUv;
uniform vec2 uCenterPx;
uniform vec2 uSizePx;
uniform vec2 uResPx;
uniform float uAngleDeg;
uniform float uMirror;
out vec2 vUv;
void main() {
  float a = radians(uAngleDeg);
  mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 px = uCenterPx + r * (aPos * uSizePx);
  vec2 ndc = (px / uResPx) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = vec2(mix(aUv.x, 1.0 - aUv.x, step(0.5, uMirror)), aUv.y);
}
`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uAlphaCutoff;
uniform float uMinAlpha;
uniform float uFadeAmount;
uniform float uAlphaMul;
out vec4 frag;
void main() {
  vec2 colorUv = vec2(vUv.x * 0.5, vUv.y);
  vec2 maskUv = vec2(0.5 + vUv.x * 0.5, vUv.y);
  vec4 color = texture(uTex, colorUv);
  float a = texture(uTex, maskUv).r;
  color.a *= max(clamp(a, 0.0, 1.0), uMinAlpha);
  color.a *= (uFadeAmount > 0.0) ? smoothstep(0.0, uFadeAmount, vUv.y) : 1.0;
  color.a *= uAlphaMul;
  if (color.a - uAlphaCutoff < 0.0) discard;
  frag = color;
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile error: ' + info);
  }
  return sh;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;

    // Unit quad, two triangles, positions in [-0.5, 0.5], UV origin top-left (0,0)->(1,1).
    const verts = new Float32Array([
      // aPos.x, aPos.y, aUv.x, aUv.y
      -0.5, -0.5, 0.0, 0.0,
       0.5, -0.5, 1.0, 0.0,
       0.5,  0.5, 1.0, 1.0,
      -0.5, -0.5, 0.0, 0.0,
       0.5,  0.5, 1.0, 1.0,
      -0.5,  0.5, 0.0, 1.0,
    ]);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(prog, 'aPos');
    const aUvLoc = gl.getAttribLocation(prog, 'aUv');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUvLoc);
    gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    this.u = {
      centerPx: gl.getUniformLocation(prog, 'uCenterPx'),
      sizePx: gl.getUniformLocation(prog, 'uSizePx'),
      resPx: gl.getUniformLocation(prog, 'uResPx'),
      angleDeg: gl.getUniformLocation(prog, 'uAngleDeg'),
      mirror: gl.getUniformLocation(prog, 'uMirror'),
      tex: gl.getUniformLocation(prog, 'uTex'),
      alphaCutoff: gl.getUniformLocation(prog, 'uAlphaCutoff'),
      minAlpha: gl.getUniformLocation(prog, 'uMinAlpha'),
      fadeAmount: gl.getUniformLocation(prog, 'uFadeAmount'),
      alphaMul: gl.getUniformLocation(prog, 'uAlphaMul'),
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    // iOS Safari is unreliable uploading a <video> straight to a GL texture
    // (often yields a blank/black texture), but it reliably draws a playing
    // video onto a 2D canvas. So we blit video -> 2D canvas -> GL texture.
    this._scratch = document.createElement('canvas');
    this._sctx = this._scratch.getContext('2d', { willReadFrequently: false });

    // Diagnostics for the on-screen overlay: did the last upload get real pixels?
    this.lastUploadOk = false;
    this.framesUploaded = 0;

    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(CONFIG.STAGE_W * dpr);
    const h = Math.round(CONFIG.STAGE_H * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  createTextureFor(toy) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 1x1 transparent placeholder until the video has a frame ready.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    toy._glTex = tex;
    return tex;
  }

  updateTexture(toy) {
    const gl = this.gl;
    const v = toy.videoEl;
    if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;

    // Blit the current video frame onto our scratch 2D canvas first. This is the
    // reliable path on iOS Safari (a direct video->texture upload often comes up
    // blank there).
    if (this._scratch.width !== v.videoWidth || this._scratch.height !== v.videoHeight) {
      this._scratch.width = v.videoWidth;
      this._scratch.height = v.videoHeight;
    }
    try {
      this._sctx.drawImage(v, 0, 0, this._scratch.width, this._scratch.height);
    } catch (e) {
      return; // frame not decodable yet — retry next frame
    }

    gl.bindTexture(gl.TEXTURE_2D, toy._glTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, CONFIG.FLIP_VIDEO_Y);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._scratch);
      this.lastUploadOk = true;
      this.framesUploaded++;
    } catch (e) {
      // Ignore transient upload failures; retry next frame.
    }
  }

  drawFrame(toys) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.u.resPx, CONFIG.STAGE_W, CONFIG.STAGE_H);
    gl.uniform1f(this.u.alphaCutoff, 0.02);
    gl.uniform1f(this.u.minAlpha, 0.0);
    gl.uniform1f(this.u.fadeAmount, 0.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.u.tex, 0);

    // Back-to-front by spawn order (older toys drawn first).
    const sorted = [...toys].sort((a, b) => a.bornAt - b.bornAt);
    for (const toy of sorted) {
      if (!toy._glTex) this.createTextureFor(toy);
      this.updateTexture(toy);
      gl.bindTexture(gl.TEXTURE_2D, toy._glTex);
      gl.uniform2f(this.u.centerPx, toy.renderX ?? toy.x, toy.renderY ?? toy.y);
      gl.uniform2f(this.u.sizePx, toy.w * (toy.scale ?? 1), toy.h * (toy.scale ?? 1));
      gl.uniform1f(this.u.angleDeg, toy.angle ?? 0);
      gl.uniform1f(this.u.mirror, toy.mirror ? 1.0 : 0.0);
      gl.uniform1f(this.u.alphaMul, toy.alpha ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
  }

  destroyTextureFor(toy) {
    if (toy._glTex) {
      this.gl.deleteTexture(toy._glTex);
      toy._glTex = null;
    }
  }
}
