# Steel Vigil

**Version 1.1.0** · a tactical top-down shooter for **My PC** (Samsung TVs 2024+, Tizen 8) and desktop browsers.

Clear enemy compounds in a 12-mission story campaign, or drop into a 12-player battle royale.
Enemies notice you gradually, hear gunshots, take cover and peek, flank, rush, aim sniper lasers and throw
grenades to flush you out. Walls, crates and rocks really stop bullets, so positioning matters.

## Modes

- **Story campaign**: 4 operations × 3 stages. Each operation ends with a boss (The Warden, Viper,
  Juggernaut, The Marshal) who calls reinforcements as they lose health. Clearing a stage unlocks the
  next one and a new weapon or grenade type. Difficulty: Recruit, Veteran or Elite.
- **Battle royale**: you and 11 bots (owner-configurable), one pistol each. Loot weapons, armor,
  medkits and grenades while a closing zone pushes everyone together. Last one standing wins.

## Controllers and co-op

- **One controller at a time.** On start, press OK (remote) or A (gamepad) on the controller you will play
  with: it becomes Player 1 and every other controller is ignored, so nothing interferes. Switch any time
  with **Players & Controllers**, or from the My PC pause menu (Back) → **Change controller**, which always
  works with the TV remote.
- **Gamepads** are supported through My PC (up to 4). Default buttons: A fires, B / X switches weapon,
  Cancel throws a grenade, A with nothing in sight opens the Tactical screen.
- **Remap buttons** per player in *Players & Controllers → Remap buttons*: Fire, Switch weapon, Throw
  grenade and Tactical screen can go on A / OK, B · X or Cancel. Choosing a button that is already used
  swaps the two; Fire always keeps a button. Saved with your profile.
- **2-player co-op (Story)**: *Players & Controllers → Player 2*, then press A on a second controller (the
  one Player 1 uses is refused). Player 2 joins as a green support soldier with their own health, ammo,
  grenades, aim and Tactical screen; the camera frames both. A downed player is back next to the partner
  after 20 s; the mission fails only if both are down. Enemies are 25% more numerous and tougher in co-op.
  A partner who leaves the controller idle is brought along instead of holding the team back.
  Battle Royale stays solo.

Gamepads and a second player need My PC: opened directly in a browser, the SDK only provides the keyboard.

## Controls (TV remote: arrows + OK only)

| Input | Action |
|---|---|
| Arrows | Move |
| OK (hold) | Fire: aim locks onto the best enemy in sight. Stand still for better accuracy (snipers zoom out). |
| OK with nothing in sight | Tactical screen (time stops): switch weapon, throw a grenade, use a medkit, full map |
| Back | My PC pause menu: *Arsenal & Map*, *Restart*, *Main menu* |
| Gamepad / keyboard extras | B · X (Shift) cycles weapons · Cancel (Backspace) throws a grenade (remappable) |

In a browser: arrows + Enter (or Space / Z to fire), **Esc** pauses.

## Arsenal

- **Pistols**: P9 Compact, Viper .45 SD (suppressed: enemies barely hear it), Vex MP, Bastion .50
- **Shotguns**: Breacher 12 (pump, shell-by-shell reload), Tempest Auto-12, Twin-Ox
- **Rifles**: Falcon AR, Kestrel SMG, Ironwood BR (3-round burst), Anvil LMG
- **Snipers**: Needle Bolt, Longbow DMR, Leviathan .50 (pierces crates and bodies)
- **Grenades**: Frag, Flashbang (blinds), Smoke (blocks sight), Incendiary

Bullets travel in real time with spread, recoil and damage falloff; they ricochet off walls at shallow
angles, shatter crates and set off fuel barrels (chain reactions). Bodies keep the momentum of the shot,
slide and leave blood that stays on the ground. Unaware enemies take double damage, and bushes hide you
unless an enemy is close or you shoot.

## Fairness

Every map is generated so all areas are reachable (blocked pockets are carved open), enemies only spawn on
reachable tiles, and when 3 or fewer hostiles remain they are marked on screen and on the map, so a mission
can't get stuck. Live grenades show their blast radius, sniper lasers are always visible, and only a few
enemies may shoot at you at the same time. Retrying a stage keeps the same map.

## My PC integration

- `mypc-app.json`: id `steel-vigil`, type `game`, with scores
- Lifecycle through the SDK (`onInit` → `ready` → `onStart`, pause/resume stop the loop and sound,
  `onDestroy` closes the AudioContext); input only through the SDK
- Saves per My PC profile (`MyPC.save('save', …)`): campaign progress, best scores, unlocked weapons,
  loadout, settings, button maps, battle royale stats
- Input per device from `onInput(action, pressed, repeat, dev)` (`keys`, `keys2`, `pad0`–`pad3`): each
  player only reacts to their own controller
- Scores with `MyPC.submitScore` at the end of a won mission and of each battle royale match
- Texts in English, French, Spanish and Arabic (right to left)
- Owner settings (`MyPC.app_config`, defaults in `mypc-app.json`):
  - `difficulty`: `"recruit"`, `"veteran"` or `"elite"` (the default until the player picks one in Settings)
  - `brBots`: number of battle royale opponents, 3 to 23 (default 11)

## Files

`index.html` (page and styles), `js/` (game code, no build step), `assets/atlas.png` (all sprites in one
image), `css/fonts.css` (embedded fonts), `js/sounds.js` (sounds embedded so the game also runs from a
plain file).

## Rebuilding the assets (adding sprites, sounds, expansions)

The game itself needs no build step; these tools only regenerate `assets/atlas.png`, `js/atlas.js`,
`js/sounds.js` and `css/fonts.css`. They need Python 3 with Pillow (`pip install pillow`) and ffmpeg.

1. `python tools/fetch_assets.py` downloads the source packs into `tools/downloads/` (git-ignored).
   To use a new pack, add its URL to `SOURCES` there.
2. Add what you need to `tools/build_assets.py`:
   - a tile: a line in `TILES` (its index in Kenney's tilesheet = row × 27 + column)
   - a particle or animation: a line in `PARTICLES` or `ANIMS`
   - a sound: a line in `SOUNDS` (file, start and end in seconds to cut a single shot)
3. `python tools/build_assets.py` rebuilds everything, or `atlas`, `sounds` or `fonts` for one part.
   If ffmpeg is not on the PATH, set `FFMPEG` to its full path.
4. Use the new names in the code: sprites by name (`t_…`, `c_…`, `p_…`, `x_…`), sounds with `SFX.play('name')`.

Positions inside the atlas can change on every rebuild; the game always looks sprites up by name, so that is fine.

## Credits

- Art: [Kenney](https://kenney.nl) Top-down Shooter, Particle Pack, Smoke Particles (CC0)
- Sound effects: Kenney Impact Sounds and Interface Sounds (CC0); OpenGameArt: "Gunshot Sounds" by
  Tabasco, "gun reload sounds" by SpringySpringo, "Gun Reload Sound Effects" by BMacZero,
  "synthesized explosion" by qubodup (all CC0)
- Music: "Tension Based Loops" by VividReality, OpenGameArt (CC-BY 3.0)
- Fonts: Rajdhani and Cairo (SIL Open Font License 1.1)
