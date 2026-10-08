/* The world grid: generation (always fully connected, so the player can never be trapped), line of sight,
 * A* pathfinding, cover search and the player's field of view (fog of war). */
var TILE = 32;
var T_FLOOR = 0, T_WALL = 1, T_CRATE = 2, T_TREE = 3, T_ROCK = 4, T_WATER = 5, T_BUSH = 6, T_BARREL = 7;
var BLOCK_MOVE = new Uint8Array([0, 1, 1, 1, 1, 1, 0, 1]);
var BLOCK_SHOT = new Uint8Array([0, 1, 1, 1, 1, 0, 0, 1]);
var BLOCK_SIGHT = BLOCK_SHOT;

var World = (function () {
    'use strict';
    var W = {
        w: 0, h: 0, n: 0, tiles: null, mat: null, hp: null, explored: null, vis: null, visStamp: 1, claim: null, dist: null,
        inside: null, theme: null, themeName: '', trees: [], spawnX: 0, spawnY: 0, buildings: [], seed: 1,
        hitTile: -1, hitNx: 0, hitNy: 0, fogData: null, fogCanvas: null, fogDirty: true
    };
    var MATS = [];                     // material index -> atlas tile key
    function matId(key) { var i = MATS.indexOf(key); if (i < 0) { MATS.push(key); i = MATS.length - 1; } return i; }
    W.MATS = MATS;

    var rs = 1;
    function rnd() { rs |= 0; rs = rs + 0x6D2B79F5 | 0; var t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    W.rnd = rnd; W.ri = ri;

    // scratch buffers sized for the largest map, allocated once
    var MAXN = 90 * 90;
    var heapI = new Int32Array(MAXN * 8), heapF = new Float32Array(MAXN * 8), heapN = 0;
    var gS = new Float32Array(MAXN), par = new Int32Array(MAXN), seen = new Uint32Array(MAXN), closed = new Uint32Array(MAXN), gen = 1;
    var queue = new Int32Array(MAXN), mark = new Uint32Array(MAXN), markGen = 1, tmpPath = new Int32Array(MAXN);

    function idx(tx, ty) { return ty * W.w + tx; }
    function inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < W.w && ty < W.h; }
    function tileAt(x, y) { var tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return inb(tx, ty) ? W.tiles[ty * W.w + tx] : T_WALL; }
    W.idx = idx; W.inb = inb; W.tileAt = tileAt;
    W.passable = function (i) { return !BLOCK_MOVE[W.tiles[i]]; };

    /* ---------------- generation ---------------- */

    function free(tx, ty) { return inb(tx, ty) && W.tiles[idx(tx, ty)] === T_FLOOR && !W.inside[idx(tx, ty)]; }
    function nearSpawn(tx, ty, r) { return Math.abs(tx - W.spawnX) <= r && Math.abs(ty - W.spawnY) <= r; }

    W.generate = function (o) {
        rs = o.seed | 0 || 1; W.seed = o.seed;
        var w = o.w, h = o.h, n = w * h, th = THEMES[o.theme];
        W.w = w; W.h = h; W.n = n; W.theme = th; W.themeName = o.theme;
        W.tiles = new Uint8Array(n); W.mat = new Uint8Array(n); W.hp = new Uint8Array(n); W.explored = new Uint8Array(n);
        W.vis = new Uint32Array(n); W.claim = new Int16Array(n); W.dist = new Int32Array(n); W.inside = new Uint8Array(n);
        W.trees = []; W.buildings = [];
        W.spawnX = o.spawnX !== undefined ? o.spawnX : 4; W.spawnY = o.spawnY !== undefined ? o.spawnY : Math.floor(h / 2);
        var i, x, y, k;

        // ground: coarse clusters of floor variants, then patches of the alternative ground
        var base = th.floors.map(matId), alt = th.alt.map(matId), inner = th.inner.map(matId);
        var cw = Math.ceil(w / 4) + 1, coarse = [];
        for (i = 0; i < cw * (Math.ceil(h / 4) + 1); i++) coarse.push(base[ri(0, base.length - 1)]);
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) W.mat[idx(x, y)] = rnd() < 0.25 ? base[ri(0, base.length - 1)] : coarse[(y >> 2) * cw + (x >> 2)];
        var patches = Math.floor(n / 160);
        for (k = 0; k < patches; k++) {
            var px = ri(1, w - 2), py = ri(1, h - 2), pr = ri(1, 4), am = alt[ri(0, alt.length - 1)];
            for (y = py - pr; y <= py + pr; y++) for (x = px - pr; x <= px + pr; x++)
                if (inb(x, y) && (x - px) * (x - px) + (y - py) * (y - py) <= pr * pr + rnd() * 2) W.mat[idx(x, y)] = am;
        }
        // map border
        for (x = 0; x < w; x++) { W.tiles[idx(x, 0)] = T_WALL; W.tiles[idx(x, h - 1)] = T_WALL; }
        for (y = 0; y < h; y++) { W.tiles[idx(0, y)] = T_WALL; W.tiles[idx(w - 1, y)] = T_WALL; }

        // water: channels with bridges (docks) or ponds
        for (k = 0; k < th.water; k++) {
            if (o.theme === 'docks') {
                var vert = rnd() < 0.5, pos = vert ? ri(10, w - 10) : ri(8, h - 8), wid = ri(2, 3);
                var len = vert ? h : w;
                for (var t = 1; t < len - 1; t++) {
                    if (t % 11 >= 9) continue;            // bridges every few tiles
                    for (var q = 0; q < wid; q++) {
                        var cx = vert ? pos + q : t, cy = vert ? t : pos + q;
                        if (inb(cx, cy) && W.tiles[idx(cx, cy)] === T_FLOOR && !nearSpawn(cx, cy, 5)) W.tiles[idx(cx, cy)] = T_WATER;
                    }
                }
            } else {
                var ox = ri(8, w - 8), oy = ri(5, h - 5), orr = ri(2, 3);
                for (y = oy - orr; y <= oy + orr; y++) for (x = ox - orr - 1; x <= ox + orr + 1; x++)
                    if (inb(x, y) && x > 0 && y > 0 && x < w - 1 && y < h - 1 && !nearSpawn(x, y, 6) &&
                        (x - ox) * (x - ox) * 0.7 + (y - oy) * (y - oy) <= orr * orr + 0.5) W.tiles[idx(x, y)] = T_WATER;
            }
        }

        // buildings: walls with doors, wooden or concrete floors inside, sometimes a partition
        var nb = o.buildings !== undefined ? o.buildings : th.buildings;
        for (var tries = 0; tries < nb * 30 && W.buildings.length < nb; tries++) {
            var bw = ri(6, 12), bh = ri(5, 9), bx = ri(2, w - bw - 3), by = ri(2, h - bh - 3);
            if (bx < W.spawnX + 6 && Math.abs(by + bh / 2 - W.spawnY) < bh / 2 + 5) continue;
            var ok = true;
            for (y = by - 2; y < by + bh + 2 && ok; y++) for (x = bx - 2; x < bx + bw + 2; x++)
                if (!inb(x, y) || W.inside[idx(x, y)] || (W.tiles[idx(x, y)] !== T_FLOOR && !(x === 0 || y === 0 || x === w - 1 || y === h - 1))) { ok = false; break; }
            if (!ok) continue;
            var im = inner[ri(0, inner.length - 1)];
            for (y = by; y < by + bh; y++) for (x = bx; x < bx + bw; x++) {
                var edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1;
                W.tiles[idx(x, y)] = edge ? T_WALL : T_FLOOR; W.mat[idx(x, y)] = im; W.inside[idx(x, y)] = 1;
            }
            // 2 to 3 doors, 2 tiles wide
            var sides = [0, 1, 2, 3].sort(function () { return rnd() - 0.5; }), nd = ri(2, 3);
            for (var s = 0; s < nd; s++) {
                var sd = sides[s];
                if (sd < 2) { var dx = ri(bx + 1, bx + bw - 3), dy = sd === 0 ? by : by + bh - 1; W.tiles[idx(dx, dy)] = T_FLOOR; W.tiles[idx(dx + 1, dy)] = T_FLOOR; }
                else { var ey = ri(by + 1, by + bh - 3), ex = sd === 2 ? bx : bx + bw - 1; W.tiles[idx(ex, ey)] = T_FLOOR; W.tiles[idx(ex, ey + 1)] = T_FLOOR; }
            }
            if (bw >= 10) {          // partition with a gap
                var mx = bx + (bw >> 1), gap = ri(by + 1, by + bh - 3);
                for (y = by + 1; y < by + bh - 1; y++) if (y !== gap && y !== gap + 1) W.tiles[idx(mx, y)] = T_WALL;
            }
            // furniture crates against inner walls
            var nc = ri(1, 3);
            for (var c = 0; c < nc; c++) {
                var fx = ri(bx + 1, bx + bw - 2), fy = rnd() < 0.5 ? by + 1 : by + bh - 2;
                if (W.tiles[idx(fx, fy)] === T_FLOOR) { W.tiles[idx(fx, fy)] = T_CRATE; W.hp[idx(fx, fy)] = 70; }
            }
            W.buildings.push({ x: bx, y: by, w: bw, h: bh });
        }

        // trees (2x2), rocks, crate clusters with barrels, bushes
        var scale = n / (50 * 36);
        for (k = 0; k < th.trees * scale; k++) {
            x = ri(2, w - 4); y = ri(2, h - 4);
            if (nearSpawn(x, y, 4) || !free(x, y) || !free(x + 1, y) || !free(x, y + 1) || !free(x + 1, y + 1)) continue;
            W.tiles[idx(x, y)] = W.tiles[idx(x + 1, y)] = W.tiles[idx(x, y + 1)] = W.tiles[idx(x + 1, y + 1)] = T_TREE;
            W.trees.push(idx(x, y));
        }
        for (k = 0; k < th.rocks * scale; k++) { x = ri(2, w - 3); y = ri(2, h - 3); if (free(x, y) && !nearSpawn(x, y, 3)) W.tiles[idx(x, y)] = T_ROCK; }
        for (k = 0; k < th.crates * scale / 2; k++) {
            x = ri(2, w - 3); y = ri(2, h - 3);
            var cl = ri(1, 4), horiz = rnd() < 0.5;
            for (var j = 0; j < cl; j++) {
                var qx = horiz ? x + j : x, qy = horiz ? y : y + j;
                if (free(qx, qy) && !nearSpawn(qx, qy, 3)) { W.tiles[idx(qx, qy)] = T_CRATE; W.hp[idx(qx, qy)] = 70; }
            }
        }
        for (k = 0; k < th.barrels * scale; k++) {
            x = ri(2, w - 3); y = ri(2, h - 3);
            if (free(x, y) && !nearSpawn(x, y, 5)) { W.tiles[idx(x, y)] = T_BARREL; W.hp[idx(x, y)] = 30; }
        }
        for (k = 0; k < th.bushes * scale; k++) {
            x = ri(2, w - 3); y = ri(2, h - 3);
            var bs = ri(2, 5);
            for (j = 0; j < bs; j++) {
                var ux = x + ri(-1, 1), uy = y + ri(-1, 1);
                if (free(ux, uy) && !nearSpawn(ux, uy, 2)) W.tiles[idx(ux, uy)] = T_BUSH;
            }
        }
        // clear the spawn area
        for (y = W.spawnY - 2; y <= W.spawnY + 2; y++) for (x = W.spawnX - 2; x <= W.spawnX + 2; x++)
            if (inb(x, y) && x > 0 && y > 0 && x < w - 1 && y < h - 1) W.tiles[idx(x, y)] = T_FLOOR;

        connect();
        W.computeDist(W.spawnX, W.spawnY);
        W.claim.fill(0);
        W.fogCanvas = document.createElement('canvas'); W.fogCanvas.width = w; W.fogCanvas.height = h;
        W.fogCtx = W.fogCanvas.getContext('2d');
        W.fogData = W.fogCtx.createImageData(w, h);
        for (i = 0; i < n; i++) { W.fogData.data[i * 4] = 8; W.fogData.data[i * 4 + 1] = 14; W.fogData.data[i * 4 + 2] = 24; W.fogData.data[i * 4 + 3] = 205; }
        W.fogDirty = true; W.visStamp = 1;
    };

    // make every passable tile reachable from the spawn: carve the shortest way through obstacles
    function connect() {
        var w = W.w, h = W.h, n = W.n, bridge = matId('p1');
        for (var guard = 0; guard < 400; guard++) {
            flood(W.spawnX, W.spawnY);
            var lost = -1;
            for (var i = 0; i < n; i++) if (!BLOCK_MOVE[W.tiles[i]] && mark[i] !== markGen) { lost = i; break; }
            if (lost < 0) return;
            // BFS from the lost tile through anything except the border until a reached tile
            var g2 = ++gen, head = 0, tail = 0;
            queue[tail++] = lost; seen[lost] = g2; par[lost] = -1;
            var found = -1;
            while (head < tail) {
                var c = queue[head++];
                if (mark[c] === markGen) { found = c; break; }
                var cx = c % w, cy = (c / w) | 0;
                for (var d = 0; d < 4; d++) {
                    var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
                    if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
                    var ni = ny * w + nx;
                    if (seen[ni] === g2) continue;
                    seen[ni] = g2; par[ni] = c; queue[tail++] = ni;
                }
            }
            if (found < 0) { W.tiles[lost] = T_WALL; continue; }    // cannot happen, but never loop forever
            for (var p = found; p >= 0; p = par[p]) {
                if (BLOCK_MOVE[W.tiles[p]]) { if (W.tiles[p] === T_WATER) W.mat[p] = bridge; if (W.tiles[p] === T_TREE) removeTree(p); W.tiles[p] = T_FLOOR; }
            }
        }
    }
    function removeTree(p) {
        for (var k = 0; k < W.trees.length; k++) {
            var a = W.trees[k];
            if (p === a || p === a + 1 || p === a + W.w || p === a + W.w + 1) {
                W.tiles[a] = W.tiles[a + 1] = W.tiles[a + W.w] = W.tiles[a + W.w + 1] = T_FLOOR;
                W.trees.splice(k, 1); return;
            }
        }
    }

    function flood(sx, sy) {
        markGen++;
        var head = 0, tail = 0, s = idx(sx, sy), w = W.w;
        queue[tail++] = s; mark[s] = markGen; W.dist[s] = 0;
        while (head < tail) {
            var c = queue[head++], cx = c % w, cy = (c / w) | 0;
            for (var d = 0; d < 4; d++) {
                var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
                if (!inb(nx, ny)) continue;
                var ni = ny * w + nx;
                if (mark[ni] === markGen || BLOCK_MOVE[W.tiles[ni]]) continue;
                mark[ni] = markGen; W.dist[ni] = W.dist[c] + 1; queue[tail++] = ni;
            }
        }
    }
    W.computeDist = function (sx, sy) { W.dist.fill(-1); flood(sx, sy); for (var i = 0; i < W.n; i++) if (mark[i] !== markGen) W.dist[i] = -1; };
    W.reachable = function (i) { return W.dist[i] >= 0; };

    /* ---------------- line of sight / ray casting ---------------- */

    // true when nothing in mask blocks the segment (the end tile itself does not count)
    W.los = function (x0, y0, x1, y1, mask) {
        var tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE), ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
        var dx = x1 - x0, dy = y1 - y0;
        var sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
        var tdx = dx !== 0 ? Math.abs(TILE / dx) : 1e9, tdy = dy !== 0 ? Math.abs(TILE / dy) : 1e9;
        var tmx = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE : tx * TILE) - x0) / dx : 1e9;
        var tmy = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE : ty * TILE) - y0) / dy : 1e9;
        for (var g = 0; g < 400; g++) {
            if (tx === ex && ty === ey) return true;
            if (tmx < tmy) { tx += sx; tmx += tdx; } else { ty += sy; tmy += tdy; }
            if (tx === ex && ty === ey) return true;
            if (!inb(tx, ty) || mask[W.tiles[ty * W.w + tx]]) return false;
        }
        return true;
    };

    // first blocking tile along a segment: returns t in 0..1 (or 2 when clear); sets hitTile and the surface normal
    W.ray = function (x0, y0, x1, y1, mask) {
        var tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE), ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
        var dx = x1 - x0, dy = y1 - y0;
        var sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
        var tdx = dx !== 0 ? Math.abs(TILE / dx) : 1e9, tdy = dy !== 0 ? Math.abs(TILE / dy) : 1e9;
        var tmx = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE : tx * TILE) - x0) / dx : 1e9;
        var tmy = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE : ty * TILE) - y0) / dy : 1e9;
        if (!inb(tx, ty) || mask[W.tiles[ty * W.w + tx]]) { W.hitTile = inb(tx, ty) ? ty * W.w + tx : -1; W.hitNx = -dx; W.hitNy = -dy; return 0; }
        for (var g = 0; g < 200; g++) {
            if (tx === ex && ty === ey) return 2;
            var t;
            if (tmx < tmy) { t = tmx; tx += sx; tmx += tdx; W.hitNx = -sx; W.hitNy = 0; }
            else { t = tmy; ty += sy; tmy += tdy; W.hitNx = 0; W.hitNy = -sy; }
            if (t > 1) return 2;
            if (!inb(tx, ty) || mask[W.tiles[ty * W.w + tx]]) { W.hitTile = inb(tx, ty) ? ty * W.w + tx : -1; return t; }
        }
        return 2;
    };

    // a body of radius r can walk straight from a to b
    W.walkLine = function (x0, y0, x1, y1, r) {
        var dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l * r, ny = dx / l * r;
        return W.los(x0, y0, x1, y1, BLOCK_MOVE) && W.los(x0 + nx, y0 + ny, x1 + nx, y1 + ny, BLOCK_MOVE) && W.los(x0 - nx, y0 - ny, x1 - nx, y1 - ny, BLOCK_MOVE)
            && !BLOCK_MOVE[tileAt(x1 + nx, y1 + ny)] && !BLOCK_MOVE[tileAt(x1 - nx, y1 - ny)];
    };

    /* ---------------- A* pathfinding (8 directions, no corner cutting) ---------------- */

    function hpush(i, f) {
        var k = heapN++;
        while (k > 0) { var p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; }
        heapI[k] = i; heapF[k] = f;
    }
    function hpop() {
        var top = heapI[0], li = heapI[--heapN], lf = heapF[heapN], k = 0;
        for (;;) {
            var c = 2 * k + 1;
            if (c >= heapN) break;
            if (c + 1 < heapN && heapF[c + 1] < heapF[c]) c++;
            if (heapF[c] >= lf) break;
            heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c;
        }
        heapI[k] = li; heapF[k] = lf;
        return top;
    }
    var DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    // fills out (Int16Array) with tile indices from the first step to the goal; returns the count (0 = no path)
    W.path = function (sx, sy, gx, gy, out, maxNodes) {
        var w = W.w, s = idx(sx, sy), goal = idx(gx, gy);
        if (!inb(gx, gy) || BLOCK_MOVE[W.tiles[goal]] || s === goal) return 0;
        var g1 = ++gen; heapN = 0;
        gS[s] = 0; seen[s] = g1; par[s] = -1; hpush(s, 0);
        var expanded = 0, limit = maxNodes || 2600;
        while (heapN > 0) {
            var c = hpop();
            if (closed[c] === g1) continue;
            closed[c] = g1;
            if (c === goal) break;
            if (++expanded > limit) return 0;
            var cx = c % w, cy = (c / w) | 0;
            for (var d = 0; d < 8; d++) {
                var nx = cx + DX[d], ny = cy + DY[d];
                if (nx < 0 || ny < 0 || nx >= w || ny >= W.h) continue;
                var ni = ny * w + nx;
                if (BLOCK_MOVE[W.tiles[ni]] || closed[ni] === g1) continue;
                if (d >= 4 && (BLOCK_MOVE[W.tiles[cy * w + nx]] || BLOCK_MOVE[W.tiles[ny * w + cx]])) continue;
                var ng = gS[c] + (d >= 4 ? 1.414 : 1) + (W.tiles[ni] === T_BUSH ? 0.3 : 0);
                if (seen[ni] === g1 && ng >= gS[ni]) continue;
                seen[ni] = g1; gS[ni] = ng; par[ni] = c;
                var hx = Math.abs(nx - gx), hy = Math.abs(ny - gy);
                hpush(ni, ng + (hx > hy ? hx + 0.414 * hy : hy + 0.414 * hx));
                if (heapN >= heapI.length - 8) return 0;
            }
        }
        if (closed[goal] !== g1) return 0;
        var len = 0;
        for (var p = goal; p !== s && p >= 0; p = par[p]) tmpPath[len++] = p;
        var cnt = Math.min(len, out.length);
        for (var k = 0; k < cnt; k++) out[k] = tmpPath[len - 1 - k];
        return cnt;
    };

    /* ---------------- cover ---------------- */

    function hasAdjBlock(tx, ty) {
        for (var d = 0; d < 4; d++) {
            var nx = tx + DX[d], ny = ty + DY[d];
            if (inb(nx, ny) && BLOCK_SHOT[W.tiles[ny * W.w + nx]]) return true;
        }
        return false;
    }
    // a tile near (ax, ay) that the threat at (tx, ty) cannot shoot, close to the preferred distance; -1 if none
    W.findCover = function (ax, ay, tx, ty, R, pref, selfId) {
        var atx = Math.floor(ax / TILE), aty = Math.floor(ay / TILE), best = -1, bestS = 1e9;
        for (var y = aty - R; y <= aty + R; y++) for (var x = atx - R; x <= atx + R; x++) {
            if (!inb(x, y)) continue;
            var i = y * W.w + x;
            if (BLOCK_MOVE[W.tiles[i]] || W.dist[i] < 0) continue;
            if (W.claim[i] && W.claim[i] !== selfId) continue;
            if (!hasAdjBlock(x, y)) continue;
            var cx = x * TILE + 16, cy = y * TILE + 16;
            var dT = Math.sqrt((cx - tx) * (cx - tx) + (cy - ty) * (cy - ty));
            if (dT < 90) continue;
            if (W.los(tx, ty, cx, cy, BLOCK_SHOT)) continue;
            var dA = Math.sqrt((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay));
            var sc = dA + Math.abs(dT - pref) * 0.35 + (W.tiles[i] === T_BUSH ? -24 : 0);
            if (sc < bestS) { bestS = sc; best = i; }
        }
        return best;
    };
    // a tile next to the cover tile from which the threat can be shot
    W.findPeek = function (ci, tx, ty) {
        var cx0 = ci % W.w, cy0 = (ci / W.w) | 0, best = -1, bestD = 1e9;
        for (var y = cy0 - 2; y <= cy0 + 2; y++) for (var x = cx0 - 2; x <= cx0 + 2; x++) {
            if (!inb(x, y)) continue;
            var i = y * W.w + x;
            if (BLOCK_MOVE[W.tiles[i]] || W.dist[i] < 0) continue;
            var px = x * TILE + 16, py = y * TILE + 16;
            if (!W.los(px, py, tx, ty, BLOCK_SHOT)) continue;
            var d = Math.abs(x - cx0) + Math.abs(y - cy0);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    };
    // a random reachable floor tile within radius R of (tx, ty) tiles
    W.randomNear = function (tx, ty, R, minR) {
        for (var k = 0; k < 40; k++) {
            var x = tx + ri(-R, R), y = ty + ri(-R, R);
            if (!inb(x, y)) continue;
            if (minR && Math.abs(x - tx) < minR && Math.abs(y - ty) < minR) continue;
            var i = y * W.w + x;
            if (!BLOCK_MOVE[W.tiles[i]] && W.dist[i] >= 0) return i;
        }
        return -1;
    };

    /* ---------------- field of view (fog of war) ---------------- */

    W.computeVis = function (px, py, R, smokeTest) {
        var st = ++W.visStamp, ptx = Math.floor(px / TILE), pty = Math.floor(py / TILE), w = W.w, d = W.fogData.data;
        var x0 = Math.max(0, ptx - R), x1 = Math.min(w - 1, ptx + R), y0 = Math.max(0, pty - R), y1 = Math.min(W.h - 1, pty + R), R2 = R * R;
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
            var ddx = x - ptx, ddy = y - pty;
            if (ddx * ddx + ddy * ddy > R2) continue;
            var cx = x * TILE + 16, cy = y * TILE + 16;
            if (W.los(px, py, cx, cy, BLOCK_SIGHT) && !(smokeTest && smokeTest(px, py, cx, cy))) {
                var i = y * w + x;
                W.vis[i] = st; W.explored[i] = 1;
            }
        }
        // fog alpha per tile: visible 0, explored dim, unknown dark
        var a0 = Math.max(0, ptx - R - 2), a1 = Math.min(w - 1, ptx + R + 2), b0 = Math.max(0, pty - R - 2), b1 = Math.min(W.h - 1, pty + R + 2);
        for (y = b0; y <= b1; y++) for (x = a0; x <= a1; x++) {
            var j = y * w + x;
            d[j * 4 + 3] = W.vis[j] === st ? 0 : (W.explored[j] ? 120 : 205);
        }
        W.fogDirty = true;
    };
    W.visible = function (x, y) { var tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return inb(tx, ty) && W.vis[ty * W.w + tx] === W.visStamp; };
    W.flushFog = function () { if (W.fogDirty) { W.fogCtx.putImageData(W.fogData, 0, 0); W.fogDirty = false; } };
    W.revealAll = function () { for (var i = 0; i < W.n; i++) { W.explored[i] = 1; W.fogData.data[i * 4 + 3] = 0; } W.fogDirty = true; };

    return W;
})();
