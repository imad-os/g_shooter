"""Download the open-source packs the game is built from into tools/downloads/ (not committed).

    python tools/fetch_assets.py

Every source is CC0 except the music (CC-BY 3.0) and the fonts (OFL); credits are in README.md.
To add a pack: add its URL below, run this again, then reference its files in build_assets.py.
"""
import os, sys, zipfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, 'downloads')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0 Safari/537.36'

KENNEY = 'https://kenney.nl/media/pages/assets/'
OGA = 'https://opengameart.org/sites/default/files/'
# (url, file name, folder to unzip into or None)
SOURCES = [
    (KENNEY + 'top-down-shooter/230204340a-1677694684/kenney_top-down-shooter.zip', 'kenney_top-down-shooter.zip', 'kenney_top-down-shooter'),
    (KENNEY + 'particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip', 'kenney_particle-pack.zip', 'kenney_particle-pack'),
    (KENNEY + 'smoke-particles/23249a0d35-1677695171/kenney_smoke-particles.zip', 'kenney_smoke-particles.zip', 'kenney_smoke-particles'),
    (KENNEY + 'impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip', 'kenney_impact-sounds.zip', 'kenney_impact-sounds'),
    (KENNEY + 'interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip', 'kenney_interface-sounds.zip', 'kenney_interface-sounds'),
    # OpenGameArt: "Gunshot Sounds" (Tabasco), "gun reload sounds" (SpringySpringo),
    # "Gun Reload Sound Effects" (BMacZero), "synthesized explosion" (qubodup), "Tension Based Loops" (VividReality)
    (OGA + 'sounds.zip', 'oga/sounds.zip', 'oga/shots'),
    (OGA + 'assaultriflereload1_0.wav', 'oga/assaultriflereload1_0.wav', None),
    (OGA + 'gunreload1.wav', 'oga/gunreload1.wav', None),
    (OGA + 'shotguncock_0.wav', 'oga/shotguncock_0.wav', None),
    (OGA + 'clipload1.wav', 'oga/clipload1.wav', None),
    (OGA + 'clipload2.wav', 'oga/clipload2.wav', None),
    (OGA + 'singlebullet1.wav', 'oga/singlebullet1.wav', None),
    (OGA + 'synthetic_explosion_1.flac', 'oga/explosion.flac', None),
    (OGA + 'Tension%20Based%20Loops%20%286%20loops%20%2B%20Full%20Mix%29.zip', 'oga/tension.zip', 'oga/tension'),
    # fonts (Google Fonts, SIL Open Font License): Rajdhani 500/700 latin, Cairo arabic
    ('https://fonts.gstatic.com/s/rajdhani/v17/LDI2apCSOBg7S-QT7pb0EPOreec.woff2', 'fonts/rajdhani-500.woff2', None),
    ('https://fonts.gstatic.com/s/rajdhani/v17/LDI2apCSOBg7S-QT7pa8FvOreec.woff2', 'fonts/rajdhani-700.woff2', None),
    ('https://fonts.gstatic.com/s/cairo/v31/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscQyyS4J0.woff2', 'fonts/cairo-arabic.woff2', None),
]


def main():
    for url, name, unzip_to in SOURCES:
        path = os.path.join(DL, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path):
            print('download', name)
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
                f.write(r.read())
        if unzip_to:
            dest = os.path.join(DL, unzip_to)
            if not os.path.isdir(dest):
                with zipfile.ZipFile(path) as z:
                    z.extractall(dest)
    print('ready in', DL)


if __name__ == '__main__':
    sys.exit(main())
