/* Game data: weapons, grenades, enemies, bosses, map themes and the campaign. Times are in frames (60 per second),
 * distances in world pixels (one tile = 32). */
var CATS = ['pistol', 'shotgun', 'rifle', 'sniper'];

// dmg per bullet (per pellet), rate = frames between shots, spread in radians, speed px/frame, range = full damage distance
var WEAPONS = {
    p9:        { cat: 'pistol',  tier: 1, name: 'P9 Compact',     dmg: 24, rate: 11, mag: 15, reserve: 999, reload: 66,  spread: 0.045, recoil: 0.012, recoilMax: 0.08, speed: 24, range: 430, knock: 1.2, noise: 420, snd: 'pistol', pitch: 1.08, pose: 'gun' },
    viper:     { cat: 'pistol',  tier: 2, name: 'Viper .45 SD',   dmg: 30, rate: 15, mag: 10, reserve: 999, reload: 76,  spread: 0.035, recoil: 0.010, recoilMax: 0.07, speed: 23, range: 420, knock: 1.4, noise: 110, snd: 'pistol', pitch: 1.5, vol: 0.35, lp: 1400, pose: 'silencer' },
    vex:       { cat: 'pistol',  tier: 2, name: 'Vex MP',         dmg: 15, rate: 5,  mag: 22, reserve: 999, reload: 80,  spread: 0.09,  recoil: 0.010, recoilMax: 0.16, speed: 23, range: 330, knock: 0.8, noise: 420, snd: 'pistol', pitch: 1.25, auto: true, pose: 'gun' },
    bastion:   { cat: 'pistol',  tier: 3, name: 'Bastion .50',    dmg: 62, rate: 30, mag: 7,  reserve: 999, reload: 92,  spread: 0.028, recoil: 0.05,  recoilMax: 0.10, speed: 27, range: 520, knock: 4.0, noise: 560, snd: 'pistol', pitch: 0.72, vol: 1.1, pose: 'gun', pen: 1 },
    breacher:  { cat: 'shotgun', tier: 1, name: 'Breacher 12',    dmg: 14, pellets: 8,  rate: 48, mag: 6, reserve: 36, reload: 26, shells: true, spread: 0.2,  recoil: 0, recoilMax: 0, speed: 21, range: 230, knock: 1.6, noise: 560, snd: 'shotgun', pitch: 1.0, pose: 'machine', pump: true },
    tempest:   { cat: 'shotgun', tier: 2, name: 'Tempest Auto-12', dmg: 11, pellets: 7, rate: 17, mag: 8, reserve: 40, reload: 115, spread: 0.24, recoil: 0.03, recoilMax: 0.1, speed: 21, range: 220, knock: 1.3, noise: 560, snd: 'shotgun', pitch: 1.12, auto: true, pose: 'machine' },
    twinox:    { cat: 'shotgun', tier: 3, name: 'Twin-Ox',        dmg: 16, pellets: 11, rate: 13, mag: 2, reserve: 30, reload: 82, spread: 0.3,  recoil: 0, recoilMax: 0, speed: 20, range: 190, knock: 2.2, noise: 600, snd: 'shotgun', pitch: 0.85, vol: 1.15, pose: 'machine' },
    falcon:    { cat: 'rifle',   tier: 1, name: 'Falcon AR',      dmg: 21, rate: 6,  mag: 30, reserve: 180, reload: 110, spread: 0.035, recoil: 0.011, recoilMax: 0.13, speed: 29, range: 640, knock: 1.0, noise: 600, snd: 'rifle', pitch: 1.05, auto: true, pose: 'machine' },
    kestrel:   { cat: 'rifle',   tier: 1, name: 'Kestrel SMG',    dmg: 15, rate: 4,  mag: 32, reserve: 224, reload: 90,  spread: 0.07,  recoil: 0.008, recoilMax: 0.15, speed: 25, range: 420, knock: 0.7, noise: 380, snd: 'rifle', pitch: 1.35, vol: 0.7, auto: true, pose: 'machine' },
    ironwood:  { cat: 'rifle',   tier: 2, name: 'Ironwood BR',    dmg: 30, rate: 24, burst: 3, burstGap: 4, mag: 24, reserve: 144, reload: 115, spread: 0.022, recoil: 0.01, recoilMax: 0.05, speed: 31, range: 720, knock: 1.3, noise: 620, snd: 'rifle', pitch: 0.92, pose: 'machine' },
    anvil:     { cat: 'rifle',   tier: 3, name: 'Anvil LMG',      dmg: 24, rate: 6,  mag: 80, reserve: 240, reload: 210, spread: 0.06,  recoil: 0.006, recoilMax: 0.12, speed: 29, range: 640, knock: 1.4, noise: 700, snd: 'rifle', pitch: 0.8, vol: 1.1, auto: true, pose: 'machine', move: 0.78 },
    needle:    { cat: 'sniper',  tier: 1, name: 'Needle Bolt',    dmg: 125, rate: 68, mag: 5, reserve: 30, reload: 130, spread: 0.004, recoil: 0, recoilMax: 0, speed: 46, range: 1300, knock: 3.5, noise: 800, snd: 'sniper', pitch: 1.0, pose: 'machine', bolt: true, pen: 1, scope: true },
    longbow:   { cat: 'sniper',  tier: 2, name: 'Longbow DMR',    dmg: 64, rate: 20, mag: 10, reserve: 50, reload: 120, spread: 0.01, recoil: 0.02, recoilMax: 0.06, speed: 42, range: 1000, knock: 2.0, noise: 700, snd: 'sniper', pitch: 1.18, vol: 0.85, pose: 'machine', scope: true },
    leviathan: { cat: 'sniper',  tier: 3, name: 'Leviathan .50',  dmg: 230, rate: 92, mag: 4, reserve: 20, reload: 165, spread: 0.003, recoil: 0, recoilMax: 0, speed: 50, range: 1500, knock: 7.0, noise: 900, snd: 'sniper', pitch: 0.78, vol: 1.2, pose: 'machine', bolt: true, pen: 3, scope: true, move: 0.85 }
};
for (var wid in WEAPONS) WEAPONS[wid].id = wid;
var WEAPON_LIST = ['p9', 'viper', 'vex', 'bastion', 'breacher', 'tempest', 'twinox', 'falcon', 'kestrel', 'ironwood', 'anvil', 'needle', 'longbow', 'leviathan'];

// grenades: thrown with an arc, bounce off walls
var NADES = [
    { id: 'frag',  fuse: 140, radius: 120, dmg: 170, color: '#9fe870' },
    { id: 'flash', fuse: 90,  radius: 190, blind: 220, color: '#ffffff' },
    { id: 'smoke', fuse: 80,  radius: 96,  smokeT: 720, color: '#c8d2dc' },
    { id: 'fire',  fuse: 90,  radius: 84,  fireT: 300, dmg: 0.9, color: '#ff8a3d' }
];

// enemy types. acc = spread multiplier (lower is deadlier), react = frames before the first shot after spotting
var ENEMIES = {
    grunt:     { sprite: 'manBlue',    hp: 70,  speed: 1.65, wpn: 'p9',       acc: 1.25, react: 40, role: 'rifleman', burst: [2, 4] },
    rifleman:  { sprite: 'soldier1',   hp: 90,  speed: 1.6,  wpn: 'falcon',   acc: 1.15, react: 38, role: 'rifleman', burst: [3, 6], nade: 0.25 },
    scout:     { sprite: 'womanGreen', hp: 70,  speed: 2.15, wpn: 'kestrel',  acc: 1.3,  react: 30, role: 'flanker',  burst: [4, 8] },
    brute:     { sprite: 'manBrown',   hp: 115, speed: 1.9,  wpn: 'breacher', acc: 1.0,  react: 30, role: 'rusher',   burst: [1, 1] },
    marksman:  { sprite: 'hitman1',    hp: 70,  speed: 1.5,  wpn: 'needle',   acc: 1.0,  react: 50, role: 'sniper',   burst: [1, 1], laser: 70 },
    grenadier: { sprite: 'manOld',     hp: 100, speed: 1.55, wpn: 'ironwood', acc: 1.2,  react: 40, role: 'rifleman', burst: [1, 2], nade: 1 },
    heavy:     { sprite: 'robot1',     hp: 230, speed: 1.15, wpn: 'anvil',    acc: 1.5,  react: 44, role: 'heavy',    burst: [6, 10], armor: 0.65 }
};

// bosses: big, tinted, phases at hp thresholds spawn reinforcements
var BOSSES = {
    warden:     { name: 'The Warden',    sprite: 'manBrown',  hp: 1000, speed: 1.15, wpn: 'anvil',     acc: 1.45, react: 40, role: 'heavy',  burst: [12, 18], armor: 0.75, scale: 1.45, tint: '#ff5a3c', nade: 0.5, waves: ['grunt', 'rifleman', 'grunt'] },
    viper:      { name: 'Viper',         sprite: 'hitman1',   hp: 600,  speed: 2.2,  wpn: 'needle',    acc: 0.7,  react: 30, role: 'sniper', burst: [1, 1], laser: 52, scale: 1.3, tint: '#b04dff', smoke: true, waves: ['brute', 'scout', 'brute'] },
    juggernaut: { name: 'Juggernaut',    sprite: 'robot1',    hp: 1300, speed: 1.0,  wpn: 'twinox',    acc: 1.0,  react: 30, role: 'heavy',  burst: [1, 2], scale: 1.6, tint: '#ffb020', frontArmor: 0.45, turn: 0.022, launcher: true, waves: ['rifleman', 'grenadier', 'heavy'] },
    marshal:    { name: 'The Marshal',   sprite: 'soldier1',  hp: 1250, speed: 1.75, wpn: 'ironwood',  acc: 0.95, react: 30, role: 'rifleman', burst: [2, 3], armor: 0.9, scale: 1.4, tint: '#ff2e63', smoke: true, nade: 0.8, berserk: 'anvil', waves: ['scout', 'marksman', 'heavy', 'brute'] }
};

// map themes. floors/alt/inner are atlas tile names (t_...)
var THEMES = {
    desert:  { floors: ['s0', 's1', 's2', 's3'], alt: ['d0', 'd1'], inner: ['c0', 'c2', 'c4'], wall: '#9c7a52', wallTop: '#c9a26b', wallEdge: '#e6c48f', bg: '#3a2a1a',
               trees: 3, bushes: 6, rocks: 26, crates: 26, barrels: 10, water: 0, bushTile: 'bush', buildings: 7, step: 'gstep' },
    forest:  { floors: ['g0', 'g1', 'g2', 'g3'], alt: ['d0', 'd1'], inner: ['p0', 'p1', 'p2', 'p3'], wall: '#5a4a3a', wallTop: '#7c6650', wallEdge: '#a48a6c', bg: '#1a3020',
               trees: 34, bushes: 30, rocks: 10, crates: 14, barrels: 4, water: 2, bushTile: 'bush', buildings: 5, step: 'gstep' },
    docks:   { floors: ['c0', 'c1', 'c2', 'c3', 'c4'], alt: ['c1', 'c3'], inner: ['p0', 'p1', 'p2'], wall: '#46525e', wallTop: '#64727f', wallEdge: '#8d9cab', bg: '#1a2430',
               trees: 0, bushes: 4, rocks: 4, crates: 48, barrels: 22, water: 5, bushTile: 'bush', buildings: 6, step: 'step' },
    citadel: { floors: ['c0', 'c2', 'c3', 'c4'], alt: ['d0', 'd1'], inner: ['p0', 'p1', 'p2', 'p3'], wall: '#33363d', wallTop: '#4b5059', wallEdge: '#767d8a', bg: '#141418',
               trees: 6, bushes: 16, rocks: 10, crates: 30, barrels: 12, water: 0, bushTile: 'bush', buildings: 9, step: 'step' },
    island:  { floors: ['g0', 'g1', 'g2', 'g3'], alt: ['s0', 's2', 'd0'], inner: ['p0', 'p1', 'c0', 'c2'], wall: '#55606a', wallTop: '#727e89', wallEdge: '#9aa6b1', bg: '#16242a',
               trees: 40, bushes: 40, rocks: 30, crates: 40, barrels: 14, water: 4, bushTile: 'bush', buildings: 16, step: 'gstep' }
};

// campaign: 4 operations x 3 stages, the third stage of each has a boss. unlock = reward for clearing it.
var CAMPAIGN = [
    { name: 'Dust Veil',     theme: 'desert',  boss: 'warden',     stages: [
        { w: 46, h: 34, n: 11, mix: { grunt: 6, rifleman: 3 }, unlock: 'viper', nadeUnlock: 'smoke' },
        { w: 50, h: 36, n: 15, mix: { grunt: 5, rifleman: 4, scout: 2 }, unlock: 'kestrel' },
        { w: 48, h: 36, n: 9,  mix: { grunt: 3, rifleman: 4, brute: 1 }, unlock: 'tempest', nadeUnlock: 'flash' } ] },
    { name: 'Green Hollow',  theme: 'forest',  boss: 'viper',      stages: [
        { w: 52, h: 38, n: 17, mix: { rifleman: 4, scout: 3, brute: 2, marksman: 1 }, unlock: 'longbow' },
        { w: 54, h: 40, n: 20, mix: { rifleman: 4, scout: 3, brute: 2, marksman: 2 }, unlock: 'vex' },
        { w: 52, h: 38, n: 11, mix: { rifleman: 3, scout: 2, marksman: 1, brute: 2 }, unlock: 'ironwood', nadeUnlock: 'fire' } ] },
    { name: 'Iron Docks',    theme: 'docks',   boss: 'juggernaut', stages: [
        { w: 56, h: 40, n: 19, mix: { rifleman: 4, scout: 2, brute: 2, marksman: 1, grenadier: 2 }, unlock: 'bastion' },
        { w: 58, h: 42, n: 22, mix: { rifleman: 4, scout: 2, brute: 2, marksman: 2, grenadier: 2, heavy: 1 }, unlock: 'twinox' },
        { w: 54, h: 40, n: 13, mix: { rifleman: 3, grenadier: 2, heavy: 1, brute: 2 }, unlock: 'leviathan' } ] },
    { name: 'Black Citadel', theme: 'citadel', boss: 'marshal',    stages: [
        { w: 58, h: 42, n: 22, mix: { rifleman: 4, scout: 2, brute: 2, marksman: 2, grenadier: 2, heavy: 1 }, unlock: 'anvil' },
        { w: 60, h: 44, n: 24, mix: { rifleman: 5, scout: 3, brute: 2, marksman: 2, grenadier: 2, heavy: 1 } },
        { w: 58, h: 42, n: 16, mix: { rifleman: 3, scout: 2, marksman: 2, grenadier: 2, heavy: 2, brute: 2 } } ] }
];
var START_WEAPONS = ['p9', 'breacher', 'falcon', 'needle'];

// difficulty presets: damage dealt to the player, enemy reaction bonus (frames), enemy accuracy multiplier
var DIFFS = {
    recruit: { dmgIn: 0.45, react: 16, acc: 1.25, hp: 0.85 },
    veteran: { dmgIn: 0.7,  react: 0,  acc: 1.0,  hp: 1.0 },
    elite:   { dmgIn: 1.0,  react: -10, acc: 0.85, hp: 1.15 }
};
