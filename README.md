# Steel Vigil

**Version 1.0.0** · a tactical top-down shooter for **My PC** (Samsung TVs 2024+, Tizen 8) and desktop browsers.

Clear enemy compounds in a 12-mission story campaign, or drop into a 12-player battle royale.
Enemies notice you gradually, hear gunshots, take cover and peek, flank, rush, aim sniper lasers and throw
grenades to flush you out. Walls, crates and rocks really stop bullets, so positioning matters.

## Modes

- **Story campaign**: 4 operations × 3 stages. Each operation ends with a boss (The Warden, Viper,
  Juggernaut, The Marshal) who calls reinforcements as they lose health. Clearing a stage unlocks the
  next one and a new weapon or grenade type. Difficulty: Recruit, Veteran or Elite.
- **Battle royale**: you and 11 bots (owner-configurable), one pistol each. Loot weapons, armor,
  medkits and grenades while a closing zone pushes everyone together. Last one standing wins.

## Controls (TV remote: arrows + OK only)

| Input | Action |
|---|---|
| Arrows | Move |
| OK (hold) | Fire: aim locks onto the best enemy in sight. Stand still for better accuracy (snipers zoom out). |
| OK with nothing in sight | Tactical screen (time stops): switch weapon, throw a grenade, use a medkit, full map |
| Back | My PC pause menu: *Arsenal & Map*, *Restart*, *Main menu* |
| Gamepad / keyboard extras | Run (X, Shift) cycles weapons · Cancel (Backspace) throws a grenade |

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
  loadout, settings, battle royale stats
- Scores with `MyPC.submitScore` at the end of a won mission and of each battle royale match
- Texts in English, French, Spanish and Arabic (right to left)
- Owner settings (`MyPC.app_config`, defaults in `mypc-app.json`):
  - `difficulty`: `"recruit"`, `"veteran"` or `"elite"` (the default until the player picks one in Settings)
  - `brBots`: number of battle royale opponents, 3 to 23 (default 11)

## Files

`index.html` (page and styles), `js/` (game code, no build step), `assets/atlas.png` (all sprites in one
image), `css/fonts.css` (embedded fonts), `js/sounds.js` (sounds embedded so the game also runs from a
plain file).

## Credits

- Art: [Kenney](https://kenney.nl) Top-down Shooter, Particle Pack, Smoke Particles (CC0)
- Sound effects: Kenney Impact Sounds and Interface Sounds (CC0); OpenGameArt: "Gunshot Sounds" by
  Tabasco, "gun reload sounds" by SpringySpringo, "Gun Reload Sound Effects" by BMacZero,
  "synthesized explosion" by qubodup (all CC0)
- Music: "Tension Based Loops" by VividReality, OpenGameArt (CC-BY 3.0)
- Fonts: Rajdhani and Cairo (SIL Open Font License 1.1)
