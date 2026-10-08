/* Simulation: actors, weapons, ballistics, grenades, explosions, physics, AI, story and battle royale rules.
 * Everything lives in fixed pools created once: nothing is allocated inside the 60 Hz update. */
var Game = (function () {
    'use strict';
    var PI = Math.PI, TAU = PI * 2;
    var G = {
        mode: 'attract', state: 'idle', frame: 0, actors: [], bullets: [], parts: [], nades: [], pickups: [], corpses: [], smokes: [], fires: [],
        player: null, players: [null, null], coop: false, maxTokens: 3, stageDmg: 1, stageReact: 0, stageHp: 1, camX: 0, camY: 0, zoom: 1, zoomT: 1, shake: 0, slowmo: 0, diff: DIFFS.veteran, diffName: 'veteran',
        stage: null, op: 0, st: 0, boss: null, bossWave: 0, enemiesLeft: 0, kills: 0, shots: 0, hits: 0, time: 0, endT: 0,
        zone: null, alive: 0, place: 0, total: 0, followId: 0, pathBudget: 0, combatT: 0, hintT: 0, flashT: 0, lowFx: false,
        revealLast: false, pingT: 0, events: { hurtAng: 0, hurtT: 0 }, result: null, lastSpot: -999
    };
    var MAX_ACTORS = 48, MAX_BULLETS = 320, MAX_PARTS = 700, MAX_NADES = 24, MAX_PICKUPS = 140, MAX_CORPSES = 40;

    // particle kinds
    var P_SPARK = 1, P_SMOKE = 2, P_BLOOD = 3, P_MUZZLE = 4, P_SHELL = 5, P_DEBRIS = 6, P_EXPL = 7, P_GLOW = 8, P_FIRE = 9, P_PUFF = 10, P_DUST = 11, P_RING = 12;
    G.P = { SPARK: P_SPARK, SMOKE: P_SMOKE, BLOOD: P_BLOOD, MUZZLE: P_MUZZLE, SHELL: P_SHELL, DEBRIS: P_DEBRIS, EXPL: P_EXPL, GLOW: P_GLOW, FIRE: P_FIRE, PUFF: P_PUFF, DUST: P_DUST, RING: P_RING };

    function makeActor(i) {
        return { id: i + 1, on: false, team: 0, isPlayer: false, def: null, boss: false, sprite: 'manBlue', scale: 1, tint: null, name: '',
            x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, r: 11, angle: 0, hp: 100, maxHp: 100, armor: 0, speed: 2,
            w: [null, null, null, null], mag: [0, 0, 0, 0], res: [0, 0, 0, 0], cur: 0, fireCd: 0, reloadT: 0, burstLeft: 0, burstT: 0, recoil: 0,
            nades: [0, 0, 0, 0], medkits: 0, still: 0, revealT: 0, hitFlash: 0, muzzleT: 0, step: 0, nadeAnim: 0, healT: 0,
            // AI
            ai: false, state: 'patrol', stateT: 0, aware: 0, alerted: false, target: null, lkX: 0, lkY: 0, lastSeen: -9999, seeT: false,
            reactT: 0, burstWant: 0, burstPause: 0, path: new Int16Array(72), pathLen: 0, pathIdx: 0, goal: -1, repathT: 0,
            cover: -1, peek: -1, homeX: 0, homeY: 0, guard: false, suppress: 0, blindT: 0, burnT: 0, nadeCd: 0, laserT: 0, icon: 0, iconT: 0,
            stuckT: 0, lastX: 0, lastY: 0, retreated: false, invX: 0, invY: 0, lookT: 0, strafe: 1, seenByP: false, launchT: 0, smokeUsed: 0,
            kills: 0, killer: null, pickT: 0, tokenF: -999, braceT: 0, slot: 0, reserved: false, respawnT: 0, idleT: 0, latch: true, tA: null, tB: -1, tX: 0, tY: 0, roamT: 0, wantSlot: 0, lastHurtBy: null, phase: 0 };
    }
    var i;
    for (i = 0; i < MAX_ACTORS; i++) G.actors.push(makeActor(i));
    for (i = 0; i < MAX_BULLETS; i++) G.bullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, sx: 0, sy: 0, dmg: 0, team: 0, owner: null, life: 0, dist: 0, range: 0, pen: 0, knock: 0, ignore: null, sniper: false, enemy: false, bounced: false });
    for (i = 0; i < MAX_PARTS; i++) G.parts.push({ on: false, k: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 0, rot: 0, vr: 0, a: 1, drag: 1, v: 0 });
    for (i = 0; i < MAX_NADES; i++) G.nades.push({ on: false, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, team: 0, owner: null, rot: 0 });
    for (i = 0; i < MAX_PICKUPS; i++) G.pickups.push({ on: false, kind: '', wid: '', n: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0 });
    for (i = 0; i < MAX_CORPSES; i++) G.corpses.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, ang: 0, va: 0, sprite: '', scale: 1, t: 0, tint: null, pool: 0 });
    for (i = 0; i < 12; i++) { G.smokes.push({ on: false, x: 0, y: 0, r: 0, t: 0, max: 1 }); G.fires.push({ on: false, x: 0, y: 0, r: 0, t: 0, owner: null, team: 0 }); }

    function rnd() { return Math.random(); }
    function rr(a, b) { return a + Math.random() * (b - a); }
    function angDiff(a, b) { var d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; }
    function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
    G.angDiff = angDiff;
    function hostile(a, b) { return a.team !== b.team; }
    function wpn(a) { return WEAPONS[a.w[a.cur]]; }
    G.wpn = wpn;

    /* ---------------- pools ---------------- */

    function part(k, x, y, vx, vy, life, size, grow, a) {
        if (G.lowFx && (k === P_SMOKE || k === P_DUST || k === P_SHELL) && rnd() < 0.5) return null;
        for (var j = 0; j < MAX_PARTS; j++) {
            var p = G.parts[j];
            if (p.on) continue;
            p.on = true; p.k = k; p.x = x; p.y = y; p.z = 0; p.vx = vx; p.vy = vy; p.vz = 0; p.life = life; p.max = life;
            p.size = size; p.grow = grow || 0; p.rot = rnd() * TAU; p.vr = 0; p.a = a === undefined ? 1 : a; p.drag = 0.94; p.v = 0;
            return p;
        }
        return null;
    }
    G.part = part;

    function spawnPickup(kind, wid, n, x, y, vx, vy) {
        for (var j = 0; j < MAX_PICKUPS; j++) {
            var p = G.pickups[j];
            if (p.on) continue;
            p.on = true; p.kind = kind; p.wid = wid; p.n = n; p.x = x; p.y = y; p.vx = vx || 0; p.vy = vy || 0; p.t = 0;
            return p;
        }
        return DUMMY;
    }
    var DUMMY = { on: false, t: 0 };

    function freeActor() { for (var j = 0; j < MAX_ACTORS; j++) if (!G.actors[j].on && !G.actors[j].reserved) return G.actors[j]; return null; }

    function resetPools() {
        var j;
        for (j = 0; j < MAX_ACTORS; j++) { G.actors[j].on = false; G.actors[j].reserved = false; }
        for (j = 0; j < MAX_BULLETS; j++) G.bullets[j].on = false;
        for (j = 0; j < MAX_PARTS; j++) G.parts[j].on = false;
        for (j = 0; j < MAX_NADES; j++) G.nades[j].on = false;
        for (j = 0; j < MAX_PICKUPS; j++) G.pickups[j].on = false;
        for (j = 0; j < MAX_CORPSES; j++) G.corpses[j].on = false;
        for (j = 0; j < 12; j++) { G.smokes[j].on = false; G.fires[j].on = false; }
        G.player = null; G.players[0] = G.players[1] = null; G.boss = null; G.zone = null; G.kills = 0; G.shots = 0; G.hits = 0; G.time = 0; G.endT = 0; G.result = null;
        G.bossWave = 0; G.shake = 0; G.slowmo = 0; G.combatT = 0; G.revealLast = false; G.pingT = 0; G.flashT = 0; G.events.hurtT = 0;
    }

    /* ---------------- actors ---------------- */

    function spawnActor(x, y, team, def, opts) {
        var a = freeActor();
        if (!a) return null;
        a.on = true; a.team = team; a.isPlayer = !!opts.player; a.def = def; a.boss = !!opts.boss;
        a.sprite = def.sprite || 'survivor1'; a.scale = def.scale || 1; a.tint = def.tint || null; a.name = def.name || '';
        a.x = x; a.y = y; a.vx = a.vy = a.dvx = a.dvy = 0; a.r = 11 * a.scale; a.angle = opts.angle || rnd() * TAU;
        var hpMul = a.isPlayer ? 1 : (opts.hpMul || 1);
        a.hp = a.maxHp = Math.round((def.hp || 100) * hpMul); a.armor = opts.armor || 0; a.speed = def.speed || 2.3;
        for (var s = 0; s < 4; s++) { a.w[s] = null; a.mag[s] = 0; a.res[s] = 0; a.nades[s] = 0; }
        a.cur = 0; a.fireCd = 0; a.reloadT = 0; a.burstLeft = 0; a.recoil = 0; a.medkits = 0; a.still = 0; a.revealT = 0; a.hitFlash = 0;
        a.muzzleT = 0; a.nadeAnim = 0; a.healT = 0; a.kills = 0; a.killer = null; a.lastHurtBy = null; a.phase = 0;
        a.ai = !a.isPlayer; a.state = 'patrol'; a.stateT = 0; a.aware = 0; a.alerted = false; a.target = null; a.lastSeen = -9999; a.seeT = false;
        a.reactT = 0; a.burstWant = 0; a.burstPause = 0; a.pathLen = 0; a.pathIdx = 0; a.goal = -1; a.repathT = 0; a.cover = -1; a.peek = -1;
        a.homeX = x; a.homeY = y; a.guard = !!opts.guard; a.suppress = 0; a.blindT = 0; a.burnT = 0; a.nadeCd = 120; a.laserT = 0; a.icon = 0; a.iconT = 0;
        a.stuckT = 0; a.lastX = x; a.lastY = y; a.retreated = false; a.lookT = 0; a.strafe = rnd() < 0.5 ? 1 : -1; a.seenByP = false; a.launchT = 90; a.smokeUsed = 0;
        a.pickT = 0; a.roamT = 0; a.tokenF = -999; a.braceT = 0; a.slot = opts.slot || 0; a.reserved = a.isPlayer; a.respawnT = 0; a.idleT = 0;
        a.latch = true; a.tA = null; a.tB = -1;
        a.reactBase = Math.max(10, (def.react || 36) + (team === 1 ? G.diff.react + G.stageReact : 0));
        a.accMul = (def.acc || 1.2) * (team === 1 ? G.diff.acc : 1);
        if (def.wpn) giveWeapon(a, def.wpn, true);
        return a;
    }
    G.spawnActor = spawnActor;

    function giveWeapon(a, wid, select) {
        var wd = WEAPONS[wid], s = CATS.indexOf(wd.cat);
        a.w[s] = wid; a.mag[s] = wd.mag; a.res[s] = a.isPlayer ? wd.reserve : 999;
        if (G.mode !== 'story' && a.isPlayer && wd.cat !== 'pistol') a.res[s] = Math.round(wd.reserve * 0.5);
        if (select) a.cur = s;
        return s;
    }

    function nextSlot(a, dir) {
        for (var k = 1; k <= 4; k++) {
            var s = (a.cur + dir * k + 8) % 4;
            if (a.w[s]) return s;
        }
        return a.cur;
    }
    function selectSlot(a, s) {
        if (!a.w[s] || s === a.cur) return;
        a.cur = s; a.reloadT = 0; a.burstLeft = 0; a.fireCd = Math.max(a.fireCd, 18); a.recoil = 0;
        if (a.isPlayer) { SFX.play('uiSwitch', 0.6); UI.hud.dirty = true; }
        if (a.mag[s] === 0) startReload(a);
    }
    G.selectSlot = function (s, p) { p = p || G.player; if (p && p.on) selectSlot(p, s); };
    G.cycleWeapon = function (p) { p = p || G.player; if (p && p.on) selectSlot(p, nextSlot(p, 1)); };

    function startReload(a) {
        var wd = wpn(a);
        if (!wd || a.reloadT > 0 || a.mag[a.cur] >= wd.mag) return;
        if (a.res[a.cur] <= 0) { if (a.isPlayer && a.fireCd <= 0) { SFX.play('empty', 0.5); a.fireCd = 20; autoSwitchEmpty(a); } return; }
        a.reloadT = wd.shells ? wd.reload : wd.reload;
        if (a.isPlayer || a.seenByP) SFX.play(wd.shells ? 'shell' : 'magOut', a.isPlayer ? 0.55 : 0.35, 1, a.x, a.y);
        if (a.isPlayer) UI.hud.dirty = true;
    }
    function autoSwitchEmpty(a) {
        for (var k = 1; k <= 4; k++) { var s = (a.cur + k) % 4; if (a.w[s] && (a.mag[s] > 0 || a.res[s] > 0)) { selectSlot(a, s); return; } }
    }
    function finishReload(a) {
        var wd = wpn(a), s = a.cur;
        if (wd.shells) {                         // shell by shell, keeps going until full
            if (a.res[s] > 0 && a.mag[s] < wd.mag) {
                a.mag[s]++; if (a.res[s] < 999) a.res[s]--;
                if (a.isPlayer || a.seenByP) SFX.play('shell', a.isPlayer ? 0.45 : 0.3, rr(0.95, 1.1), a.x, a.y);
                if (a.mag[s] < wd.mag && a.res[s] > 0) { a.reloadT = wd.reload; return; }
            }
            if (a.isPlayer || a.seenByP) SFX.play('pump', a.isPlayer ? 0.55 : 0.3, 1, a.x, a.y);
        } else {
            var need = wd.mag - a.mag[s], take = a.res[s] >= 999 ? need : Math.min(need, a.res[s]);
            a.mag[s] += take; if (a.res[s] < 999) a.res[s] -= take;
            if (a.isPlayer || a.seenByP) SFX.play(wd.bolt ? 'bolt' : 'magIn', a.isPlayer ? 0.6 : 0.35, 1, a.x, a.y);
        }
        a.reloadT = 0;
        if (a.isPlayer) UI.hud.dirty = true;
    }

    /* ---------------- firing and ballistics ---------------- */

    function fire(a) {
        var wd = wpn(a), s = a.cur;
        if (!wd || a.fireCd > 0) return false;
        if (a.reloadT > 0) { if (wd.shells && a.mag[s] > 0) a.reloadT = 0; else return false; }
        if (a.mag[s] <= 0) { startReload(a); return false; }
        a.mag[s]--; a.fireCd = wd.rate;
        if (wd.burst && a.burstLeft <= 0) { a.burstLeft = wd.burst - 1; a.burstT = wd.burstGap; }
        shoot(a, wd);
        if (a.mag[s] === 0) startReload(a);
        if (a.isPlayer) UI.hud.dirty = true;
        return true;
    }

    function shoot(a, wd) {
        var moving = Math.abs(a.vx) + Math.abs(a.vy) > 0.5;
        var spread = a.isPlayer ? wd.spread * (moving ? 1.25 : 0.7) + a.recoil * 0.5 : wd.spread * (moving ? 1.7 : 0.85) + a.recoil;
        if (wd.scope) spread = moving ? wd.spread * (a.isPlayer ? 9 : 14) : (a.still > 30 ? wd.spread * 0.6 : wd.spread * 3);
        if (a.ai) {
            spread = spread * a.accMul + a.suppress * 0.08 + (a.blindT > 0 ? 0.5 : 0);
            var tg = a.target;
            if (tg && Math.abs(tg.vx) + Math.abs(tg.vy) > 1.2) spread += 0.035;     // a moving target is harder to hit
        }
        var ca = Math.cos(a.angle), sa = Math.sin(a.angle), sc = a.scale;
        var mx = a.x + ca * 16 * sc - sa * 5 * sc, my = a.y + sa * 16 * sc + ca * 5 * sc;
        // never start a bullet inside a wall
        var t = World.ray(a.x, a.y, mx, my, BLOCK_SHOT);
        var bx = t <= 1 ? a.x + (mx - a.x) * t * 0.9 : mx, by = t <= 1 ? a.y + (my - a.y) * t * 0.9 : my;
        var n = wd.pellets || 1;
        for (var k = 0; k < n; k++) {
            var ang = a.angle + (rnd() + rnd() - 1) * spread;
            var sp = wd.speed * rr(0.94, 1.04);
            for (var j = 0; j < MAX_BULLETS; j++) {
                var b = G.bullets[j];
                if (b.on) continue;
                b.on = true; b.x = b.sx = bx; b.y = b.sy = by; b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
                b.dmg = wd.dmg * (a.ai && a.team === 1 ? 0.62 * G.stageDmg : 1); b.team = a.team; b.owner = a; b.dist = 0; b.range = wd.range; b.life = 0;
                b.pen = wd.pen || 0; b.knock = wd.knock; b.ignore = null; b.sniper = wd.cat === 'sniper'; b.enemy = a.team === 1; b.bounced = false;
                break;
            }
        }
        a.recoil = Math.min(wd.recoilMax, a.recoil + wd.recoil);
        a.muzzleT = 4; a.revealT = 150; a.still = Math.min(a.still, 12);
        // flash, light, ejected casing
        var mp = part(P_MUZZLE, mx, my, a.vx, a.vy, 4, (wd.pellets ? 1.25 : wd.cat === 'sniper' ? 1.4 : 1) * sc, 0, 1);
        if (mp) mp.rot = a.angle;
        part(P_GLOW, mx, my, 0, 0, 5, wd.cat === 'pistol' ? 2.2 : 3, 0, 0.55);
        if (!wd.shells || wd.pellets) {
            var sh = part(P_SHELL, a.x + ca * 4, a.y + sa * 4, -sa * rr(1.2, 2.2) + a.vx, ca * rr(1.2, 2.2) + a.vy, 90, 1, 0, 1);
            if (sh) { sh.vz = rr(1.5, 2.5); sh.vr = rr(-0.5, 0.5); sh.drag = 0.9; }
        }
        part(P_SMOKE, mx + ca * 6, my + sa * 6, ca * 0.4, sa * 0.4, 40, 0.25, 0.012, 0.25);
        var vol = (wd.vol || 1) * (a.isPlayer ? 0.75 : 0.6);
        if (wd.lp) SFX.playLow(wd.snd, vol, wd.pitch * rr(0.97, 1.03), wd.lp, a.x, a.y);
        else SFX.play(wd.snd, vol, wd.pitch * rr(0.96, 1.04), a.x, a.y);
        if (a.isPlayer) { G.shots += wd.pellets ? 1 : 1; addShake(wd.cat === 'sniper' ? 5 : wd.pellets ? 4 : wd.cat === 'pistol' ? 1.2 : 1.6); }
        noise(a.x, a.y, wd.noise, a);
    }

    function segCircle(b, ax, ay, r) {         // first t in 0..1 where the bullet segment enters the circle, or 2
        var fx = b.x - ax, fy = b.y - ay, A = b.vx * b.vx + b.vy * b.vy, B = 2 * (fx * b.vx + fy * b.vy), C = fx * fx + fy * fy - r * r;
        if (C < 0) return 0;
        var disc = B * B - 4 * A * C;
        if (disc < 0) return 2;
        var t = (-B - Math.sqrt(disc)) / (2 * A);
        return t >= 0 && t <= 1 ? t : 2;
    }

    function updateBullets() {
        for (var j = 0; j < MAX_BULLETS; j++) {
            var b = G.bullets[j];
            if (!b.on) continue;
            b.life++;
            var nx = b.x + b.vx, ny = b.y + b.vy;
            var tw = World.ray(b.x, b.y, nx, ny, BLOCK_SHOT), wallTile = World.hitTile, wnx = World.hitNx, wny = World.hitNy;
            var best = tw <= 1 ? tw : 1, hit = null;
            for (var k = 0; k < MAX_ACTORS; k++) {
                var a = G.actors[k];
                if (!a.on || a.team === b.team || a === b.ignore) continue;
                if (Math.abs(a.x - b.x) > 60 + a.r && Math.abs(a.x - nx) > 60 + a.r) continue;
                var t = segCircle(b, a.x, a.y, a.r);
                if (t < best) { best = t; hit = a; }
                // near miss: suppression and the AI learns where the shots come from
                if (a.ai && !hit) {
                    var mx = (b.x + nx) * 0.5 - a.x, my = (b.y + ny) * 0.5 - a.y;
                    if (mx * mx + my * my < 1600 && b.owner && b.owner.on) {
                        a.suppress = Math.min(1, a.suppress + 0.12);
                        if (!a.alerted || !a.seeT) { a.lkX = b.owner.x; a.lkY = b.owner.y; alertTo(a, b.owner, false); }
                    }
                }
            }
            var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (hit) {
                var hx = b.x + b.vx * best, hy = b.y + b.vy * best;
                var falloff = b.dist > b.range ? Math.max(0.35, 1 - (b.dist - b.range) / b.range) : 1;
                hurt(hit, b.dmg * falloff, b.owner, b.vx / spd, b.vy / spd, b.knock, false);
                if (b.owner && b.owner.isPlayer) G.hits++;
                if (b.pen > 0) { b.pen--; b.ignore = hit; b.dmg *= 0.65; b.x = hx; b.y = hy; continue; }
                b.on = false; continue;
            }
            if (tw <= 1) {
                var ix = b.x + b.vx * tw, iy = b.y + b.vy * tw, tt = wallTile >= 0 ? World.tiles[wallTile] : T_WALL;
                if (tt === T_CRATE || tt === T_BARREL) {
                    damageTile(wallTile, b.dmg * (b.sniper ? 2 : 1), ix, iy, b.owner);
                    if (b.pen > 0 && tt === T_CRATE) { b.pen--; b.dmg *= 0.6; b.x = ix + b.vx * 0.05; b.y = iy + b.vy * 0.05; b.ignore = null; continue; }
                } else {
                    impactSparks(ix, iy, wnx, wny, tt);
                    // shallow hits ricochet (not pellets)
                    var dot = (b.vx * wnx + b.vy * wny) / spd;
                    if (!b.bounced && dot > -0.35 && rnd() < 0.55) {
                        if (wnx !== 0) b.vx = -b.vx; else b.vy = -b.vy;
                        b.vx *= 0.7; b.vy *= 0.7; b.dmg *= 0.45; b.bounced = true; b.x = ix + wnx * 0.5; b.y = iy + wny * 0.5; b.ignore = null;
                        if (rnd() < 0.5) SFX.play('hitWall' + ((rnd() * 3) | 0), 0.35, rr(1.3, 1.7), ix, iy);
                        continue;
                    }
                }
                b.on = false; continue;
            }
            b.x = nx; b.y = ny; b.dist += spd;
            if (b.dist > b.range * 1.8 || b.life > 160) b.on = false;
        }
    }

    function impactSparks(x, y, nx, ny, tt) {
        var n = G.lowFx ? 2 : 4;
        for (var k = 0; k < n; k++) part(P_SPARK, x, y, nx * rr(0.5, 2.5) + rr(-1.2, 1.2), ny * rr(0.5, 2.5) + rr(-1.2, 1.2), rr(8, 16), rr(0.2, 0.35), 0, 1);
        part(P_DUST, x, y, nx * 0.6, ny * 0.6, 30, 0.22, 0.01, 0.5);
        Render.decal('hole', x - nx * 1.5, y - ny * 1.5, 0, 1, 0.8);
        if (rnd() < 0.6) SFX.play(tt === T_TREE ? 'hitWood' + ((rnd() * 2) | 0) : 'hitWall' + ((rnd() * 3) | 0), 0.3, rr(0.9, 1.2), x, y);
    }

    function damageTile(ti, dmg, x, y, src) {
        var tt = World.tiles[ti];
        var h = World.hp[ti] - dmg;
        part(P_DEBRIS, x, y, rr(-1.5, 1.5), rr(-1.5, 1.5), rr(30, 50), rr(0.25, 0.4), 0, 1);
        if (tt === T_CRATE) SFX.play('hitWood' + ((rnd() * 2) | 0), 0.4, rr(0.9, 1.1), x, y);
        else SFX.play('hitWall' + ((rnd() * 3) | 0), 0.3, 0.7, x, y);
        if (h > 0) { World.hp[ti] = h; return; }
        World.hp[ti] = 0;
        var cx = (ti % World.w) * TILE + 16, cy = ((ti / World.w) | 0) * TILE + 16;
        World.tiles[ti] = T_FLOOR;
        // newly opened tile becomes reachable
        var w = World.w;
        if (World.dist[ti] < 0) World.dist[ti] = Math.max(World.dist[ti - 1], World.dist[ti + 1], World.dist[ti - w], World.dist[ti + w], -1) + 1;
        Render.repaintTile(ti);
        if (tt === T_BARREL) { explode(cx, cy, 0, src, 1.0, true); return; }
        SFX.play('woodBreak', 0.6, rr(0.9, 1.1), cx, cy);
        for (var k = 0; k < (G.lowFx ? 4 : 9); k++) {
            var p = part(P_DEBRIS, cx + rr(-8, 8), cy + rr(-8, 8), rr(-3, 3), rr(-3, 3), rr(40, 80), rr(0.35, 0.6), 0, 1);
            if (p) { p.vr = rr(-0.3, 0.3); p.drag = 0.9; }
        }
        Render.decal('planks', cx, cy, rnd() * TAU, 1, 0.9);
    }

    /* ---------------- damage and death ---------------- */

    function hurt(a, dmg, src, dx, dy, knock, explosive) {
        if (!a.on || a.hp <= 0) return;
        var m = 1;
        if (a.ai && src && src.isPlayer && !a.alerted && a.aware < 1) { m = 2; if (src.isPlayer) UI.toastSmall('x2'); }
        if (a.def.armor) m *= a.def.armor;
        if (a.def.frontArmor && !explosive) {
            var facing = Math.cos(a.angle) * -dx + Math.sin(a.angle) * -dy;
            if (facing > 0.6) { m *= a.def.frontArmor; if (rnd() < 0.5) SFX.play('armor', 0.5, rr(0.9, 1.2), a.x, a.y); part(P_SPARK, a.x - dx * a.r, a.y - dy * a.r, -dx * 2, -dy * 2, 10, 0.4, 0, 1); }
            else m *= 1.25;
        }
        if (a.isPlayer) {
            m *= G.mode === 'story' ? G.diff.dmgIn : 0.75;
            var d = dmg * m;
            if (a.armor > 0) { var ab = Math.min(a.armor, d * 0.6); a.armor -= ab; d -= ab; SFX.play('armor', 0.4, 1.3); }
            a.hp -= d;
            G.events.hurtAng = Math.atan2(-dy, -dx); G.events.hurtT = 50;
            addShake(Math.min(8, d * 0.25));
            UI.hud.dirty = true;
        } else a.hp -= dmg * m;
        a.vx += dx * knock * 0.45; a.vy += dy * knock * 0.45;
        a.hitFlash = 6;
        if (src) a.lastHurtBy = src;
        // blood: spray in the bullet direction, drops on the floor
        var n = G.lowFx ? 2 : 5;
        for (var k = 0; k < n; k++) {
            var p = part(P_BLOOD, a.x + dx * a.r * 0.5, a.y + dy * a.r * 0.5, dx * rr(1, 4) + rr(-1, 1), dy * rr(1, 4) + rr(-1, 1), rr(14, 26), rr(0.1, 0.22), 0, 1);
            if (p) p.drag = 0.86;
        }
        if (rnd() < 0.6) Render.decal('blood', a.x + dx * rr(10, 28), a.y + dy * rr(10, 28), rnd() * TAU, rr(0.25, 0.45), 0.85);
        SFX.play('hitFlesh' + ((rnd() * 3) | 0), a.isPlayer ? 0.7 : 0.45, rr(0.9, 1.1), a.x, a.y);
        if (a.ai && src && src.on) {
            a.lkX = src.x; a.lkY = src.y;
            if (!a.alerted) alertTo(a, src, true);
            else if (!a.seeT) { a.target = src; }
            a.suppress = Math.min(1, a.suppress + 0.3);
        }
        if (a.hp <= 0) die(a, src, dx, dy, knock);
        else if (a.boss) bossCheck(a);
    }
    G.hurt = hurt;

    function die(a, src, dx, dy, knock) {
        a.hp = 0; a.on = false;
        if (a.cover >= 0 && World.claim[a.cover] === a.id) World.claim[a.cover] = 0;
        // the body keeps the momentum of the hit and slides, spinning, then rests in a pool of blood
        for (var j = 0; j < MAX_CORPSES; j++) {
            var c = G.corpses[j];
            if (c.on) continue;
            c.on = true; c.x = a.x; c.y = a.y; c.vx = a.vx * 0.5 + dx * (1.2 + knock * 0.7); c.vy = a.vy * 0.5 + dy * (1.2 + knock * 0.7);
            c.ang = a.angle; c.va = rr(-0.12, 0.12) * (0.5 + knock * 0.3); c.sprite = a.sprite; c.scale = a.scale; c.t = 0; c.tint = a.tint; c.pool = 0;
            break;
        }
        for (var k = 0; k < (G.lowFx ? 5 : 12); k++) {
            var p = part(P_BLOOD, a.x, a.y, dx * rr(1, 5) + rr(-1.5, 1.5), dy * rr(1, 5) + rr(-1.5, 1.5), rr(16, 30), rr(0.12, 0.3), 0, 1);
            if (p) p.drag = 0.85;
        }
        SFX.play('body', 0.6, rr(0.85, 1.05), a.x, a.y);
        if (src && src.on !== undefined) { src.kills++; }
        a.killer = src;
        if (a.isPlayer) {
            var mate = G.players[1 - a.slot];
            if (G.coop && mate && mate.on) { a.respawnT = 20 * 60; UI.toast((a.slot ? 'P2' : 'P1') + ' ' + T('down'), '#ff6b5a', T('backIn') + ' 20 s'); UI.hud.dirty = true; return; }
            playerDied(src); return;
        }
        if (src && src.isPlayer) { G.kills++; UI.killMark(); if (G.mode !== 'attract') UI.addCredits(CR_KILL); }
        if (G.mode === 'br' || G.mode === 'attract') { brDrop(a); brDeath(a, src); return; }
        // story drops
        var r = rnd();
        if (a.def.armor && a.def.armor < 0.8) spawnPickup('armor', '', 50, a.x, a.y, dx * 2, dy * 2);
        else if (r < 0.4) spawnPickup('ammo', '', 1, a.x, a.y, dx * 2 + rr(-1, 1), dy * 2 + rr(-1, 1));
        else if (r < 0.58) spawnPickup('med', '', 1, a.x, a.y, dx * 2, dy * 2);
        else if (r < 0.66) spawnPickup('nade', '', (rnd() * 4) | 0, a.x, a.y, dx * 2, dy * 2);
        if (a.boss) {
            G.boss = null; G.slowmo = 90; UI.toast(T('bossDown'), '#ffd34d'); MyPC.announce(T('bossDown'));
            spawnPickup('med', '', 1, a.x + 10, a.y, 1, 0); spawnPickup('armor', '', 50, a.x - 10, a.y, -1, 0);
        }
        countEnemies();
        if (G.enemiesLeft === 0 && G.state === 'play') { G.slowmo = 80; G.endT = 150; UI.toast(T('areaSecure'), '#5cf2a0'); }
        else if (G.enemiesLeft <= 3 && !G.revealLast) { G.revealLast = true; G.pingT = 1; UI.toast(T('lastHostiles'), '#ffb648'); }
    }

    function countEnemies() {
        var n = 0;
        for (var k = 0; k < MAX_ACTORS; k++) { var a = G.actors[k]; if (a.on && a.team === 1) n++; }
        G.enemiesLeft = n; UI.hud.dirty = true;
    }

    function playerDied(src) {
        G.state = 'dead'; G.endT = 140; G.slowmo = 60;
        SFX.setMix('calm');
        if (G.mode === 'br') { G.place = G.alive; }
    }

    /* ---------------- grenades and explosions ---------------- */

    function throwNade(a, type, tx, ty) {
        var d = dist(a.x, a.y, tx, ty), maxD = 330;
        if (d > maxD) { tx = a.x + (tx - a.x) / d * maxD; ty = a.y + (ty - a.y) / d * maxD; d = maxD; }
        for (var j = 0; j < MAX_NADES; j++) {
            var n = G.nades[j];
            if (n.on) continue;
            var T = 38, ang = Math.atan2(ty - a.y, tx - a.x);
            n.on = true; n.t = type; n.x = a.x + Math.cos(ang) * 12; n.y = a.y + Math.sin(ang) * 12; n.z = 8;
            n.vx = Math.cos(ang) * d * 0.88 / T; n.vy = Math.sin(ang) * d * 0.88 / T; n.vz = 0.5 * 0.35 * T - 8 / T;
            n.fuse = NADES[type].fuse; n.team = a.team; n.owner = a; n.rot = 0;
            a.nadeAnim = 24; a.angle = ang;
            SFX.play('bounce', 0.35, 1.6, a.x, a.y);
            return true;
        }
        return false;
    }
    G.throwNade = throwNade;

    function updateNades() {
        for (var j = 0; j < MAX_NADES; j++) {
            var n = G.nades[j];
            if (!n.on) continue;
            n.vz -= 0.35; n.z += n.vz; n.rot += (Math.abs(n.vx) + Math.abs(n.vy)) * 0.1;
            if (n.z <= 0) {
                n.z = 0;
                if (n.vz < -1.2) { SFX.play('bounce', Math.min(0.6, -n.vz * 0.12), rr(0.9, 1.2), n.x, n.y); n.vz = -n.vz * 0.32; n.vx *= 0.65; n.vy *= 0.65; }
                else { n.vz = 0; n.vx *= 0.9; n.vy *= 0.9; }
            }
            // bounce off walls (height matters: a high grenade flies over crates but not walls)
            var nx = n.x + n.vx, ny = n.y + n.vy;
            var tx = World.tileAt(nx, n.y), ty2 = World.tileAt(n.x, ny);
            var over = n.z > 22;
            if (BLOCK_SHOT[tx] && !(over && tx !== T_WALL && tx !== T_TREE)) { n.vx = -n.vx * 0.5; nx = n.x; SFX.play('bounce', 0.3, 1.4, n.x, n.y); }
            if (BLOCK_SHOT[ty2] && !(over && ty2 !== T_WALL && ty2 !== T_TREE)) { n.vy = -n.vy * 0.5; ny = n.y; }
            n.x = nx; n.y = ny;
            if (--n.fuse <= 0) { n.on = false; detonate(n); }
        }
    }

    function detonate(n) {
        var d = NADES[n.t];
        if (d.id === 'frag') explode(n.x, n.y, 0, n.owner, 1, false);
        else if (d.id === 'flash') {
            part(P_GLOW, n.x, n.y, 0, 0, 14, 12, 0, 1); part(P_RING, n.x, n.y, 0, 0, 18, 0.2, 0.25, 0.9);
            SFX.play('explosion', 0.5, 1.9, n.x, n.y);
            for (var k = 0; k < MAX_ACTORS; k++) {
                var a = G.actors[k];
                if (!a.on) continue;
                var dd = dist(a.x, a.y, n.x, n.y);
                if (dd > d.radius || !World.los(n.x, n.y, a.x, a.y, BLOCK_SIGHT)) continue;
                var f = 1 - dd / d.radius;
                if (a.isPlayer) G.flashT = Math.max(G.flashT, Math.round(70 + f * 90));
                else { a.blindT = Math.round(60 + d.blind * f); a.icon = 2; a.iconT = a.blindT; if (n.owner) { a.lkX = n.owner.x; a.lkY = n.owner.y; } }
            }
            noise(n.x, n.y, 500, n.owner);
        } else if (d.id === 'smoke') {
            addSmoke(n.x, n.y, d.radius, d.smokeT);
            SFX.play('explosion', 0.25, 2.4, n.x, n.y);
        } else if (d.id === 'fire') {
            for (var f2 = 0; f2 < 12; f2++) {
                var fz = G.fires[f2];
                if (fz.on) continue;
                fz.on = true; fz.x = n.x; fz.y = n.y; fz.r = d.radius; fz.t = d.fireT; fz.owner = n.owner; fz.team = n.team; break;
            }
            SFX.play('explosion', 0.45, 1.5, n.x, n.y);
            Render.decal('scorch', n.x, n.y, rnd() * TAU, 0.9, 0.6);
            noise(n.x, n.y, 500, n.owner);
        }
    }

    function addSmoke(x, y, r, t) {
        for (var k = 0; k < 12; k++) {
            var s = G.smokes[k];
            if (s.on) continue;
            s.on = true; s.x = x; s.y = y; s.r = r; s.t = t; s.max = t; return;
        }
    }
    G.addSmoke = addSmoke;
    // does smoke hide the segment?
    function smokeBlocks(x0, y0, x1, y1) {
        for (var k = 0; k < 12; k++) {
            var s = G.smokes[k];
            if (!s.on) continue;
            var r = s.r * Math.min(1, s.t / 90) * Math.min(1, (s.max - s.t) / 30 + 0.3);
            var dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
            var t = ((s.x - x0) * dx + (s.y - y0) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            var px = x0 + dx * t - s.x, py = y0 + dy * t - s.y;
            if (px * px + py * py < r * r * 0.7) return true;
        }
        return false;
    }
    G.smokeBlocks = smokeBlocks;

    function explode(x, y, type, src, power, barrel) {
        var R = barrel ? 105 : NADES[0].radius, D = barrel ? 140 : NADES[0].dmg;
        SFX.play('explosion', 1, rr(0.85, 1.05), x, y);
        addShake(Math.max(0, 14 - dist(x, y, G.camX, G.camY) / 40));
        var e = part(P_EXPL, x, y, 0, 0, 34, barrel ? 1.25 : 1.1, 0, 1);
        part(P_GLOW, x, y, 0, 0, 16, 9, 0, 0.9);
        part(P_RING, x, y, 0, 0, 14, 0.2, 0.18, 0.6);
        for (var k = 0; k < (G.lowFx ? 5 : 12); k++) {
            var p = part(P_SMOKE, x + rr(-20, 20), y + rr(-20, 20), rr(-0.8, 0.8), rr(-0.8, 0.8), rr(80, 150), rr(0.6, 1.0), 0.01, 0.6);
            if (p) p.v = 1;     // dark smoke
            part(P_SPARK, x, y, rr(-6, 6), rr(-6, 6), rr(12, 28), rr(0.3, 0.6), 0, 1);
        }
        Render.decal('scorch', x, y, rnd() * TAU, barrel ? 1.3 : 1.1, 0.85);
        noise(x, y, 950, src);
        for (var j = 0; j < MAX_ACTORS; j++) {
            var a = G.actors[j];
            if (!a.on) continue;
            var dd = dist(a.x, a.y, x, y);
            if (dd > R || !World.los(x, y, a.x, a.y, BLOCK_SHOT)) continue;
            var f = 1 - dd / R, ux = (a.x - x) / (dd || 1), uy = (a.y - y) / (dd || 1);
            var em = src && src.team === 1 && a.isPlayer && !barrel ? 0.6 * G.stageDmg : 1;     // enemy explosives scale like their bullets
            hurt(a, D * (0.25 + 0.75 * f) * em, src, ux, uy, 6 * f + 1, true);
        }
        for (j = 0; j < MAX_CORPSES; j++) {
            var c = G.corpses[j];
            if (!c.on) continue;
            var dc = dist(c.x, c.y, x, y);
            if (dc < R) { c.vx += (c.x - x) / (dc || 1) * 6 * (1 - dc / R); c.vy += (c.y - y) / (dc || 1) * 6 * (1 - dc / R); c.va += rr(-0.3, 0.3); }
        }
        for (j = 0; j < MAX_PICKUPS; j++) {
            var pk = G.pickups[j];
            if (!pk.on) continue;
            var dp = dist(pk.x, pk.y, x, y);
            if (dp < R) { pk.vx += (pk.x - x) / (dp || 1) * 4 * (1 - dp / R); pk.vy += (pk.y - y) / (dp || 1) * 4 * (1 - dp / R); }
        }
        // destroy crates, set off barrels (chain reactions)
        var tx0 = Math.floor((x - R * 0.6) / TILE), tx1 = Math.floor((x + R * 0.6) / TILE), ty0 = Math.floor((y - R * 0.6) / TILE), ty1 = Math.floor((y + R * 0.6) / TILE);
        for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
            if (!World.inb(tx, ty)) continue;
            var ti = ty * World.w + tx, tt = World.tiles[ti];
            if (tt === T_CRATE) damageTile(ti, 200, tx * TILE + 16, ty * TILE + 16, src);
            else if (tt === T_BARREL) { World.hp[ti] = 1; pendingBarrel(ti, src); }
        }
    }
    G.explode = explode;
    var barrelQ = new Int32Array(32), barrelT = new Int32Array(32), barrelSrc = [], barrelN = 0;
    for (i = 0; i < 32; i++) barrelSrc.push(null);
    function pendingBarrel(ti, src) {
        for (var k = 0; k < barrelN; k++) if (barrelQ[k] === ti) return;
        if (barrelN >= 32) return;
        barrelQ[barrelN] = ti; barrelT[barrelN] = 8 + ((rnd() * 8) | 0); barrelSrc[barrelN] = src; barrelN++;
    }
    function updateBarrels() {
        for (var k = 0; k < barrelN; k++) {
            if (--barrelT[k] > 0) continue;
            var ti = barrelQ[k], src = barrelSrc[k];
            barrelN--; barrelQ[k] = barrelQ[barrelN]; barrelT[k] = barrelT[barrelN]; barrelSrc[k] = barrelSrc[barrelN]; k--;
            if (World.tiles[ti] === T_BARREL) damageTile(ti, 999, (ti % World.w) * TILE + 16, ((ti / World.w) | 0) * TILE + 16, src);
        }
    }

    function updateZones() {
        for (var k = 0; k < 12; k++) {
            var s = G.smokes[k];
            if (s.on) {
                s.t--;
                if (s.t <= 0) s.on = false;
                else if (G.frame % (G.lowFx ? 10 : 5) === 0 && s.t > 60) {
                    var a = rnd() * TAU, r = rnd() * s.r * 0.7;
                    var p = part(P_PUFF, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, rr(-0.15, 0.15), rr(-0.15, 0.15), 160, rr(0.9, 1.4), 0.002, 0.75);
                    if (p) p.v = 0;
                }
            }
            var f = G.fires[k];
            if (f.on) {
                f.t--;
                if (f.t <= 0) { f.on = false; continue; }
                if (G.frame % (G.lowFx ? 6 : 3) === 0) {
                    var fa = rnd() * TAU, fr = rnd() * f.r * 0.8;
                    part(P_FIRE, f.x + Math.cos(fa) * fr, f.y + Math.sin(fa) * fr, rr(-0.2, 0.2), rr(-0.6, -0.2), rr(20, 40), rr(0.35, 0.6), 0, 1);
                }
                for (var j = 0; j < MAX_ACTORS; j++) {
                    var ac = G.actors[j];
                    if (!ac.on || dist(ac.x, ac.y, f.x, f.y) > f.r) continue;
                    if (G.frame % 10 === 0) hurt(ac, NADES[3].dmg * 10, f.owner, 0, 0, 0, true);
                }
            }
        }
    }

    /* ---------------- noise and alerts ---------------- */

    function noise(x, y, r, src) {
        if (!src) return;
        for (var k = 0; k < MAX_ACTORS; k++) {
            var a = G.actors[k];
            if (!a.on || !a.ai || a === src || !hostile(a, src)) continue;
            var d = dist(a.x, a.y, x, y);
            if (d > r) continue;
            if (a.seeT && a.target) continue;
            a.lkX = x + rr(-1, 1) * d * 0.12; a.lkY = y + rr(-1, 1) * d * 0.12;
            if (!a.alerted) { a.state = 'investigate'; a.stateT = 0; a.aware = Math.max(a.aware, 0.6); a.icon = 1; a.iconT = 90; a.pathLen = 0; a.goal = -1; a.target = src; }
            else { a.target = src; }
        }
    }
    G.noise = noise;

    function alertTo(a, t, seen) {
        var was = a.alerted;
        a.alerted = true; a.aware = 1; a.target = t; a.state = 'engage'; a.stateT = 0;
        if (seen) { a.lkX = t.x; a.lkY = t.y; a.lastSeen = G.frame; }
        a.reactT = a.reactBase; a.icon = 3; a.iconT = 70; a.pathLen = 0; a.goal = -1;
        if (!was) {
            if (t.isPlayer && G.frame - G.lastSpot > 360 && G.mode === 'story') { G.lastSpot = G.frame; UI.toastSmall(T('spotted')); SFX.play('uiAlert', 0.35); }
            // shout to allies nearby
            for (var k = 0; k < MAX_ACTORS; k++) {
                var b = G.actors[k];
                if (!b.on || !b.ai || b === a || b.team !== a.team || b.alerted) continue;
                if (dist(a.x, a.y, b.x, b.y) > 420) continue;
                b.alerted = true; b.aware = 1; b.target = t; b.lkX = t.x + rr(-40, 40); b.lkY = t.y + rr(-40, 40);
                b.state = 'engage'; b.stateT = 0; b.reactT = b.reactBase; b.icon = 3; b.iconT = 60; b.pathLen = 0; b.goal = -1;
            }
        }
        G.combatT = 600;
    }

    /* ---------------- movement and physics ---------------- */

    function collide(a) {
        var r = a.r * 0.92;
        var tx0 = Math.floor((a.x - r) / TILE), tx1 = Math.floor((a.x + r) / TILE), ty0 = Math.floor((a.y - r) / TILE), ty1 = Math.floor((a.y + r) / TILE);
        for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
            if (World.inb(tx, ty) && !BLOCK_MOVE[World.tiles[ty * World.w + tx]]) continue;
            var nx = Math.max(tx * TILE, Math.min(a.x, tx * TILE + TILE)), ny = Math.max(ty * TILE, Math.min(a.y, ty * TILE + TILE));
            var dx = a.x - nx, dy = a.y - ny, d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            if (d2 < 0.0001) { a.x = a.lastX; a.y = a.lastY; continue; }
            var d = Math.sqrt(d2), push = r - d;
            a.x += dx / d * push; a.y += dy / d * push;
            var vn = a.vx * dx / d + a.vy * dy / d;
            if (vn < 0) { a.vx -= vn * dx / d; a.vy -= vn * dy / d; }
        }
    }

    function moveActor(a) {
        var acc = a.isPlayer ? 0.32 : 0.2;
        a.vx += (a.dvx - a.vx) * acc; a.vy += (a.dvy - a.vy) * acc;
        a.lastX = a.x; a.lastY = a.y;
        a.x += a.vx; a.y += a.vy;
        collide(a);
        var sp = Math.abs(a.vx) + Math.abs(a.vy);
        if (sp > 0.6) {
            a.step += sp;
            if (a.step > 46) {
                a.step = 0;
                if (a.isPlayer || (a.seenByP && dist(a.x, a.y, G.camX, G.camY) < 400)) {
                    var tt = World.tileAt(a.x, a.y), mat = World.MATS[World.mat[World.idx(Math.floor(a.x / TILE), Math.floor(a.y / TILE))]] || '';
                    var nm = (mat.charAt(0) === 'g' || mat.charAt(0) === 's' || mat.charAt(0) === 'd' || tt === T_BUSH ? 'gstep' : 'step') + ((rnd() * 3) | 0);
                    SFX.play(nm, a.isPlayer ? 0.28 : 0.2, rr(0.9, 1.1), a.x, a.y);
                }
            }
        }
    }

    function separate() {
        for (var j = 0; j < MAX_ACTORS; j++) {
            var a = G.actors[j];
            if (!a.on) continue;
            for (var k = j + 1; k < MAX_ACTORS; k++) {
                var b = G.actors[k];
                if (!b.on) continue;
                var dx = b.x - a.x, dy = b.y - a.y, rr2 = a.r + b.r, d2 = dx * dx + dy * dy;
                if (d2 >= rr2 * rr2 || d2 < 0.01) continue;
                var d = Math.sqrt(d2), push = (rr2 - d) * 0.5, ux = dx / d, uy = dy / d;
                var wa = a.isPlayer ? 0.3 : 1, wb = b.isPlayer ? 0.3 : 1;
                a.x -= ux * push * wa; a.y -= uy * push * wa; b.x += ux * push * wb; b.y += uy * push * wb;
                collide(a); collide(b);
            }
        }
    }

    function followPath(a, speed) {
        if (a.pathIdx >= a.pathLen) { a.dvx = a.dvy = 0; return true; }
        var w = World.w, ti = a.path[a.pathIdx], tx = (ti % w) * TILE + 16, ty = ((ti / w) | 0) * TILE + 16;
        // string pulling: skip ahead while the way is clear
        for (var s = 0; s < 3 && a.pathIdx + 1 < a.pathLen; s++) {
            var n2 = a.path[a.pathIdx + 1], nx = (n2 % w) * TILE + 16, ny = ((n2 / w) | 0) * TILE + 16;
            if (!World.walkLine(a.x, a.y, nx, ny, a.r)) break;
            a.pathIdx++; tx = nx; ty = ny;
        }
        var dx = tx - a.x, dy = ty - a.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 6) { a.pathIdx++; if (a.pathIdx >= a.pathLen) { a.dvx = a.dvy = 0; return true; } }
        a.dvx = dx / (d || 1) * speed; a.dvy = dy / (d || 1) * speed;
        return false;
    }

    function goTo(a, ti) {
        if (ti < 0) return false;
        if (a.goal === ti && a.pathIdx < a.pathLen) return true;
        if (G.pathBudget <= 0) return false;
        G.pathBudget--;
        a.pathLen = World.path(Math.floor(a.x / TILE), Math.floor(a.y / TILE), ti % World.w, (ti / World.w) | 0, a.path);
        a.pathIdx = 0; a.goal = a.pathLen ? ti : -1;
        return a.pathLen > 0;
    }
    function tileOf(x, y) { return Math.floor(y / TILE) * World.w + Math.floor(x / TILE); }
    function nearestFree(x, y) {
        var ti = tileOf(x, y);
        if (ti >= 0 && ti < World.n && !BLOCK_MOVE[World.tiles[ti]]) return ti;
        return World.randomNear(Math.floor(x / TILE), Math.floor(y / TILE), 2);
    }

    function turnTo(a, ang, rate) {
        var d = angDiff(ang, a.angle);
        if (d > rate) d = rate; else if (d < -rate) d = -rate;
        a.angle += d;
        return Math.abs(angDiff(ang, a.angle));
    }

    /* ---------------- perception ---------------- */

    function canSee(a, t) {
        if (a.blindT > 0) return false;
        var d = dist(a.x, a.y, t.x, t.y);
        var range = a.def.role === 'sniper' ? 980 : 620;
        if (d > range) return false;
        if (!a.alerted && d > 70) {
            var ang = Math.atan2(t.y - a.y, t.x - a.x);
            if (Math.abs(angDiff(ang, a.angle)) > 1.05) return false;
        }
        if (World.tileAt(t.x, t.y) === T_BUSH && t.revealT <= 0 && d > 85) return false;
        if (!World.los(a.x, a.y, t.x, t.y, BLOCK_SIGHT)) return false;
        if (smokeBlocks(a.x, a.y, t.x, t.y)) return false;
        return true;
    }

    function perceive(a) {
        // pick the target: nearest visible hostile (story: the player)
        var best = null, bd = 1e9;
        for (var k = 0; k < MAX_ACTORS; k++) {
            var t = G.actors[k];
            if (!t.on || !hostile(a, t)) continue;
            if (G.mode === 'story' && t.team !== 0) continue;
            var d = dist(a.x, a.y, t.x, t.y);
            if (d > 1000 || d > bd) continue;
            if (canSee(a, t)) { best = t; bd = d; }
        }
        a.seeT = !!best;
        if (best) {
            if (!a.alerted) {
                var close = 1 - Math.min(1, bd / 600);
                a.aware += 0.04 + close * close * 0.35 + (best.revealT > 0 ? 0.15 : 0);
                a.icon = 1; a.iconT = 30;
                a.lkX = best.x; a.lkY = best.y;
                if (a.aware >= 1 || bd < 110) alertTo(a, best, true);
                else if (a.state === 'patrol') { a.state = 'investigate'; a.stateT = 0; a.pathLen = 0; a.goal = -1; a.dvx = a.dvy = 0; }
            } else {
                if (a.target !== best) { a.target = best; a.reactT = Math.max(a.reactT, a.reactBase >> 1); }
                if (G.frame - a.lastSeen > 90) a.reactT = Math.max(a.reactT, a.reactBase >> 1);
                a.lkX = best.x; a.lkY = best.y; a.lastSeen = G.frame;
            }
        } else if (!a.alerted && a.aware > 0) a.aware = Math.max(0, a.aware - 0.01);
    }

    /* ---------------- AI ---------------- */

    function aiShoot(a, t) {
        var wd = wpn(a);
        if (!wd || !t || !t.on) return;
        var d = dist(a.x, a.y, t.x, t.y);
        var lead = d / wd.speed * 0.5;
        var aim = Math.atan2(t.y + t.vy * lead - a.y, t.x + t.vx * lead - a.x);
        var off = turnTo(a, aim, a.braceT > 0 ? 0 : a.def.turn || (a.def.role === 'heavy' ? 0.07 : 0.12));
        if (a.reactT > 0) { a.reactT--; return; }
        if (d > wd.range * 1.5) return;
        // sniper: show the laser, then shoot
        if (a.def.laser) {
            if (a.fireCd > 0 || a.reloadT > 0) { a.laserT = 0; return; }
            if (a.laserT === 0 && !takeToken(a, t)) return;
            a.laserT++;
            var need = a.def.laser - (a.boss && a.hp < a.maxHp * 0.5 ? 16 : 0);
            if (a.laserT < need) return;
            a.laserT = 0;
            if (fire(a)) { a.burstPause = 0; }
            return;
        }
        if (off > 0.18) return;
        if (a.burstPause > 0) { a.burstPause--; return; }
        if (a.burstWant <= 0) {
            if (!takeToken(a, t)) { a.burstPause = Math.round(rr(25, 55)); return; }
            a.burstWant = Math.round(rr(a.def.burst[0], a.def.burst[1] + 0.99));
        }
        if (fire(a) || (a.burstLeft > 0)) {
            if (!wd.burst || a.burstLeft <= 0) a.burstWant--;
            if (a.burstWant <= 0) a.burstPause = Math.round(rr(20, 50) * (1 + a.suppress));
        }
    }

    // only a few enemies may shoot at the player at the same time (bosses always may)
    function takeToken(a, t) {
        if (G.mode !== 'story' || !t || !t.isPlayer || a.boss) return true;
        var f = G.frame;
        if (f - a.tokenF < 110) { a.tokenF = f; return true; }
        var n = 0;
        for (var k = 0; k < MAX_ACTORS; k++) { var b = G.actors[k]; if (b.on && b !== a && b.ai && f - b.tokenF < 110) n++; }
        if (n >= G.maxTokens) return false;
        a.tokenF = f;
        return true;
    }

    function aiNade(a, tx, ty, force) {
        if (a.nadeCd > 0 || (!a.def.nade && !force)) return false;
        var d = dist(a.x, a.y, tx, ty);
        if (d < 110 || d > 340) return false;
        if (!force && rnd() > a.def.nade) { a.nadeCd = 240; return false; }
        a.nadeCd = a.boss ? 200 : 420;
        return throwNade(a, 0, tx, ty);
    }

    function updateAI(a) {
        var role = a.def.role, f = G.frame, t = a.target;
        if (a.fireCd > 0) a.fireCd--;
        if (a.nadeCd > 0) a.nadeCd--;
        if (a.iconT > 0) a.iconT--;
        if (a.braceT > 0) { a.braceT--; a.dvx = a.dvy = 0; if (a.braceT > 0) return; }
        a.suppress *= 0.985;
        a.stateT++;
        if (a.blindT > 0) { a.blindT--; a.dvx = Math.cos(f * 0.05 + a.id) * 0.4; a.dvy = Math.sin(f * 0.05 + a.id) * 0.4; a.angle += 0.05; return; }
        if ((f + a.id) % 4 === 0) perceive(a);
        if (t && !t.on) { a.target = null; t = null; a.seeT = false; if (G.mode !== 'story') { a.alerted = false; a.state = 'patrol'; } }
        var spd = a.speed * (wpn(a) && wpn(a).move ? wpn(a).move : 1);
        // stuck detection
        if ((f + a.id) % 40 === 0) {
            var moved = Math.abs(a.x - a.homeX * 0 - a.lastX) + Math.abs(a.y - a.lastY);
            if (a.pathLen && a.pathIdx < a.pathLen && moved < 0.05) { a.stuckT++; if (a.stuckT > 2) { a.pathLen = 0; a.goal = -1; a.stuckT = 0; } }
            else a.stuckT = 0;
        }
        if (G.mode !== 'story') { brBrain(a, spd); return; }

        if (!a.alerted) {
            if (a.state === 'investigate') {
                a.icon = 1; a.iconT = Math.max(a.iconT, 10);
                var gi = nearestFree(a.lkX, a.lkY);
                if (a.goal !== gi) goTo(a, gi);
                var arrived = followPath(a, spd * 0.75);
                if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.15;
                else turnTo(a, Math.atan2(a.lkY - a.y, a.lkX - a.x), 0.06);
                if (arrived || a.stateT > 600) { a.lookT++; a.angle += Math.sin(a.lookT * 0.03) * 0.04; if (a.lookT > 200) { a.state = 'patrol'; a.lookT = 0; a.stateT = 0; a.aware *= 0.5; } }
                return;
            }
            // patrol: walk between points near home, or stand guard and look around
            if (a.guard) { a.dvx = a.dvy = 0; a.angle += Math.sin(a.stateT * 0.012 + a.id) * 0.012; return; }
            if (a.pathIdx >= a.pathLen && a.stateT > 120) {
                var pt = World.randomNear(Math.floor(a.homeX / TILE), Math.floor(a.homeY / TILE), 6, 2);
                if (goTo(a, pt)) a.stateT = 0;
            }
            followPath(a, spd * 0.45);
            if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.1;
            return;
        }

        // ---- alerted ----
        if (!t) { t = nearestPlayer(a); a.target = t; if (!t || !t.on) { a.dvx = a.dvy = 0; return; } }
        var sees = a.seeT, d = dist(a.x, a.y, t.x, t.y), wd = wpn(a), lost = f - a.lastSeen;
        if (G.revealLast && (f + a.id) % 300 === 0) { a.lkX = t.x; a.lkY = t.y; }
        // retreat when badly hurt (once)
        if (!a.boss && !a.retreated && a.hp < a.maxHp * 0.35 && role !== 'heavy') {
            a.retreated = true; a.state = 'retreat'; a.stateT = 0;
            a.cover = World.findCover(a.x, a.y, t.x, t.y, 8, 520, a.id);
            if (a.cover >= 0) World.claim[a.cover] = a.id;
            a.pathLen = 0; a.goal = -1;
        }
        if (a.state === 'retreat') {
            if (a.cover >= 0) goTo(a, a.cover);
            followPath(a, spd * 1.15);
            if (sees) aiShoot(a, t);
            else if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.2;
            if (a.stateT > 260) { a.state = 'engage'; a.stateT = 0; a.cover = -1; }
            return;
        }
        // grenades to flush the target out of cover
        if (!sees && lost > 100 && lost < 600 && (a.def.nade || a.boss)) aiNade(a, a.lkX, a.lkY, false);
        if (a.def.launcher) {
            if (--a.launchT <= 0 && lost < 500 && dist(a.x, a.y, a.lkX, a.lkY) < 360) { a.launchT = a.hp < a.maxHp * 0.5 ? 130 : 190; a.nadeCd = 0; if (aiNade(a, a.lkX + rr(-20, 20), a.lkY + rr(-20, 20), true)) { a.braceT = 85; a.dvx = a.dvy = 0; } }
        }
        if (a.def.smoke && a.smokeUsed < 4 && sees && a.hp < a.maxHp * (0.85 - a.smokeUsed * 0.2)) { a.smokeUsed++; addSmoke(a.x, a.y, 90, 420); a.cover = -1; a.state = 'engage'; }

        if (role === 'rusher' || (role === 'flanker' && d < 200)) {
            // close in, sidestep while shooting
            if ((f + a.id) % 30 === 0 || a.pathIdx >= a.pathLen) goTo(a, nearestFree(sees ? t.x : a.lkX, sees ? t.y : a.lkY));
            if (sees && d < 140) { a.dvx = Math.cos(a.angle + PI / 2) * spd * 0.6 * a.strafe; a.dvy = Math.sin(a.angle + PI / 2) * spd * 0.6 * a.strafe; if ((f + a.id) % 70 === 0) a.strafe = -a.strafe; }
            else followPath(a, spd);
            if (sees) aiShoot(a, t); else if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.2;
            return;
        }
        if (role === 'flanker') {
            // circle around: go to a point beside the target, then attack
            if (a.state !== 'flank' || a.pathIdx >= a.pathLen || a.stateT > 420) {
                var bx = sees ? t.x : a.lkX, by = sees ? t.y : a.lkY, ang = Math.atan2(a.y - by, a.x - bx) + a.strafe * 1.3;
                var fx = bx + Math.cos(ang) * 170, fy = by + Math.sin(ang) * 170;
                if (goTo(a, nearestFree(fx, fy)) || a.stateT > 420) { a.state = 'flank'; a.stateT = 0; a.strafe = -a.strafe; }
            }
            followPath(a, spd);
            if (sees) aiShoot(a, t); else if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.2;
            return;
        }
        if (role === 'heavy') {
            if (sees && d < 280) { a.dvx = a.dvy = 0; }
            else { if ((f + a.id) % 45 === 0 || a.pathIdx >= a.pathLen) goTo(a, nearestFree(sees ? t.x : a.lkX, sees ? t.y : a.lkY)); followPath(a, spd * (a.boss && a.hp < a.maxHp * 0.5 ? 1.35 : 1)); }
            if (sees) aiShoot(a, t); else if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.1;
            return;
        }
        // rifleman / sniper: cover, peek, shoot, hide, hunt
        var pref = role === 'sniper' ? 560 : Math.min(420, wd.range * 0.65);
        if (role === 'sniper' && sees && d < 190 && a.state !== 'move') { a.cover = -1; a.state = 'move'; }
        switch (a.state) {
            case 'engage':
            case 'move':
                if (a.cover < 0 || a.state === 'move') {
                    if (a.cover >= 0 && World.claim[a.cover] === a.id) World.claim[a.cover] = 0;
                    if ((f + a.id) % 12 === 0) {
                        var c = World.findCover(a.x, a.y, sees ? t.x : a.lkX, sees ? t.y : a.lkY, role === 'sniper' ? 9 : 7, pref, a.id);
                        if (c >= 0 && goTo(a, c)) { a.cover = c; World.claim[c] = a.id; a.state = 'toCover'; a.stateT = 0; }
                        else if (!sees) { goTo(a, nearestFree(a.lkX, a.lkY)); a.state = 'hunt'; a.stateT = 0; }
                    }
                }
                if (sees) aiShoot(a, t);
                followPath(a, spd);
                break;
            case 'toCover':
                if (followPath(a, spd * 1.1) || a.stateT > 300) { a.state = 'hide'; a.stateT = 0; a.dvx = a.dvy = 0; }
                if (sees && (role === 'sniper' || a.stateT % 3 === 0)) aiShoot(a, t);
                else if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.2;
                break;
            case 'hide':
                a.dvx = a.dvy = 0;
                turnTo(a, Math.atan2(a.lkY - a.y, a.lkX - a.x), 0.08);
                if (wd.mag && a.mag[a.cur] < wd.mag * 0.5) startReload(a);
                if (sees) aiShoot(a, t);                   // target walked into view
                if (a.stateT > (role === 'sniper' ? 50 : 70 + a.suppress * 120) && a.reloadT === 0) {
                    a.peek = World.findPeek(a.cover, a.lkX, a.lkY);
                    if (a.peek >= 0 && goTo(a, a.peek)) { a.state = 'peek'; a.stateT = 0; }
                    else { a.cover = -1; a.state = lost > 240 ? 'hunt' : 'engage'; a.stateT = 0; if (a.state === 'hunt') goTo(a, nearestFree(a.lkX, a.lkY)); }
                }
                break;
            case 'peek':
                if (!sees) followPath(a, spd * 0.8); else { a.dvx = a.dvy = 0; aiShoot(a, t); }
                if (!sees && a.pathIdx >= a.pathLen && a.stateT > 60) { a.state = 'hunt'; a.stateT = 0; a.cover = -1; goTo(a, nearestFree(a.lkX, a.lkY)); }
                if (a.stateT > (role === 'sniper' ? 200 : 110 + rnd() * 40) || (a.hitFlash > 0 && rnd() < 0.3) || a.mag[a.cur] === 0) {
                    if (a.cover >= 0 && goTo(a, a.cover)) { a.state = 'toCover'; a.stateT = 0; }
                    else { a.state = 'engage'; a.cover = -1; }
                    if (role === 'sniper' && rnd() < 0.5) { a.state = 'move'; a.cover = -1; }
                }
                break;
            case 'hunt':
                if (sees) { a.state = 'engage'; a.stateT = 0; a.cover = -1; break; }
                if (a.pathIdx >= a.pathLen) {
                    if (dist(a.x, a.y, a.lkX, a.lkY) > 48) goTo(a, nearestFree(a.lkX, a.lkY));
                    else { a.angle += 0.04; if (a.stateT > 240) { a.lkX = a.x + rr(-200, 200); a.lkY = a.y + rr(-200, 200); a.stateT = 0; } }
                }
                followPath(a, spd * 0.8);
                if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.15;
                break;
            default:
                a.state = 'engage';
        }
    }

    /* ---------------- bosses ---------------- */

    function bossCheck(a) {
        var waves = a.def.waves, n = waves.length;
        var thr = 1 - (a.bossWaveDone + 1) / (n + 1);
        if (a.bossWaveDone < n && a.hp < a.maxHp * thr) {
            var type = waves[a.bossWaveDone]; a.bossWaveDone++;
            G.bossWave = a.bossWaveDone;
            var cnt = 0;
            for (var k = 0; k < 40 && cnt < 3; k++) {
                var ti = World.randomNear(Math.floor(a.x / TILE), Math.floor(a.y / TILE), 12, 5);
                if (ti < 0) continue;
                var x = (ti % World.w) * TILE + 16, y = ((ti / World.w) | 0) * TILE + 16;
                var np = nearestPlayer({ x: x, y: y });
                if (np && (World.visible(x, y) || dist(x, y, np.x, np.y) < 300)) continue;
                var e = spawnActor(x, y, 1, ENEMIES[type], { hpMul: G.stageHp });
                if (e && np) { cnt++; alertTo(e, np, false); e.lkX = np.x; e.lkY = np.y; }
            }
            if (cnt) { UI.toast(T('reinforce'), '#ff6b5a'); MyPC.announce(T('reinforce')); countEnemies(); }
        }
        if (a.def.berserk && a.phase === 0 && a.hp < a.maxHp * 0.3) {
            a.phase = 1; giveWeapon(a, a.def.berserk, true); a.def = Object.assign({}, a.def, { role: 'heavy', burst: [16, 24] }); a.speed = 1.5;
        }
    }

    /* ---------------- player ---------------- */

    function nearestPlayer(a) {
        var best = null, bd = 1e9;
        for (var k = 0; k < 2; k++) { var p = G.players[k]; if (!p || !p.on) continue; var d = dist(a.x, a.y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
        return best;
    }
    G.nearestPlayer = nearestPlayer;
    function pickTarget(p) {
        var best = null, bs = 1e9, wd = wpn(p), maxR = Math.max(560, wd.range * 1.3);
        for (var k = 0; k < MAX_ACTORS; k++) {
            var e = G.actors[k];
            if (!e.on || e === p || !hostile(p, e) || !e.seenByP) continue;
            var d = dist(p.x, p.y, e.x, e.y);
            if (d > maxR) continue;
            if (!World.los(p.x, p.y, e.x, e.y, BLOCK_SHOT)) continue;
            var ang = Math.abs(angDiff(Math.atan2(e.y - p.y, e.x - p.x), p.angle));
            var s = d * (1 + ang * 0.45);
            if (e === p.tA) s *= 0.55;
            if (e.alerted && e.seeT) s *= 0.8;       // threats first
            if (s < bs) { bs = s; best = e; }
        }
        // a fuel barrel next to visible enemies is a better target
        var barrel = -1;
        if (best) {
            var bx0 = Math.floor((best.x - 64) / TILE), by0 = Math.floor((best.y - 64) / TILE);
            for (var ty = by0; ty <= by0 + 4; ty++) for (var tx = bx0; tx <= bx0 + 4; tx++) {
                if (!World.inb(tx, ty) || World.tiles[ty * World.w + tx] !== T_BARREL) continue;
                var cx = tx * TILE + 16, cy = ty * TILE + 16;
                if (dist(cx, cy, best.x, best.y) > 80 || dist(cx, cy, p.x, p.y) < 140) continue;
                if (!World.visible(cx, cy) || !World.los(p.x, p.y, cx, cy, BLOCK_SHOT)) continue;
                var near = 0;
                for (var q = 0; q < MAX_ACTORS; q++) { var o = G.actors[q]; if (o.on && hostile(p, o) && dist(o.x, o.y, cx, cy) < 90) near++; }
                if (near >= 1 && !best.boss) barrel = ty * World.w + tx;
            }
        }
        p.tA = best; p.tB = barrel;
        if (barrel >= 0) { p.tX = (barrel % World.w) * TILE + 16; p.tY = ((barrel / World.w) | 0) * TILE + 16; }
        else if (best) { p.tX = best.x; p.tY = best.y; }
        if (best) { p.lkX = p.tX; p.lkY = p.tY; p.lastSeen = G.frame; }
    }

    function updatePlayer(p) {
        var f = G.frame;
        if (p.fireCd > 0) p.fireCd--;
        if (p.revealT > 0) p.revealT--;
        if (p.hitFlash > 0) p.hitFlash--;
        if (p.healT > 0) { p.healT--; p.hp = Math.min(p.maxHp, p.hp + 0.5); if (p.healT % 10 === 0) UI.hud.dirty = true; }
        var sl = p.slot;
        var ix = (Input.dirDown(sl, 'right') ? 1 : 0) - (Input.dirDown(sl, 'left') ? 1 : 0), iy = (Input.dirDown(sl, 'down') ? 1 : 0) - (Input.dirDown(sl, 'up') ? 1 : 0);
        var wd = wpn(p), l = Math.sqrt(ix * ix + iy * iy) || 1;
        var sp = 2.35 * (wd.move || 1) * (p.reloadT > 0 ? 0.9 : 1);
        p.dvx = ix / l * sp; p.dvy = iy / l * sp;
        // co-op: both players share the screen, so neither may walk too far from the other
        var mate = G.players[1 - sl];
        if (ix || iy || Input.cmdDown(sl, 'fire')) p.idleT = 0; else p.idleT++;
        if (mate && mate.on) {
            var mx = p.x + p.dvx - mate.x, my = p.y + p.dvy - mate.y;
            var atEdge = (Math.abs(mx) > 1100 && mx * p.dvx > 0) || (Math.abs(my) > 600 && my * p.dvy > 0);
            // a partner who put the controller down is brought along instead of holding the team back
            if (atEdge && mate.idleT > 600) warpNear(mate, p);
            else {
                if (Math.abs(mx) > 1100 && mx * p.dvx > 0) p.dvx = 0;
                if (Math.abs(my) > 600 && my * p.dvy > 0) p.dvy = 0;
            }
        }
        if (ix || iy) p.still = 0; else p.still++;
        if (f % 3 === 0) pickTarget(p);
        var holding = Input.cmdDown(sl, 'fire');
        if (p.latch && !holding) p.latch = false;
        var aimX = 0, aimY = 0, has = false;
        if (p.tA || p.tB >= 0) { aimX = p.tX; aimY = p.tY; has = true; }
        else if (holding && f - p.lastSeen < 90) { aimX = p.lkX; aimY = p.lkY; has = true; }
        if (has) {
            var lead = p.tA ? dist(p.x, p.y, aimX, aimY) / wd.speed * 0.6 : 0;
            var off = turnTo(p, Math.atan2(aimY + (p.tA ? p.tA.vy * lead : 0) - p.y, aimX + (p.tA ? p.tA.vx * lead : 0) - p.x), 0.3);
            // holding OK fires at the weapon's own pace (semi-automatic ones too: easier on a TV remote)
            if (holding && !p.latch && off < 0.12) fire(p);
        } else if (ix || iy) turnTo(p, Math.atan2(iy, ix), 0.22);
        if (p.burstLeft > 0 && --p.burstT <= 0) { p.burstLeft--; p.burstT = wd.burstGap; if (p.mag[p.cur] > 0) { p.mag[p.cur]--; shoot(p, wd); UI.hud.dirty = true; } else p.burstLeft = 0; }
        if (!holding) p.recoil = Math.max(0, p.recoil - 0.006); else p.recoil = Math.max(0, p.recoil - 0.0015);
        if (p.reloadT > 0 && --p.reloadT <= 0) finishReload(p);
        // tactical reload when nothing is around
        if (!has && p.reloadT === 0 && f - p.lastSeen > 120 && p.mag[p.cur] < wd.mag * 0.6 && p.res[p.cur] > 0) startReload(p);
        if (p.nadeAnim > 0) p.nadeAnim--;
        // pickups
        for (var k = 0; k < MAX_PICKUPS; k++) {
            var pk = G.pickups[k];
            if (pk.on && pk.t > 20 && dist(pk.x, pk.y, p.x, p.y) < 22) takePickup(p, pk);
        }
        if (G.flashT > 0) G.flashT--;
    }

    function takePickup(a, pk) {
        var msg = '', s;
        if (pk.kind === 'ammo') {
            for (s = 1; s < 4; s++) if (a.w[s]) a.res[s] = Math.min(WEAPONS[a.w[s]].reserve * 2, a.res[s] + Math.ceil(WEAPONS[a.w[s]].mag * (s === 3 ? 1 : 1.5)));
            msg = T('ammo');
        } else if (pk.kind === 'med') {
            if (a.isPlayer && a.medkits >= MAX_CARRY && a.hp >= a.maxHp) return;
            if (a.isPlayer && a.medkits < MAX_CARRY) { a.medkits++; msg = T('medkit'); }
            else { a.hp = Math.min(a.maxHp, a.hp + 50); msg = T('health'); }
        } else if (pk.kind === 'armor') {
            if (a.armor >= 100) return;
            a.armor = Math.min(100, a.armor + pk.n); msg = T('armor');
        } else if (pk.kind === 'nade') {
            a.nades[pk.n] = Math.min(5, a.nades[pk.n] + 1); msg = T(NADES[pk.n].id);
        } else if (pk.kind === 'w') {
            var wd = WEAPONS[pk.wid]; s = CATS.indexOf(wd.cat);
            if (a.w[s] === pk.wid) { a.res[s] = Math.min(wd.reserve * 2, a.res[s] + wd.mag); msg = T('ammo'); }
            else if (!a.w[s] || WEAPONS[a.w[s]].tier < wd.tier) {
                if (a.w[s]) spawnPickup('w', a.w[s], 0, a.x, a.y, rr(-1.5, 1.5), rr(-1.5, 1.5)).t = 0;
                giveWeapon(a, pk.wid, !a.isPlayer || !a.w[a.cur] || WEAPONS[a.w[a.cur]].tier <= wd.tier);
                msg = wd.name;
            } else { a.res[s] = Math.min(WEAPONS[a.w[s]].reserve * 2, a.res[s] + WEAPONS[a.w[s]].mag); msg = T('ammo'); }
        }
        pk.on = false;
        if (a.isPlayer) { SFX.play('pickup', 0.6); UI.toastSmall((G.coop ? 'P' + (a.slot + 1) + '  ' : '') + '+ ' + msg); UI.hud.dirty = true; }
    }

    G.useMedkit = function (p) {
        p = p || G.player;
        if (!p || !p.on || p.medkits <= 0 || p.hp >= p.maxHp) return false;
        p.medkits--; p.healT = 100; SFX.play('pickup', 0.6, 0.8); UI.hud.dirty = true; return true;
    };
    // throw a grenade at the target, the last seen enemy, or ahead
    G.playerNade = function (type, p) {
        p = p || G.player;
        if (!p || !p.on) return false;
        if (type === undefined) { type = -1; for (var k = 0; k < 4; k++) if (p.nades[k] > 0) { type = k; break; } }
        if (type < 0 || p.nades[type] <= 0) { SFX.play('uiError', 0.5); return false; }
        var tx, ty;
        if (G.frame - p.lastSeen < 400) { tx = p.lkX; ty = p.lkY; }
        else { var ne = nearestKnownEnemy(p); if (ne) { tx = ne.x; ty = ne.y; } else { tx = p.x + Math.cos(p.angle) * 220; ty = p.y + Math.sin(p.angle) * 220; } }
        if (NADES[type].id === 'smoke' && G.frame - p.lastSeen < 400) { tx = (p.x * 2 + tx) / 3; ty = (p.y * 2 + ty) / 3; }
        else if (NADES[type].id !== 'flash') {        // never inside your own blast
            var dd = dist(p.x, p.y, tx, ty);
            if (dd < 165) { tx = p.x + (tx - p.x) / (dd || 1) * 165; ty = p.y + (ty - p.y) / (dd || 1) * 165; }
        }
        if (throwNade(p, type, tx, ty)) { p.nades[type]--; UI.hud.dirty = true; return true; }
        return false;
    };
    function nearestKnownEnemy(p) {
        var best = null, bd = 360;
        for (var k = 0; k < MAX_ACTORS; k++) {
            var e = G.actors[k];
            if (!e.on || !hostile(p, e) || !(e.seenByP || (G.revealLast && e.team === 1))) continue;
            var d = dist(p.x, p.y, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }
    // what OK does when pressed in play: fire if something is (or just was) in sight, else open the tactical screen
    G.okWantsTactical = function (p) {
        p = p || G.player;
        if (!p || !p.on) return false;
        return !p.tA && p.tB < 0 && G.frame - p.lastSeen > 90;
    };

    /* ---------------- battle royale ---------------- */

    var BR_RADII = [0.78, 0.4, 0.25, 0.14, 0.06, 0.0], BR_DPS = [1.5, 3, 5, 8, 12, 18];
    function brDrop(a) {
        var best = -1, bt = 0;
        for (var s = 1; s < 4; s++) if (a.w[s] && WEAPONS[a.w[s]].tier >= bt) { bt = WEAPONS[a.w[s]].tier; best = s; }
        if (best >= 0) spawnPickup('w', a.w[best], 0, a.x, a.y, rr(-2, 2), rr(-2, 2));
        spawnPickup('ammo', '', 1, a.x, a.y, rr(-2, 2), rr(-2, 2));
        if (a.medkits > 0 || rnd() < 0.3) spawnPickup('med', '', 1, a.x, a.y, rr(-2, 2), rr(-2, 2));
        if (a.armor > 20) spawnPickup('armor', '', 50, a.x, a.y, rr(-2, 2), rr(-2, 2));
    }
    function brDeath(a, src) {
        G.alive--;
        if (G.mode === 'br') {
            UI.feed((src && src.on !== undefined ? (src.isPlayer ? (MyPC.info().profile.name || 'YOU') : src.name) : 'ZONE') + '  ›  ' + (a.isPlayer ? 'YOU' : a.name));
            UI.hud.dirty = true;
            if (G.alive <= 1 && G.player && G.player.on && G.state === 'play') { G.place = 1; G.state = 'won'; G.endT = 150; G.slowmo = 90; SFX.play('uiWin', 0.8); UI.toast(T('winner'), '#ffd34d'); MyPC.announce(T('winner')); }
        }
    }
    function zonePick(r) {
        var z = G.zone;
        for (var k = 0; k < 60; k++) {
            var a = rnd() * TAU, d = rnd() * Math.max(0, z.r - r) * 0.85;
            var x = z.cx + Math.cos(a) * d, y = z.cy + Math.sin(a) * d;
            var ti = tileOf(x, y);
            if (ti >= 0 && ti < World.n && World.dist[ti] >= 0 && !BLOCK_MOVE[World.tiles[ti]]) { z.ncx = x; z.ncy = y; return; }
        }
        z.ncx = z.cx; z.ncy = z.cy;
    }
    function updateZone() {
        var z = G.zone, sp = G.mode === 'attract' ? 3 : 1;
        z.t -= sp;
        if (z.shrink) {
            var k = 1 - Math.max(0, z.t) / z.dur;
            z.r = z.r0 + (z.nr - z.r0) * k; z.cx = z.cx0 + (z.ncx - z.cx0) * k; z.cy = z.cy0 + (z.ncy - z.cy0) * k;
            if (z.t <= 0) {
                z.shrink = false; z.phase++;
                if (z.phase < BR_RADII.length - 1) { z.nr = BR_RADII[z.phase + 1] * z.size; zonePick(z.nr); z.t = z.wait = 50 * 60 - z.phase * 400; }
                else z.t = 1e9;
            }
        } else if (z.t <= 0) {
            z.shrink = true; z.dur = z.t = 28 * 60; z.r0 = z.r; z.cx0 = z.cx; z.cy0 = z.cy;
            if (G.mode === 'br') { UI.toast(T('zoneShrink'), '#4fc3ff'); MyPC.announce(T('zoneShrink')); }
        }
        z.dps = BR_DPS[Math.min(z.phase, BR_DPS.length - 1)];
        if (G.frame % 30 === 0) {
            for (var j = 0; j < MAX_ACTORS; j++) {
                var a = G.actors[j];
                if (!a.on || dist(a.x, a.y, z.cx, z.cy) <= z.r) continue;
                a.hp -= z.dps / 2; a.hitFlash = 4;
                if (a.isPlayer) { UI.hud.dirty = true; G.events.hurtT = 20; G.events.hurtAng = Math.atan2(z.cy - a.y, z.cx - a.x) + PI; }
                if (a.hp <= 0) die(a, null, 0, 0, 0);
            }
        }
    }

    function brBrain(a, spd) {
        var f = G.frame, z = G.zone, t = a.target && a.target.on && a.seeT ? a.target : null;
        a.pickT--;
        // weapon choice by distance
        if (t && (f + a.id) % 30 === 0) {
            var d0 = dist(a.x, a.y, t.x, t.y), want = a.cur;
            if (d0 < 170 && a.w[1]) want = 1; else if (d0 > 420 && a.w[3]) want = 3; else if (a.w[2]) want = 2; else if (a.w[1] && d0 < 260) want = 1; else if (a.w[3]) want = 3; else want = 0;
            if (want !== a.cur && a.w[want]) { a.cur = want; a.reloadT = 0; a.fireCd = 20; }
        }
        if (a.reloadT > 0 && --a.reloadT <= 0) finishReload(a);
        if (a.burstLeft > 0 && --a.burstT <= 0) { var w0 = wpn(a); a.burstLeft--; a.burstT = w0.burstGap; if (a.mag[a.cur] > 0) { a.mag[a.cur]--; shoot(a, w0); } }
        if (a.hp < a.maxHp * 0.5 && a.medkits > 0 && !t) { a.medkits--; a.hp = Math.min(a.maxHp, a.hp + 50); }
        var outside = dist(a.x, a.y, z.cx, z.cy) > z.r - 40, outNext = dist(a.x, a.y, z.ncx, z.ncy) > z.nr - 30 && (z.shrink || z.t < 900);
        if (t) {
            var d = dist(a.x, a.y, t.x, t.y);
            aiShoot(a, t);
            if (outside) { goTo(a, nearestFree(z.cx, z.cy)); followPath(a, spd); return; }
            // keep a fighting distance and strafe
            var wd = wpn(a), pref = wd.cat === 'shotgun' ? 110 : wd.cat === 'sniper' ? 420 : 240;
            var ux = (t.x - a.x) / (d || 1), uy = (t.y - a.y) / (d || 1), fwd = d > pref + 40 ? 1 : d < pref - 40 ? -1 : 0;
            if ((f + a.id) % 80 === 0) a.strafe = -a.strafe;
            a.dvx = (ux * fwd - uy * a.strafe * 0.7) * spd * 0.8; a.dvy = (uy * fwd + ux * a.strafe * 0.7) * spd * 0.8;
            a.pathLen = 0; a.goal = -1;
            if (wd.mag && a.mag[a.cur] === 0) startReload(a);
            return;
        }
        if (a.mag[a.cur] < (wpn(a).mag >> 1)) startReload(a);
        if (G.frame - a.lastSeen < 200 && a.alerted && !outside) {
            // investigate the last known position
            if (a.pathIdx >= a.pathLen) goTo(a, nearestFree(a.lkX, a.lkY));
        } else if (outside || outNext) {
            if (a.pathIdx >= a.pathLen || a.roamT-- <= 0) { a.roamT = 200; goTo(a, zoneTile(z.shrink ? z.ncx : z.ncx, z.ncy, z.nr * 0.6)); }
        } else if (a.pickT <= 0) {
            a.pickT = 60;
            // loot: nearest useful pickup in reach
            var best = null, bd = 330;
            for (var k = 0; k < MAX_PICKUPS; k++) {
                var pk = G.pickups[k];
                if (!pk.on) continue;
                var dd = dist(a.x, a.y, pk.x, pk.y);
                if (dd > bd) continue;
                if (pk.kind === 'w') { var s = CATS.indexOf(WEAPONS[pk.wid].cat); if (a.w[s] && WEAPONS[a.w[s]].tier >= WEAPONS[pk.wid].tier) continue; }
                else if (pk.kind === 'nade') continue;
                best = pk; bd = dd;
            }
            if (best) goTo(a, nearestFree(best.x, best.y));
            else if (a.pathIdx >= a.pathLen || a.roamT-- <= 0) { a.roamT = 400; goTo(a, zoneTile(z.ncx, z.ncy, Math.max(64, z.nr * 0.8))); }
        }
        followPath(a, spd * 0.9);
        for (var q = 0; q < MAX_PICKUPS; q++) { var p2 = G.pickups[q]; if (p2.on && p2.t > 20 && dist(p2.x, p2.y, a.x, a.y) < 22) takePickup(a, p2); }
        if (a.dvx || a.dvy) a.angle += angDiff(Math.atan2(a.dvy, a.dvx), a.angle) * 0.15;
        if (a.alerted && G.frame - a.lastSeen > 400) a.alerted = false;
    }
    function zoneTile(cx, cy, r) {
        for (var k = 0; k < 30; k++) {
            var an = rnd() * TAU, d = rnd() * r, ti = tileOf(cx + Math.cos(an) * d, cy + Math.sin(an) * d);
            if (ti >= 0 && ti < World.n && World.dist[ti] >= 0 && !BLOCK_MOVE[World.tiles[ti]]) return ti;
        }
        return nearestFree(cx, cy);
    }

    /* ---------------- setup: story, battle royale, attract ---------------- */

    function tileXY(ti) { return [(ti % World.w) * TILE + 16, ((ti / World.w) | 0) * TILE + 16]; }

    G.startStory = function (op, st, save) {
        resetPools();
        var O = CAMPAIGN[op], S = O.stages[st], isBoss = st === 2;
        G.mode = 'story'; G.op = op; G.st = st; G.stage = S; G.isBoss = isBoss;
        var stageNo = op * 3 + st;
        G.stageHp = (1 + stageNo * 0.02) * G.diff.hp;
        // the campaign ramps up: early stages hit softer and react slower
        G.stageDmg = 0.75 + stageNo * 0.025; G.stageReact = Math.round((11 - stageNo) * 1.5);
        G.maxTokens = Math.min(3, 2 + Math.floor(stageNo / 5)) + (G.diffName === 'elite' ? 1 : 0);
        World.generate({ w: S.w, h: S.h, theme: O.theme, seed: 1000 + stageNo * 7919 + ((save.seeds && save.seeds[stageNo]) || 0), spawnX: 4, spawnY: (S.h / 2) | 0 });
        Render.buildFloor();
        var nu = save.nades, p = null;
        for (var pl = 0; pl < (G.coop ? 2 : 1); pl++) {
            var q = spawnActor(World.spawnX * TILE + 16, World.spawnY * TILE + 16 + (pl ? 30 : (G.coop ? -14 : 0)), 0,
                { sprite: 'survivor1', hp: 100, speed: 2.35, tint: P_TINT[pl] }, { player: true, angle: 0, armor: 50, slot: pl });
            G.players[pl] = q;
            var lo = pl ? save.loadout2 || save.loadout : save.loadout;
            for (var s = 0; s < 4; s++) if (lo[s]) giveWeapon(q, lo[s], false);
            q.cur = lo[2] ? 2 : 0;
            q.medkits = isBoss ? 2 : 1;
            var take = Math.min(save.kits | 0, MAX_CARRY - q.medkits);          // medkits bought in the shop
            if (take > 0) { q.medkits += take; save.kits -= take; }
            q.nades[0] = 2; q.nades[1] = nu.indexOf('flash') >= 0 ? 1 : 0; q.nades[2] = nu.indexOf('smoke') >= 0 ? 1 : 0; q.nades[3] = nu.indexOf('fire') >= 0 ? 1 : 0;
        }
        p = G.player = G.players[0];
        if (G.coop) { G.stageHp *= 1.2; G.maxTokens++; }     // a second gun: tougher and bolder enemies
        // enemies: spread out on reachable tiles far from the player, some in buildings, some on guard
        var mix = [], k;
        for (var t2 in S.mix) for (k = 0; k < S.mix[t2]; k++) mix.push(t2);
        S = Object.assign({}, S, { n: G.coop ? Math.round(S.n * 1.25) : S.n });
        var placed = [];
        function place(minDist, maxTries) {
            for (var q = 0; q < maxTries; q++) {
                var ti = World.ri(0, World.n - 1);
                if (World.dist[ti] < minDist || BLOCK_MOVE[World.tiles[ti]]) continue;
                var xy = tileXY(ti), okk = true;
                for (var z = 0; z < placed.length; z++) if (Math.abs(placed[z][0] - xy[0]) < 96 && Math.abs(placed[z][1] - xy[1]) < 96) { okk = false; break; }
                if (!okk) continue;
                placed.push(xy); return xy;
            }
            return null;
        }
        if (isBoss) {
            // boss in the farthest area
            var far = 0, fi = 0;
            for (k = 0; k < World.n; k++) if (World.dist[k] > far && !BLOCK_MOVE[World.tiles[k]]) { far = World.dist[k]; fi = k; }
            var bxy = tileXY(fi);
            var bd = BOSSES[O.boss];
            var b = spawnActor(bxy[0], bxy[1], 1, bd, { boss: true, hpMul: G.diff.hp, armor: 0, angle: PI });
            b.bossWaveDone = 0; b.guard = true;
            G.boss = b; placed.push(bxy);
            for (k = 0; k < S.n; k++) {
                var e1 = mix[k % mix.length], ti2 = k < 4 ? World.randomNear(Math.floor(bxy[0] / TILE), Math.floor(bxy[1] / TILE), 7, 2) : -1, xy2;
                if (ti2 >= 0 && World.dist[ti2] > 12) { xy2 = tileXY(ti2); placed.push(xy2); } else xy2 = place(13, 600);
                if (xy2) spawnActor(xy2[0], xy2[1], 1, ENEMIES[e1], { hpMul: G.stageHp, guard: rnd() < 0.4 });
            }
        } else {
            // squads of 2-4 in separate pockets of the map, far enough from the start
            var maxD = 0;
            for (k = 0; k < World.n; k++) if (World.dist[k] > maxD) maxD = World.dist[k];
            var minD = Math.max(14, Math.round(maxD * 0.3)), centers = [], made = 0, guardN = 0;
            for (var sq = 0; made < S.n && sq < 60; sq++) {
                var cxy = null;
                for (var q2 = 0; q2 < 400 && !cxy; q2++) {
                    var ci = World.ri(0, World.n - 1);
                    if (World.dist[ci] < minD || BLOCK_MOVE[World.tiles[ci]]) continue;
                    var cand = tileXY(ci), far = true;
                    for (var z2 = 0; z2 < centers.length; z2++) if (dist(cand[0], cand[1], centers[z2][0], centers[z2][1]) < (q2 < 250 ? 300 : 180)) { far = false; break; }
                    if (far) cxy = cand;
                }
                if (!cxy) break;
                centers.push(cxy);
                var size = Math.min(S.n - made, World.ri(2, 4));
                for (var m2 = 0; m2 < size; m2++) {
                    var et = mix[(made * 7 + 3) % mix.length], mi = m2 === 0 ? tileOf(cxy[0], cxy[1]) : World.randomNear(Math.floor(cxy[0] / TILE), Math.floor(cxy[1] / TILE), 3, 1);
                    if (mi < 0 || World.dist[mi] < minD - 4) continue;
                    var mxy = tileXY(mi);
                    var e2 = spawnActor(mxy[0] + rr(-6, 6), mxy[1] + rr(-6, 6), 1, ENEMIES[et], { hpMul: G.stageHp, guard: et === 'marksman' || (m2 === 0 && rnd() < 0.5) });
                    if (e2) { e2.homeX = cxy[0]; e2.homeY = cxy[1]; made++; placed.push(mxy); }
                }
            }
            for (k = made; k < S.n; k++) {          // anything left: anywhere far enough
                var xy3 = place(minD, 600);
                if (xy3) spawnActor(xy3[0], xy3[1], 1, ENEMIES[mix[k % mix.length]], { hpMul: G.stageHp, guard: rnd() < 0.35 });
            }
        }
        // supplies inside buildings and along the way
        var nm = isBoss ? 4 : 3;
        for (k = 0; k < nm + 3; k++) {
            var xy4 = place(6, 300);
            if (xy4) spawnPickup(k < nm ? (k % 2 ? 'ammo' : 'med') : (k === nm ? 'armor' : 'ammo'), '', k === nm ? 50 : 1, xy4[0], xy4[1], 0, 0).t = 30;
        }
        countEnemies();
        G.camX = p.x; G.camY = p.y; G.zoom = G.zoomT = 1.12;
        G.state = 'play'; G.frame = 0; G.lastSpot = -999;
        World.computeVis(p.x, p.y, 17, smokeBlocks);
        SFX.setMix(isBoss ? 'calm' : 'calm');
    };

    G.startBR = function (bots, attract) {
        resetPools();
        G.mode = attract ? 'attract' : 'br';
        var size = attract ? 46 : 72;
        G.stageHp = 1; G.stageDmg = 1; G.stageReact = 0;
        World.generate({ w: size, h: size, theme: attract ? 'docks' : 'island', seed: (Date.now() % 100000) + 7, spawnX: size >> 1, spawnY: size >> 1, buildings: attract ? 7 : 16 });
        Render.buildFloor();
        var names = ['Raven', 'Kodiak', 'Mako', 'Ghost', 'Talon', 'Nova', 'Ember', 'Orca', 'Lynx', 'Saber', 'Vandal', 'Jinx', 'Rook', 'Zephyr', 'Onyx', 'Blaze', 'Wraith', 'Cobra', 'Atlas', 'Frost', 'Hex', 'Drift', 'Brick'];
        var sprites = ['manBlue', 'manBrown', 'manOld', 'soldier1', 'womanGreen', 'hitman1', 'robot1'];
        var total = (attract ? Math.min(bots, 7) : bots) + (attract ? 0 : 1), spots = [], k, q;
        for (k = 0; k < total; k++) {
            for (q = 0; q < 500; q++) {
                var ti = World.ri(0, World.n - 1);
                if (World.dist[ti] < 0 || BLOCK_MOVE[World.tiles[ti]]) continue;
                var xy = tileXY(ti), ok = true;
                for (var z = 0; z < spots.length; z++) if (dist(spots[z][0], spots[z][1], xy[0], xy[1]) < (attract ? 260 : 520)) { ok = false; break; }
                if (ok || q > 400) { spots.push(xy); break; }
            }
        }
        for (k = 0; k < spots.length; k++) {
            var isP = !attract && k === 0;
            var def = isP ? { sprite: 'survivor1', hp: 100, speed: 2.35, wpn: 'p9', tint: P_TINT[0] } : { sprite: sprites[k % sprites.length], hp: 100, speed: 1.95, wpn: 'p9', acc: 1.35, react: 34, role: 'rifleman', burst: [3, 6], name: names[k % names.length] };
            var a = spawnActor(spots[k][0], spots[k][1], k + 2, def, { player: isP, armor: 0 });
            if (!a) continue;
            a.name = isP ? '' : names[k % names.length];
            if (isP) { G.player = G.players[0] = a; a.team = 0; }
        }
        // loot: weapons by rarity, ammo, medkits, armor, grenades
        var nW = attract ? 24 : 70;
        for (k = 0; k < nW * 2.2; k++) {
            var t2 = World.ri(0, World.n - 1);
            if (World.dist[t2] < 0 || BLOCK_MOVE[World.tiles[t2]]) continue;
            var p2 = tileXY(t2), r = rnd();
            if (k < nW) {
                var tier = r < 0.6 ? 1 : r < 0.9 ? 2 : 3, opts = [];
                for (q = 0; q < WEAPON_LIST.length; q++) if (WEAPONS[WEAPON_LIST[q]].tier === tier && WEAPON_LIST[q] !== 'p9') opts.push(WEAPON_LIST[q]);
                spawnPickup('w', opts[(rnd() * opts.length) | 0], 0, p2[0], p2[1], 0, 0).t = 30;
            } else if (r < 0.45) spawnPickup('ammo', '', 1, p2[0], p2[1], 0, 0).t = 30;
            else if (r < 0.7) spawnPickup('med', '', 1, p2[0], p2[1], 0, 0).t = 30;
            else if (r < 0.85) spawnPickup('armor', '', 50, p2[0], p2[1], 0, 0).t = 30;
            else spawnPickup('nade', '', (rnd() * 4) | 0, p2[0], p2[1], 0, 0).t = 30;
        }
        var S2 = size * TILE;
        G.zone = { size: S2, cx: S2 / 2, cy: S2 / 2, r: S2 * BR_RADII[0], nr: S2 * BR_RADII[1], ncx: 0, ncy: 0, phase: 0, t: (attract ? 20 : 60) * 60, shrink: false, dur: 1, r0: 0, cx0: 0, cy0: 0, dps: 1, wait: 0 };
        zonePick(G.zone.nr);
        G.alive = 0; for (k = 0; k < MAX_ACTORS; k++) if (G.actors[k].on) G.alive++;
        G.total = G.alive; G.place = 0;
        var c = G.player || G.actors[0];
        G.camX = c.x; G.camY = c.y; G.zoom = G.zoomT = attract ? 0.85 : 0.92;
        G.state = 'play'; G.frame = 0; G.followId = 0;
        if (attract) World.revealAll(); else World.computeVis(c.x, c.y, 17, smokeBlocks);
        SFX.setMix(attract ? 'menu' : 'calm');
    };

    /* ---------------- main update ---------------- */

    function addShake(v) { if (UI.settings.shake) G.shake = Math.min(16, Math.max(G.shake, v)); }
    G.addShake = addShake;

    G.update = function () {
        if (G.state === 'idle' || G.state === 'tactical') return;
        if (G.slowmo > 0) { G.slowmo--; if (G.slowmo % 3 !== 0) return; }
        G.frame++; G.time++;
        G.pathBudget = 4;
        SFX.tick();
        var k, a;
        if (G.state === 'play' || G.state === 'dead' || G.state === 'won') {
            for (k = 0; k < MAX_ACTORS; k++) {
                a = G.actors[k];
                if (!a.on) continue;
                if (a.hitFlash > 0 && !a.isPlayer) a.hitFlash--;
                if (a.muzzleT > 0) a.muzzleT--;
                if (a.isPlayer) updatePlayer(a);
                else {
                    if (a.revealT > 0) a.revealT--;
                    if (a.nadeAnim > 0) a.nadeAnim--;
                    updateAI(a);
                    if (G.mode === 'story' && a.reloadT > 0 && --a.reloadT <= 0) finishReload(a);
                    if (a.burstLeft > 0 && G.mode === 'story' && --a.burstT <= 0) { var w1 = wpn(a); a.burstLeft--; a.burstT = w1.burstGap; if (a.mag[a.cur] > 0) { a.mag[a.cur]--; shoot(a, w1); } }
                    if (a.recoil > 0) a.recoil = Math.max(0, a.recoil - 0.004);
                }
                moveActor(a);
            }
            separate();
        }
        for (k = 0; k < 2; k++) {
            var dp = G.players[k];
            if (!dp || dp.on || dp.respawnT <= 0 || G.state !== 'play') continue;
            if (--dp.respawnT === 0) respawn(dp);
            else if (dp.respawnT % 60 === 0) UI.hud.dirty = true;
        }
        updateBullets(); updateNades(); updateBarrels(); updateZones();
        if (G.zone) updateZone();
        // particles
        for (k = 0; k < MAX_PARTS; k++) {
            var p = G.parts[k];
            if (!p.on) continue;
            if (--p.life <= 0) {
                if (p.k === P_BLOOD && rnd() < 0.35) Render.decal('drop', p.x, p.y, p.rot, p.size * 0.6, 0.8);
                if (p.k === P_SHELL) Render.decal('shell', p.x, p.y, p.rot, 1, 0.9);
                p.on = false; continue;
            }
            p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag; p.size += p.grow; p.rot += p.vr;
            if (p.k === P_SHELL) { p.vz -= 0.25; p.z += p.vz; if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.4; p.vr *= 0.6; if (p.vz > 0.6) SFX.play('casing', 0.12, rr(1.6, 2.2), p.x, p.y); } }
        }
        // corpses slide, spin and settle, then are baked into the floor
        for (k = 0; k < MAX_CORPSES; k++) {
            var c = G.corpses[k];
            if (!c.on) continue;
            c.t++;
            var nx = c.x + c.vx, ny = c.y + c.vy;
            if (BLOCK_MOVE[World.tileAt(nx, c.y)] && World.tileAt(nx, c.y) !== T_WATER) { c.vx = -c.vx * 0.3; nx = c.x; }
            if (BLOCK_MOVE[World.tileAt(c.x, ny)] && World.tileAt(c.x, ny) !== T_WATER) { c.vy = -c.vy * 0.3; ny = c.y; }
            c.x = nx; c.y = ny; c.vx *= 0.88; c.vy *= 0.88; c.ang += c.va; c.va *= 0.88;
            if (c.t > 12 && c.pool < 1) c.pool = Math.min(1, c.pool + 0.012);
            if (c.t > 150 && Math.abs(c.vx) + Math.abs(c.vy) < 0.05) { Render.bakeCorpse(c); c.on = false; }
        }
        for (k = 0; k < MAX_PICKUPS; k++) {
            var pk = G.pickups[k];
            if (!pk.on) continue;
            pk.t++;
            if (pk.vx || pk.vy) {
                var px2 = pk.x + pk.vx, py2 = pk.y + pk.vy;
                if (BLOCK_MOVE[World.tileAt(px2, pk.y)]) pk.vx = -pk.vx * 0.4; else pk.x = px2;
                if (BLOCK_MOVE[World.tileAt(pk.x, py2)]) pk.vy = -pk.vy * 0.4; else pk.y = py2;
                pk.vx *= 0.9; pk.vy *= 0.9;
                if (Math.abs(pk.vx) + Math.abs(pk.vy) < 0.05) pk.vx = pk.vy = 0;
            }
        }
        // camera
        var ft = G.player && G.player.on ? G.player : null, p2 = G.players[1] && G.players[1].on ? G.players[1] : null;
        if (!ft && p2) { ft = p2; p2 = null; }
        if (!ft && (G.mode === 'attract' || G.mode === 'br')) {
            var f0 = G.actors[G.followId];
            if (!f0 || !f0.on) { for (k = 0; k < MAX_ACTORS; k++) if (G.actors[k].on) { G.followId = k; break; } }
            ft = G.actors[G.followId].on ? G.actors[G.followId] : null;
        }
        if (ft) {
            var leadX = 0, leadY = 0;
            if (p2) {
                // co-op: frame both players, zooming out as they spread apart
                var mx2 = (ft.x + p2.x) / 2, my2 = (ft.y + p2.y) / 2;
                G.camX += (mx2 - G.camX) * 0.08; G.camY += (my2 - G.camY) * 0.08;
                var fitX = 960 / (Math.abs(ft.x - p2.x) + 220), fitY = 540 / (Math.abs(ft.y - p2.y) + 160);
                G.zoomT = Math.max(0.72, Math.min(1.05, fitX, fitY));
                SFX.listener.x = mx2; SFX.listener.y = my2;
            } else {
                if (ft.isPlayer && (ft.tA || ft.tB >= 0)) { leadX = (ft.tX - ft.x) * 0.3; leadY = (ft.tY - ft.y) * 0.3; }
                else { leadX = ft.vx * 18; leadY = ft.vy * 18; }
                G.camX += (ft.x + leadX - G.camX) * 0.08; G.camY += (ft.y + leadY - G.camY) * 0.08;
                var wd = ft.isPlayer ? wpn(ft) : null;
                G.zoomT = wd && wd.scope && ft.still > 20 ? 0.8 : (G.mode === 'story' ? 1.12 : G.mode === 'attract' ? 0.85 : 0.92);
                SFX.listener.x = ft.x; SFX.listener.y = ft.y;
            }
        }
        G.zoom += (G.zoomT - G.zoom) * 0.05;
        if (G.shake > 0) G.shake *= 0.86;
        if (G.shake < 0.1) G.shake = 0;
        // field of view and what the player can see
        if (G.alivePlayer() && G.mode !== 'attract' && G.frame % 4 === 0) {
            World.beginVis();
            for (var pv = 0; pv < 2; pv++) { var V = G.players[pv]; if (V && V.on) World.addVis(V.x, V.y, G.zoomT < 0.9 ? 22 : 18, smokeBlocks); }
            World.endVis();
            for (k = 0; k < MAX_ACTORS; k++) {
                a = G.actors[k];
                if (!a.on || a.isPlayer) continue;
                // same rule both ways: what can see a player can be seen by that player
                var vis = false;
                for (pv = 0; pv < 2 && !vis; pv++) {
                    var P = G.players[pv];
                    if (!P || !P.on) continue;
                    var dv = dist(a.x, a.y, P.x, P.y);
                    vis = dv < 760 && World.los(P.x, P.y, a.x, a.y, BLOCK_SIGHT) && !smokeBlocks(P.x, P.y, a.x, a.y);
                    if (vis && World.tileAt(a.x, a.y) === T_BUSH && a.revealT <= 0 && dv > 85) vis = false;
                }
                a.seenByP = vis;
                if (vis) {           // light up the fog where a visible enemy stands
                    var vt = Math.floor(a.y / TILE) * World.w + Math.floor(a.x / TILE);
                    World.vis[vt] = World.visStamp; World.explored[vt] = 1; World.fogData.data[vt * 4 + 3] = 0;
                }
            }
        } else if (G.mode === 'attract') for (k = 0; k < MAX_ACTORS; k++) G.actors[k].seenByP = G.actors[k].on;
        // music intensity
        if (G.combatT > 0) G.combatT--;
        if (G.mode !== 'attract' && G.state === 'play') SFX.setMix(G.boss && G.boss.alerted ? 'boss' : G.combatT > 0 ? 'combat' : 'calm');
        if (G.revealLast && G.pingT > 0 && --G.pingT === 0) G.pingT = 600;
        // end conditions
        if (G.endT > 0 && --G.endT === 0) finish();
        if (G.mode === 'attract' && G.alive <= 1 && G.frame % 60 === 0) G.startBR(7, true);
    };

    function finish() {
        var won = G.state === 'won' || (G.mode === 'story' && G.state === 'play' && G.enemiesLeft === 0);
        var secs = Math.round(G.time / 60), acc = G.shots ? Math.min(1, G.hits / G.shots) : 0, score;
        if (G.mode === 'story') {
            var dm = G.diffName === 'recruit' ? 0.7 : G.diffName === 'elite' ? 1.5 : 1;
            score = won ? Math.round((G.kills * 100 + Math.max(0, 3000 - secs * 4) + Math.round(acc * 1500) + (G.isBoss ? 2500 : 0)) * dm) : 0;
        } else {
            var place = G.state === 'won' ? 1 : G.place || G.alive + 1;
            G.place = place;
            score = G.kills * 100 + (G.total - place) * 40 + (place === 1 ? 1000 : 0);
        }
        G.result = { won: won, kills: G.kills, secs: secs, acc: acc, score: score, place: G.place, total: G.total, mode: G.mode };
        G.state = 'idle';
        UI.showResult(G.result);
    }

    G.alivePlayer = function () { return !!((G.players[0] && G.players[0].on) || (G.players[1] && G.players[1].on)); };

    function warpNear(p, to) {
        var ti = World.randomNear(Math.floor(to.x / TILE), Math.floor(to.y / TILE), 2, 1);
        if (ti < 0) ti = tileOf(to.x, to.y);
        p.x = (ti % World.w) * TILE + 16; p.y = ((ti / World.w) | 0) * TILE + 16; p.vx = p.vy = 0; p.idleT = 0;
    }

    // a downed co-op player comes back next to the partner with part of their health
    function respawn(p) {
        var mate = G.players[1 - p.slot];
        if (!mate || !mate.on) return;
        var ti = World.randomNear(Math.floor(mate.x / TILE), Math.floor(mate.y / TILE), 2, 1);
        if (ti < 0) ti = tileOf(mate.x, mate.y);
        p.on = true; p.x = (ti % World.w) * TILE + 16; p.y = ((ti / World.w) | 0) * TILE + 16; p.vx = p.vy = 0;
        p.hp = 60; p.armor = 0; p.latch = true; p.tA = null; p.tB = -1; p.reloadT = 0; p.healT = 0; p.hitFlash = 0;
        for (var s2 = 0; s2 < 4; s2++) if (p.w[s2]) { var wd2 = WEAPONS[p.w[s2]]; p.mag[s2] = wd2.mag; if (p.res[s2] < 999) p.res[s2] = Math.max(p.res[s2], wd2.mag * 2); }
        UI.toast((p.slot ? 'P2' : 'P1') + ' ' + T('backOnline'), '#5cf2a0'); UI.hud.dirty = true;
    }
    return G;
})();
