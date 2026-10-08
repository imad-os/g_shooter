/* Drawing. The ground, walls, obstacles and every decal (blood, scorch marks, bodies) live in one pre-rendered
 * floor canvas, so a frame is: floor, a few hundred sprites, particles, fog, effects. */
var Render = (function () {
    'use strict';
    var VW = 960, VH = 540, PI = Math.PI;
    var R = { canvas: null, ctx: null, img: null, floor: null, fctx: null, fs: 1, mini: null, cache: {}, tier: 'high', ready: false };
    var vignette, redVignette, glowWarm, glowWhite, sparkWarm, smokeLight = [], smokeDark = [], dust, bloods = [], flame = [], muzzles = [], puffs = [], expl = [], scorches = [];
    var MAT_COL = { g: '#2f9e57', d: '#a8723f', s: '#cf7c45', c: '#8fb0b6', p: '#b98249' };

    function F(n) { return ATLAS[n]; }
    function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
    // copy an atlas frame into its own canvas, optionally tinted (no getImageData: works from file:// too)
    function frameCanvas(n, tint, amount) {
        var f = F(n), c = canvas(f[2], f[3]), x = c.getContext('2d');
        x.drawImage(R.img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
        if (tint) { x.globalCompositeOperation = 'source-atop'; x.globalAlpha = amount === undefined ? 1 : amount; x.fillStyle = tint; x.fillRect(0, 0, f[2], f[3]); }
        return c;
    }
    R.frameCanvas = frameCanvas;
    function sprite(name, tint, amount) {
        var key = name + (tint || '') + (amount || '');
        var c = R.cache[key];
        if (!c) { if (!F(name)) return null; c = R.cache[key] = frameCanvas(name, tint, amount); }
        return c;
    }
    R.sprite = sprite;

    R.init = function (cv, img, tier) {
        R.canvas = cv; R.ctx = cv.getContext('2d'); R.img = img; R.tier = tier;
        vignette = canvas(480, 270);
        var v = vignette.getContext('2d'), g = v.createRadialGradient(240, 135, 70, 240, 135, 290);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)'); v.fillStyle = g; v.fillRect(0, 0, 480, 270);
        redVignette = canvas(480, 270);
        v = redVignette.getContext('2d'); g = v.createRadialGradient(240, 135, 90, 240, 135, 280);
        g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, 'rgba(200,10,10,0.85)'); v.fillStyle = g; v.fillRect(0, 0, 480, 270);
        glowWarm = frameCanvas('p_circle_05', '#ffb050', 1);
        glowWhite = frameCanvas('p_circle_05');
        sparkWarm = [frameCanvas('p_spark_01', '#ffd27a', 1), frameCanvas('p_spark_02', '#ffe2a0', 1), frameCanvas('p_spark_03', '#ffcc66', 1)];
        for (var k = 1; k <= 4; k++) { smokeLight.push(frameCanvas('p_smoke_0' + k, '#c9ccd2', 1)); smokeDark.push(frameCanvas('p_smoke_0' + k, '#2a2a2e', 1)); }
        dust = frameCanvas('p_smoke_02', '#d8c7a8', 1);
        for (k = 1; k <= 3; k++) bloods.push(frameCanvas('p_dirt_0' + k, '#6e0a0e', 1));
        flame.push(frameCanvas('p_flame_01', '#ff9a3c', 1), frameCanvas('p_flame_02', '#ffcf5a', 1));
        for (k = 1; k <= 5; k++) muzzles.push(sprite('p_muzzle_0' + k));
        for (k = 0; k < 6; k++) puffs.push(sprite('x_white' + k));
        for (k = 0; k < 9; k++) expl.push(sprite('x_explosion' + k));
        for (k = 1; k <= 3; k++) scorches.push(sprite('p_scorch_0' + k, '#120c08', 1));
        R.ready = true;
    };

    R.resize = function (cssW, cssH) {
        var dpr = window.devicePixelRatio || 1, maxW = R.tier === 'high' ? 2560 : R.tier === 'mid' ? 1920 : 1280;
        var bw = Math.min(Math.round(cssW * dpr), maxW);
        R.canvas.width = bw; R.canvas.height = Math.round(bw * 9 / 16);
        R.k = bw / VW;
    };

    /* ---------------- floor canvas ---------------- */

    function drawTileImg(c, name, x, y, size, rot) {
        var f = F('t_' + name);
        if (!f) return;
        if (rot) { c.save(); c.translate(x + size / 2, y + size / 2); c.rotate(rot); c.drawImage(R.img, f[0], f[1], f[2], f[3], -size / 2, -size / 2, size, size); c.restore(); }
        else c.drawImage(R.img, f[0], f[1], f[2], f[3], x, y, size + 0.5, size + 0.5);
    }

    function paintGround(c, i) {
        var W = World, x = (i % W.w) * TILE, y = ((i / W.w) | 0) * TILE, t = W.tiles[i];
        if (t === T_WATER) { drawTileImg(c, (i * 7) % 3 ? 'w0' : 'w1', x, y, TILE); return; }
        drawTileImg(c, W.MATS[W.mat[i]], x, y, TILE);
    }

    R.buildFloor = function () {
        var W = World, th = W.theme, fs = R.tier === 'low' || W.w * W.h > 3200 ? 0.5 : 1;
        if (R.tier === 'high' && W.w * W.h <= 3200) fs = 1;
        R.fs = fs;
        var cw = Math.round(W.w * TILE * fs), ch = Math.round(W.h * TILE * fs);
        if (!R.floor || R.floor.width !== cw || R.floor.height !== ch) { R.floor = canvas(cw, ch); R.fctx = R.floor.getContext('2d'); }
        var c = R.fctx, i, x, y, t;
        c.setTransform(fs, 0, 0, fs, 0, 0);
        c.fillStyle = th.bg; c.fillRect(0, 0, W.w * TILE, W.h * TILE);
        for (i = 0; i < W.n; i++) paintGround(c, i);
        // soft drop shadows for everything that stands up
        c.fillStyle = 'rgba(0,0,0,0.32)';
        for (i = 0; i < W.n; i++) {
            t = W.tiles[i]; x = (i % W.w) * TILE; y = ((i / W.w) | 0) * TILE;
            if (t === T_WALL) c.fillRect(x + 6, y + 8, TILE, TILE);
            else if (t === T_CRATE || t === T_BARREL || t === T_ROCK) { c.beginPath(); c.ellipse(x + 20, y + 22, 14, 12, 0, 0, 6.283); c.fill(); }
        }
        for (i = 0; i < W.trees.length; i++) {
            x = (W.trees[i] % W.w) * TILE; y = ((W.trees[i] / W.w) | 0) * TILE;
            c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + 40, y + 42, 34, 30, 0, 0, 6.283); c.fill();
        }
        for (i = 0; i < W.n; i++) paintObstacle(c, i);
        // minimap: 4 px per tile
        R.mini = canvas(W.w * 4, W.h * 4);
        var m = R.mini.getContext('2d');
        for (i = 0; i < W.n; i++) {
            t = W.tiles[i]; x = (i % W.w) * 4; y = ((i / W.w) | 0) * 4;
            m.fillStyle = t === T_WALL ? '#1d2229' : t === T_WATER ? '#2a6fb0' : t === T_TREE ? '#1f5a33' : t === T_BUSH ? '#2f7a45' :
                t === T_CRATE ? '#8a5a2c' : t === T_ROCK ? '#6f7a80' : t === T_BARREL ? '#d2552a' : (MAT_COL[(W.MATS[W.mat[i]] || 'c').charAt(0)] || '#888');
            m.fillRect(x, y, 4, 4);
        }
        // building interiors slightly darker
        m.fillStyle = 'rgba(0,0,0,0.18)';
        for (i = 0; i < W.n; i++) if (W.inside[i] && W.tiles[i] !== T_WALL) m.fillRect((i % W.w) * 4, ((i / W.w) | 0) * 4, 4, 4);
    };

    function paintObstacle(c, i) {
        var W = World, th = W.theme, t = W.tiles[i], x = (i % W.w) * TILE, y = ((i / W.w) | 0) * TILE;
        if (t === T_WALL) {
            var w = W.w, up = i >= w && W.tiles[i - w] === T_WALL, dn = i + w < W.n && W.tiles[i + w] === T_WALL;
            var lf = i % w > 0 && W.tiles[i - 1] === T_WALL, rt = i % w < w - 1 && W.tiles[i + 1] === T_WALL;
            c.fillStyle = th.wall; c.fillRect(x, y, TILE, TILE);
            c.fillStyle = th.wallTop; c.fillRect(x + (lf ? 0 : 3), y + (up ? 0 : 3), TILE - (lf ? 0 : 3) - (rt ? 0 : 3), TILE - (up ? 0 : 3) - (dn ? 0 : 6));
            c.fillStyle = th.wallEdge;
            if (!up) c.fillRect(x + (lf ? 0 : 3), y + 3, TILE - (lf ? 0 : 3) - (rt ? 0 : 3), 2);
            if (!lf) c.fillRect(x + 3, y + 3, 2, TILE - 6);
            c.fillStyle = 'rgba(0,0,0,0.25)';
            if (!dn) c.fillRect(x, y + TILE - 6, TILE, 6);
        } else if (t === T_CRATE) drawTileImg(c, (i * 13) % 5 === 0 ? 'crate2' : 'crate', x - 1, y - 1, TILE + 2, ((i * 7) % 4) * 0.06 - 0.09);
        else if (t === T_BARREL) drawTileImg(c, 'barrelR', x + 2, y + 2, TILE - 4, 0);
        else if (t === T_ROCK) drawTileImg(c, 'rock' + (i % 3), x - 2, y - 2, TILE + 4, (i % 5) * 0.4);
        else if (t === T_WATER) {
            var aw = W.w;
            c.fillStyle = 'rgba(255,255,255,0.25)';
            if (i >= aw && W.tiles[i - aw] !== T_WATER) c.fillRect(x, y, TILE, 2);
            if (i + aw < W.n && W.tiles[i + aw] !== T_WATER) c.fillRect(x, y + TILE - 2, TILE, 2);
        }
    }

    R.repaintTile = function (i) {
        var c = R.fctx, x = (i % World.w) * TILE, y = ((i / World.w) | 0) * TILE;
        c.setTransform(R.fs, 0, 0, R.fs, 0, 0);
        paintGround(c, i);
        // keep neighbouring walls' look
        if (i + 1 < World.n && World.tiles[i - 1] === T_WALL) { c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(x, y + 8, 6, TILE - 8); }
        if (i >= World.w && World.tiles[i - World.w] === T_WALL) { c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(x + 6, y, TILE - 6, 8); }
        // update the minimap
        var m = R.mini.getContext('2d');
        m.fillStyle = MAT_COL[(World.MATS[World.mat[i]] || 'c').charAt(0)] || '#888';
        m.fillRect((i % World.w) * 4, ((i / World.w) | 0) * 4, 4, 4);
    };

    R.decal = function (kind, x, y, rot, s, a) {
        var c = R.fctx;
        if (!c) return;
        c.setTransform(R.fs, 0, 0, R.fs, 0, 0);
        c.globalAlpha = a;
        if (kind === 'hole') { c.fillStyle = '#16120e'; c.beginPath(); c.arc(x, y, 1.6, 0, 6.283); c.fill(); }
        else if (kind === 'shell') { c.fillStyle = '#c9a03c'; c.save(); c.translate(x, y); c.rotate(rot); c.fillRect(-2, -1, 4, 2); c.restore(); }
        else if (kind === 'drop') { c.fillStyle = '#5c080b'; c.beginPath(); c.arc(x, y, 1.5 + s * 3, 0, 6.283); c.fill(); }
        else {
            var img = kind === 'blood' ? bloods[(Math.random() * 3) | 0] : kind === 'scorch' ? scorches[(Math.random() * 3) | 0] : null;
            if (kind === 'planks') { img = sprite('t_plank'); s = 0.45; }
            if (img) {
                c.save(); c.translate(x, y); c.rotate(rot);
                var w = img.width * s, h = img.height * s;
                c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
                if (kind === 'planks') { var sh = sprite('t_shards'); c.drawImage(sh, x - 14, y - 10, 28, 28); }
            }
        }
        c.globalAlpha = 1;
    };

    R.bakeCorpse = function (b) {
        var c = R.fctx;
        c.setTransform(R.fs, 0, 0, R.fs, 0, 0);
        c.globalAlpha = 0.9;
        var bl = bloods[(b.x | 0) % 3], s = 0.55 * b.scale;
        c.save(); c.translate(b.x, b.y); c.rotate(b.ang * 0.7);
        c.drawImage(bl, -bl.width * s / 2, -bl.height * s / 2, bl.width * s, bl.height * s);
        c.restore();
        c.globalAlpha = 1;
        drawCorpse(c, b);
    };
    function drawCorpse(c, b) {
        var img = sprite('c_' + b.sprite + '_hold', '#200000', 0.42);
        if (!img) return;
        var s = 0.5 * b.scale;
        c.save(); c.translate(b.x, b.y); c.rotate(b.ang);
        c.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
        c.restore();
    }

    /* ---------------- frame ---------------- */

    var actorCache = {};
    function actorImg(a) {
        var wd = Game.wpn(a), pose = a.reloadT > 0 ? 'reload' : a.nadeAnim > 0 ? 'hold' : wd ? wd.pose : 'stand';
        var bySprite = actorCache[a.tint || a.sprite];
        if (!bySprite) bySprite = actorCache[a.tint || a.sprite] = {};
        var c = bySprite[pose];
        if (!c) c = bySprite[pose] = sprite('c_' + a.sprite + '_' + pose, a.tint, a.tint ? 0.38 : 0);
        return c;
    }

    R.draw = function () {
        var c = R.ctx, G = Game, W = World, k = R.k, z = G.zoom, i, a;
        if (!R.floor) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b0f14'; c.fillRect(0, 0, R.canvas.width, R.canvas.height); return; }
        var vw = VW / z, vh = VH / z;
        var sx = G.shake ? (Math.random() - 0.5) * G.shake : 0, sy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
        var cx = G.camX, cy = G.camY;
        var mw = W.w * TILE, mh = W.h * TILE;
        if (mw > vw) cx = Math.max(vw / 2 - 40, Math.min(mw - vw / 2 + 40, cx)); else cx = mw / 2;
        if (mh > vh) cy = Math.max(vh / 2 - 40, Math.min(mh - vh / 2 + 40, cy)); else cy = mh / 2;
        var left = cx - vw / 2 + sx, top = cy - vh / 2 + sy;
        R.left = left; R.top = top; R.vw = vw; R.vh = vh;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = W.theme.bg; c.fillRect(0, 0, R.canvas.width, R.canvas.height);
        c.setTransform(k * z, 0, 0, k * z, -left * k * z, -top * k * z);
        c.imageSmoothingEnabled = true;
        // floor (only the visible part)
        var fx = Math.max(0, left), fy = Math.max(0, top), fw = Math.min(mw, left + vw) - fx, fh = Math.min(mh, top + vh) - fy;
        if (fw > 0 && fh > 0) c.drawImage(R.floor, fx * R.fs, fy * R.fs, fw * R.fs, fh * R.fs, fx, fy, fw, fh);
        var L0 = left - 64, T0 = top - 64, L1 = left + vw + 64, T1 = top + vh + 64, f = G.frame;

        // pickups
        for (i = 0; i < G.pickups.length; i++) {
            var p = G.pickups[i];
            if (!p.on || p.x < L0 || p.x > L1 || p.y < T0 || p.y > T1) continue;
            drawPickup(c, p, f);
        }
        // sliding bodies with their growing pool of blood
        for (i = 0; i < G.corpses.length; i++) {
            var b = G.corpses[i];
            if (!b.on || b.x < L0 || b.x > L1 || b.y < T0 || b.y > T1) continue;
            if (b.pool > 0) {
                var bl = bloods[(i) % 3], bs = 0.55 * b.scale * b.pool;
                c.globalAlpha = 0.9; c.save(); c.translate(b.x, b.y); c.rotate(b.ang * 0.7);
                c.drawImage(bl, -bl.width * bs / 2, -bl.height * bs / 2, bl.width * bs, bl.height * bs); c.restore(); c.globalAlpha = 1;
            }
            drawCorpse(c, b);
        }
        // low particles: shells, blood, debris
        for (i = 0; i < G.parts.length; i++) {
            var q = G.parts[i];
            if (!q.on || q.x < L0 || q.x > L1 || q.y < T0 || q.y > T1) continue;
            if (q.k === Game.P.SHELL) { c.fillStyle = '#e0b84a'; c.save(); c.translate(q.x, q.y - q.z); c.rotate(q.rot); c.fillRect(-2, -1, 4, 2); c.restore(); }
            else if (q.k === Game.P.BLOOD) { c.globalAlpha = Math.min(1, q.life / 8); c.fillStyle = '#8a0d12'; c.beginPath(); c.arc(q.x, q.y, 1 + q.size * 6, 0, 6.283); c.fill(); c.globalAlpha = 1; }
            else if (q.k === Game.P.DEBRIS) { c.globalAlpha = Math.min(1, q.life / 15); c.fillStyle = '#9b6a3a'; c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.size * 9, -q.size * 3, q.size * 18, q.size * 6); c.restore(); c.globalAlpha = 1; }
        }
        // grenades
        for (i = 0; i < G.nades.length; i++) {
            var n = G.nades[i];
            if (!n.on) continue;
            var nd = NADES[n.t];
            if ((nd.id === 'frag' || nd.id === 'fire') && n.z < 6) {      // blast radius warning on the ground
                c.globalAlpha = 0.25 + 0.25 * ((f >> 3) & 1);
                c.fillStyle = '#ff2a2a'; c.beginPath(); c.arc(n.x, n.y, nd.radius * 0.8, 0, 6.283); c.fill();
                c.globalAlpha = 0.9; c.strokeStyle = '#ff4040'; c.lineWidth = 2; c.stroke();
                c.globalAlpha = 1;
            }
            c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(n.x + 2 + n.z * 0.3, n.y + 3 + n.z * 0.5, 4, 3, 0, 0, 6.283); c.fill();
            c.fillStyle = '#3b4a2f'; c.beginPath(); c.arc(n.x, n.y - n.z, 4.2, 0, 6.283); c.fill();
            c.fillStyle = NADES[n.t].color; c.beginPath(); c.arc(n.x - 1, n.y - n.z - 1, 1.6, 0, 6.283); c.fill();
            if ((n.fuse >> 3) % 2 === 0) { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(n.x + 2, n.y - n.z - 2, 1.5, 0, 6.283); c.fill(); }
        }
        // actors
        for (i = 0; i < G.actors.length; i++) {
            a = G.actors[i];
            if (!a.on || a.x < L0 || a.x > L1 || a.y < T0 || a.y > T1) continue;
            if (!a.isPlayer && !a.seenByP) continue;
            drawActor(c, a, f);
        }
        // bullets as tracers
        c.globalCompositeOperation = 'lighter';
        c.lineCap = 'round';
        for (i = 0; i < G.bullets.length; i++) {
            var u = G.bullets[i];
            if (!u.on) continue;
            var tl = u.sniper ? 2.2 : 1.1, tx0 = u.x - u.vx * tl, ty0 = u.y - u.vy * tl;
            if (u.life < 2) { tx0 = u.sx; ty0 = u.sy; }
            c.strokeStyle = u.enemy ? 'rgba(255,120,70,0.85)' : u.sniper ? 'rgba(200,240,255,0.95)' : 'rgba(255,236,170,0.85)';
            c.lineWidth = u.sniper ? 2.4 : 1.5;
            c.beginPath(); c.moveTo(tx0, ty0); c.lineTo(u.x, u.y); c.stroke();
        }
        c.globalCompositeOperation = 'source-over';
        // tree canopies and bushes above the actors
        var th = W.theme;
        for (i = 0; i < W.trees.length; i++) {
            var ti = W.trees[i], txx = (ti % W.w) * TILE, tyy = ((ti / W.w) | 0) * TILE;
            if (txx < L0 - 64 || txx > L1 || tyy < T0 - 64 || tyy > T1) continue;
            var sway = Math.sin(f * 0.02 + ti) * 0.6;
            drawTile(c, 'tree0', txx - 4 + sway, tyy - 4, 36); drawTile(c, 'tree1', txx + 32 + sway, tyy - 4, 36);
            drawTile(c, 'tree2', txx - 4 + sway, tyy + 32, 36); drawTile(c, 'tree3', txx + 32 + sway, tyy + 32, 36);
        }
        var x0 = Math.max(0, Math.floor(left / TILE) - 1), x1 = Math.min(W.w - 1, Math.floor((left + vw) / TILE) + 1);
        var y0 = Math.max(0, Math.floor(top / TILE) - 1), y1 = Math.min(W.h - 1, Math.floor((top + vh) / TILE) + 1);
        var bushImg = sprite('t_' + th.bushTile);
        for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
            var ii = yy * W.w + xx;
            if (W.tiles[ii] !== T_BUSH) continue;
            var pin = G.player && G.player.on && Math.floor(G.player.x / TILE) === xx && Math.floor(G.player.y / TILE) === yy;
            c.globalAlpha = pin ? 0.55 : 0.96;
            c.drawImage(bushImg, xx * TILE - 6, yy * TILE - 6, TILE + 12, TILE + 12);
        }
        c.globalAlpha = 1;
        // particles: smoke, fire, sparks, flashes
        drawParts(c, L0, T0, L1, T1);
        // fog of war
        if (G.mode !== 'attract') {
            W.flushFog();
            var gx0 = Math.max(0, Math.floor(left / TILE) - 2), gy0 = Math.max(0, Math.floor(top / TILE) - 2);
            var gx1 = Math.min(W.w, Math.ceil((left + vw) / TILE) + 2), gy1 = Math.min(W.h, Math.ceil((top + vh) / TILE) + 2);
            c.imageSmoothingEnabled = true;
            c.drawImage(W.fogCanvas, gx0, gy0, gx1 - gx0, gy1 - gy0, gx0 * TILE, gy0 * TILE, (gx1 - gx0) * TILE, (gy1 - gy0) * TILE);
        }
        // sniper lasers are always shown: fair warning
        for (i = 0; i < G.actors.length; i++) {
            a = G.actors[i];
            if (!a.on || !a.laserT || a.x < L0 - 900 || a.x > L1 + 900) continue;
            var need = a.def.laser || 60, pr = Math.min(1, a.laserT / need);
            var ex = a.x + Math.cos(a.angle) * 1400, ey = a.y + Math.sin(a.angle) * 1400;
            var tt = World.ray(a.x, a.y, ex, ey, BLOCK_SHOT);
            if (tt <= 1) { ex = a.x + (ex - a.x) * tt; ey = a.y + (ey - a.y) * tt; }
            c.globalAlpha = 0.25 + pr * 0.6; c.strokeStyle = '#ff2828'; c.lineWidth = 1 + pr * 1.5;
            c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(ex, ey); c.stroke();
            c.globalAlpha = 0.9; c.fillStyle = '#ff3c3c'; c.beginPath(); c.arc(ex, ey, 2 + pr * 2, 0, 6.283); c.fill(); c.globalAlpha = 1;
        }
        // AI state icons over visible enemies
        for (i = 0; i < G.actors.length; i++) {
            a = G.actors[i];
            if (!a.on || a.isPlayer || !a.seenByP || G.mode === 'attract') continue;
            drawOverhead(c, a, f);
        }
        // battle royale zone
        if (G.zone) drawZone(c, G.zone, left, top, vw, vh);
        // auto-aim reticle
        var P = G.player;
        if (P && P.on && G.state === 'play' && (G.tgt.a || G.tgt.barrel >= 0)) {
            var rx = G.tgt.x, ry = G.tgt.y, rs = (G.tgt.a ? G.tgt.a.r + 9 : 18) + Math.sin(f * 0.2) * 2;
            c.strokeStyle = G.tgt.barrel >= 0 ? '#ffa630' : '#ff3d4a'; c.lineWidth = 3;
            for (var cc = 0; cc < 4; cc++) {
                var ax = cc & 1 ? 1 : -1, ay = cc & 2 ? 1 : -1;
                c.beginPath(); c.moveTo(rx + ax * rs, ry + ay * (rs - 7)); c.lineTo(rx + ax * rs, ry + ay * rs); c.lineTo(rx + ax * (rs - 7), ry + ay * rs); c.stroke();
            }
            if (R.tier !== 'low') { c.strokeStyle = 'rgba(255,80,80,0.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(rx, ry); c.stroke(); }
        }
        // last hostiles: pulsing markers through the fog
        if (G.revealLast && G.mode === 'story') {
            var pulse = 0.5 + 0.5 * Math.sin(f * 0.12);
            for (i = 0; i < G.actors.length; i++) {
                a = G.actors[i];
                if (!a.on || a.team !== 1 || a.seenByP) continue;
                c.globalAlpha = 0.4 + pulse * 0.5; c.strokeStyle = '#ff4646'; c.lineWidth = 2.5;
                c.beginPath(); c.arc(a.x, a.y, 12 + pulse * 6, 0, 6.283); c.stroke(); c.globalAlpha = 1;
            }
        }
        // screen space
        c.setTransform(k, 0, 0, k, 0, 0);
        if (P && P.on && G.mode !== 'attract') {
            if (R.tier !== 'low') c.drawImage(vignette, 0, 0, VW, VH);
            var hurt = G.events.hurtT / 50, low = P.hp < 35 ? (0.35 + 0.25 * Math.sin(f * 0.1)) * (1 - P.hp / 35) : 0;
            if (hurt > 0 || low > 0) { c.globalAlpha = Math.min(1, hurt * 0.55 + low); c.drawImage(redVignette, 0, 0, VW, VH); c.globalAlpha = 1; }
            if (G.events.hurtT > 0) {
                // direction of the hit
                var ha = G.events.hurtAng;
                c.globalAlpha = Math.min(1, hurt * 0.9); c.strokeStyle = '#ff2828'; c.lineWidth = 10;
                c.beginPath(); c.arc(VW / 2, VH / 2, 200, ha - 0.35, ha + 0.35); c.stroke(); c.globalAlpha = 1;
                if (G.state !== 'tactical') G.events.hurtT--;
            }
            if (G.flashT > 0) { c.globalAlpha = Math.min(1, G.flashT / 60); c.fillStyle = '#ffffff'; c.fillRect(0, 0, VW, VH); c.globalAlpha = 1; }
            // off-screen pointers to the last hostiles
            if (G.revealLast && G.mode === 'story') {
                for (i = 0; i < G.actors.length; i++) {
                    a = G.actors[i];
                    if (!a.on || a.team !== 1) continue;
                    var px = (a.x - left) * z, py = (a.y - top) * z;
                    if (px > 20 && px < VW - 20 && py > 20 && py < VH - 20) continue;
                    var an = Math.atan2(py - VH / 2, px - VW / 2);
                    var ex2 = VW / 2 + Math.cos(an) * 1000, ey2 = VH / 2 + Math.sin(an) * 1000;
                    var tclip = Math.min(Math.abs((VW / 2 - 34) / (ex2 - VW / 2 || 1e-6)), Math.abs((VH / 2 - 34) / (ey2 - VH / 2 || 1e-6)));
                    var ix = VW / 2 + (ex2 - VW / 2) * tclip, iy = VH / 2 + (ey2 - VH / 2) * tclip;
                    c.save(); c.translate(ix, iy); c.rotate(an); c.fillStyle = '#ff4d4d';
                    c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-4, 0); c.lineTo(-8, 10); c.closePath(); c.fill(); c.restore();
                }
            }
        } else if (R.tier !== 'low') c.drawImage(vignette, 0, 0, VW, VH);
    };

    function drawTile(c, name, x, y, size) { var f = F('t_' + name); if (f) c.drawImage(R.img, f[0], f[1], f[2], f[3], x, y, size, size); }

    function drawActor(c, a, f) {
        var img = actorImg(a);
        if (!img) return;
        var s = 0.5 * a.scale, inBush = World.tileAt(a.x, a.y) === T_BUSH;
        // shadow and team ring
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(a.x + 3, a.y + 4, a.r * 1.05, a.r * 0.9, 0, 0, 6.283); c.fill();
        if (a.isPlayer) { c.strokeStyle = '#3ee6ff'; c.lineWidth = 2.5; c.beginPath(); c.arc(a.x, a.y, a.r + 5, 0, 6.283); c.stroke(); }
        else if (a.boss) { c.globalAlpha = 0.6 + 0.3 * Math.sin(f * 0.1); c.strokeStyle = '#ff3c3c'; c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, a.r + 6, 0, 6.283); c.stroke(); c.globalAlpha = 1; }
        else if (Game.mode !== 'attract') { c.strokeStyle = a.team === 1 ? 'rgba(255,70,70,0.7)' : 'rgba(255,170,60,0.7)'; c.lineWidth = 1.5; c.beginPath(); c.arc(a.x, a.y, a.r + 3, 0, 6.283); c.stroke(); }
        c.save(); c.translate(a.x, a.y); c.rotate(a.angle);
        if (inBush && a.isPlayer) c.globalAlpha = 0.6;
        c.drawImage(img, -img.width * s * 0.42, -img.height * s / 2, img.width * s, img.height * s);
        if (a.hitFlash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a.hitFlash / 8; c.drawImage(img, -img.width * s * 0.42, -img.height * s / 2, img.width * s, img.height * s); c.globalCompositeOperation = 'source-over'; }
        c.globalAlpha = 1;
        c.restore();
    }

    function drawOverhead(c, a, f) {
        var y = a.y - a.r - 14;
        if (a.hp < a.maxHp && !a.boss) {
            c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(a.x - 14, y + 6, 28, 4);
            c.fillStyle = a.hp / a.maxHp > 0.4 ? '#7dff9a' : '#ff5a4a'; c.fillRect(a.x - 14, y + 6, 28 * Math.max(0, a.hp / a.maxHp), 4);
        }
        if (Game.mode === 'br' && a.name) {
            c.font = '700 10px Rajdhani, Arial, sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillText(a.name, a.x, y - 6);
        }
        if (a.iconT > 0 && a.icon) {
            var col = a.icon === 3 ? '#ff3b3b' : a.icon === 2 ? '#ffffff' : '#ffd23f', ch = a.icon === 3 ? '!' : a.icon === 2 ? '*' : '?';
            var bob = Math.sin(f * 0.2) * 1.5;
            c.fillStyle = 'rgba(0,0,0,0.65)'; c.beginPath(); c.arc(a.x, y - 4 + bob, 8, 0, 6.283); c.fill();
            c.strokeStyle = col; c.lineWidth = 2; c.stroke();
            if (a.icon === 1 && a.aware > 0 && a.aware < 1) { c.beginPath(); c.arc(a.x, y - 4 + bob, 8, -PI / 2, -PI / 2 + a.aware * 6.283); c.lineWidth = 3; c.stroke(); }
            c.fillStyle = col; c.font = '800 12px Rajdhani, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(ch, a.x, y - 3.5 + bob); c.textBaseline = 'alphabetic';
        }
    }

    function drawPickup(c, p, f) {
        var bob = Math.sin(f * 0.08 + p.x) * 1.5, x = p.x, y = p.y + bob;
        var col = p.kind === 'w' ? '#ffd34d' : p.kind === 'med' ? '#ff5a6a' : p.kind === 'armor' ? '#4fc3ff' : p.kind === 'nade' ? '#9fe870' : '#e6e6e6';
        c.globalAlpha = 0.35 + 0.15 * Math.sin(f * 0.1 + p.y);
        c.fillStyle = col; c.beginPath(); c.arc(x, y, 12, 0, 6.283); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 12, 0, 6.283); c.stroke();
        if (p.kind === 'w') {
            var wd = WEAPONS[p.wid], icon = sprite(wd.cat === 'pistol' ? (wd.pose === 'silencer' ? 'i_weapon_silencer' : 'i_weapon_gun') : 'i_weapon_machine');
            if (icon) { var s = wd.cat === 'pistol' ? 0.6 : 0.75; c.drawImage(icon, x - icon.width * s / 2, y - icon.height * s / 2, icon.width * s, icon.height * s); }
        } else if (p.kind === 'med') { c.fillStyle = '#fff'; c.fillRect(x - 6, y - 5, 12, 10); c.fillStyle = '#e8283c'; c.fillRect(x - 1.5, y - 4, 3, 8); c.fillRect(x - 4, y - 1.5, 8, 3); }
        else if (p.kind === 'armor') { c.fillStyle = '#2a8fd6'; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y - 4); c.lineTo(x + 5, y + 3); c.lineTo(x, y + 7); c.lineTo(x - 5, y + 3); c.lineTo(x - 6, y - 4); c.closePath(); c.fill(); }
        else if (p.kind === 'nade') { c.fillStyle = '#3b4a2f'; c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.fill(); c.fillStyle = NADES[p.n].color; c.fillRect(x - 1.5, y - 8, 3, 4); }
        else { c.fillStyle = '#5b6b3a'; c.fillRect(x - 7, y - 5, 14, 10); c.fillStyle = '#d9c06a'; c.fillRect(x - 5, y - 3, 2, 6); c.fillRect(x - 1, y - 3, 2, 6); c.fillRect(x + 3, y - 3, 2, 6); }
    }

    function drawParts(c, L0, T0, L1, T1) {
        var P = Game.P, parts = Game.parts, i, q, img, s, a;
        // normal-blended smoke first, then additive light
        for (i = 0; i < parts.length; i++) {
            q = parts[i];
            if (!q.on || q.x < L0 || q.x > L1 || q.y < T0 || q.y > T1) continue;
            var lr = q.life / q.max;
            if (q.k === P.SMOKE || q.k === P.DUST) {
                img = q.k === P.DUST ? dust : (q.v ? smokeDark : smokeLight)[i & 3];
                s = q.size; a = q.a * Math.min(1, lr * 2) * Math.min(1, (1 - lr) * 6 + 0.3);
                c.globalAlpha = a; c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
                c.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s); c.restore();
            } else if (q.k === P.PUFF) {
                img = puffs[i % 6];
                s = q.size; a = q.a * Math.min(1, lr * 3) * Math.min(1, (1 - lr) * 4);
                c.globalAlpha = a; c.save(); c.translate(q.x, q.y); c.rotate(q.rot);
                c.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s); c.restore();
            } else if (q.k === P.EXPL) {
                var fr = Math.min(8, Math.floor((1 - lr) * 9));
                img = expl[fr]; s = q.size;
                c.globalAlpha = Math.min(1, lr * 3);
                c.drawImage(img, q.x - img.width * s / 2, q.y - img.height * s / 2, img.width * s, img.height * s);
            } else if (q.k === P.RING) {
                c.globalAlpha = lr * q.a; c.strokeStyle = '#fff3d0'; c.lineWidth = 4 * lr + 1;
                c.beginPath(); c.arc(q.x, q.y, (q.size + (q.max - q.life) * q.grow) * 100, 0, 6.283); c.stroke();
            }
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'lighter';
        for (i = 0; i < parts.length; i++) {
            q = parts[i];
            if (!q.on || q.x < L0 || q.x > L1 || q.y < T0 || q.y > T1) continue;
            var lr2 = q.life / q.max;
            if (q.k === P.MUZZLE) {
                img = muzzles[i % 5];
                s = 0.3 * q.size; c.globalAlpha = Math.min(1, lr2 * 1.5);
                c.save(); c.translate(q.x, q.y); c.rotate(q.rot + PI / 2);
                c.drawImage(img, -img.width * s / 2, -img.height * s * 0.95, img.width * s, img.height * s); c.restore();
            } else if (q.k === P.GLOW) {
                img = q.size > 6 ? glowWhite : glowWarm; s = q.size * 0.5; c.globalAlpha = q.a * lr2;
                c.drawImage(img, q.x - img.width * s / 2, q.y - img.height * s / 2, img.width * s, img.height * s);
            } else if (q.k === P.SPARK) {
                img = sparkWarm[i % 3]; s = q.size; c.globalAlpha = Math.min(1, lr2 * 1.4);
                c.drawImage(img, q.x - img.width * s / 2, q.y - img.height * s / 2, img.width * s, img.height * s);
            } else if (q.k === P.FIRE) {
                img = flame[i & 1]; s = q.size * (0.6 + lr2 * 0.6); c.globalAlpha = Math.min(1, lr2 * 1.5) * 0.9;
                c.drawImage(img, q.x - img.width * s / 2, q.y - img.height * s / 2, img.width * s, img.height * s);
            }
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
    }

    function drawZone(c, z, left, top, vw, vh) {
        c.fillStyle = 'rgba(30,110,255,0.22)';
        c.beginPath(); c.rect(left - 50, top - 50, vw + 100, vh + 100); c.arc(z.cx, z.cy, Math.max(1, z.r), 0, 6.283, true); c.fill();
        c.strokeStyle = 'rgba(90,180,255,0.9)'; c.lineWidth = 4; c.beginPath(); c.arc(z.cx, z.cy, Math.max(1, z.r), 0, 6.283); c.stroke();
        if (z.nr > 0) { c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.setLineDash([12, 10]); c.beginPath(); c.arc(z.ncx, z.ncy, z.nr, 0, 6.283); c.stroke(); c.setLineDash([]); }
    }

    /* ---------------- minimap / tactical map ---------------- */

    // draws the map into ctx (w x h). full: whole map; otherwise a window around the player
    R.drawMap = function (ctx, w, h, full) {
        var G = Game, W = World;
        if (!R.mini) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var scale, ox, oy;
        if (full) { scale = Math.min(w / (W.w * TILE), h / (W.h * TILE)); ox = (w - W.w * TILE * scale) / 2; oy = (h - W.h * TILE * scale) / 2; }
        else { scale = w / 900; var c0 = G.player && G.player.on ? G.player : { x: G.camX, y: G.camY }; ox = w / 2 - c0.x * scale; oy = h / 2 - c0.y * scale; }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(R.mini, ox, oy, W.w * TILE * scale, W.h * TILE * scale);
        if (G.mode !== 'attract') { ctx.imageSmoothingEnabled = true; W.flushFog(); ctx.drawImage(W.fogCanvas, ox, oy, W.w * TILE * scale, W.h * TILE * scale); }
        var i, a, ps = Math.max(3, full ? 5 : 3.5);
        for (i = 0; i < G.pickups.length; i++) {
            var p = G.pickups[i];
            if (!p.on || !W.explored[Math.floor(p.y / TILE) * W.w + Math.floor(p.x / TILE)]) continue;
            ctx.fillStyle = p.kind === 'w' ? '#ffd34d' : p.kind === 'med' ? '#ff5a6a' : p.kind === 'armor' ? '#4fc3ff' : '#dddddd';
            ctx.fillRect(ox + p.x * scale - 1.5, oy + p.y * scale - 1.5, 3, 3);
        }
        if (G.zone) {
            var z = G.zone;
            ctx.strokeStyle = '#5ab4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + z.cx * scale, oy + z.cy * scale, z.r * scale, 0, 6.283); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(ox + z.ncx * scale, oy + z.ncy * scale, z.nr * scale, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        }
        for (i = 0; i < G.actors.length; i++) {
            a = G.actors[i];
            if (!a.on || a.isPlayer) continue;
            var show = a.seenByP || (G.revealLast && a.team === 1) || G.mode === 'attract';
            if (!show) continue;
            ctx.fillStyle = a.boss ? '#ff2e63' : '#ff4b4b';
            ctx.beginPath(); ctx.arc(ox + a.x * scale, oy + a.y * scale, a.boss ? ps * 1.6 : ps, 0, 6.283); ctx.fill();
        }
        if (G.boss && G.boss.on && full && !G.boss.seenByP) {
            // the boss area is known from intel
            ctx.strokeStyle = 'rgba(255,46,99,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
            ctx.beginPath(); ctx.arc(ox + G.boss.homeX * scale, oy + G.boss.homeY * scale, 9 * TILE * scale, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        }
        var P = G.player;
        if (P && P.on) {
            var px = ox + P.x * scale, py = oy + P.y * scale;
            ctx.save(); ctx.translate(px, py); ctx.rotate(P.angle);
            ctx.fillStyle = '#3ee6ff'; ctx.strokeStyle = '#002a33'; ctx.lineWidth = 1.5;
            var u = full ? 9 : 7;
            ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(-u * 0.7, -u * 0.65); ctx.lineTo(-u * 0.35, 0); ctx.lineTo(-u * 0.7, u * 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
        }
    };

    return R;
})();
