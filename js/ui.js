/* Menus and HUD (DOM). Every screen is driven by arrows + OK: focus moves to the nearest item in the pressed
 * direction (so the Arabic right-to-left layout works without special cases). */
var UI = (function () {
    'use strict';
    var U = { hud: { dirty: true }, settings: { shake: true, music: true, hints: true, diff: 'veteran' }, screen: '', save: null };
    var $ = function (id) { return document.getElementById(id); };
    var focusEl = null, onBack = null, info = null, toastT = 0, smallList = [], feedList = [], frameNo = 0, lastHud = {};
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

    U.init = function (inf, save) {
        info = inf; U.save = save;
        var s = save.settings;
        U.settings.shake = s.shake !== false; U.settings.music = s.music !== false; U.settings.hints = s.hints !== false;
        U.settings.diff = DIFFS[s.diff] ? s.diff : (DIFFS[MyPC.app_config.difficulty] ? MyPC.app_config.difficulty : 'veteran');
        var maps = Array.isArray(s.maps) ? s.maps : [];
        Input.maps[0] = Input.cleanMap(maps[0]); Input.maps[1] = Input.cleanMap(maps[1]);
        applyDiff();
        $('hint').innerHTML = '<span>' + esc(T('hintMove')) + '</span><span>' + esc(T('hintFire')) + '</span><span>' + esc(T('hintTac')) + '</span><span>' + esc(T('hintBack')) + '</span>';
    };
    function applyDiff() { Game.diff = DIFFS[U.settings.diff]; Game.diffName = U.settings.diff; }
    function persist() {
        U.save.settings = { shake: U.settings.shake, music: U.settings.music, hints: U.settings.hints, diff: U.settings.diff, maps: [Input.maps[0], Input.maps[1]] };
        MyPC.save('save', U.save);
    }
    U.persist = persist;

    /* ---------------- focus and navigation ---------------- */

    function focusables() { var s = $('screen'); return s ? s.querySelectorAll('.f') : []; }
    function setFocus(el, silent) {
        if (!el) return;
        if (focusEl) focusEl.classList.remove('focus');
        focusEl = el; el.classList.add('focus');
        if (!silent) SFX.play('uiMove', 0.5);
        if (el.dataset.say) MyPC.announce(el.dataset.say);
        else MyPC.announce(el.textContent.replace(/\s+/g, ' ').trim());
        if (el.onfocusin2) el.onfocusin2();
        // keep it visible inside scrolling lists
        var p = el.closest('.scroll');
        if (p) { var r = el.getBoundingClientRect(), pr = p.getBoundingClientRect(); if (r.bottom > pr.bottom) p.scrollTop += r.bottom - pr.bottom + 8; else if (r.top < pr.top) p.scrollTop -= pr.top - r.top + 8; }
    }
    U.nav = function (dir) {
        var list = focusables();
        if (!list.length) return;
        if (!focusEl || !document.body.contains(focusEl)) { setFocus(list[0]); return; }
        var r0 = focusEl.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2, best = null, bs = 1e9;
        for (var k = 0; k < list.length; k++) {
            var el = list[k];
            if (el === focusEl) continue;
            var r = el.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2, dx = ex - cx, dy = ey - cy, main, side;
            if (dir === 'right') { if (r.left < r0.right - 4 && dx <= 4) continue; main = dx; side = Math.abs(dy); }
            else if (dir === 'left') { if (r.right > r0.left + 4 && dx >= -4) continue; main = -dx; side = Math.abs(dy); }
            else if (dir === 'down') { if (r.top < r0.bottom - 4 && dy <= 4) continue; main = dy; side = Math.abs(dx); }
            else { if (r.bottom > r0.top + 4 && dy >= -4) continue; main = -dy; side = Math.abs(dx); }
            if (main <= 0) continue;
            var sc = main + side * 2.2;
            if (sc < bs) { bs = sc; best = el; }
        }
        if (best) setFocus(best);
    };
    U.ok = function () {
        if (!focusEl) return;
        if (focusEl.classList.contains('off')) { SFX.play('uiError', 0.5); return; }
        SFX.play('uiOk', 0.6);
        var fn = focusEl.onok;
        if (fn) fn();
    };
    U.back = function () { if (onBack) { SFX.play('uiBack', 0.6); onBack(); } };
    U.inMenu = function () { return !!U.screen; };
    // only the controller in charge moves through the menus: Player 1's, or the player who opened the tactical screen
    U.menuDev = function () { return U.screen === 'tactical' || (U.screen === 'shop' && shopInGame) ? Input.devOf(U.tacSlot) : Input.p1; };

    /* ---------------- controllers ---------------- */

    // first screen: whoever presses OK / A becomes Player 1; other controllers are then ignored
    U.splash = function () {
        hudVisible(false);
        MyPC.setMenu([]);
        if (Game.mode !== 'attract' || Game.state === 'idle') Game.startBR(7, true);
        SFX.setMix('menu');
        Input.p1 = null;
        screen('splash', '<div class="logo center"><div class="emblem">' + EMBLEM + '</div><div><h1>STEEL VIGIL</h1><h2>' + esc(T('subtitle')) + '</h2></div></div>' +
            '<div class="press"><span class="key">OK</span><span class="key round">A</span><b>' + esc(T('pressStart')) + '</b></div>' +
            '<div class="foot"><span></span><span class="credits">Art: Kenney (CC0) · Sound: OpenGameArt (CC0) · Music: VividReality (CC-BY 3.0)</span></div>', null);
        MyPC.announce('Steel Vigil. ' + T('pressStart'));
    };
    U.claimP1 = function (dev) {
        Input.p1 = dev;
        if (Input.p2 === dev) Input.p2 = null;
        Game.coop = !!Input.p2;
        SFX.play('uiOk', 0.6);
        U.title();
    };

    // waiting for a button on the controller that will be Player 1 or Player 2
    U.capturing = null;
    function capture(slot) {
        U.capturing = { slot: slot, t: 600 };
        var m = document.createElement('div');
        m.className = 'modal'; m.id = 'capture';
        m.innerHTML = '<div class="panel"><div class="press"><span class="key">OK</span><span class="key round">A</span></div><b>' + esc(T('waitPress')) + ' ' +
            esc(T(slot ? 'player2' : 'player1')) + '</b><small id="cap-t">10</small></div>';
        $('screen').appendChild(m);
        MyPC.announce(T('waitPress') + ' ' + T(slot ? 'player2' : 'player1'));
    }
    function endCapture() { U.capturing = null; var m = $('capture'); if (m) m.remove(); }
    U.captured = function (dev) {
        var slot = U.capturing.slot;
        if (slot === 1 && dev === Input.p1) { SFX.play('uiError', 0.6); U.toastSmall(T('alreadyP1')); MyPC.announce(T('alreadyP1')); return; }
        endCapture();
        if (slot === 0) { if (Input.p2 === dev) Input.p2 = null; Input.p1 = dev; }
        else Input.p2 = dev;
        Game.coop = !!Input.p2;
        SFX.play('uiOk', 0.6);
        U.playersScreen(slot ? '#c-p2' : '#c-p1');
    };
    U.cancelCapture = function () { if (!U.capturing) return; endCapture(); SFX.play('uiBack', 0.5); };

    U.playersScreen = function (focusSel) {
        var p2 = Input.p2;
        screen('players', '<div class="head"><h3>' + esc(T('players')) + '</h3></div><div class="panel list ctl">' +
            '<div class="btn f set" id="c-p1"><b><i class="pdot p1"></i>' + esc(T('player1')) + '</b><span class="val">' + esc(Input.devName(Input.p1)) + '</span></div>' +
            '<div class="btn f set" id="c-p2"><b><i class="pdot p2"></i>' + esc(T('player2')) + '</b><span class="val">' + esc(p2 ? Input.devName(p2) : T('addP2')) + '</span></div>' +
            (p2 ? '<div class="btn f set" id="c-rm"><b>' + esc(T('removeP2')) + '</b><span class="val"></span></div>' : '') +
            '<div class="btn f set" id="c-m1"><b>' + esc(T('remapFor')) + ' ' + esc(T('player1')) + '</b><span class="val">›</span></div>' +
            '<div class="btn f set' + (p2 ? '' : ' off') + '" id="c-m2"><b>' + esc(T('remapFor')) + ' ' + esc(T('player2')) + '</b><span class="val">›</span></div>' +
            '<p class="note">' + esc(T('coopNote')) + '</p>' +
            '</div><div class="row"><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>', U.title, focusSel);
        bind('#c-p1', function () { capture(0); });
        bind('#c-p2', function () { capture(1); });
        bind('#c-rm', function () { Input.p2 = null; Game.coop = false; U.playersScreen('#c-p2'); });
        bind('#c-m1', function () { U.remap(0); });
        bind('#c-m2', function () { if (Input.p2) U.remap(1); });
        bind('#b-back', U.title);
    };

    U.remap = function (slot, focusSel) {
        var dev = Input.devOf(slot), m = Input.mapOf(slot), h = '<div class="head"><h3>' + esc(T('remap')) + '</h3><span class="tag"><i class="pdot p' + (slot + 1) + '"></i>' +
            esc(T(slot ? 'player2' : 'player1')) + ' · ' + esc(Input.devName(dev)) + '</span></div><div class="panel list ctl">';
        for (var k = 0; k < Input.CMDS.length; k++) {
            var c = Input.CMDS[k];
            h += '<div class="btn f set" id="r-' + c + '" data-c="' + c + '"><b>' + esc(T('cmd_' + c)) + '</b><span class="val">' + esc(Input.btnName(m[c])) + '</span></div>';
        }
        h += '<div class="btn f set" id="r-reset"><b>' + esc(T('resetDef')) + '</b><span class="val"></span></div>';
        h += '<p class="note">' + esc(T('remapNote')) + '</p>';
        if (dev === 'keys' && m.fire !== 'jump') h += '<p class="note warn">' + esc(T('remoteWarn')) + '</p>';
        h += '</div><div class="row"><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>';
        screen('remap', h, function () { U.playersScreen(slot ? '#c-m2' : '#c-m1'); }, focusSel);
        bind('.set[data-c]', function (el) { listen(slot, el.dataset.c); });
        bind('#r-reset', function () { Input.reset(slot); persist(); U.remap(slot, '#r-reset'); });
        bind('#b-back', function () { U.playersScreen(slot ? '#c-m2' : '#c-m1'); });
    };

    // waiting for the button a command goes on: any button of the player's controller except the ones
    // My PC keeps (Back on the remote, Select / Start / Home on a pad, which never reach the game) and directions
    U.listening = null;
    U.guardUntil = 0;
    function listen(slot, cmd) {
        U.listening = { slot: slot, cmd: cmd, t: 600, armed: false };
        var m = document.createElement('div');
        m.className = 'modal'; m.id = 'listen';
        m.innerHTML = '<div class="panel"><b>' + esc(T('pressFor')) + ' ' + esc(T('cmd_' + cmd)) + '</b><p class="note">' + esc(T('listenHint')) + '</p><small id="lis-t">10</small></div>';
        $('screen').appendChild(m);
        MyPC.announce(T('pressFor') + ' ' + T('cmd_' + cmd));
    }
    function endListen() { U.listening = null; U.guardUntil = performance.now() + 300; var m = $('listen'); if (m) m.remove(); }
    U.cancelListen = function () { if (U.listening) endListen(); };
    function listenGot(b) {
        var L2 = U.listening, got = Input.assign(L2.slot, L2.cmd, b);
        endListen();
        if (!got) { SFX.play('uiError', 0.6); U.toastSmall(T('fireKeeps')); MyPC.announce(T('fireKeeps')); return; }
        SFX.play('uiOk', 0.6);
        persist();
        U.remap(L2.slot, '#r-' + L2.cmd);
        MyPC.announce(T('cmd_' + L2.cmd) + ': ' + Input.btnName(got));
    }
    // an SDK action from the remote / keyboard (or from a pad the game cannot read directly)
    U.listenAction = function (dev, action, pressed) {
        var L2 = U.listening;
        if (!pressed || dev !== Input.devOf(L2.slot) || !L2.armed || Input.padReadable(dev)) return;
        var b = Input.buttonFromAction(dev, action);
        if (b) listenGot(b);
    };
    function listenTick() {
        var L2 = U.listening, dev = Input.devOf(L2.slot), raw = Input.padReadable(dev), i = raw ? Input.padPressed(dev) : -1;
        // the press that opened this window does not count: wait until everything is let go first
        if (!L2.armed) { if (i < 0 && !Input.anyButton(dev)) L2.armed = true; }
        else if (i >= 0) { listenGot('b' + i); return; }
        if (--L2.t <= 0) { endListen(); U.toastSmall(T('timeout')); SFX.play('uiBack', 0.5); }
        else if (L2.t % 60 === 0) { var lt = $('lis-t'); if (lt) lt.textContent = String(L2.t / 60); }
    }

    function screen(name, html, back, first) {
        U.screen = name; U.listening = null;
        var s = $('screen');
        s.className = 'screen s-' + name;
        s.innerHTML = html;
        s.style.display = '';
        onBack = back || null; focusEl = null;
        var f = first ? s.querySelector(first) : null;
        setFocus(f || s.querySelector('.f'), true);
    }
    function closeScreen() { U.screen = ''; U.listening = null; var s = $('screen'); s.style.display = 'none'; s.innerHTML = ''; focusEl = null; onBack = null; }
    function bind(sel, fn) { var els = $('screen').querySelectorAll(sel); for (var k = 0; k < els.length; k++) els[k].onok = fn.bind(null, els[k]); }

    /* ---------------- title ---------------- */

    U.title = function () {
        if (!Input.p1) { U.splash(); return; }
        hudVisible(false);
        MyPC.setMenu([{ id: 'controller', label: T('changeCtrl') }]);
        if (Game.mode !== 'attract') Game.startBR(7, true);
        SFX.setMix('menu');
        var sv = U.save, name = info.profile && info.profile.name ? info.profile.name : '';
        var prog = Math.min(12, sv.prog);
        screen('title',
            '<div class="logo"><div class="emblem">' + EMBLEM + '</div><div><h1>STEEL VIGIL</h1><h2>' + esc(T('subtitle')) + '</h2></div></div>' +
            '<div class="menu">' +
            '<div class="btn f big" id="m-story"><b>' + esc(T('story')) + '</b><small>' + prog + ' / 12</small></div>' +
            '<div class="btn f big" id="m-br"><b>' + esc(T('br')) + '</b><small>' + esc(T('wins')) + ' ' + sv.stats.brWins + '</small></div>' +
            '<div class="btn f" id="m-players"><b>' + esc(T('players')) + '</b><small>' + esc(Input.devName(Input.p1)) + (Input.p2 ? ' + ' + esc(T('coop')) : '') + '</small></div>' +
            '<div class="btn f" id="m-arsenal"><b>' + esc(T('arsenal')) + '</b></div>' +
            '<div class="btn f" id="m-shop"><b>' + esc(T('shop')) + '</b><small>' + sv.credits + ' ' + esc(T('cr')) + '</small></div>' +
            '<div class="btn f" id="m-settings"><b>' + esc(T('settings')) + '</b></div>' +
            '<div class="btn f" id="m-howto"><b>' + esc(T('howto')) + '</b></div>' +
            '</div>' +
            '<div class="foot">' + (name ? '<span>' + esc(T('profile')) + ': <b>' + esc(name) + '</b></span>' : '<span></span>') +
            '<span class="credits">Art: Kenney (CC0) · Sound: OpenGameArt (CC0) · Music: VividReality (CC-BY 3.0)</span></div>',
            null);
        bind('#m-story', function () { U.campaign(); });
        bind('#m-br', function () { U.brScreen(); });
        bind('#m-arsenal', function () { U.loadout(false); });
        bind('#m-shop', function () { U.shop(false); });
        bind('#m-players', function () { U.playersScreen(); });
        bind('#m-settings', function () { U.settingsScreen(); });
        bind('#m-howto', function () { U.howto(); });
        MyPC.announce('Steel Vigil. ' + T('story'));
    };

    /* ---------------- campaign ---------------- */

    U.campaign = function (focusIdx) {
        var sv = U.save, h = '<div class="head"><h3>' + esc(T('story')) + '</h3><span class="tag">' + esc(T('difficulty')) + ': ' + esc(T(U.settings.diff)) + '</span>' +
            (Input.p2 ? '<span class="tag coop"><i class="pdot p1"></i><i class="pdot p2"></i>' + esc(T('coop')) + '</span>' : '') + '</div><div class="camp"><div class="ops">';
        for (var o = 0; o < CAMPAIGN.length; o++) {
            var O = CAMPAIGN[o];
            h += '<div class="op"><div class="opname"><small>' + esc(T('operation')) + ' ' + (o + 1) + '</small><b>' + esc(O.name) + '</b></div><div class="stages">';
            for (var s = 0; s < 3; s++) {
                var idx = o * 3 + s, locked = idx > sv.prog, done = idx < sv.prog, boss = s === 2;
                h += '<div class="stage f' + (locked ? ' off' : '') + (done ? ' done' : '') + (boss ? ' boss' : '') + '" data-i="' + idx + '">' +
                    '<span class="num">' + (o + 1) + '-' + (s + 1) + '</span>' +
                    '<span class="ico">' + (locked ? LOCK : boss ? SKULL : done ? CHECK : TARGET) + '</span></div>';
                if (s < 2) h += '<i class="link' + (idx < sv.prog ? ' lit' : '') + '"></i>';
            }
            h += '</div></div>';
        }
        h += '</div><div class="panel info" id="sinfo"></div></div><div class="row"><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>';
        var first = '.stage[data-i="' + Math.min(sv.prog, 11) + '"]';
        if (focusIdx !== undefined) first = '.stage[data-i="' + focusIdx + '"]';
        screen('campaign', h, U.title, first);
        var els = $('screen').querySelectorAll('.stage');
        for (var k = 0; k < els.length; k++) {
            (function (el) {
                var i = +el.dataset.i;
                el.onfocusin2 = function () { stageInfo(i); };
                el.onok = function () { if (i <= U.save.prog) U.loadout(true, i); };
                var O = CAMPAIGN[(i / 3) | 0];
                el.dataset.say = O.name + ' ' + ((i % 3) + 1) + (i > U.save.prog ? '. ' + T('locked') : '');
            })(els[k]);
        }
        bind('#b-back', U.title);
        if (focusEl && focusEl.onfocusin2) focusEl.onfocusin2();
    };
    function stageInfo(i) {
        var o = (i / 3) | 0, s = i % 3, O = CAMPAIGN[o], S = O.stages[s], sv = U.save, boss = s === 2;
        var threat = Math.min(5, 1 + Math.floor(i / 2.4));
        var stars = ''; for (var k = 0; k < 5; k++) stars += '<i class="' + (k < threat ? 'on' : '') + '"></i>';
        var rw = S.unlock ? WEAPONS[S.unlock].name : '';
        if (S.nadeUnlock) rw += (rw ? ' + ' : '') + T(S.nadeUnlock);
        $('sinfo').innerHTML = '<div class="thumb t-' + O.theme + '"><span>' + esc(O.name.toUpperCase()) + '</span></div>' +
            '<h4>' + esc(T('operation')) + ' ' + esc(O.name) + ' · ' + esc(T('stage')) + ' ' + (s + 1) + '</h4>' +
            '<p>' + esc(L.ops[o] || I18N.en.ops[o]) + '</p>' +
            '<div class="kv"><span>' + esc(T('threat')) + '</span><span class="stars">' + stars + '</span></div>' +
            '<div class="kv"><span>' + esc(T('hostiles')) + '</span><b>' + (S.n + (boss ? 1 : 0)) + '</b></div>' +
            (boss ? '<div class="kv"><span>' + esc(T('boss')) + '</span><b class="red">' + esc(BOSSES[O.boss].name) + '</b></div>' : '') +
            (rw ? '<div class="kv"><span>' + esc(T('reward')) + '</span><b class="gold">' + esc(rw) + '</b></div>' : '') +
            (sv.best[i] ? '<div class="kv"><span>' + esc(T('score')) + '</span><b>' + sv.best[i] + '</b></div>' : '') +
            '<div class="obj">' + esc(boss ? T('objBoss') : T('objElim')) + '</div>';
    }

    /* ---------------- loadout / arsenal ---------------- */

    U.loadout = function (deploy, stageIdx) {
        var sv = U.save, h = '<div class="head"><h3>' + esc(deploy ? T('loadout') : T('arsenal')) + '</h3>' +
            (deploy ? '<span class="tag">' + esc(CAMPAIGN[(stageIdx / 3) | 0].name) + ' ' + (((stageIdx / 3) | 0) + 1) + '-' + (stageIdx % 3 + 1) + '</span>' : '') + '</div><div class="lo"><div class="cats scroll">';
        for (var c = 0; c < 4; c++) {
            h += '<div class="cat"><div class="catname">' + esc(T(CATS[c])) + '</div><div class="chips">';
            for (var k = 0; k < WEAPON_LIST.length; k++) {
                var wid = WEAPON_LIST[k], wd = WEAPONS[wid];
                if (wd.cat !== CATS[c]) continue;
                var own = sv.owned.indexOf(wid) >= 0, eq = sv.loadout[c] === wid;
                h += '<div class="chip f' + (own ? '' : ' off') + (eq ? ' eq' : '') + '" data-w="' + wid + '">' + weaponIcon(wd) + '<b>' + esc(wd.name) + '</b>' + (own ? '' : LOCK) + '</div>';
            }
            h += '</div></div>';
        }
        h += '<div class="cat"><div class="catname">' + esc(T('grenades')) + '</div><div class="chips">';
        for (var n = 0; n < NADES.length; n++) {
            var nown = sv.nades.indexOf(NADES[n].id) >= 0;
            h += '<div class="chip nade' + (nown ? ' eq' : ' off') + '"><i class="dot" style="background:' + NADES[n].color + '"></i><b>' + esc(T(NADES[n].id)) + '</b>' + (nown ? '' : LOCK) + '</div>';
        }
        h += '</div></div></div><div class="panel info" id="winfo"></div></div><div class="row">' +
            (deploy ? '<div class="btn f primary" id="b-deploy"><b>' + esc(T('deploy')) + '</b></div>' : '') +
            '<div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>';
        screen('loadout', h, deploy ? function () { U.campaign(stageIdx); } : U.title, deploy ? '#b-deploy' : '.chip.eq');
        var els = $('screen').querySelectorAll('.chip.f');
        for (var e = 0; e < els.length; e++) {
            (function (el) {
                var wid = el.dataset.w, wd = WEAPONS[wid];
                el.dataset.say = wd.name + (el.classList.contains('off') ? '. ' + T('locked') : '');
                el.onfocusin2 = function () { weaponInfo(wid); };
                el.onok = function () {
                    var c = CATS.indexOf(wd.cat);
                    U.save.loadout[c] = wid; persist();
                    var sib = el.parentNode.querySelectorAll('.chip'); for (var q = 0; q < sib.length; q++) sib[q].classList.remove('eq');
                    el.classList.add('eq'); weaponInfo(wid);
                };
            })(els[e]);
        }
        bind('#b-deploy', function () { U.deploy(stageIdx); });
        bind('#b-back', deploy ? function () { U.campaign(stageIdx); } : U.title);
        weaponInfo(sv.loadout[2]);
    };
    function bar(label, v) { return '<div class="stat"><span>' + esc(label) + '</span><i><u style="width:' + Math.round(Math.max(0.04, Math.min(1, v)) * 100) + '%"></u></i></div>'; }
    function weaponInfo(wid) {
        var wd = WEAPONS[wid], own = U.save.owned.indexOf(wid) >= 0, eq = U.save.loadout[CATS.indexOf(wd.cat)] === wid;
        var unlockAt = '';
        if (!own) for (var i = 0; i < 12; i++) if (CAMPAIGN[(i / 3) | 0].stages[i % 3].unlock === wid) unlockAt = CAMPAIGN[(i / 3) | 0].name + ' ' + ((i / 3 | 0) + 1) + '-' + (i % 3 + 1);
        $('winfo').innerHTML = '<div class="wbig">' + weaponIcon(wd, true) + '</div><h4>' + esc(wd.name) + '</h4><p>' + esc(L.cat[wd.cat] || I18N.en.cat[wd.cat]) + '</p>' +
            bar(T('damage'), Math.sqrt(wd.dmg * (wd.pellets || 1) * (wd.burst || 1) / 240)) + bar(T('rate'), 60 / wd.rate / 14) + bar(T('range'), wd.range / 1500) + bar(T('mag'), wd.mag / 80) +
            '<div class="obj">' + (own ? (eq ? '✔ ' + esc(T('equipped')) : esc(T('owned'))) : LOCK + ' ' + esc(unlockAt)) + '</div>';
    }
    function weaponIcon(wd, big) {
        var n = wd.cat === 'pistol' ? (wd.pose === 'silencer' ? 'i_weapon_silencer' : 'i_weapon_gun') : 'i_weapon_machine', f = ATLAS[n];
        var len = { pistol: 1, shotgun: 1.25, rifle: 1.45, sniper: 1.8 }[wd.cat], u = U.u || 10;
        var bw = (big ? 20 : 6) * u, bh = (big ? 8 : 3) * u, sc = Math.min(bh * 0.9 / f[3], bw / (f[2] * len));
        return '<span class="wi"><span style="width:' + f[2] + 'px;height:' + f[3] + 'px;background:url(assets/atlas.png) -' + f[0] + 'px -' + f[1] +
            'px;transform:translate(-50%,-50%) scale(' + (sc * len).toFixed(3) + ',' + sc.toFixed(3) + ')"></span></span>';
    }

    U.deploy = function (stageIdx) {
        closeScreen();
        Game.coop = !!Input.p2;
        Game.startStory((stageIdx / 3) | 0, stageIdx % 3, U.save);
        startHud();
        var O = CAMPAIGN[(stageIdx / 3) | 0];
        var title = O.name + ' ' + ((stageIdx / 3 | 0) + 1) + '-' + (stageIdx % 3 + 1);
        U.toast(title, '#ffffff', Game.isBoss ? T('objBoss') : T('objElim'));
        MyPC.announce(title + '. ' + (Game.isBoss ? T('objBoss') : T('objElim')));
        U.lastStage = stageIdx;
    };

    /* ---------------- battle royale ---------------- */

    function brBots() { var b = +MyPC.app_config.brBots; return b >= 3 && b <= 23 ? Math.round(b) : 11; }
    U.brScreen = function () {
        var st = U.save.stats;
        screen('br', '<div class="head"><h3>' + esc(T('br')) + '</h3></div><div class="panel brp"><div class="thumb t-island"><span>ISLAND OF ASHES</span></div>' +
            '<p>' + esc(T('brDesc')) + '</p>' +
            '<div class="kv"><span>' + esc(T('bots')) + '</span><b>' + brBots() + '</b></div>' +
            '<div class="kv"><span>' + esc(T('wins')) + '</span><b class="gold">' + st.brWins + '</b></div>' +
            '<div class="kv"><span>' + esc(T('bestPlace')) + '</span><b>' + (st.brBest ? '#' + st.brBest : '–') + '</b></div>' +
            (Input.p2 ? '<p class="note">' + esc(T('coopNote')) + '</p>' : '') + '</div>' +
            '<div class="row"><div class="btn f primary" id="b-deploy"><b>' + esc(T('deploy')) + '</b></div><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>', U.title);
        bind('#b-deploy', U.startBR);
        bind('#b-back', U.title);
    };
    U.startBR = function () {
        closeScreen();
        Game.coop = false;
        Game.startBR(brBots(), false);
        startHud();
        U.toast(T('br'), '#ffffff', T('alive') + ' ' + Game.alive);
        MyPC.announce(T('br'));
    };

    /* ---------------- settings / how to ---------------- */

    U.settingsScreen = function () {
        function row(id, label, val) { return '<div class="btn f set" id="' + id + '"><b>' + esc(label) + '</b><span class="val">' + esc(val) + '</span></div>'; }
        var s = U.settings;
        screen('settings', '<div class="head"><h3>' + esc(T('settings')) + '</h3></div><div class="panel list">' +
            row('s-diff', T('difficulty'), T(s.diff)) + row('s-shake', T('shake'), T(s.shake ? 'on' : 'off')) +
            row('s-music', T('music'), T(s.music ? 'on' : 'off')) + row('s-hints', T('hints'), T(s.hints ? 'on' : 'off')) +
            '</div><div class="row"><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>', U.title);
        bind('#s-diff', function (el) { var o = ['recruit', 'veteran', 'elite']; s.diff = o[(o.indexOf(s.diff) + 1) % 3]; applyDiff(); persist(); el.querySelector('.val').textContent = T(s.diff); MyPC.announce(T(s.diff)); });
        bind('#s-shake', function (el) { s.shake = !s.shake; persist(); el.querySelector('.val').textContent = T(s.shake ? 'on' : 'off'); });
        bind('#s-music', function (el) { s.music = !s.music; SFX.setMusic(s.music); persist(); el.querySelector('.val').textContent = T(s.music ? 'on' : 'off'); });
        bind('#s-hints', function (el) { s.hints = !s.hints; persist(); el.querySelector('.val').textContent = T(s.hints ? 'on' : 'off'); });
        bind('#b-back', U.title);
    };
    U.howto = function () {
        var h = '<div class="head"><h3>' + esc(T('howto')) + '</h3></div><div class="panel list how scroll">';
        var lines = L.how || I18N.en.how;
        for (var k = 0; k < lines.length; k++) h += '<div class="hrow"><kbd>' + esc(lines[k][0]) + '</kbd><span>' + esc(lines[k][1]) + '</span></div>';
        h += '</div><div class="row"><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>';
        screen('howto', h, U.title);
        bind('#b-back', U.title);
        MyPC.announce(lines.map(function (l) { return l[0] + ': ' + l[1]; }).join('. '));
    };

    /* ---------------- in game: tactical screen ---------------- */

    U.tacSlot = 0;
    U.openTactical = function (slot) {
        slot = slot || 0;
        var p = Game.players[slot];
        if (Game.state !== 'play' || !p || !p.on) return;
        U.tacSlot = slot;
        Game.state = 'tactical';
        hudVisible(false);
        SFX.play('uiOpen', 0.6);
        var h = '<div class="tac"><div class="tleft"><div class="head"><h3>' + esc(T('tactical')) + '</h3>' +
            (Game.coop ? '<span class="tag"><i class="pdot p' + (slot + 1) + '"></i>' + esc(T(slot ? 'player2' : 'player1')) + '</span>' : '') + '</div><div class="slots">';
        for (var s = 0; s < 4; s++) {
            var wid = p.w[s], wd = wid ? WEAPONS[wid] : null;
            h += '<div class="slot f' + (wd ? '' : ' off') + (s === p.cur ? ' eq' : '') + '" data-s="' + s + '"><small>' + esc(T(CATS[s])) + '</small>' +
                (wd ? weaponIcon(wd) + '<b>' + esc(wd.name) + '</b><span class="am">' + p.mag[s] + ' / ' + (p.res[s] >= 999 ? '∞' : p.res[s]) + '</span>' : '<b class="dim">' + esc(T('empty')) + '</b>') + '</div>';
        }
        h += '</div><div class="slots small">';
        for (var n = 0; n < 4; n++) {
            h += '<div class="slot nade f' + (p.nades[n] > 0 ? '' : ' off') + '" data-n="' + n + '"><i class="dot" style="background:' + NADES[n].color + '"></i><b>' + esc(T(NADES[n].id)) + '</b><span class="am">× ' + p.nades[n] + '</span></div>';
        }
        h += '<div class="slot med f' + (p.medkits > 0 && p.hp < p.maxHp ? '' : ' off') + '" id="t-med"><i class="cross"></i><b>' + esc(T('medkit')) + '</b><span class="am">× ' + p.medkits + '</span></div>';
        h += '</div><div class="row"><div class="btn f primary" id="t-resume"><b>' + esc(T('resume')) + '</b></div>' +
            '<div class="btn f" id="t-shop"><b>' + esc(T('shop')) + '</b><small>' + U.save.credits + ' ' + esc(T('cr')) + '</small></div></div></div>' +
            '<div class="tright panel"><div class="maphead"><b>' + esc(T('map')) + '</b>' + mapLegend() + '</div><canvas id="tmap" width="760" height="560"></canvas></div></div>';
        screen('tactical', h, U.closeTactical, '.slot.eq');
        bind('.slot[data-s]', function (el) { Game.selectSlot(+el.dataset.s, p); U.closeTactical(); });
        bind('.slot[data-n]', function (el) { Game.playerNade(+el.dataset.n, p); U.closeTactical(); });
        bind('#t-med', function () { Game.useMedkit(p); U.closeTactical(); });
        bind('#t-resume', U.closeTactical);
        bind('#t-shop', function () { U.shop(true); });
        var mc = $('tmap');
        Render.drawMap(mc.getContext('2d'), mc.width, mc.height, true);
        MyPC.announce(T('tactical'));
    };
    /* ---------------- shop: credits earned in play buy medkits ---------------- */

    var shopInGame = false;
    U.addCredits = function (n) { U.save.credits = Math.min(999999, U.save.credits + n); U.runCredits += n; };
    U.runCredits = 0;
    // in play (from the Tactical screen) a medkit goes straight to that player's kit; from the main menu it goes
    // to the reserve, and each player takes from the reserve at the start of the next mission
    U.shop = function (inGame, focusSel) {
        shopInGame = inGame;
        var sv = U.save, p = inGame ? Game.players[U.tacSlot] : null;
        var have = inGame ? p.medkits : sv.kits, max = inGame ? MAX_CARRY : MAX_KITS;
        var can = sv.credits >= MEDKIT_COST && have < max;
        screen('shop', '<div class="head"><h3>' + esc(T('shop')) + '</h3><span class="tag">' + sv.credits + ' ' + esc(T('cr')) + '</span></div>' +
            '<div class="panel list ctl">' +
            '<div class="btn f set' + (can ? '' : ' off') + '" id="sh-med"><b><i class="cross"></i> ' + esc(T('buyMedkit')) + '</b><span class="val">' + MEDKIT_COST + ' ' + esc(T('cr')) + '</span></div>' +
            '<p class="note">' + esc(T(inGame ? 'shopCarry' : 'shopReserve')) + ': <b>' + have + ' / ' + max + '</b></p>' +
            '<p class="note">' + esc(T('shopEarn')) + '</p>' +
            '</div><div class="row"><div class="btn f" id="b-back"><b>' + esc(T('back')) + '</b></div></div>', shopBack, focusSel);
        bind('#sh-med', function () {
            if (sv.credits < MEDKIT_COST) { U.toastSmall(T('noCredits')); MyPC.announce(T('noCredits')); return; }
            if (inGame) p.medkits++; else sv.kits++;
            sv.credits -= MEDKIT_COST;
            persist(); U.hud.dirty = true;
            MyPC.announce(T('medkit') + ' ' + (have + 1) + ' / ' + max);
            U.shop(inGame, '#sh-med');
        });
        bind('#b-back', shopBack);
    };
    function shopBack() {
        if (!shopInGame) { U.title(); return; }
        if (Game.state === 'tactical') Game.state = 'play';
        U.openTactical(U.tacSlot);
    }

    function mapLegend() {
        return '<span class="lg"><i style="background:#4aa8ff"></i>YOU</span><span class="lg"><i style="background:#ff4b4b"></i>' + esc(T('hostiles')) + '</span>' +
            '<span class="lg"><i style="background:#ffd34d"></i>' + esc(T('arsenal')) + '</span><span class="lg"><i style="background:#ff5a6a"></i>' + esc(T('medkit')) + '</span>';
    }
    U.closeTactical = function () {
        closeScreen();
        SFX.play('uiClose', 0.5);
        if (Game.state === 'tactical') { Game.state = 'play'; var tp = Game.players[U.tacSlot]; if (tp) tp.latch = true; }
        if (Game.state === 'play') hudVisible(true);
        U.hud.dirty = true;
    };

    /* ---------------- results ---------------- */

    function crLine() { return '<div class="unlock">' + esc(T('crEarned')) + ': <b>+' + U.runCredits + ' ' + esc(T('cr')) + '</b> · ' + esc(T('shop')) + ': ' + U.save.credits + ' ' + esc(T('cr')) + '</div>'; }
    U.showResult = function (r) {
        hudVisible(false);
        MyPC.setMenu([]);
        var sv = U.save, h, title, unlocked = '';
        if (r.mode === 'story') {
            var idx = Game.op * 3 + Game.st, S = CAMPAIGN[Game.op].stages[Game.st];
            sv.stats.kills += r.kills;
            if (r.won) {
                if (idx >= sv.prog) {
                    sv.prog = idx + 1;
                    if (S.unlock && sv.owned.indexOf(S.unlock) < 0) { sv.owned.push(S.unlock); unlocked = WEAPONS[S.unlock].name; }
                    if (S.nadeUnlock && sv.nades.indexOf(S.nadeUnlock) < 0) { sv.nades.push(S.nadeUnlock); unlocked += (unlocked ? ' + ' : '') + T(S.nadeUnlock); }
                }
                if (r.score > (sv.best[idx] || 0)) sv.best[idx] = r.score;
                U.addCredits(CR_STAGE + (Game.isBoss ? CR_BOSS : 0));
                MyPC.submitScore(r.score);
                SFX.play('uiWin', 0.8);
            }
            persist();
            title = r.won ? T('complete') : T('failed');
            h = '<div class="res ' + (r.won ? 'win' : 'lose') + '"><h1>' + esc(title) + '</h1><h2>' + esc(CAMPAIGN[Game.op].name) + ' ' + (Game.op + 1) + '-' + (Game.st + 1) + '</h2>' +
                '<div class="grid">' + stat(T('kills'), r.kills) + stat(T('accuracy'), Math.round(r.acc * 100) + '%') + stat(T('time'), fmtTime(r.secs)) + stat(T('score'), r.score) + '</div>' +
                crLine() + (unlocked ? '<div class="unlock">' + esc(T('unlocked')) + ': <b>' + esc(unlocked) + '</b></div>' : '') +
                '<div class="row">' + (r.won ? (idx + 1 < 12 ? '<div class="btn f primary" id="r-next"><b>' + esc(T('next')) + '</b></div>' : '') : '<div class="btn f primary" id="r-retry"><b>' + esc(T('retry')) + '</b></div>') +
                (r.won ? '<div class="btn f" id="r-retry"><b>' + esc(T('retry')) + '</b></div>' : '') +
                '<div class="btn f" id="r-menu"><b>' + esc(T('menu')) + '</b></div></div></div>';
            screen('result', h, U.title);
            bind('#r-next', function () { U.loadout(true, idx + 1); });
            bind('#r-retry', function () { U.deploy(idx); });
        } else {
            sv.stats.brGames++;
            if (r.place === 1) { sv.stats.brWins++; U.addCredits(CR_BR_WIN); }
            if (!sv.stats.brBest || r.place < sv.stats.brBest) sv.stats.brBest = r.place;
            sv.stats.kills += r.kills;
            persist();
            MyPC.submitScore(r.score);
            title = r.place === 1 ? T('winner') : T('eliminated');
            h = '<div class="res ' + (r.place === 1 ? 'win' : 'lose') + '"><h1>' + esc(title) + '</h1><h2>' + esc(T('place')) + ' #' + r.place + ' / ' + r.total + '</h2>' +
                '<div class="grid">' + stat(T('kills'), r.kills) + stat(T('accuracy'), Math.round(r.acc * 100) + '%') + stat(T('time'), fmtTime(r.secs)) + stat(T('score'), r.score) + '</div>' + crLine() +
                '<div class="row"><div class="btn f primary" id="r-again"><b>' + esc(T('br')) + '</b></div><div class="btn f" id="r-menu"><b>' + esc(T('menu')) + '</b></div></div></div>';
            screen('result', h, U.title);
            bind('#r-again', U.startBR);
        }
        bind('#r-menu', U.title);
        MyPC.announce(title + '. ' + T('score') + ' ' + r.score);
    };
    function stat(l, v) { return '<div class="st"><small>' + esc(l) + '</small><b>' + esc(v) + '</b></div>'; }
    function fmtTime(s) { var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }

    /* ---------------- HUD ---------------- */

    function hudVisible(v) { $('hud').style.display = v ? '' : 'none'; }
    function startHud() {
        hudVisible(true); lastHud = {}; U.hud.dirty = true; U.runCredits = 0; $('downs').innerHTML = ''; feedList.length = 0; $('feed').innerHTML = '';
        $('hint').style.display = U.settings.hints ? '' : 'none'; $('hint').classList.remove('fade'); U.hintT = 0;
        $('boss').style.display = 'none';
        MyPC.setMenu([{ id: 'tactical', label: T('arsenalMap') }, { id: 'restart', label: Game.mode === 'br' ? T('br') : T('restart') }, { id: 'menu', label: T('menu') },
            { id: 'controller', label: T('changeCtrl') }]);
        $('p2hud').style.display = Game.players[1] ? '' : 'none';
        $('hud').classList.toggle('coop', !!Game.players[1]);
    }
    U.restart = function () {
        if (Game.mode === 'story') U.deploy(U.lastStage);
        else if (Game.mode === 'br') U.startBR();
    };
    U.quitToMenu = function () { endCapture(); closeScreen(); persist(); Game.state = 'idle'; U.title(); };
    U.changeController = function () { endCapture(); closeScreen(); Game.state = 'idle'; U.splash(); };

    function setTxt(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
    function setW(id, v) { v = Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10; if (lastHud[id] !== v) { lastHud[id] = v; $(id).style.width = v + '%'; } }

    U.tick = function () {
        frameNo++;
        if (toastT > 0 && --toastT === 0) $('toast').classList.remove('show');
        for (var k = smallList.length - 1; k >= 0; k--) if (--smallList[k].t <= 0) { smallList[k].el.remove(); smallList.splice(k, 1); }
        for (k = feedList.length - 1; k >= 0; k--) if (--feedList[k].t <= 0) { feedList[k].el.remove(); feedList.splice(k, 1); }
        if (U.hintT !== undefined && ++U.hintT === 900) $('hint').classList.add('fade');
        if (U.capturing) {
            if (--U.capturing.t <= 0) { endCapture(); U.toastSmall(T('timeout')); SFX.play('uiBack', 0.5); }
            else if (U.capturing.t % 60 === 0) { var ct = $('cap-t'); if (ct) ct.textContent = String(U.capturing.t / 60); }
        }
        if (U.listening) listenTick();
    };

    U.updateHud = function () {
        var G = Game, p = G.player;
        if (!p || U.screen === 'title' || $('hud').style.display === 'none') return;
        if (frameNo % 6 === 0) { var mc = $('mini'); Render.drawMap(mc.getContext('2d'), mc.width, mc.height, false); }
        if (!U.hud.dirty && frameNo % 15 !== 0) return;
        U.hud.dirty = false;
        setW('hpb', p.hp / p.maxHp); setW('arb', p.armor / 100);
        setTxt('hpv', String(Math.max(0, Math.ceil(p.hp)))); setTxt('arv', String(Math.ceil(p.armor)));
        setTxt('medv', '× ' + p.medkits);
        var wd = G.wpn(p);
        setTxt('wname', wd.name);
        setTxt('mag', String(p.mag[p.cur])); setTxt('res', p.res[p.cur] >= 999 ? '∞' : String(p.res[p.cur]));
        var rl = p.reloadT > 0;
        if (lastHud.rl !== rl) { lastHud.rl = rl; $('wpanel').classList.toggle('reload', rl); }
        var ns = p.nades[0] + '·' + p.nades[1] + '·' + p.nades[2] + '·' + p.nades[3];
        if (lastHud.ns !== ns) { lastHud.ns = ns; for (var n = 0; n < 4; n++) { var e = $('n' + n); e.lastChild.textContent = String(p.nades[n]); e.classList.toggle('zero', !p.nades[n]); } }
        var sl = p.cur + '|' + p.w.join(',');
        if (lastHud.sl !== sl) { lastHud.sl = sl; for (var s = 0; s < 4; s++) { var se = $('sl' + s); se.classList.toggle('on', s === p.cur); se.classList.toggle('none', !p.w[s]); } }
        if (G.mode === 'story') {
            setTxt('obj1', CAMPAIGN[G.op].name + ' ' + (G.op + 1) + '-' + (G.st + 1));
            setTxt('obj2', G.isBoss && G.boss ? T('objBoss') : T('objElim'));
            setTxt('obj3', T('hostilesLeft') + ': ' + G.enemiesLeft);
        } else {
            setTxt('obj1', T('br'));
            setTxt('obj2', T('alive') + ': ' + G.alive + '   ·   ' + T('kills') + ': ' + G.kills);
            var z = G.zone, secs = Math.max(0, Math.ceil(z.t / 60));
            setTxt('obj3', z.phase >= 5 ? '' : z.shrink ? T('zoneShrink') : T('zoneSoon') + ' ' + fmtTime(secs));
        }
        var b = G.boss && G.boss.on && G.boss.alerted ? G.boss : null;
        if (!!b !== !!lastHud.boss) { lastHud.boss = !!b; $('boss').style.display = b ? '' : 'none'; if (b) $('bossname').textContent = b.name; }
        if (b) setW('bossb', b.hp / b.maxHp);
        var low = p.on && p.hp < 30;
        if (lastHud.low !== low) { lastHud.low = low; $('hpwrap').classList.toggle('low', low); }
        var q = G.players[1];
        if (q) {
            var qs = q.on ? '' : T('backIn') + ' ' + Math.ceil(q.respawnT / 60) + ' s';
            setW('p2hp', q.on ? q.hp / q.maxHp : 0); setW('p2ar', q.on ? q.armor / 100 : 0);
            setTxt('p2w', q.on ? WEAPONS[q.w[q.cur]].name : qs);
            setTxt('p2a', q.on ? q.mag[q.cur] + ' / ' + (q.res[q.cur] >= 999 ? '∞' : q.res[q.cur]) : '');
        }
        if (!p.on && G.players[1]) setTxt('wname', T('backIn') + ' ' + Math.ceil(p.respawnT / 60) + ' s');
        // a downed co-op player sees a big countdown, whichever player it is
        var dn = '';
        for (var di = 0; di < 2; di++) {
            var dp = G.players[di];
            if (dp && !dp.on && dp.respawnT > 0) dn += '<div class="dn p' + (di + 1) + '"><b>P' + (di + 1) + ' ' + esc(T('down')) + '</b><span>' + esc(T('backIn')) + ' ' + Math.ceil(dp.respawnT / 60) + ' s</span></div>';
        }
        if (lastHud.dn !== dn) { lastHud.dn = dn; $('downs').innerHTML = dn; }
    };

    U.toast = function (text, color, sub) {
        var t = $('toast');
        t.innerHTML = '<b style="color:' + (color || '#fff') + '">' + esc(text) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '');
        t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
        toastT = 170;
    };
    U.toastSmall = function (text) {
        var box = $('toasts');
        if (smallList.length > 3) { smallList[0].el.remove(); smallList.shift(); }
        var el = document.createElement('div'); el.className = 'ts'; el.textContent = text; box.appendChild(el);
        smallList.push({ el: el, t: 120 });
    };
    U.feed = function (text) {
        var box = $('feed');
        if (feedList.length > 4) { feedList[0].el.remove(); feedList.shift(); }
        var el = document.createElement('div'); el.className = 'fd'; el.textContent = text; box.appendChild(el);
        feedList.push({ el: el, t: 300 });
    };
    U.killMark = function () { var k = $('killmark'); k.classList.remove('show'); void k.offsetWidth; k.classList.add('show'); };
    U.closeAll = closeScreen;

    var EMBLEM = '<svg viewBox="0 0 64 64"><path d="M32 3 L58 13 V31 C58 46 46 56 32 61 C18 56 6 46 6 31 V13 Z" fill="#0f1a24" stroke="#3ee6ff" stroke-width="3"/><path d="M18 26 L32 36 L46 26 M18 36 L32 46 L46 36" fill="none" stroke="#ffb648" stroke-width="4.5" stroke-linejoin="round"/><circle cx="32" cy="17" r="4" fill="#3ee6ff"/></svg>';
    var LOCK = '<svg class="ic" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/></svg>';
    var SKULL = '<svg class="ic" viewBox="0 0 24 24"><path d="M12 2C7 2 3.5 5.5 3.5 10c0 3 1.5 5 3.5 6v3h10v-3c2-1 3.5-3 3.5-6C20.5 5.5 17 2 12 2z" fill="currentColor"/><circle cx="8.5" cy="10.5" r="2.2" fill="#111"/><circle cx="15.5" cy="10.5" r="2.2" fill="#111"/><path d="M10 19v3M14 19v3" stroke="#111" stroke-width="1.6"/></svg>';
    var CHECK = '<svg class="ic" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var TARGET = '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2.2"/></svg>';
    return U;
})();
