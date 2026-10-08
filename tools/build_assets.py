"""Build the game's assets from the packs in tools/downloads/ (run fetch_assets.py first).

    python tools/build_assets.py            # everything
    python tools/build_assets.py atlas      # only assets/atlas.png + js/atlas.js
    python tools/build_assets.py sounds     # only js/sounds.js
    python tools/build_assets.py fonts      # only css/fonts.css

Needs Python 3 with Pillow (pip install pillow) and ffmpeg (with libvorbis) on the PATH,
or its path in the FFMPEG environment variable.

Outputs:
  assets/atlas.png  every sprite packed into one image
  js/atlas.js       ATLAS = { name: [x, y, w, h] }  (names: t_ tiles, c_ characters, i_ icons, p_ particles, x_ animations)
  js/sounds.js      SOUNDS = { name: base64 OGG }  (embedded so the game also runs from file://)
  css/fonts.css     the fonts as data URIs (same reason)

To add a sprite: add it to TILES / PARTICLES / ANIMS below (or a new section), rebuild, then draw it in the
game by its name. To add a sound: add a line to SOUNDS, rebuild, then SFX.play('name').
"""
import os, re, sys, json, base64, shutil, subprocess
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DL = os.path.join(HERE, 'downloads')
TDS = os.path.join(DL, 'kenney_top-down-shooter')
PP = os.path.join(DL, 'kenney_particle-pack', 'PNG (Transparent)')
SP = os.path.join(DL, 'kenney_smoke-particles', 'PNG')
OGA = os.path.join(DL, 'oga')
IS = os.path.join(DL, 'kenney_impact-sounds', 'Audio')
US = os.path.join(DL, 'kenney_interface-sounds', 'Audio')

# ---------------------------------------------------------------- sprites

# tiles from Kenney's tilesheet_complete.png (27 x 20 tiles of 64 px): name -> tile index (row * 27 + column)
TILES = {
    'g0': 0, 'g1': 1, 'g2': 2, 'g3': 3, 'd0': 4, 'd1': 5,                       # grass, dirt
    'c0': 6, 'c1': 7, 'c2': 8, 'c3': 9, 'c4': 10,                                # concrete
    's0': 12, 's1': 13, 's2': 14, 's3': 15, 'w0': 18, 'w1': 19,                  # sand, water
    'p0': 41, 'p1': 42, 'p2': 43, 'p3': 44,                                      # wooden floor
    'crate': 128, 'crate2': 155, 'crateS': 129,
    'tree0': 180, 'tree1': 181, 'tree2': 207, 'tree3': 208,                      # big tree, 2 x 2
    'bush': 182, 'bushO': 185, 'bushS': 234, 'bushS2': 235,
    'rock0': 236, 'rock1': 237, 'rock2': 238,
    'barrel': 315, 'barrelB': 316, 'barrelR': 317,
    'oil0': 318, 'oil1': 319, 'tuft': 212, 'leaf': 133, 'shards': 263, 'plank': 264,
}
# particles from Kenney's Particle Pack (512 px, trimmed and scaled to the given size)
PARTICLES = [('muzzle_01', 96), ('muzzle_02', 96), ('muzzle_03', 96), ('muzzle_04', 96), ('muzzle_05', 96),
             ('spark_01', 48), ('spark_02', 48), ('spark_03', 48), ('spark_04', 48),
             ('smoke_01', 96), ('smoke_02', 96), ('smoke_03', 96), ('smoke_04', 96),
             ('circle_05', 64), ('light_01', 96), ('scorch_01', 128), ('scorch_02', 128), ('scorch_03', 128),
             ('dirt_01', 96), ('dirt_02', 96), ('dirt_03', 96), ('flame_01', 64), ('flame_02', 64), ('trace_01', 64)]
# animations from Kenney's Smoke Particles: (prefix, folder, file pattern, frame numbers, size)
ANIMS = [('x_explosion', 'Explosion', 'explosion%02d.png', range(9), 128),
         ('x_white', 'White puff', 'whitePuff%02d.png', range(0, 24, 4), 96),
         ('x_black', 'Black smoke', 'blackSmoke%02d.png', range(0, 24, 4), 96)]


def trimmed(path, size):
    im = Image.open(path).convert('RGBA')
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    s = size / max(im.size)
    return im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)


def build_atlas():
    items = []
    sheet = Image.open(os.path.join(TDS, 'Tilesheet', 'tilesheet_complete.png')).convert('RGBA')
    for name, i in TILES.items():
        c, r = i % 27, i // 27
        items.append(('t_' + name, sheet.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64))))
    # every character pose (hitman1, manBlue, manBrown, manOld, robot1, soldier1, survivor1, womanGreen, zoimbie1)
    cs = Image.open(os.path.join(TDS, 'Spritesheet', 'spritesheet_characters.png')).convert('RGBA')
    xml = open(os.path.join(TDS, 'Spritesheet', 'spritesheet_characters.xml')).read()
    for m in re.finditer(r'name="([^"]+)\.png"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"', xml):
        x, y, w, h = map(int, m.groups()[1:])
        items.append(('c_' + m.group(1), cs.crop((x, y, x + w, y + h))))
    for w in ['weapon_gun', 'weapon_machine', 'weapon_silencer']:
        items.append(('i_' + w, Image.open(os.path.join(TDS, 'PNG', w + '.png')).convert('RGBA')))
    for name, size in PARTICLES:
        items.append(('p_' + name, trimmed(os.path.join(PP, name + '.png'), size)))
    for prefix, folder, pattern, frames, size in ANIMS:
        for k, n in enumerate(frames):
            items.append((prefix + str(k), trimmed(os.path.join(SP, folder, pattern % n), size)))

    # shelf packing, tallest first, 2 px gaps
    items.sort(key=lambda it: -it[1].size[1])
    W = 1024
    x = y = rowh = 0
    frames = {}
    for name, im in items:
        w, h = im.size
        if x + w + 2 > W:
            x = 0; y += rowh + 2; rowh = 0
        frames[name] = [x, y, w, h]
        x += w + 2; rowh = max(rowh, h)
    atlas = Image.new('RGBA', (W, y + rowh), (0, 0, 0, 0))
    for name, im in items:
        atlas.paste(im, tuple(frames[name][:2]))
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    out = os.path.join(ROOT, 'assets', 'atlas.png')
    atlas.save(out, optimize=True)
    with open(os.path.join(ROOT, 'js', 'atlas.js'), 'w') as f:
        f.write('/* Generated by tools/build_assets.py: frames of assets/atlas.png (Kenney CC0 art). name: [x, y, w, h] */\n')
        f.write('var ATLAS = ' + json.dumps(frames, separators=(',', ':')) + ';\n')
    print('atlas: %d sprites, %dx%d, %d KB' % (len(frames), W, atlas.size[1], os.path.getsize(out) // 1024))

# ---------------------------------------------------------------- sounds

def L(*p): return os.path.join(*p)

# name -> (source file, start s, end s, options). start/end None = whole file.
# options: 'trim' removes leading silence, 'music' = loop (lower quality, no fade)
SOUNDS = {
    'pistol':  (L(OGA, 'shots/sounds/cz.wav'), 0.20, 0.80, ''),
    'rifle':   (L(OGA, 'shots/sounds/sks.wav'), 0.30, 1.10, ''),
    'sniper':  (L(OGA, 'shots/sounds/mosin.wav'), 0.40, 1.55, ''),
    'shotgun': (L(OGA, 'shots/sounds/shotty.wav'), 0.10, 0.70, ''),
    'explosion': (L(OGA, 'explosion.flac'), 0, 1.18, ''),
    'magOut':  (L(OGA, 'clipload2.wav'), None, None, ''),
    'magIn':   (L(OGA, 'clipload1.wav'), None, None, ''),
    'shell':   (L(OGA, 'singlebullet1.wav'), None, None, ''),
    'pump':    (L(OGA, 'shotguncock_0.wav'), None, None, 'trim'),
    'bolt':    (L(OGA, 'assaultriflereload1_0.wav'), None, None, 'trim'),
}
for k, f in [('hitWall0', 'impactMetal_light_000'), ('hitWall1', 'impactMetal_light_001'), ('hitWall2', 'impactMetal_light_002'),
             ('hitFlesh0', 'impactPunch_medium_000'), ('hitFlesh1', 'impactPunch_medium_001'), ('hitFlesh2', 'impactPunch_medium_002'),
             ('hitWood0', 'impactWood_medium_000'), ('hitWood1', 'impactWood_medium_001'), ('woodBreak', 'impactWood_heavy_002'),
             ('bounce', 'impactPlate_light_000'), ('casing', 'impactTin_medium_000'), ('body', 'impactSoft_heavy_001'),
             ('step0', 'footstep_concrete_000'), ('step1', 'footstep_concrete_001'), ('step2', 'footstep_concrete_002'),
             ('gstep0', 'footstep_grass_000'), ('gstep1', 'footstep_grass_001'), ('gstep2', 'footstep_grass_002'),
             ('armor', 'impactMetal_medium_001'), ('empty', 'impactGeneric_light_002')]:
    SOUNDS[k] = (L(IS, f + '.ogg'), None, None, '')
for k, f in [('uiMove', 'click_002'), ('uiOk', 'select_002'), ('uiBack', 'back_002'), ('uiError', 'error_003'),
             ('uiSwitch', 'switch_002'), ('uiOpen', 'maximize_003'), ('uiClose', 'minimize_003'),
             ('uiWin', 'confirmation_004'), ('pickup', 'drop_002'), ('uiAlert', 'question_002')]:
    SOUNDS[k] = (L(US, f + '.ogg'), None, None, '')
# music: six loops of the same length, mixed by intensity in js/audio.js
for k, f in [('mNoise', 'Picked Noise 1'), ('mPulse1', 'Picked Pulse 1'), ('mPulse2', 'Picked Pulse 2'),
             ('mSaw1', 'Picked Saw 1'), ('mSaw2', 'Picked Saw 2'), ('mSaw3', 'Picked Saw 3')]:
    SOUNDS[k] = (L(OGA, 'tension', 'Loops', f + '.wav'), None, None, 'music')


def ffmpeg():
    ff = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ff:
        sys.exit('ffmpeg not found: install it or set FFMPEG to its path')
    return ff


def encode(ff, src, ss, to, opts):
    """Mono 22 kHz OGG Vorbis, cut and faded out, as bytes."""
    args = [ff, '-v', 'error', '-y']
    if ss is not None: args += ['-ss', str(ss)]
    if to is not None: args += ['-to', str(to)]
    args += ['-i', src, '-ac', '1', '-ar', '22050']
    af = []
    if 'trim' in opts: af.append('silenceremove=start_periods=1:start_threshold=-45dB')
    if ss is not None and to is not None and 'music' not in opts:
        af.append('afade=t=out:st=%f:d=0.12' % max(0, (to - ss) - 0.12))
    if af: args += ['-af', ','.join(af)]
    args += ['-c:a', 'libvorbis', '-q:a', '0' if 'music' in opts else '2', '-f', 'ogg', 'pipe:1']
    return subprocess.run(args, capture_output=True, check=True).stdout


def build_sounds():
    ff = ffmpeg()
    total = 0
    with open(os.path.join(ROOT, 'js', 'sounds.js'), 'w') as f:
        f.write('/* Generated by tools/build_assets.py: sounds as base64 OGG (so they also load from file://). Credits in README.md. */\nvar SOUNDS = {\n')
        for name, (src, ss, to, opts) in SOUNDS.items():
            data = encode(ff, src, ss, to, opts)
            total += len(data)
            f.write("  %s: '%s',\n" % (name, base64.b64encode(data).decode()))
        f.write('};\n')
    print('sounds: %d, %d KB' % (len(SOUNDS), total // 1024))

# ---------------------------------------------------------------- fonts

FONTS = [("Rajdhani", '500', 'rajdhani-500.woff2', ''),
         ("Rajdhani", '700', 'rajdhani-700.woff2', ''),
         ("Cairo", '200 1000', 'cairo-arabic.woff2',
          ';unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC')]


def build_fonts():
    css = '/* Generated by tools/build_assets.py. Fonts embedded so they also load from file://. Rajdhani and Cairo: SIL Open Font License 1.1 (Google Fonts). */\n'
    for family, weight, file, extra in FONTS:
        b64 = base64.b64encode(open(os.path.join(DL, 'fonts', file), 'rb').read()).decode()
        css += "@font-face{font-family:'%s';font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')%s}\n" % (family, weight, b64, extra)
    os.makedirs(os.path.join(ROOT, 'css'), exist_ok=True)
    open(os.path.join(ROOT, 'css', 'fonts.css'), 'w').write(css)
    print('fonts: %d' % len(FONTS))


if __name__ == '__main__':
    if not os.path.isdir(DL):
        sys.exit('tools/downloads/ is missing: run python tools/fetch_assets.py first')
    what = sys.argv[1:] or ['atlas', 'sounds', 'fonts']
    if 'atlas' in what: build_atlas()
    if 'sounds' in what: build_sounds()
    if 'fonts' in what: build_fonts()
