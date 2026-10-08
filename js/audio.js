/* Sound: one AudioContext (created in onStart, closed in onDestroy). Effects are CC0 recordings, the music is six
 * looping layers mixed by intensity. Volumes follow info.volume (music / sfx). */
var SFX = (function () {
    'use strict';
    var ctx = null, master = null, sfxGain = null, musicGain = null, buffers = {}, vol = { music: 0.7, sfx: 0.8 };
    var musicOn = true, layers = [], layerNames = ['mPulse1', 'mNoise', 'mSaw1', 'mPulse2', 'mSaw2', 'mSaw3'];
    var voices = 0, MAX_VOICES = 28, lastPlay = {}, frameNo = 0, ready = false;
    // music intensity presets: gains per layer
    var MIX = {
        silent: [0, 0, 0, 0, 0, 0],
        menu:   [0.55, 0, 0.45, 0, 0, 0],
        calm:   [0.5, 0.35, 0, 0, 0, 0],
        combat: [0.6, 0.5, 0.35, 0.45, 0, 0],
        boss:   [0.6, 0.55, 0.4, 0.5, 0.45, 0.4]
    };
    var mixName = 'silent';

    function b64ToBuf(b64) {
        var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
        for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
        return u.buffer;
    }

    function start(v) {
        if (ctx) return Promise.resolve();
        vol = v || vol;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return Promise.resolve();
        ctx = new AC();
        master = ctx.createGain(); master.connect(ctx.destination);
        // a gentle compressor keeps many gunshots from clipping
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
        comp.connect(master);
        sfxGain = ctx.createGain(); sfxGain.gain.value = vol.sfx; sfxGain.connect(comp);
        musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? vol.music * 0.55 : 0; musicGain.connect(master);
        var names = Object.keys(SOUNDS), jobs = [];
        names.forEach(function (n) {
            jobs.push(new Promise(function (res) {
                try {
                    ctx.decodeAudioData(b64ToBuf(SOUNDS[n]), function (b) { buffers[n] = b; res(); }, function () { res(); });
                } catch (e) { res(); }
            }));
        });
        return Promise.all(jobs).then(function () { ready = true; startMusic(); });
    }

    function startMusic() {
        if (!ctx || layers.length) return;
        var t0 = ctx.currentTime + 0.1;
        for (var i = 0; i < layerNames.length; i++) {
            var b = buffers[layerNames[i]];
            var g = ctx.createGain(); g.gain.value = 0; g.connect(musicGain);
            if (b) { var s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); s.start(t0); }
            layers.push(g);
        }
        setMix(mixName, true);
    }

    function setMix(name, force) {
        if (!MIX[name]) return;
        if (name === mixName && !force) return;
        mixName = name;
        if (!ctx || !layers.length) return;
        var m = MIX[name], t = ctx.currentTime;
        for (var i = 0; i < layers.length; i++) layers[i].gain.setTargetAtTime(m[i], t, name === 'combat' || name === 'boss' ? 0.4 : 1.2);
    }

    // play a sound; x/y in world space for distance and stereo (pass null for UI sounds)
    function play(name, volume, rate, x, y) {
        if (!ctx || !ready || ctx.state !== 'running') return;
        var b = buffers[name];
        if (!b || voices >= MAX_VOICES) return;
        if (lastPlay[name] === frameNo && name.indexOf('ui') !== 0) return;     // one per name per frame
        lastPlay[name] = frameNo;
        var v = volume === undefined ? 1 : volume, pan = 0;
        if (x !== null && x !== undefined && SFX.listener) {
            var dx = x - SFX.listener.x, dy = y - SFX.listener.y, d = Math.sqrt(dx * dx + dy * dy);
            var fall = SFX.listener.range || 900;
            if (d > fall) return;
            v *= 1 - d / fall * 0.85;
            pan = Math.max(-0.8, Math.min(0.8, dx / 500));
        }
        if (v < 0.02) return;
        var s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
        var g = ctx.createGain(); g.gain.value = v;
        var last = g;
        if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); last = p; }
        s.connect(g); last.connect(sfxGain);
        voices++;
        s.onended = function () { voices--; };
        s.start();
    }

    // filtered variant (suppressed weapons)
    function playLow(name, volume, rate, cutoff, x, y) {
        if (!ctx || !ready || ctx.state !== 'running') return;
        var b = buffers[name];
        if (!b || voices >= MAX_VOICES) return;
        var v = volume;
        if (x !== null && SFX.listener) {
            var dx = x - SFX.listener.x, dy = y - SFX.listener.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > 900) return;
            v *= 1 - d / 900 * 0.85;
        }
        var s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
        var g = ctx.createGain(); g.gain.value = v;
        s.connect(f); f.connect(g); g.connect(sfxGain);
        voices++; s.onended = function () { voices--; };
        s.start();
    }

    return {
        listener: { x: 0, y: 0, range: 900 },
        start: start,
        play: play,
        playLow: playLow,
        setMix: setMix,
        tick: function () { frameNo++; },
        setVolume: function (v) {
            vol = v;
            if (!ctx) return;
            sfxGain.gain.setTargetAtTime(v.sfx, ctx.currentTime, 0.05);
            musicGain.gain.setTargetAtTime(musicOn ? v.music * 0.55 : 0, ctx.currentTime, 0.05);
        },
        setMusic: function (on) { musicOn = on; if (ctx) musicGain.gain.setTargetAtTime(on ? vol.music * 0.55 : 0, ctx.currentTime, 0.1); },
        suspend: function () { if (ctx && ctx.state === 'running') ctx.suspend(); },
        resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); },
        close: function () { if (ctx) { try { ctx.close(); } catch (e) {} } ctx = null; layers = []; ready = false; },
        unlock: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); }
    };
})();
