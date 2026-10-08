/* Entry point: My PC lifecycle, the single fixed-step loop, input routing and saves. */
(function () {
    'use strict';
    var raf = 0, last = 0, acc = 0, STEP = 1000 / 60, info = null, stage, canvas, atlas, okGuard = 0;

    function defaults() {
        return { v: 1, prog: 0, best: [], owned: START_WEAPONS.slice(), loadout: START_WEAPONS.slice(), nades: ['frag'], settings: {},
                 stats: { kills: 0, brWins: 0, brBest: 0, brGames: 0 }, seeds: [] };
    }
    // read the profile's save and repair anything missing or invalid
    function loadSave() {
        var d = defaults(), s = MyPC.load('save', null);
        if (!s || typeof s !== 'object') return d;
        var out = d;
        out.prog = Math.max(0, Math.min(12, s.prog | 0));
        out.best = Array.isArray(s.best) ? s.best.slice(0, 12) : [];
        out.owned = Array.isArray(s.owned) ? s.owned.filter(function (w) { return WEAPONS[w]; }) : d.owned;
        START_WEAPONS.forEach(function (w) { if (out.owned.indexOf(w) < 0) out.owned.push(w); });
        // weapons earned by clearing stages are always owned (repairs older saves)
        for (var i = 0; i < out.prog; i++) { var S = CAMPAIGN[(i / 3) | 0].stages[i % 3]; if (S.unlock && out.owned.indexOf(S.unlock) < 0) out.owned.push(S.unlock); }
        out.loadout = d.loadout.slice();
        if (Array.isArray(s.loadout)) for (var c = 0; c < 4; c++) if (WEAPONS[s.loadout[c]] && WEAPONS[s.loadout[c]].cat === CATS[c] && out.owned.indexOf(s.loadout[c]) >= 0) out.loadout[c] = s.loadout[c];
        out.nades = ['frag'];
        for (i = 0; i < out.prog; i++) { var S2 = CAMPAIGN[(i / 3) | 0].stages[i % 3]; if (S2.nadeUnlock && out.nades.indexOf(S2.nadeUnlock) < 0) out.nades.push(S2.nadeUnlock); }
        out.settings = s.settings && typeof s.settings === 'object' ? s.settings : {};
        var st = s.stats || {};
        out.stats = { kills: st.kills | 0, brWins: st.brWins | 0, brBest: st.brBest | 0, brGames: st.brGames | 0 };
        return out;
    }

    function resize() {
        var w = window.innerWidth, h = window.innerHeight, sw = Math.min(w, h * 16 / 9), sh = sw * 9 / 16;
        stage.style.width = sw + 'px'; stage.style.height = sh + 'px';
        stage.style.left = ((w - sw) / 2) + 'px'; stage.style.top = ((h - sh) / 2) + 'px';
        stage.style.setProperty('--u', (sh / 100) + 'px');
        UI.u = sh / 100;
        Render.resize(sw, sh);
    }

    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        acc += Math.min(250, ts - last); last = ts;
        while (acc >= STEP) { Input.poll(); Game.update(); UI.tick(); acc -= STEP; }
        Render.draw();
        UI.updateHud();
    }
    function startLoop() { if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); } }
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    var DIRS = { left: 1, right: 1, up: 1, down: 1 };
    // every action carries the device that made it; each player only listens to their own controller
    function onInput(action, pressed, repeat, dev) {
        SFX.unlock();
        if (!repeat) Input.set(dev, action, pressed);
        if (UI.listening) { UI.listenAction(dev, action, pressed); return; }   // "press a button for Fire"
        if (!pressed) return;
        var isOk = action === 'confirm' || action === 'jump';
        if (UI.capturing) {                                  // "press OK / A on the controller for player N"
            if (isOk && !repeat && performance.now() > okGuard) { okGuard = performance.now() + 250; UI.captured(dev); }
            else if (action === 'cancel' && dev === Input.p1) UI.cancelCapture();
            return;
        }
        if (UI.screen === 'splash') {                        // the first controller to press OK / A is player 1
            if (isOk && !repeat) { okGuard = performance.now() + 250; UI.claimP1(dev); }
            return;
        }
        if (UI.inMenu()) {
            if (dev !== UI.menuDev() || performance.now() < UI.guardUntil) return;
            if (DIRS[action]) UI.nav(action);
            else if (action === 'confirm' && !repeat && performance.now() > okGuard) UI.ok();
            else if (action === 'cancel' && !repeat) UI.back();
            return;
        }
        if (repeat || Game.state !== 'play') return;
        var slot = Input.slotOf(dev);
        if (slot < 0) return;
        if (action === 'confirm') return;                    // OK / A always send confirm + jump: play uses jump only
        runCmd(slot, Input.cmdFor(slot, action));
    }
    // a command button was pressed (an SDK action above, or a gamepad button read by Input.poll)
    function runCmd(slot, cmd) {
        if (!cmd || UI.inMenu() || Game.state !== 'play') return;
        var p = Game.players[slot];
        if (!p || !p.on) return;
        if (cmd === 'fire') {
            if (!p.latch && Input.mapOf(slot).tac === 'auto' && Game.okWantsTactical(p)) { okGuard = performance.now() + 180; UI.openTactical(slot); }
        } else if (cmd === 'tac') { okGuard = performance.now() + 180; UI.openTactical(slot); }
        else if (cmd === 'swap') Game.cycleWeapon(p);
        else if (cmd === 'nade') Game.playerNade(undefined, p);
    }
    Input.onPress = runCmd;

    MyPC.init({
        onInit: function (inf) {
            info = inf;
            L = I18N[info.lang] || I18N.en;
            stage = document.getElementById('stage'); canvas = document.getElementById('c');
            if (info.rtl) stage.setAttribute('dir', 'rtl');
            document.getElementById('rl-txt').textContent = T('reloading');
            document.getElementById('p-title').textContent = T('paused');
            document.getElementById('p-sub').textContent = T('pressEsc');
            Game.lowFx = info.quality && info.quality.tier === 'low';
            MyPC.progress(0.1);
            atlas = new Image();
            atlas.onload = function () {
                MyPC.progress(0.8);
                Render.init(canvas, atlas, (info.quality && info.quality.tier) || 'high');
                resize(); window.addEventListener('resize', resize);
                UI.init(info, loadSave());
                SFX.setMusic(UI.settings.music);
                MyPC.progress(1);
                MyPC.ready();
            };
            atlas.onerror = function () { MyPC.fail('Could not load graphics'); };
            atlas.src = 'assets/atlas.png?v=1.2.0';
        },
        onStart: function () {
            SFX.start(info.volume);
            Game.startBR(7, true);
            UI.splash();
            startLoop();
        },
        onPause: function () {
            stopLoop(); SFX.suspend(); Input.clear(); UI.cancelListen();
            if (info.standalone) document.getElementById('paused').style.display = 'flex';
        },
        onResume: function () {
            document.getElementById('paused').style.display = 'none';
            SFX.resume(); startLoop();
        },
        onDestroy: function () {
            stopLoop(); SFX.close();
            window.removeEventListener('resize', resize);
        },
        onInput: onInput,
        onMenu: function (id) {
            if (id === 'tactical') { if (!UI.inMenu() && Game.state === 'play') { okGuard = performance.now() + 180; UI.openTactical(Game.players[0] && Game.players[0].on ? 0 : 1); } }
            else if (id === 'controller') UI.changeController();
            else if (id === 'restart') { UI.closeAll(); UI.restart(); }
            else if (id === 'menu') UI.quitToMenu();
        },
        onVolume: function (v) { info.volume = v; SFX.setVolume(v); }
    });
})();
