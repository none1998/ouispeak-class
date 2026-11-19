/* =========================================================================
   ROBOT3D — the robot friend in real 3D (WebGL, no external library)
   - Robot3D.mount(container, profile, opts)  → live, animated 3D robot
       returns { setProfile, gesture, talkFor, destroy }
   - Robot3D.snapshot(profile, frame, w, h)    → picture (data URL) of the robot
   - Robot3D.OPTIONS                           → the choices (shapes, colours…)
   - Robot3D.supported                         → false if the device has no WebGL
   Profile: { gender, head, body, accent, eyes, eyeColor, top, chest, extra }
   ========================================================================= */
(function () {
    'use strict';

    /* ---------------- choices (Georgian labels) ---------------- */
    const OPTIONS = {
        head: {
            ronde:   { ka: 'მრგვალი' },
            carree:  { ka: 'კვადრატული' },
            tele:    { ka: 'ტელევიზორი' },
            oeuf:    { ka: 'კვერცხისებრი' }
        },
        body: {
            blanc:   { c: '#f2f5f9', ka: 'თეთრი' },
            argent:  { c: '#c3ccd8', ka: 'ვერცხლისფერი' },
            bleu:    { c: '#4f8ee8', ka: 'ლურჯი' },
            rouge:   { c: '#ef5a4f', ka: 'წითელი' },
            rose:    { c: '#f7a8cb', ka: 'ვარდისფერი' },
            menthe:  { c: '#7fdcb6', ka: 'პიტნისფერი' },
            jaune:   { c: '#fcd45a', ka: 'ყვითელი' },
            violet:  { c: '#a993f5', ka: 'იისფერი' },
            noir:    { c: '#323947', ka: 'შავი' }
        },
        accent: {
            bleu:    { c: '#0055a5', ka: 'მუქი ლურჯი' },
            rouge:   { c: '#ef4135', ka: 'წითელი' },
            or:      { c: '#e2b04a', ka: 'ოქროსფერი' },
            argent:  { c: '#9aa6b6', ka: 'ვერცხლისფერი' },
            noir:    { c: '#232833', ka: 'შავი' },
            rose:    { c: '#ec4899', ka: 'ვარდისფერი' },
            vert:    { c: '#10b981', ka: 'მწვანე' },
            violet:  { c: '#7c3aed', ka: 'იისფერი' }
        },
        eyes: {
            rond:    { ka: 'მრგვალი' },
            ovale:   { ka: 'ოვალური' },
            carre:   { ka: 'კვადრატული' },
            coeur:   { ka: 'გულები' },
            etoile:  { ka: 'ვარსკვლავები' }
        },
        eyeColor: {
            cyan:    { c: '#3fe6ff', ka: 'ცისფერი' },
            bleu:    { c: '#4c8dff', ka: 'ლურჯი' },
            vert:    { c: '#3ee08f', ka: 'მწვანე' },
            rose:    { c: '#ff6fa8', ka: 'ვარდისფერი' },
            violet:  { c: '#b18cff', ka: 'იისფერი' },
            jaune:   { c: '#ffd84a', ka: 'ყვითელი' },
            blanc:   { c: '#ffffff', ka: 'თეთრი' }
        },
        top: {
            aucun:     { ka: 'არაფერი' },
            antenne:   { ka: 'ანტენა' },
            oreilles:  { ka: 'კატის ყურები' },
            helice:    { ka: 'პროპელერი' },
            noeud:     { ka: 'ბაფთა' },
            casquette: { ka: 'კეპი' },
            casque:    { ka: 'ყურსასმენი' },
            couronne:  { ka: 'გვირგვინი' }
        },
        chest: {
            aucun:   { ka: 'არაფერი' },
            coeur:   { ka: 'გული' },
            etoile:  { ka: 'ვარსკვლავი' },
            anneau:  { ka: 'ენერგიის რგოლი' },
            drapeau: { ka: 'საფრანგეთის დროშა' }
        },
        extra: {
            aucun:    { ka: 'არაფერი' },
            lunettes: { ka: 'სათვალე' },
            echarpe:  { ka: 'შარფი' },
            papillon: { ka: 'პეპელა-ჰალსტუხი' },
            sac:      { ka: 'ზურგჩანთა' }
        }
    };
    const DEFAULT = { gender: 'f', head: 'ronde', body: 'blanc', accent: 'bleu', eyes: 'rond', eyeColor: 'cyan', top: 'antenne', chest: 'coeur', extra: 'aucun' };

    /* ---------------- small math library ---------------- */
    const ident = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
    function mul(a, b) {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
        return o;
    }
    function persp(fovy, aspect, n, f) {
        const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
        m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
        return m;
    }
    function lookAt(e, c, u) {
        let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
        let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
        let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
        l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        const m = new Float32Array(16);
        m[0] = xx; m[4] = xy; m[8] = xz; m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
        m[1] = yx; m[5] = yy; m[9] = yz; m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
        m[2] = zx; m[6] = zy; m[10] = zz; m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
        m[15] = 1;
        return m;
    }
    // translate · rotateY · rotateX · rotateZ · scale
    function trs(t, r, s) {
        const cy = Math.cos(r[1]), sy = Math.sin(r[1]), cx = Math.cos(r[0]), sx = Math.sin(r[0]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
        // R = Ry * Rx * Rz
        const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
        const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
        const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
        const m = new Float32Array(16);
        m[0] = r00 * s[0]; m[1] = r10 * s[0]; m[2] = r20 * s[0];
        m[4] = r01 * s[1]; m[5] = r11 * s[1]; m[6] = r21 * s[1];
        m[8] = r02 * s[2]; m[9] = r12 * s[2]; m[10] = r22 * s[2];
        m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
        return m;
    }
    function normalMat(m) {
        const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
        const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
        const det = a * A + b * B + c * C || 1e-9;
        return new Float32Array([
            A / det, B / det, C / det,
            -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det,
            (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det
        ]);
    }
    function hex(c) { const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

    /* ---------------- shapes (geometry) ---------------- */
    const GEO = {};
    const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    // rounded box / sphere / pill: "superellipsoid", radius 1 in each direction (scaled by the node)
    function superellipsoid(e1, e2, nu, nv) {
        const p = [], n = [], idx = [];
        for (let j = 0; j <= nv; j++) {
            const v = -Math.PI / 2 + Math.PI * j / nv;
            for (let i = 0; i <= nu; i++) {
                const u = -Math.PI + 2 * Math.PI * i / nu;
                const cv = Math.cos(v), sv = Math.sin(v), cu = Math.cos(u), su = Math.sin(u);
                p.push(sgnPow(cv, e1) * sgnPow(cu, e2), sgnPow(sv, e1), sgnPow(cv, e1) * sgnPow(su, e2));
                let nx = sgnPow(cv, 2 - e1) * sgnPow(cu, 2 - e2), ny = sgnPow(sv, 2 - e1), nz = sgnPow(cv, 2 - e1) * sgnPow(su, 2 - e2);
                const l = Math.hypot(nx, ny, nz) || 1;
                n.push(nx / l, ny / l, nz / l);
            }
        }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
            const a = j * (nu + 1) + i, b = a + nu + 1;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
        return { p, n, i: idx };
    }
    // ring in the XY plane (facing +Z), big radius 1, tube radius r
    function torus(r, arc, nu, nv) {
        const p = [], n = [], idx = [];
        for (let j = 0; j <= nu; j++) {
            const u = arc * j / nu - (arc < 6.28 ? (arc - Math.PI) / 2 : 0);
            for (let i = 0; i <= nv; i++) {
                const v = 2 * Math.PI * i / nv;
                const cx = Math.cos(u), cy = Math.sin(u);
                p.push((1 + r * Math.cos(v)) * cx, (1 + r * Math.cos(v)) * cy, r * Math.sin(v));
                n.push(Math.cos(v) * cx, Math.cos(v) * cy, Math.sin(v));
            }
        }
        for (let j = 0; j < nu; j++) for (let i = 0; i < nv; i++) {
            const a = j * (nv + 1) + i, b = a + nv + 1;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
        return { p, n, i: idx };
    }
    // cylinder along Y, radius 1, height 1 (centered), with caps
    function cylinder(seg, topScale) {
        const p = [], n = [], idx = [];
        const ts = topScale === undefined ? 1 : topScale;
        const slope = 1 - ts;
        for (let k = 0; k <= seg; k++) {
            const a = 2 * Math.PI * k / seg, c = Math.cos(a), s = Math.sin(a);
            const l = Math.hypot(1, slope);
            p.push(c, -0.5, s, c * ts, 0.5, s * ts);
            n.push(c / l, slope / l, s / l, c / l, slope / l, s / l);
        }
        for (let k = 0; k < seg; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        [[-0.5, -1, 1], [0.5, 1, ts]].forEach(([y, ny, sc]) => {
            if (sc < 0.001) return;
            const base = p.length / 3;
            p.push(0, y, 0); n.push(0, ny, 0);
            for (let k = 0; k <= seg; k++) { const a = 2 * Math.PI * k / seg; p.push(Math.cos(a) * sc, y, Math.sin(a) * sc); n.push(0, ny, 0); }
            for (let k = 1; k <= seg; k++) ny > 0 ? idx.push(base, base + k + 1, base + k) : idx.push(base, base + k, base + k + 1);
        });
        return { p, n, i: idx };
    }
    // flat shape (polygon around 0,0) given some thickness along Z
    function extrude(poly, depth) {
        const p = [], n = [], idx = [];
        const d = depth / 2;
        [[d, 1], [-d, -1]].forEach(([z, nz]) => {
            const base = p.length / 3;
            p.push(0, 0, z); n.push(0, 0, nz);
            poly.forEach(([x, y]) => { p.push(x, y, z); n.push(0, 0, nz); });
            for (let k = 0; k < poly.length; k++) {
                const a = base + 1 + k, b = base + 1 + ((k + 1) % poly.length);
                nz > 0 ? idx.push(base, a, b) : idx.push(base, b, a);
            }
        });
        for (let k = 0; k < poly.length; k++) {
            const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % poly.length];
            let nx = y2 - y1, ny = -(x2 - x1); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
            const base = p.length / 3;
            p.push(x1, y1, d, x2, y2, d, x1, y1, -d, x2, y2, -d);
            for (let q = 0; q < 4; q++) n.push(nx, ny, 0);
            idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
        return { p, n, i: idx };
    }
    const HEART = Array.from({ length: 48 }, (_, k) => {
        const t = (k / 48) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [x / 17, (y + 3) / 17];
    }).reverse();
    const STAR = Array.from({ length: 10 }, (_, k) => {
        const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.45 : 1;
        return [Math.cos(a) * r, Math.sin(a) * r];
    });
    function geo(key) {
        if (GEO[key]) return GEO[key];
        let g;
        const m = key.split(':');
        if (m[0] === 'se') g = superellipsoid(+m[1], +m[2], 40, 24);
        else if (m[0] === 'tor') g = torus(+m[1], +m[2], 40, 14);
        else if (m[0] === 'cyl') g = cylinder(28, m[1] === undefined ? 1 : +m[1]);
        else if (m[0] === 'heart') g = extrude(HEART, 0.5);
        else if (m[0] === 'star') g = extrude(STAR, 0.5);
        else if (m[0] === 'disk') g = cylinder(40, 1);
        GEO[key] = { p: new Float32Array(g.p), n: new Float32Array(g.n), i: new Uint16Array(g.i) };
        return GEO[key];
    }

    /* ---------------- WebGL renderer ---------------- */
    const VS = `
        attribute vec3 aPos; attribute vec3 aNrm;
        uniform mat4 uModel, uView, uProj; uniform mat3 uNrm;
        varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main() {
            vec4 w = uModel * vec4(aPos, 1.0);
            vW = w.xyz; vL = aPos; vN = normalize(uNrm * aNrm);
            gl_Position = uProj * uView * w;
        }`;
    const FS = `
        precision mediump float;
        varying vec3 vN; varying vec3 vW; varying vec3 vL;
        uniform vec3 uColor; uniform float uEmit; uniform float uShine; uniform float uSpec; uniform float uAlpha;
        uniform float uShadow; uniform vec3 uCam;
        void main() {
            if (uShadow > 0.5) {
                float d = length(vL.xz);
                float a = (1.0 - smoothstep(0.0, 1.0, d)) * uAlpha;
                gl_FragColor = vec4(0.06, 0.16, 0.32, 1.0) * a;
                return;
            }
            vec3 n = normalize(vN);
            if (!gl_FrontFacing) n = -n;
            vec3 v = normalize(uCam - vW);
            vec3 L1 = normalize(vec3(-0.55, 0.85, 0.75));
            vec3 L2 = normalize(vec3(0.8, 0.15, 0.45));
            float d1 = max(dot(n, L1), 0.0);
            float d2 = max(dot(n, L2), 0.0);
            vec3 amb = mix(vec3(0.42, 0.46, 0.55), vec3(0.78, 0.82, 0.9), n.y * 0.5 + 0.5);
            vec3 col = uColor * (amb * 0.55 + d1 * vec3(0.78, 0.76, 0.72) + d2 * vec3(0.18, 0.22, 0.3));
            vec3 h = normalize(L1 + v);
            float sp = pow(max(dot(n, h), 0.0), uShine) * uSpec;
            float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.32;
            col += vec3(sp) + vec3(0.75, 0.86, 1.0) * rim;
            col = mix(col, uColor * 1.15 + vec3(0.12), uEmit);
            gl_FragColor = vec4(col * uAlpha, uAlpha);
        }`;

    function createRenderer(canvas, keepImage) {
        const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: !!keepImage });
        if (!gl) return null;
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        gl.useProgram(prog);
        const loc = {};
        ['uModel', 'uView', 'uProj', 'uNrm', 'uColor', 'uEmit', 'uShine', 'uSpec', 'uAlpha', 'uShadow', 'uCam'].forEach(k => { loc[k] = gl.getUniformLocation(prog, k); });
        const aPos = gl.getAttribLocation(prog, 'aPos'), aNrm = gl.getAttribLocation(prog, 'aNrm');
        gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNrm);
        const buffers = {};
        function mesh(key) {
            if (buffers[key]) return buffers[key];
            const g = geo(key);
            const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, g.p, gl.STATIC_DRAW);
            const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, g.n, gl.STATIC_DRAW);
            const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.i, gl.STATIC_DRAW);
            return (buffers[key] = { vb, nb, ib, count: g.i.length });
        }
        function draw(root, cam, w, h) {
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);
            const proj = persp(cam.fov, w / h, 0.1, 60);
            const view = lookAt(cam.eye, cam.target, [0, 1, 0]);
            gl.uniformMatrix4fv(loc.uProj, false, proj);
            gl.uniformMatrix4fv(loc.uView, false, view);
            gl.uniform3fv(loc.uCam, cam.eye);
            const solid = [], soft = [];
            (function walk(node, parent) {
                if (node.hidden) return;
                const m = mul(parent, trs(node.t, node.r, node.s));
                if (node.g) (node.m.a < 1 || node.m.shadow ? soft : solid).push([node, m]);
                (node.kids || []).forEach(k => walk(k, m));
            })(root, ident());
            const one = (node, m) => {
                const b = mesh(node.g);
                gl.bindBuffer(gl.ARRAY_BUFFER, b.vb); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, b.nb); gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
                gl.uniformMatrix4fv(loc.uModel, false, m);
                gl.uniformMatrix3fv(loc.uNrm, false, normalMat(m));
                gl.uniform3fv(loc.uColor, node.m.c);
                gl.uniform1f(loc.uEmit, node.m.e || 0);
                gl.uniform1f(loc.uShine, node.m.sh || 40);
                gl.uniform1f(loc.uSpec, node.m.sp === undefined ? 0.35 : node.m.sp);
                gl.uniform1f(loc.uAlpha, node.m.a === undefined ? 1 : node.m.a);
                gl.uniform1f(loc.uShadow, node.m.shadow ? 1 : 0);
                gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
            };
            gl.disable(gl.BLEND);
            solid.forEach(([n, m]) => one(n, m));
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            soft.forEach(([n, m]) => one(n, m));
            gl.depthMask(true);
        }
        return { gl, draw, lost: () => gl.isContextLost() };
    }

    /* ---------------- the robot (scene) ---------------- */
    const node = (g, m, t, s, r, kids, name) => ({ g, m, t: t || [0, 0, 0], s: s || [1, 1, 1], r: r || [0, 0, 0], kids: kids || [], name });
    const group = (t, r, kids, name) => node(null, null, t, [1, 1, 1], r, kids, name);
    const HEADS = {
        ronde:  { s: [1.0, 0.92, 0.9], e: [0.95, 0.95] },
        carree: { s: [1.0, 0.84, 0.84], e: [0.38, 0.38] },
        tele:   { s: [1.14, 0.8, 0.74], e: [0.3, 0.72] },
        oeuf:   { s: [0.9, 1.0, 0.86], e: [1.05, 1.0] }
    };

    function buildRobot(prof) {
        const p = Object.assign({}, DEFAULT, prof || {});
        const girl = p.gender === 'f';
        const bodyC = hex((OPTIONS.body[p.body] || OPTIONS.body.blanc).c);
        const accC = hex((OPTIONS.accent[p.accent] || OPTIONS.accent.bleu).c);
        const eyeC = hex((OPTIONS.eyeColor[p.eyeColor] || OPTIONS.eyeColor.cyan).c);
        const shell = { c: bodyC, sh: 60, sp: 0.55 };
        const panel = { c: mix(bodyC, [0.93, 0.95, 0.98], 0.55), sh: 50, sp: 0.4 };
        const acc = { c: accC, sh: 70, sp: 0.6 };
        const glow = { c: eyeC, e: 0.92, sp: 0 };
        const screen = { c: [0.06, 0.08, 0.13], sh: 120, sp: 0.9 };
        const gold = { c: [0.9, 0.7, 0.28], sh: 90, sp: 0.9 };
        const refs = {};
        const R = (name, n) => { refs[name] = n; return n; };

        // ----- head -----
        const H = HEADS[p.head] || HEADS.ronde;
        const [hx, hy, hz] = H.s;
        const headKids = [];
        headKids.push(node(`se:${H.e[0]}:${H.e[1]}`, shell, [0, 0, 0], [hx, hy, hz]));
        // face screen
        const fz = hz * 0.42;
        headKids.push(node('se:0.45:0.6', screen, [0, -0.02, fz], [hx * 0.8, hy * 0.64, hz * 0.62]));
        const front = fz + hz * 0.62 - 0.02;
        // eyes
        const eyeY = 0.1, eyeX = 0.33;
        const eyeShape = (x) => {
            switch (p.eyes) {
                case 'ovale': return node('se:1:1', glow, [x, eyeY, front], [0.12, 0.2, 0.06]);
                case 'carre': return node('se:0.3:0.3', glow, [x, eyeY, front], [0.15, 0.15, 0.06]);
                case 'coeur': return node('heart', glow, [x, eyeY - 0.02, front], [0.2, 0.2, 0.14]);
                case 'etoile': return node('star', glow, [x, eyeY, front], [0.2, 0.2, 0.14]);
                default: return node('se:1:1', glow, [x, eyeY, front], [0.16, 0.16, 0.06]);
            }
        };
        const eyesGroup = R('eyes', group([0, 0, 0], [0, 0, 0], [-1, 1].map(sx => {
            const kids = [eyeShape(sx * eyeX)];
            if (p.eyes === 'rond' || p.eyes === 'ovale') kids.push(node('se:1:1', { c: [1, 1, 1], e: 1, sp: 0 }, [sx * eyeX + 0.05, eyeY + 0.06, front + 0.05], [0.04, 0.04, 0.02]));
            if (girl) [-0.5, 0, 0.5].forEach((o, k) => kids.push(node('se:0.5:0.5', glow, [sx * (eyeX + 0.09 + k * 0.03), eyeY + 0.2 + (1 - Math.abs(o)) * 0.02, front], [0.018, 0.06, 0.02], [0, 0, -sx * (0.5 + k * 0.25)])));
            return group([0, 0, 0], [0, 0, 0], kids);
        })));
        refs.eyesGroup = eyesGroup;
        headKids.push(group([0, 0, 0], [0, 0, 0], [eyesGroup], 'eyePivot'));
        // mouth: a smile, and an open mouth used when talking
        refs.smile = node(`tor:0.22:${Math.PI * 0.9}`, glow, [0, -0.25, front + 0.01], [0.16, 0.14, 0.14], [0, 0, Math.PI]);
        refs.mouthOpen = node('se:1:1', glow, [0, -0.27, front + 0.01], [0.11, 0.07, 0.04]);
        refs.mouthOpen.hidden = true;
        headKids.push(refs.smile, refs.mouthOpen);
        if (girl) [-1, 1].forEach(sx => headKids.push(node('se:1:1', { c: [1, 0.45, 0.62], e: 0.85, a: 0.7, sp: 0 }, [sx * 0.55, -0.15, front - 0.02], [0.11, 0.06, 0.03])));
        // ears
        [-1, 1].forEach(sx => {
            headKids.push(node('cyl', acc, [sx * (hx + 0.02), 0, 0], [0.22, 0.16, 0.22], [0, 0, Math.PI / 2]));
            headKids.push(node('cyl', glow, [sx * (hx + 0.11), 0, 0], [0.11, 0.03, 0.11], [0, 0, Math.PI / 2]));
        });
        // on top of the head
        const top = hy;
        switch (p.top) {
            case 'antenne':
                headKids.push(node('cyl', acc, [0, top + 0.18, 0], [0.035, 0.38, 0.035]));
                headKids.push(R('antBall', node('se:1:1', glow, [0, top + 0.42, 0], [0.11, 0.11, 0.11])));
                break;
            case 'oreilles':
                [-1, 1].forEach(sx => {
                    headKids.push(node('cyl:0', shell, [sx * 0.48, top - 0.02, 0], [0.26, 0.5, 0.18], [0, 0, -sx * 0.32]));
                    headKids.push(node('cyl:0', acc, [sx * 0.49, top - 0.0, 0.07], [0.15, 0.36, 0.08], [0, 0, -sx * 0.32]));
                });
                break;
            case 'helice':
                headKids.push(node('cyl', acc, [0, top + 0.1, 0], [0.05, 0.2, 0.05]));
                headKids.push(R('prop', group([0, top + 0.22, 0], [0, 0, 0], [
                    node('se:1:1', acc, [0, 0, 0], [0.09, 0.07, 0.09]),
                    node('se:0.8:1', { c: mix(accC, [1, 1, 1], 0.35), sh: 60, sp: 0.5 }, [0.32, 0, 0], [0.32, 0.03, 0.1], [0.3, 0, 0]),
                    node('se:0.8:1', { c: mix(accC, [1, 1, 1], 0.35), sh: 60, sp: 0.5 }, [-0.32, 0, 0], [0.32, 0.03, 0.1], [-0.3, 0, 0])
                ])));
                break;
            case 'noeud':
                headKids.push(group([0.5, top - 0.08, 0.25], [0.2, 0, 0.35], [
                    node('se:0.9:0.9', acc, [-0.17, 0, 0], [0.2, 0.15, 0.08], [0, 0, 0.35]),
                    node('se:0.9:0.9', acc, [0.17, 0, 0], [0.2, 0.15, 0.08], [0, 0, -0.35]),
                    node('se:1:1', { c: mix(accC, [0, 0, 0], 0.25), sh: 60, sp: 0.4 }, [0, 0, 0.02], [0.07, 0.07, 0.07])
                ]));
                break;
            case 'casquette':
                headKids.push(node('se:0.9:1', acc, [0, top - 0.3, -0.02], [hx * 0.97, 0.52, hz * 0.97]));
                headKids.push(node('se:0.25:1', acc, [0, top - 0.24, hz * 0.72], [0.62, 0.04, 0.5]));
                headKids.push(node('se:1:1', { c: [1, 1, 1], sh: 30, sp: 0.2 }, [0, top + 0.2, 0], [0.07, 0.05, 0.07]));
                break;
            case 'casque':
                headKids.push(node(`tor:0.06:${Math.PI}`, acc, [0, 0.04, 0], [hx + 0.14, hy + 0.12, 0.9], [0, 0, 0]));
                [-1, 1].forEach(sx => headKids.push(node('cyl', acc, [sx * (hx + 0.1), 0, 0], [0.3, 0.2, 0.3], [0, 0, Math.PI / 2])));
                [-1, 1].forEach(sx => headKids.push(node('cyl', { c: mix(accC, [1, 1, 1], 0.4), sh: 40, sp: 0.3 }, [sx * (hx + 0.21), 0, 0], [0.22, 0.03, 0.22], [0, 0, Math.PI / 2])));
                break;
            case 'couronne': {
                const cr = Math.min(hx, hz) * 0.55;
                headKids.push(node('cyl', gold, [0, top - 0.02, 0], [cr, 0.2, cr]));
                for (let k = 0; k < 5; k++) {
                    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
                    headKids.push(node('cyl:0', gold, [Math.cos(a) * cr * 0.92, top + 0.2, Math.sin(a) * cr * 0.92], [0.09, 0.24, 0.09]));
                    headKids.push(node('se:1:1', { c: [0.95, 0.25, 0.35], e: 0.5, sh: 120, sp: 1 }, [Math.cos(a) * cr * 1.0, top - 0.02, Math.sin(a) * cr * 1.0], [0.05, 0.05, 0.05]));
                }
                break;
            }
        }
        // glasses
        if (p.extra === 'lunettes') {
            const rimC = { c: mix(accC, [0, 0, 0], 0.15), sh: 80, sp: 0.7 };
            [-1, 1].forEach(sx => headKids.push(node('tor:0.12:6.283', rimC, [sx * eyeX, eyeY, front + 0.06], [0.24, 0.24, 0.24])));
            headKids.push(node('cyl', rimC, [0, eyeY + 0.03, front + 0.06], [0.03, 0.18, 0.03], [0, 0, Math.PI / 2]));
            headKids.push(node('se:1:1', { c: [0.75, 0.9, 1], a: 0.18, sh: 120, sp: 1 }, [-eyeX, eyeY, front + 0.06], [0.22, 0.22, 0.02]));
            headKids.push(node('se:1:1', { c: [0.75, 0.9, 1], a: 0.18, sh: 120, sp: 1 }, [eyeX, eyeY, front + 0.06], [0.22, 0.22, 0.02]));
        }
        const head = R('head', group([0, 0.62, 0], [0, 0, 0], headKids));

        // ----- body -----
        const bodyKids = [];
        const bw = girl ? 0.74 : 0.82, be = girl ? [0.75, 0.9] : [0.5, 0.7];
        bodyKids.push(node(`se:${be[0]}:${be[1]}`, shell, [0, -1.15, 0], [bw, 0.8, 0.64]));
        bodyKids.push(node('se:0.5:0.6', panel, [0, -1.1, 0.33], [bw * 0.62, 0.5, 0.36]));
        // neck
        bodyKids.push(node('cyl', acc, [0, -0.3, 0], [0.22, 0.3, 0.22]));
        // chest light
        const cz = 0.33 + 0.36 - 0.02, cy = -0.98;
        switch (p.chest) {
            case 'coeur': bodyKids.push(R('chestLight', node('heart', glow, [0, cy, cz], [0.2, 0.2, 0.12]))); break;
            case 'etoile': bodyKids.push(R('chestLight', node('star', glow, [0, cy, cz], [0.21, 0.21, 0.12]))); break;
            case 'anneau': bodyKids.push(R('chestLight', node('tor:0.25:6.283', glow, [0, cy, cz], [0.15, 0.15, 0.2]))); break;
            case 'drapeau':
                [['#0055a5', -0.13], ['#ffffff', 0], ['#ef4135', 0.13]].forEach(([c, x]) => bodyKids.push(node('se:0.2:0.2', { c: hex(c), sh: 40, sp: 0.3 }, [x, cy, cz], [0.065, 0.13, 0.03])));
                break;
        }
        // belt (boy) or skirt ring (girl)
        if (girl) bodyKids.push(node('tor:0.35:6.283', acc, [0, -1.72, 0], [0.55, 0.55, 0.42], [Math.PI / 2, 0, 0]));
        else bodyKids.push(node('se:0.4:0.9', acc, [0, -1.55, 0], [bw * 0.97, 0.07, 0.62]));
        // scarf / bow tie / backpack
        if (p.extra === 'echarpe') {
            bodyKids.push(node('tor:0.45:6.283', acc, [0, -0.42, 0.02], [0.36, 0.36, 0.3], [Math.PI / 2, 0, 0]));
            bodyKids.push(node('se:0.6:0.8', acc, [0.22, -0.72, 0.55], [0.1, 0.24, 0.05], [0.2, 0, 0.15]));
        }
        if (p.extra === 'papillon') {
            bodyKids.push(group([0, -0.52, 0.5], [0.15, 0, 0], [
                node('cyl:0', acc, [-0.13, 0, 0], [0.12, 0.2, 0.06], [0, 0, -Math.PI / 2]),
                node('cyl:0', acc, [0.13, 0, 0], [0.12, 0.2, 0.06], [0, 0, Math.PI / 2]),
                node('se:1:1', acc, [0, 0, 0.02], [0.05, 0.05, 0.05])
            ]));
        }
        if (p.extra === 'sac') {
            bodyKids.push(node('se:0.4:0.5', acc, [0, -1.05, -0.62], [0.52, 0.55, 0.22]));
            bodyKids.push(node('se:0.4:0.5', { c: mix(accC, [1, 1, 1], 0.25), sh: 50, sp: 0.4 }, [0, -1.2, -0.84], [0.32, 0.25, 0.06]));
            [-1, 1].forEach(sx => bodyKids.push(node('se:0.5:0.5', acc, [sx * 0.42, -0.85, 0.12], [0.05, 0.38, 0.55], [0.0, 0, sx * 0.12])));
        }
        // thruster (the robot floats)
        bodyKids.push(node('cyl:0.7', acc, [0, -1.98, 0], [0.32, 0.22, 0.32], [Math.PI, 0, 0]));
        bodyKids.push(R('flame', node('cyl:0', { c: eyeC, e: 1, a: 0.55, sp: 0 }, [0, -2.32, 0], [0.18, 0.45, 0.18], [Math.PI, 0, 0])));

        // arms: shoulder → upper arm → elbow → forearm → hand
        const arm = (sx) => {
            const hand = node('se:0.8:0.8', shell, [0, -0.36, 0], [0.17, 0.17, 0.16]);
            const fore = group([0, -0.42, 0], [0, 0, 0], [
                node('se:1:1', acc, [0, 0, 0], [0.12, 0.12, 0.12]),
                node('se:1:1', shell, [0, -0.18, 0], [0.11, 0.2, 0.11]),
                hand
            ]);
            const upper = group([sx * (bw + 0.08), -0.72, 0], [0, 0, sx * 0.18], [
                node('se:1:1', acc, [0, 0, 0], [0.16, 0.16, 0.16]),
                node('se:1:1', shell, [0, -0.22, 0], [0.12, 0.22, 0.12]),
                fore
            ]);
            return { upper, fore };
        };
        const L = arm(-1), Rr = arm(1);
        refs.armL = L.upper; refs.foreL = L.fore; refs.armR = Rr.upper; refs.foreR = Rr.fore;
        bodyKids.push(L.upper, Rr.upper);

        const body = R('body', group([0, 0, 0], [0, 0, 0], bodyKids));
        const bot = R('bot', group([0, 0, 0], [0, 0, 0], [body, head]));
        const shadow = R('shadow', node('disk', { c: [0, 0, 0], shadow: true, a: 0.5 }, [0, -2.95, 0], [1.25, 0.01, 0.5]));
        const root = group([0, 0, 0], [0, 0, 0], [shadow, bot]);
        return { root, refs, girl };
    }

    /* ---------------- camera framing ---------------- */
    const FRAMES = {
        full:  { c: [0, -0.42, 0], h: 2.62, w: 1.75, yaw: -0.38, pitch: 0.12 },
        bust:  { c: [0, 0.3, 0], h: 1.75, w: 1.7, yaw: -0.3, pitch: 0.1 },
        head:  { c: [0, 0.95, 0], h: 1.2, w: 1.45, yaw: -0.32, pitch: 0.1 },
        face:  { c: [0, 0.68, 0], h: 0.75, w: 1.05, yaw: -0.22, pitch: 0.05 },
        chest: { c: [0, -1.0, 0], h: 0.72, w: 0.95, yaw: -0.25, pitch: 0.1 },
        body:  { c: [0, -0.9, 0], h: 1.35, w: 1.35, yaw: -0.55, pitch: 0.12 }
    };
    function camera(frameName, aspect) {
        const f = FRAMES[frameName] || FRAMES.full;
        const fov = 0.5;
        const half = Math.max(f.h, f.w / aspect);
        const dist = half / Math.tan(fov / 2) * 1.08;
        const eye = [f.c[0], f.c[1] + Math.sin(f.pitch) * dist, f.c[2] + Math.cos(f.pitch) * dist];
        return { fov, eye, target: f.c, yaw: f.yaw };
    }

    /* ---------------- animation ---------------- */
    const GESTURES = { wave: 2400, think: 2600, happy: 1900, wow: 1600, tilt: 1800, nod: 1100, shrug: 1500 };
    function animate(scene, st, t) {
        const r = scene.refs;
        const bob = Math.sin(t * 2.0) * 0.07;
        r.bot.t[1] = bob;
        r.shadow.s[0] = 1.25 - bob * 0.8; r.shadow.s[2] = 0.5 - bob * 0.3;
        r.bot.r[1] = st.yaw + Math.sin(t * 0.6) * 0.12 * st.sway;
        r.head.r = [Math.sin(t * 0.9) * 0.04 - st.lookY * 0.25, st.lookX * 0.4, Math.sin(t * 0.7) * 0.03];
        r.armL.r = [Math.sin(t * 1.3) * 0.08, 0, -0.18 - Math.sin(t * 1.7) * 0.05];
        r.armR.r = [Math.sin(t * 1.3 + 1) * 0.08, 0, 0.18 + Math.sin(t * 1.7 + 1) * 0.05];
        r.foreL.r = [0.15, 0, 0.05]; r.foreR.r = [0.15, 0, -0.05];
        // blink every few seconds
        const bl = (t % 4.2);
        const blink = bl < 0.14 ? Math.max(0.08, Math.abs(bl - 0.07) / 0.07) : 1;
        r.eyesGroup.s = [1, blink, 1];
        if (r.antBall) { const k = Math.sin(t * 3); r.antBall.t[0] = Math.sin(t * 1.5) * 0.04; r.antBall.m.e = 0.8 + k * 0.2; }
        if (r.prop) r.prop.r[1] = t * 9;
        if (r.chestLight) { const k = 1 + Math.sin(t * 2.6) * 0.06; r.chestLight.s = r.chestLight.base || (r.chestLight.base = r.chestLight.s.slice()); r.chestLight.s = r.chestLight.base.map(v => v * k); }
        if (r.flame) { const k = 0.85 + Math.sin(t * 22) * 0.1 + Math.sin(t * 13) * 0.06; r.flame.s = [0.18 * k, 0.45 * (0.9 + k * 0.25), 0.18 * k]; }
        // talking
        const talking = t < st.talkUntil;
        r.smile.hidden = talking;
        r.mouthOpen.hidden = !talking;
        if (talking) { const o = Math.abs(Math.sin(t * 14)) * 0.8 + Math.abs(Math.sin(t * 9.3)) * 0.3; r.mouthOpen.s = [0.1 + o * 0.02, 0.025 + o * 0.06, 0.04]; }
        // gestures
        const g = st.gesture;
        if (g) {
            const k = (t - g.start) / (GESTURES[g.name] / 1000);
            if (k >= 1) st.gesture = null;
            else {
                const env = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * Math.sin(Math.min(1, (1 - k) * 4) * Math.PI / 2);
                switch (g.name) {
                    case 'wave':
                        r.armR.r = [0, 0, 0.18 + env * 2.55];
                        r.foreR.r = [0, 0, env * (0.35 + Math.sin(t * 9) * 0.45)];
                        r.head.r[2] += env * 0.12;
                        break;
                    case 'happy':
                        r.bot.t[1] += Math.abs(Math.sin(k * Math.PI * 3)) * 0.35 * env;
                        r.armL.r = [0, 0, -0.18 - env * 2.2]; r.armR.r = [0, 0, 0.18 + env * 2.2];
                        r.eyesGroup.s = [1 + env * 0.15, (1 - env * 0.5), 1];
                        break;
                    case 'nod': r.head.r[0] += Math.sin(k * Math.PI * 4) * 0.22 * env; break;
                    case 'tilt': r.head.r[2] += env * 0.32; r.head.r[1] += env * 0.15; break;
                    case 'wow': r.eyesGroup.s = [1 + env * 0.35, 1 + env * 0.35, 1]; r.bot.t[1] += env * 0.12; break;
                    case 'shrug':
                        r.armL.r = [0, 0, -0.18 - env * 0.9]; r.armR.r = [0, 0, 0.18 + env * 0.9];
                        r.foreL.r = [0, 0, env * 1.2]; r.foreR.r = [0, 0, -env * 1.2];
                        r.head.r[2] += env * 0.15;
                        break;
                    case 'think':
                        r.armR.r = [-env * 0.6, 0, 0.18 + env * 0.5];
                        r.foreR.r = [-env * 1.6, 0, env * 1.4];
                        r.head.r[2] -= env * 0.12; r.head.r[0] -= env * 0.12;
                        break;
                }
            }
        }
    }

    /* ---------------- live view ---------------- */
    let supported = null;
    function isSupported() {
        if (supported !== null) return supported;
        try { const c = document.createElement('canvas'); supported = !!(c.getContext('webgl')); } catch (e) { supported = false; }
        return supported;
    }

    function mount(container, profile, opts) {
        opts = opts || {};
        if (container._bot) container._bot.destroy();
        if (!isSupported()) { container.innerHTML = '<div class="r3d-fallback" aria-hidden="true">🤖</div>'; return { setProfile() {}, gesture() {}, talkFor() {}, destroy() {} }; }
        const canvas = document.createElement('canvas');
        canvas.className = 'r3d-canvas';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', opts.label || 'robot');
        container.innerHTML = '';
        container.appendChild(canvas);
        const rnd = createRenderer(canvas, false);
        if (!rnd) { container.innerHTML = '<div class="r3d-fallback" aria-hidden="true">🤖</div>'; return { setProfile() {}, gesture() {}, talkFor() {}, destroy() {} }; }
        const frame = opts.frame || 'full';
        let scene = buildRobot(profile);
        const st = { yaw: (FRAMES[frame] || FRAMES.full).yaw, sway: 1, lookX: 0, lookY: 0, gesture: null, talkUntil: 0, drag: null, spin: 0 };
        const start = performance.now();
        let raf = 0, alive = true, w = 0, h = 0;
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const now = () => (performance.now() - start) / 1000;

        function resize() {
            const r = container.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const nw = Math.max(2, Math.round(r.width * dpr)), nh = Math.max(2, Math.round(r.height * dpr));
            if (nw !== w || nh !== h) { w = nw; h = nh; canvas.width = w; canvas.height = h; }
        }
        function tick() {
            if (!alive) return;
            raf = requestAnimationFrame(tick);
            if (!container.isConnected) return destroy();
            if (container.offsetParent === null && getComputedStyle(container).position !== 'fixed') return;   // hidden: don't draw
            resize();
            if (rnd.lost()) return;
            const t = reduce ? 1 : now();
            // drag to turn the robot, it slowly comes back
            if (!st.drag) { st.spin *= 0.94; st.yaw += st.spin; const base = (FRAMES[frame] || FRAMES.full).yaw; st.yaw += (base - st.yaw) * (Math.abs(st.spin) < 0.002 ? 0.02 : 0); }
            animate(scene, st, t);
            const cam = camera(frame, w / h);
            rnd.draw(scene.root, cam, w, h);
        }
        // turn towards the pointer, and drag to rotate
        const onMove = (e) => {
            const r = container.getBoundingClientRect();
            st.lookX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)) * 0.6;
            st.lookY = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.4) * 2)) * 0.5;
            if (st.drag) { const dx = e.clientX - st.drag.x; st.drag.x = e.clientX; st.yaw += dx * 0.012; st.spin = dx * 0.004; }
        };
        const onDown = (e) => { if (!opts.interactive) return; st.drag = { x: e.clientX }; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} };
        const onUp = () => { st.drag = null; };
        const onLeave = () => { st.lookX = 0; st.lookY = 0; };
        const host = opts.pointerArea || container;
        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerleave', onLeave);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        if (opts.interactive) canvas.style.touchAction = 'pan-y';
        raf = requestAnimationFrame(tick);

        function destroy() {
            alive = false;
            cancelAnimationFrame(raf);
            host.removeEventListener('pointermove', onMove);
            host.removeEventListener('pointerleave', onLeave);
            const ext = rnd.gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
            if (container._bot === api) container._bot = null;
        }
        const api = {
            setProfile(p) { scene = buildRobot(p); },
            gesture(name) { if (GESTURES[name]) st.gesture = { name, start: now() }; },
            talkFor(ms) { st.talkUntil = now() + ms / 1000; },
            destroy
        };
        container._bot = api;
        return api;
    }

    /* ---------------- pictures (for small buttons and tiles) ---------------- */
    let snapR = null, snapCanvas = null;
    const snapCache = new Map();
    function snapshot(profile, frame, wCss, hCss) {
        if (!isSupported()) return '';
        const key = JSON.stringify([profile, frame, wCss, hCss]);
        if (snapCache.has(key)) return snapCache.get(key);
        if (!snapR || snapR.lost()) {
            snapCanvas = document.createElement('canvas');
            snapR = createRenderer(snapCanvas, true);
            if (!snapR) return '';
        }
        const w = Math.round(wCss * 2), h = Math.round(hCss * 2);
        snapCanvas.width = w; snapCanvas.height = h;
        const scene = buildRobot(profile);
        const st = { yaw: (FRAMES[frame] || FRAMES.full).yaw, sway: 0, lookX: 0, lookY: 0, gesture: null, talkUntil: 0 };
        animate(scene, st, 1.2);
        scene.refs.bot.t[1] = 0;
        snapR.draw(scene.root, camera(frame, w / h), w, h);
        const url = snapCanvas.toDataURL('image/png');
        if (snapCache.size > 200) snapCache.clear();
        snapCache.set(key, url);
        return url;
    }

    window.Robot3D = { mount, snapshot, OPTIONS, DEFAULT, get supported() { return isSupported(); } };
})();
