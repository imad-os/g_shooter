/* Controllers. The SDK sends actions tagged with the device that made them ('keys' = TV remote / keyboard,
 * 'keys2' = second keyboard, 'pad0'..'pad3' = gamepads). Each player owns one device; input from any other
 * device is ignored, so a second controller never interferes. Commands (fire, switch weapon, grenade,
 * tactical screen) are mapped per player to the SDK's buttons and can be remapped in the menu. */
var Input = (function () {
    'use strict';
    var held = {};                                   // device -> { action: true }
    var BUTTONS = ['jump', 'run', 'cancel'];         // A / OK, B / X, Cancel
    var CMDS = ['fire', 'swap', 'nade', 'tac'];
    var I = { p1: null, p2: null, maps: [null, null], BUTTONS: BUTTONS, CMDS: CMDS };

    I.defMap = function () { return { fire: 'jump', swap: 'run', nade: 'cancel', tac: 'auto' }; };
    I.maps[0] = I.defMap(); I.maps[1] = I.defMap();

    // keep a saved map valid: every command on a known button (or none), never two on the same button
    I.cleanMap = function (m) {
        var d = I.defMap(), out = {}, used = {}, k, c, b;
        if (!m || typeof m !== 'object') return d;
        for (k = 0; k < CMDS.length; k++) {
            c = CMDS[k]; b = m[c];
            var ok = BUTTONS.indexOf(b) >= 0 ? !used[b] && !(c === 'tac' && b === 'jump') : (c === 'tac' ? b === 'auto' : c !== 'fire' && b === 'none');
            if (!ok) b = !used[d[c]] ? d[c] : (c === 'tac' ? 'auto' : 'none');
            if (c === 'fire' && BUTTONS.indexOf(b) < 0) b = BUTTONS.filter(function (x) { return !used[x]; })[0];
            if (BUTTONS.indexOf(b) >= 0) used[b] = true;
            out[c] = b;
        }
        return out;
    };

    I.set = function (dev, action, pressed) {
        var h = held[dev];
        if (!h) h = held[dev] = {};
        h[action] = pressed;
    };
    I.clear = function () { for (var d in held) for (var a in held[d]) held[d][a] = false; };
    I.down = function (dev, action) { var h = held[dev]; return !!(h && h[action]); };

    I.devOf = function (slot) { return slot === 1 ? I.p2 : I.p1; };
    I.slotOf = function (dev) { return dev === I.p1 ? 0 : dev !== null && dev === I.p2 ? 1 : -1; };
    // the command a pressed action triggers for this player ('' if none)
    I.cmdFor = function (slot, action) {
        var m = I.maps[slot];
        if (action === 'confirm') action = 'jump';            // OK sends confirm + jump: count it once (jump)
        for (var k = 0; k < CMDS.length; k++) if (m[CMDS[k]] === action) return CMDS[k];
        return '';
    };
    I.cmdDown = function (slot, cmd) {
        var b = I.maps[slot][cmd], dev = I.devOf(slot);
        if (!dev || b === 'none' || b === 'auto') return false;
        return I.down(dev, b) || (b === 'jump' && I.down(dev, 'confirm'));
    };
    I.dirDown = function (slot, dir) { var dev = I.devOf(slot); return !!dev && I.down(dev, dir); };

    // options offered in the remap screen for each command
    I.OPTIONS = { fire: ['jump', 'run', 'cancel'], swap: ['run', 'cancel', 'jump', 'none'], nade: ['cancel', 'run', 'jump', 'none'], tac: ['auto', 'run', 'cancel'] };
    // give a command a button; a command already on that button takes this one's old button (swap).
    // Fire always keeps a real button, so a swap that would leave it without one is refused.
    I.assign = function (slot, cmd, button) {
        var m = I.maps[slot], old = m[cmd];
        var real = function (b) { return BUTTONS.indexOf(b) >= 0; };
        if (real(button)) {
            for (var k = 0; k < CMDS.length; k++) {
                var c = CMDS[k];
                if (c === cmd || m[c] !== button) continue;
                if (c === 'fire' && !real(old)) return false;
                m[c] = real(old) ? old : (c === 'tac' ? 'auto' : 'none');
            }
        }
        m[cmd] = button;
        return true;
    };

    I.devName = function (dev) {
        if (!dev) return T('notAssigned');
        if (dev === 'keys') return T('devRemote');
        if (dev === 'keys2') return T('devKeys2');
        var m = /^pad(\d)$/.exec(dev);
        return m ? T('devPad') + ' ' + (+m[1] + 1) : dev;
    };
    I.btnName = function (b) {
        return b === 'jump' ? T('btnA') : b === 'run' ? T('btnRun') : b === 'cancel' ? T('btnCancel') : b === 'auto' ? T('btnAuto') : '—';
    };
    return I;
})();
