/* Controllers. The SDK sends actions tagged with the device that made them ('keys' = TV remote / keyboard,
 * 'keys2' = second keyboard, 'pad0'..'pad3' = gamepads). Each player owns one device; input from any other
 * device is ignored, so a second controller never interferes. Commands (fire, switch weapon, grenade,
 * tactical screen) are mapped per player and per kind of controller, and are remapped by pressing a button.
 *
 * Remote / keyboard commands sit on the SDK's buttons ('jump' = OK, 'run', 'cancel'). Gamepad commands sit on
 * the pad's own buttons ('b0'..'b17', W3C standard mapping), read directly with the Gamepad API (My PC's frame
 * allows it): that gives LB, RB, LT, RT, X, Y and the stick clicks, which the SDK actions cannot tell apart.
 * Select, Start and Home (My PC's pause / home) and the D-pad (movement) can never be mapped. If the pad
 * cannot be read, its buttons fall back to the SDK actions it sends (A = jump, B = cancel, X / Y = run). */
var Input = (function () {
    'use strict';
    var held = {};                                   // device -> { action: true }
    var KEY_BUTTONS = ['jump', 'run', 'cancel'];     // OK / A, Shift / X, Cancel
    var PAD_RESERVED = { 8: 1, 9: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1 };   // Select, Start, D-pad, Home
    var PAD_MAX = 18;
    var CMDS = ['fire', 'swap', 'nade', 'tac'];
    var I = { p1: null, p2: null, maps: [null, null], CMDS: CMDS, onPress: null };

    function kind(dev) { return dev && dev.indexOf('pad') === 0 ? 'pad' : 'keys'; }
    function padBtn(b) { var m = /^b(\d+)$/.exec(b); return m && +m[1] < PAD_MAX && !PAD_RESERVED[m[1]] ? +m[1] : -1; }
    function real(k, b) { return k === 'pad' ? padBtn(b) >= 0 : KEY_BUTTONS.indexOf(b) >= 0; }
    function empty(c) { return c === 'tac' ? 'auto' : 'none'; }
    I.kind = kind;

    I.defKeys = function () { return { fire: 'jump', swap: 'run', nade: 'cancel', tac: 'auto' }; };
    I.defPad = function () { return { fire: 'b0', swap: 'b3', nade: 'b1', tac: 'auto' }; };     // A, Y, B
    I.defMap = function () { return { keys: I.defKeys(), pad: I.defPad() }; };
    I.maps[0] = I.defMap(); I.maps[1] = I.defMap();

    // keep one kind's map valid: every command on a real button (or none / auto), never two on the same button
    function cleanKind(k, m) {
        var d = k === 'pad' ? I.defPad() : I.defKeys(), out = {}, used = {}, i, c, b;
        if (!m || typeof m !== 'object') return d;
        for (i = 0; i < CMDS.length; i++) {
            c = CMDS[i]; b = m[c];
            if (!(real(k, b) ? !used[b] : c !== 'fire' && b === empty(c))) b = !used[d[c]] ? d[c] : empty(c);
            if (c === 'fire' && !real(k, b)) b = d.fire;
            if (real(k, b)) used[b] = true;
            out[c] = b;
        }
        return out;
    }
    // saves from 1.1 hold a single map for the remote / keyboard
    I.cleanMap = function (m) {
        if (m && typeof m === 'object' && !m.keys && !m.pad) m = { keys: m };
        m = m || {};
        return { keys: cleanKind('keys', m.keys), pad: cleanKind('pad', m.pad) };
    };

    I.set = function (dev, action, pressed) {
        var h = held[dev];
        if (!h) h = held[dev] = {};
        h[action] = pressed;
    };
    I.clear = function () { for (var d in held) for (var a in held[d]) held[d][a] = false; };
    I.down = function (dev, action) { var h = held[dev]; return !!(h && h[action]); };
    // any of the SDK's buttons (not directions) held on this device
    I.anyButton = function (dev) { return I.down(dev, 'jump') || I.down(dev, 'confirm') || I.down(dev, 'run') || I.down(dev, 'cancel') || I.down(dev, 'pause'); };

    /* ---------------- gamepad buttons (Gamepad API) ---------------- */

    var padList = null;
    // read once per update step
    I.poll = function () {
        try { padList = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { padList = null; }
        for (var s = 0; s < 2; s++) pollSlot(s);
    };
    function pad(dev) {
        if (!padList || kind(dev) !== 'pad') return null;
        var p = padList[+dev.slice(3)];
        return p && p.connected && p.buttons && p.buttons.length ? p : null;
    }
    I.padReadable = function (dev) { return !!pad(dev); };
    function btnDown(p, i) { var b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5); }
    // first mappable pad button held now (-1 if none)
    I.padPressed = function (dev) {
        var p = pad(dev);
        if (!p) return -1;
        for (var i = 0; i < p.buttons.length && i < PAD_MAX; i++) if (!PAD_RESERVED[i] && btnDown(p, i)) return i;
        return -1;
    };

    // a pad button the SDK reports when the pad itself cannot be read
    var PAD_FALLBACK = { b0: 'jump', b1: 'cancel', b2: 'run', b3: 'run' };
    // the SDK action that stands for this command's button on this device ('' when it is a raw pad button)
    function actionOf(slot, cmd) {
        var dev = I.devOf(slot), b = I.maps[slot][kind(dev)][cmd];
        if (kind(dev) !== 'pad') return b;
        return pad(dev) ? '' : PAD_FALLBACK[b] || '';
    }

    // raw pad buttons: one-shot commands fire on the press (edge), like the SDK actions do
    var padHeld = [{}, {}];
    function pollSlot(slot) {
        var dev = I.devOf(slot), p = pad(dev), h = padHeld[slot], m, c, k, d;
        if (!p) { for (k = 0; k < CMDS.length; k++) h[CMDS[k]] = false; return; }
        m = I.maps[slot].pad;
        for (k = 0; k < CMDS.length; k++) {
            c = CMDS[k]; d = padBtn(m[c]) >= 0 && btnDown(p, padBtn(m[c]));
            if (d && !h[c] && I.onPress) { h[c] = true; I.onPress(slot, c); }
            h[c] = d;
        }
    }

    I.devOf = function (slot) { return slot === 1 ? I.p2 : I.p1; };
    I.slotOf = function (dev) { return dev === I.p1 ? 0 : dev !== null && dev === I.p2 ? 1 : -1; };
    // the command a pressed SDK action triggers for this player ('' if none)
    I.cmdFor = function (slot, action) {
        if (action === 'confirm') action = 'jump';            // OK sends confirm + jump: count it once (jump)
        for (var k = 0; k < CMDS.length; k++) if (actionOf(slot, CMDS[k]) === action) return CMDS[k];
        return '';
    };
    I.cmdDown = function (slot, cmd) {
        var dev = I.devOf(slot);
        if (!dev) return false;
        var p = kind(dev) === 'pad' ? pad(dev) : null;
        if (p) { var i = padBtn(I.maps[slot].pad[cmd]); return i >= 0 && btnDown(p, i); }
        var b = actionOf(slot, cmd);
        if (!b || b === 'none' || b === 'auto') return false;
        return I.down(dev, b) || (b === 'jump' && I.down(dev, 'confirm'));
    };
    I.dirDown = function (slot, dir) { var dev = I.devOf(slot); return !!dev && I.down(dev, dir); };

    // the map in use for this player's current controller
    I.mapOf = function (slot) { return I.maps[slot][kind(I.devOf(slot))]; };
    // a button from the remote / keyboard (an SDK action), or from a pad that cannot be read
    I.buttonFromAction = function (dev, action) {
        if (action === 'confirm') action = 'jump';
        if (KEY_BUTTONS.indexOf(action) < 0) return '';
        if (kind(dev) !== 'pad') return action;
        return action === 'jump' ? 'b0' : action === 'cancel' ? 'b1' : 'b2';
    };

    // give a command a button; a command already on that button takes this one's old button (swap).
    // Pressing a command's own button again clears it (Fire always keeps one). Returns the new binding or ''.
    I.assign = function (slot, cmd, button) {
        var k = kind(I.devOf(slot)), m = I.maps[slot][k], old = m[cmd];
        if (!real(k, button)) return '';
        if (old === button) {
            if (cmd === 'fire') return button;
            m[cmd] = empty(cmd);
            return m[cmd];
        }
        for (var i = 0; i < CMDS.length; i++) {
            var c = CMDS[i];
            if (c === cmd || m[c] !== button) continue;
            if (c === 'fire' && !real(k, old)) return '';
            m[c] = real(k, old) ? old : empty(c);
        }
        m[cmd] = button;
        return button;
    };
    I.reset = function (slot) { var k = kind(I.devOf(slot)); I.maps[slot][k] = k === 'pad' ? I.defPad() : I.defKeys(); };

    I.devName = function (dev) {
        if (!dev) return T('notAssigned');
        if (dev === 'keys') return T('devRemote');
        if (dev === 'keys2') return T('devKeys2');
        var m = /^pad(\d)$/.exec(dev);
        return m ? T('devPad') + ' ' + (+m[1] + 1) : dev;
    };
    var PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', '', '', 'L3', 'R3'];
    I.btnName = function (b) {
        if (b === 'jump') return T('btnA');
        if (b === 'run') return T('btnRun');
        if (b === 'cancel') return T('btnCancel');
        if (b === 'auto') return T('btnAuto');
        var i = padBtn(b);
        if (i >= 0) return PAD_NAMES[i] || T('btnN') + ' ' + (i + 1);
        return '—';
    };
    return I;
})();
