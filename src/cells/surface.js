// The cell history as a 3D surface, drawn with WebGL 2 and no library: drag to turn, scroll or
// pinch to zoom, double-click to reset. It renders only when something changes. Hovering reads
// the grid position back from an offscreen pass that encodes it in its colour, and draws a
// crosshair along that cell and that moment on the surface.

// Half-sizes of the box the surface fills: time along x, cells along y, value up z.
const AX = 1.1;
const AY = 0.55;
const AZ = 0.5;
const TARGET = [0, 0, AZ * 0.1];
// Where the camera starts. A wide view looks from the front (cell 1) a little from the right, so
// time runs left to right; a tall one (a phone) looks down the time axis, the newest end nearest.
const HOME_WIDE = { yaw: -1.3, pitch: 0.5, dist: 2.5 };
const HOME_TALL = { yaw: -0.38, pitch: 0.7, dist: 4.7 };

const SURFACE_VS = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec3 aColor;
in vec2 aUv;
uniform mat4 uMvp;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUv;
out vec3 vPos;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  vUv = aUv;
  vPos = aPos;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

// uPick: write the grid position (12 bits each way) instead of a colour.
const SURFACE_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec2 vUv;
in vec3 vPos;
uniform vec3 uEye;
uniform int uPick;
out vec4 outColor;
void main() {
  if (uPick == 1) {
    float u = floor(clamp(vUv.x, 0.0, 1.0) * 4095.0 + 0.5);
    float v = floor(clamp(vUv.y, 0.0, 1.0) * 4095.0 + 0.5);
    outColor = vec4(floor(u / 16.0), mod(u, 16.0) * 16.0 + floor(v / 256.0), mod(v, 256.0), 255.0) / 255.0;
    return;
  }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 l = normalize(vec3(-0.35, -0.55, 1.0));
  vec3 e = normalize(uEye - vPos);
  float diffuse = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + e)), 0.0), 60.0);
  outColor = vec4(vColor * (0.6 + 0.5 * diffuse) + vec3(0.16 * spec), 1.0);
}`;

const LINE_VS = `#version 300 es
in vec3 aPos;
in vec4 aColor;
uniform mat4 uMvp;
uniform float uPointSize;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMvp * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
}`;

const LINE_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
uniform int uRound;
out vec4 outColor;
void main() {
  if (uRound == 1 && length(gl_PointCoord - 0.5) > 0.5) discard;
  outColor = vColor;
}`;

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const loc = (name) => gl.getUniformLocation(prog, name);
  return { prog, loc, attr: (name) => gl.getAttribLocation(prog, name) };
}

// Column-major 4x4 matrices.
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye, target, up) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const norm = (a) => {
    const l = Math.hypot(...a) || 1;
    return a.map((v) => v / l);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export class Surface3D {
  // canvas: where to draw; labels: an element over it for the axis labels.
  // onHover({ k, row, x, y } | undefined), onClick({ k, row }), onLost(): the context is gone,
  // onCamera({ yaw, pitch, dist }): the viewer turned or zoomed; camera: where to start.
  constructor(canvas, labels, { onHover, onClick, onLost, onCamera, camera }) {
    const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: true });
    if (!gl) throw new Error("This browser can't draw 3D (no WebGL 2).");
    this.gl = gl;
    this.canvas = canvas;
    this.labelsEl = labels;
    this.onHover = onHover;
    this.onClick = onClick;
    this.onLost = onLost;
    this.onCamera = onCamera;
    const ok = camera && ["yaw", "pitch", "dist"].every((k) => Number.isFinite(camera[k]));
    this.cam = ok ? { ...camera } : undefined;
    this.ink = [0.5, 0.5, 0.5];
    this.surface = compile(gl, SURFACE_VS, SURFACE_FS);
    this.line = compile(gl, LINE_VS, LINE_FS);
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.lineBuf = gl.createBuffer();
    this.count = 0;
    this._listen();
  }

  // grid: { cols, rows, value(row, col), lut, lo, hi (colour scale), zLo, zHi, xTicks: [{ at, text }],
  // yTicks: [{ at, text }], zTicks: [{ v, text }], titles: { x, y, z } }; `at` runs 0..1.
  setData(grid) {
    this.grid = grid;
    const { cols, rows, value, lut, lo, hi, zLo, zHi } = grid;
    const n = cols * rows;
    const z = new Float32Array(n);
    const zSpan = zHi - zLo || 1;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const v = value(r, k);
        z[r * cols + k] = Number.isFinite(v) ? AZ * Math.min(1, Math.max(0, (v - zLo) / zSpan)) : NaN;
      }
    }
    this.z = z;
    const dx = cols > 1 ? (2 * AX) / (cols - 1) : 1;
    const dy = rows > 1 ? (2 * AY) / (rows - 1) : 1;
    const at = (r, k) => z[r * cols + k];
    const data = new Float32Array(n * 11);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const i = r * cols + k;
        const h = z[i];
        const o = i * 11;
        data[o] = this._x(k);
        data[o + 1] = this._y(r);
        data[o + 2] = Number.isNaN(h) ? 0 : h;
        // Normal from the neighbours' slopes, where they exist.
        const slope = (a, b, step) => (Number.isNaN(a) || Number.isNaN(b) ? 0 : (b - a) / step);
        const kx0 = k > 0 ? at(r, k - 1) : h;
        const kx1 = k < cols - 1 ? at(r, k + 1) : h;
        const ry0 = r > 0 ? at(r - 1, k) : h;
        const ry1 = r < rows - 1 ? at(r + 1, k) : h;
        const sx = slope(kx0, kx1, dx * ((k > 0) + (k < cols - 1) || 1));
        const sy = slope(ry0, ry1, dy * ((r > 0) + (r < rows - 1) || 1));
        const l = Math.hypot(sx, sy, 1);
        data[o + 3] = -sx / l;
        data[o + 4] = -sy / l;
        data[o + 5] = 1 / l;
        const v = value(r, k);
        const c = Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))) * 255) * 3 : 0;
        data[o + 6] = lut[c] / 255;
        data[o + 7] = lut[c + 1] / 255;
        data[o + 8] = lut[c + 2] / 255;
        data[o + 9] = cols > 1 ? k / (cols - 1) : 0;
        data[o + 10] = rows > 1 ? r / (rows - 1) : 0;
      }
    }
    // Two triangles per interval and pair of neighbouring cells, where all four corners have data.
    const idx = new Uint32Array(Math.max(0, (rows - 1) * (cols - 1) * 6));
    let m = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < cols - 1; k++) {
        const a = r * cols + k;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (Number.isNaN(z[a]) || Number.isNaN(z[b]) || Number.isNaN(z[c]) || Number.isNaN(z[d])) continue;
        idx.set([a, b, d, a, d, c], m);
        m += 6;
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, m), gl.STATIC_DRAW);
    this.count = m;
    if (this.hover && (this.hover.k >= cols || this.hover.row >= rows)) this.hover = undefined;
    this.draw();
  }

  // Colour of lines and labels, as [r, g, b] 0..1.
  setInk(rgb) {
    this.ink = rgb;
    this.draw();
  }

  setSize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.w = width;
    this.h = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.cam ??= this._home();
    this.draw();
  }

  _home() {
    return { ...(this.h > this.w ? HOME_TALL : HOME_WIDE) };
  }

  _cameraMoved() {
    this.onCamera?.({ ...this.cam });
  }

  reset() {
    this.cam = this._home();
    this._cameraMoved();
    this.draw();
  }

  destroy() {
    this._unlisten?.();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  _x(k) {
    const cols = this.grid.cols;
    return cols > 1 ? -AX + (2 * AX * k) / (cols - 1) : 0;
  }

  _y(r) {
    const rows = this.grid.rows;
    return rows > 1 ? -AY + (2 * AY * r) / (rows - 1) : 0;
  }

  _camera() {
    const { yaw, pitch, dist } = this.cam;
    const eye = [
      TARGET[0] + dist * Math.cos(pitch) * Math.cos(yaw),
      TARGET[1] + dist * Math.cos(pitch) * Math.sin(yaw),
      TARGET[2] + dist * Math.sin(pitch),
    ];
    const proj = perspective((32 * Math.PI) / 180, this.w / this.h || 1, 0.1, 50);
    return { eye, mvp: multiply(proj, lookAt(eye, TARGET, [0, 0, 1])) };
  }

  // Screen position in CSS px of a point in the box, or undefined behind the camera.
  _project(mvp, [x, y, z]) {
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 0) return undefined;
    return [((cx / cw + 1) / 2) * this.w, ((1 - cy / cw) / 2) * this.h];
  }

  draw() {
    if (this._frame || !this.grid || !this.w) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      this._render();
    });
  }

  _render() {
    const gl = this.gl;
    const { eye, mvp } = this._camera();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const sx = Math.sign(eye[0] - TARGET[0]) || 1;
    const sy = Math.sign(eye[1] - TARGET[1]) || 1;
    this._lines(mvp, this._grid(sx, sy), gl.LINES);
    this._surface(mvp, eye, false);
    if (this.hover) this._crosshair(mvp);
    this._labels(mvp, sx, sy);
  }

  _surface(mvp, eye, pick) {
    const gl = this.gl;
    const s = this.surface;
    gl.useProgram(s.prog);
    gl.uniformMatrix4fv(s.loc("uMvp"), false, mvp);
    gl.uniform3fv(s.loc("uEye"), eye);
    gl.uniform1i(s.loc("uPick"), pick ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const attrs = [["aPos", 3, 0], ["aNormal", 3, 3], ["aColor", 3, 6], ["aUv", 2, 9]];
    for (const [name, size, offset] of attrs) {
      const a = s.attr(name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 44, offset * 4);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    // Push the surface back a touch so lines drawn on it win.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    for (const [name] of attrs) gl.disableVertexAttribArray(s.attr(name));
  }

  // Lines (or points) from [x, y, z, r, g, b, a, ...].
  _lines(mvp, verts, mode, pointSize = 1) {
    if (!verts.length) return;
    const gl = this.gl;
    const l = this.line;
    gl.useProgram(l.prog);
    gl.uniformMatrix4fv(l.loc("uMvp"), false, mvp);
    gl.uniform1f(l.loc("uPointSize"), pointSize);
    gl.uniform1i(l.loc("uRound"), mode === gl.POINTS ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    const pos = l.attr("aPos");
    const col = l.attr("aColor");
    gl.enableVertexAttribArray(pos);
    gl.enableVertexAttribArray(col);
    gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(col, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(mode, 0, verts.length / 7);
    gl.disableVertexAttribArray(pos);
    gl.disableVertexAttribArray(col);
  }

  // Floor and the two walls behind the surface (from where the camera is), with tick lines.
  _grid(sx, sy) {
    const { xTicks, yTicks, zTicks, zLo, zHi } = this.grid;
    const out = [];
    const faint = [...this.ink, 0.13];
    const edge = [...this.ink, 0.35];
    const seg = (a, b, c) => out.push(...a, ...c, ...b, ...c);
    const wx = -sx * AX;
    const wy = -sy * AY;
    const zOf = (v) => AZ * ((v - zLo) / (zHi - zLo || 1));
    for (const t of xTicks) {
      const x = -AX + 2 * AX * t.at;
      seg([x, -AY, 0], [x, AY, 0], faint);
      seg([x, wy, 0], [x, wy, AZ], faint);
    }
    for (const t of yTicks) {
      const y = -AY + 2 * AY * t.at;
      seg([-AX, y, 0], [AX, y, 0], faint);
      seg([wx, y, 0], [wx, y, AZ], faint);
    }
    for (const t of zTicks) {
      const z = zOf(t.v);
      if (z < 0 || z > AZ) continue;
      seg([-AX, wy, z], [AX, wy, z], faint);
      seg([wx, -AY, z], [wx, AY, z], faint);
    }
    // Box edges: the floor, the walls' outlines.
    seg([-AX, -AY, 0], [AX, -AY, 0], edge);
    seg([-AX, AY, 0], [AX, AY, 0], edge);
    seg([-AX, -AY, 0], [-AX, AY, 0], edge);
    seg([AX, -AY, 0], [AX, AY, 0], edge);
    seg([-AX, wy, AZ], [AX, wy, AZ], edge);
    seg([wx, -AY, AZ], [wx, AY, AZ], edge);
    seg([wx, wy, 0], [wx, wy, AZ], edge);
    seg([-wx, wy, 0], [-wx, wy, AZ], edge);
    seg([wx, -wy, 0], [wx, -wy, AZ], edge);
    // That last edge is the value axis, at the front corner its labels are on.
    for (const t of zTicks) {
      const z = zOf(t.v);
      if (z >= 0 && z <= AZ) seg([wx, -wy, z], [wx - sx * 0.03, -wy, z], edge);
    }
    return out;
  }

  // The hovered cell's line across time and the hovered moment's line across the cells, on the
  // surface, with a dot where they cross and their shadows on the floor.
  _crosshair(mvp) {
    const { cols, rows } = this.grid;
    const { k, row } = this.hover;
    const z = this.z;
    const lift = 0.002;
    const on = [1, 1, 1, 0.9];
    const shadow = [...this.ink, 0.3];
    const lines = [];
    const path = (n, at) => {
      for (let i = 0; i + 1 < n; i++) {
        const [a, b] = [at(i), at(i + 1)];
        if (Number.isNaN(a[2]) || Number.isNaN(b[2])) continue;
        lines.push(a[0], a[1], a[2] + lift, ...on, b[0], b[1], b[2] + lift, ...on);
        lines.push(a[0], a[1], 0, ...shadow, b[0], b[1], 0, ...shadow);
      }
    };
    path(cols, (i) => [this._x(i), this._y(row), z[row * cols + i]]);
    path(rows, (i) => [this._x(k), this._y(i), z[i * cols + k]]);
    this._lines(mvp, lines, this.gl.LINES);
    const h = z[row * cols + k];
    if (!Number.isNaN(h)) {
      const dpr = window.devicePixelRatio || 1;
      this.gl.disable(this.gl.DEPTH_TEST);
      this._lines(mvp, [this._x(k), this._y(row), h, 1, 1, 1, 1], this.gl.POINTS, 9 * dpr);
      this._lines(mvp, [this._x(k), this._y(row), h, ...this.ink.map((c) => c * 0.2), 1], this.gl.POINTS, 5 * dpr);
      this.gl.enable(this.gl.DEPTH_TEST);
    }
  }

  // Tick labels on the floor's front edges and the wall's side edge, and the axis titles.
  _labels(mvp, sx, sy) {
    const { xTicks, yTicks, zTicks, titles, zLo, zHi } = this.grid;
    const items = [];
    const put = (p, text, cls = "") => {
      const s = this._project(mvp, p);
      if (s) items.push([s, text, cls]);
    };
    const fy = sy * (AY + 0.07);
    const fx = sx * (AX + 0.1);
    for (const t of xTicks) put([-AX + 2 * AX * t.at, fy, 0], t.text);
    for (const t of yTicks) put([fx, -AY + 2 * AY * t.at, 0], t.text);
    // Values up the front corner on the other side from the cell numbers, clear of the surface.
    for (const t of zTicks) {
      const z = AZ * ((t.v - zLo) / (zHi - zLo || 1));
      if (z >= 0 && z <= AZ) put([-fx, sy * AY, z], t.text);
    }
    put([0, sy * (AY + 0.22), 0], titles.x, "title");
    put([sx * (AX + 0.22), 0, 0], titles.y, "title");
    put([-fx, sy * AY, AZ + 0.08], titles.z, "title");
    const el = this.labelsEl;
    while (el.children.length < items.length) el.appendChild(document.createElement("span"));
    [...el.children].forEach((span, i) => {
      const item = items[i];
      span.hidden = !item;
      if (!item) return;
      const [[x, y], text, cls] = item;
      if (span.textContent !== text) span.textContent = text;
      span.className = cls;
      span.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  }

  // Grid position under a point (CSS px), from an offscreen pass.
  _pick(x, y) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    if (!this.fb || this.fbW !== width || this.fbH !== height) {
      if (this.fb) {
        gl.deleteFramebuffer(this.fb);
        gl.deleteTexture(this.fbTex);
        gl.deleteRenderbuffer(this.fbDepth);
      }
      this.fb = gl.createFramebuffer();
      this.fbTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.fbDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.fbDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.fbDepth);
      this.fbW = width;
      this.fbH = height;
    }
    const { eye, mvp } = this._camera();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    this._surface(mvp, eye, true);
    const dpr = width / this.w;
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(x * dpr), height - 1 - Math.floor(y * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!px[3]) return undefined;
    const u = px[0] * 16 + (px[1] >> 4);
    const v = (px[1] & 15) * 256 + px[2];
    const { cols, rows } = this.grid;
    return { k: Math.round((u / 4095) * (cols - 1)), row: Math.round((v / 4095) * (rows - 1)) };
  }

  _setHover(hit) {
    const same = hit && this.hover && hit.k === this.hover.k && hit.row === this.hover.row;
    if (same || (!hit && !this.hover)) return;
    this.hover = hit;
    this.draw();
    if (!hit) return this.onHover(undefined);
    const { mvp } = this._camera();
    const h = this.z[hit.row * this.grid.cols + hit.k];
    const s = this._project(mvp, [this._x(hit.k), this._y(hit.row), Number.isNaN(h) ? 0 : h]);
    this.onHover({ ...hit, x: s?.[0] ?? 0, y: s?.[1] ?? 0 });
  }

  _listen() {
    const c = this.canvas;
    const pointers = new Map();
    let moved = 0;
    let pinch;
    let pending;
    let zoomed;
    const down = (ev) => {
      c.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      moved = 0;
      pinch = undefined;
    };
    const move = (ev) => {
      const last = pointers.get(ev.pointerId);
      if (!last) {
        // Hover: pick once per frame.
        const r = c.getBoundingClientRect();
        const at = [ev.clientX - r.left, ev.clientY - r.top];
        if (!pending && this.grid) {
          pending = requestAnimationFrame(() => {
            pending = undefined;
            this._setHover(this._pick(...this._hoverAt));
          });
        }
        this._hoverAt = at;
        return;
      }
      const dx = ev.clientX - last[0];
      const dy = ev.clientY - last[1];
      pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.cam.dist = Math.min(8, Math.max(1.4, (this.cam.dist * pinch) / d));
        pinch = d;
      } else {
        this.cam.yaw -= dx * 0.006;
        this.cam.pitch = Math.min(1.5, Math.max(-0.1, this.cam.pitch + dy * 0.005));
      }
      if (moved > 4) this._setHover(undefined);
      this.draw();
    };
    const up = (ev) => {
      const was = pointers.size;
      pointers.delete(ev.pointerId);
      if (was === 1 && moved <= 4) {
        const r = c.getBoundingClientRect();
        const hit = this._pick(ev.clientX - r.left, ev.clientY - r.top);
        if (hit) this.onClick(hit);
      } else if (was && !pointers.size) {
        this._cameraMoved();
      }
    };
    const leave = () => {
      if (!pointers.size) this._setHover(undefined);
    };
    const wheel = (ev) => {
      ev.preventDefault();
      this.cam.dist = Math.min(8, Math.max(1.4, this.cam.dist * Math.exp(ev.deltaY * 0.001)));
      this.draw();
      clearTimeout(zoomed);
      zoomed = setTimeout(() => this._cameraMoved(), 300);
    };
    const dbl = () => this.reset();
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    const lost = (ev) => {
      ev.preventDefault();
      this.onLost?.();
    };
    c.addEventListener("dblclick", dbl);
    c.addEventListener("webglcontextlost", lost);
    this._unlisten = () => {
      c.removeEventListener("webglcontextlost", lost);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("dblclick", dbl);
      if (pending) cancelAnimationFrame(pending);
      clearTimeout(zoomed);
      if (this._frame) cancelAnimationFrame(this._frame);
    };
  }
}
