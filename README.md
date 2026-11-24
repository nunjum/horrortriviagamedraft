# Don't Make a Sound *(working title)*

> **Five days. One locked house. She hunts by sound — and only what you know about horror will keep you hidden.**

A **first-person browser horror game** in the spirit of *Granny*, with trivia about **Mike Flanagan's hauntings**: *The Haunting of Hill House*, *Bly Manor*, *Midnight Mass*, *The Midnight Club*, *The Fall of the House of Usher*, and his films. Creep through the Marrow house, pick locks, hide in wardrobes and under the bed, and escape before the fifth day. When she finds you, what you know about those stories is the only thing that keeps you hidden.

> *Unofficial fan project.* The trivia is about Flanagan's work, but the house, its story and every ghost in it are original. Nothing in the game is affiliated with or endorsed by Netflix or Mike Flanagan.

![She sees you](docs/screenshots/her.jpg)

> ⚠️ **Content warning:** jump scares, loud screams, flashing images and horror themes. **Reduced effects** in Settings removes shaking, strobing and the split-second hidden faces, and softens the jump scares.

---

## ▶ Play it

**`index.html` is the whole game in one file:** engine, art, sound and questions. Nothing to install, and no image or audio files.

| Option | How |
|---|---|
| **Just open it** | Double-click `index.html`. |
| **GitHub Pages** | Repo → *Settings* → *Pages* → *Deploy from branch* → `main` / `/ (root)`. |

> Uploading through the GitHub website? Make sure `index.html` ends up in the **root** of the repo.

🎧 **Play with headphones, in the dark.** Her footsteps come from where she actually is.

### Controls

| Desktop | Phone / tablet ("remote control") | Action |
|---|---|---|
| Click, then **mouse** | Drag the right side of the screen | Look around |
| **W A S D** / arrows | Left joystick | Walk |
| **Shift** (hold) | **»** | Run (fast, *loud*) |
| **C** / Ctrl (hold) | **⤓** | Sneak (slow, silent) |
| **E**, Space or click | **✋** | Use · open/close doors · hide · leave a hiding place |
| **F** | **🔦** | Flashlight |
| **1 – 4** | Tap | Answer trivia |
| **M** / **Esc** | | Mute / pause |

Add `?debug` to the URL to expose `window.game` in the console.

---

## CONCEPT

* **The Pitch:** A first-person stealth escape game where horror movie and video game trivia is your only tool to stay hidden, pick locks, and survive five days inside a locked house.
* **Core Loop:** Explore the dark house on foot → find escape items (Basement Key, Bolt Cutters, Master Key) → every step, door and drawer makes noise → she comes to investigate → hide, and survive rapid-fire horror trivia while she searches for you.
* **The Hook:** Ordinary trivia is a quiz. Here you're crouched in a wardrobe watching her silhouette through the slats, hearing her breathing, with a 10-second countdown and a shaking screen.
* **Target Audience:** Fans of indie horror games (*Granny*, *Five Nights at Freddy's*, *Buckshot Roulette*) and hardcore horror movie buffs who want high-stakes replayability.

---

## SPECIFICATION

### Tech stack

| Layer | Choice |
|---|---|
| **3D engine** | A custom **WebGL2 renderer** written from scratch (no libraries) that draws at full screen resolution. The house grid becomes real geometry: walls, floors, ceilings, door frames with lintels, **doors that swing on hinges**, and **furniture modelled in 3D** (iron bed, crib, table and chairs, clawfoot tub with shower curtain, sink, nightstand with lamp, toolbox). |
| **Lighting** | Lamp light is pre-computed so it **doesn't bleed through walls**. Surfaces have **normal maps**, so grout, planks, brick and wallpaper patterns catch the light. Your **flashlight** is a real spotlight with **specular highlights** on tiles, enamel and brass. Corners and furniture get soft contact shadows, door frames have casings, ceiling lamps hang on cords, and exponential fog eats the far end of every corridor. The flashlight beam lights up **volumetric haze** and **drifting dust**. Figures are matte and the beam softens at arm's length, so dark clothes stay dark and faces keep their detail up close. A cold rim light picks out their silhouettes. |
| **Post-processing** | HDR rendering → **bloom** around bulbs, candles and stained glass → **ACES filmic tone mapping** → colour grading (cold shadows, a red tint that creeps in each day) → vignette, **chromatic aberration** that grows when she's close, and animated film grain, then a final **FXAA anti-aliasing** pass, **contrast-adaptive sharpening** (crisp detail even when the resolution is scaled down), fine film grain that only shows in the shadows, and dithering (no colour banding in the dark). |
| **Graphics** | **100% procedural, still no image files.** 256px textures (wood, marble checker, subway tile, brick, damask wallpaper, panelled doors, a stained-glass front door, a moonlit window…) are generated from layered noise when the game loads. Characters and ghosts are painted at 6× resolution with tapered limbs, long-fingered hands, clothing with folds and stains, and hair that hangs in strands. Their faces are dead things: grey-green mottled skin, bruised sunken sockets, bloodshot eyes with pinprick pupils, cracked lips, bloody or black tears, jaws that hang too low and grins that tear at the corners. Their poses are wrong too: a broken neck, an elbow bent backwards, arms too long. Some of their eyes shine in the dark. A normal map generated from each silhouette lets the flashlight wrap around them. The jump-scare faces are painted at 1.75× so they stay sharp full-screen. The title screen is SVG. |
| **Smoothness** | **Dynamic resolution** keeps the frame rate steady: the render scale drops when a frame runs slow and climbs back when there's headroom. Movement has eased acceleration, turning is smoothed, and the camera leans slightly into strafes. Textures are built in small slices while the title screen is up, so the game never freezes on load. Buffers are reused every frame (no garbage-collection hitches). |
| **Fallback** | Settings → Graphics → **Retro** switches back to the original software raycaster (pixelated, runs anywhere). It's chosen automatically if WebGL2 isn't available. |
| **Audio** | **Web Audio API, fully synthesized.** HRTF **3D positional sound** (her footsteps, breathing and doors come from where they actually are, and are muffled through walls), a generated convolution **reverb**, chase music, a music box, whispers, and a distorted vocal-formant **scream** for the jump scare. |
| **AI** | A* pathfinding over the house grid. She patrols, hears noise, investigates, chases on sight, searches hiding places and opens doors. |
| **Storage** | `localStorage` for settings, high scores and achievements. |
| **Tests** | Node's built-in test runner (`npm test`). The game logic doesn't touch the DOM, so it is tested headlessly. |

### Game mechanics

**The 5-Day System.** Getting caught carries you back to bed and starts the next day. You keep your items, but she gets faster and sharper each day, and the screen gets grainier and redder. Getting caught on Day 5 means Game Over.

**Noise meter (0–100%).**

| Action | Noise |
|---|---|
| Sneaking | 0 |
| Walking | +2 % per second |
| Running | **+16 % per second** |
| Loose floorboards | +10 % |
| Opening or closing a door | +6 % |
| Searching drawers, cupboards, closets | **+25 %** |
| Failing to pick a lock | +25 % |
| The hammer | **+50 %** |
| Standing still / hiding | noise slowly fades |

Loud noises within earshot send her to **investigate**. At **100 %** she knows exactly where you are and comes running (a **Pursuit Event**).

**She sees you** if you're in her line of sight. Your flashlight and lit rooms let her see you from much further away; sneaking makes you harder to spot.

**Trivia encounters**

| Encounter | When | Questions | Pass | Fail |
|---|---|---|---|---|
| **Found** | She saw you hide (or got suspicious) and checks your hiding place | 1–3 (the room's danger level) | She leaves; noise drops to 20 % | Caught → next day |
| **Grab** | She catches you in the open | 1 (shorter timer) | You tear free; she's stunned for 3 s | Caught → next day |
| **Lockpick** | The kitchen drawer | 2 | Basement Key | +25 % noise |
| **Standoff** | The front door, with both keys | 3 | **You escape** | Caught |

### The residents
The Marrow house keeps everyone who ever died in it, so **she isn't the only one there**. In the spirit of Flanagan's background ghosts, **still figures stand in dark corners and doorways**: a bride in a yellowed veil, a gardener holding rusted shears, a drowned man, a nurse with a bandaged face, a woman with a curtain of black hair. Nothing points them out and no sound plays when they appear. You notice them or you don't. When you look away they may be standing somewhere else, and if you walk right up to one, from Day 3 it may not go quietly. Day 1 has 3 of them; by Day 3 there are 7.

### The story
Diary pages and notes around the house tell the story of Agnes Marrow, who couldn't let her family go and now keeps everyone who comes in. **She hums a lullaby when she's calm.** When the humming stops, hide.

### Things that aren't her
A scare director also spawns harmless apparitions in places you *aren't* looking:
- a pale woman standing at the far end of a corridor, who is gone when you look straight at her;
- something standing right behind you, there only if you turn around in time;
- a child running across a doorway;
- something crawling on the ceiling of a dark room, which flees your flashlight;
- doors slamming on their own, whispers right beside your ear, and lights that die and come back with someone standing under them;
- *GET OUT* and bloody handprints that appear on walls you've just walked past;
- a face peeking around a doorframe ahead of you;
- someone sobbing in another room;
- a music box in the nursery, a rocking chair that won't stop rocking, and a piano playing somewhere in the house;
- **the Smiling Man:** a tall, bald man in a dark suit at the far end of a hall, staring at you. At first you'll only see two pale points where his eyes are. Unlike the others **he doesn't vanish when you look at him**; he waits. Stare long enough and he starts to smile. He only moves when you aren't looking, and every time you look back he's closer. If you let him reach you, you'll find out what that smile looks like up close;
- **eyes in the dark:** pairs of eyes in unlit rooms that blink and watch you. Catch them in your flashlight beam and something skitters away;
- **the girl:** a little girl standing with her head bowed and her hair hiding her face. Watch her long enough and she giggles and **looks up at you** with black eyes. Look away and she's closer the next time you check;
- **under the bed:** a face lying on its side under the bedroom bed, and a long hand reaching across the floorboards toward you. It gets dragged back under if you look at it too long;
- **the woman in the corner:** she stands in the corner of a room with her face to the wall, and she makes no sound at all. Look away, and when you look back **she has turned around**. Look away again and she isn't in the corner any more. Usually she's right behind you;
- **footsteps that aren't yours:** for a while, every step you take is answered by one just behind you. When you stop, it takes one more step;
- **two frames:** every minute or two, a face is on the screen for about a twentieth of a second, faint, at the edge of your vision. You're never quite sure you saw it (turned off by *Reduced effects*);
- **stop-motion:** nothing in the house moves smoothly. Every few seconds she and the others **jerk**, a sideways twitch or a stretch, and then they're perfectly still again;
- **your flashlight dies:** it stutters and goes out. When it comes back on, something is standing *right in front of you*;
- **jolts:** a full-screen face, held to one every ~20 seconds so they keep their bite. Each ghost has its own face and its own way of hitting you: a lunge, a snap or a twitch. It won't cost you a day, but it will make you jump.

They come more often as the days go by.

### The house

```
 ┌────────┬────────┬───────────┐        ┌──────────── BASEMENT ───┐
 │BEDROOM │NURSERY │ KITCHEN   │        │ stairs   workbench       │
 │bed, 🔦 │crib,   │ locked    │        │          (bolt cutters)  │
 │wardrobe│music   │ drawer 🗝 │        │                 shelves  │
 │  note  │box     │ pantry    │        │     toolbox (master key) │
 ├──D─────┴──D─────┴───D───────┤        │                  boiler  │
 │ closet🔨  HALLWAY  (bulbs)  D═stairs═┘                          │
 ├──D───────┬──arch──┬─────────┘        └──────────────────────────┘
 │BATHROOM  │ FOYER  │
 │tub+curtain clock, │
 │          │coats   │
 └──────────┴FRONT DOOR
```

**Escape route:** flashlight (nightstand) → hammer (linen closet) → pick the kitchen drawer (Basement Key) → unlock the basement door and go down → bolt cutters (workbench) → smash the toolbox (Master Key) → front door standoff.

**Hiding places:** under the bed · wardrobes (bedroom, nursery) · pantry · behind the shower curtain · coat closet · behind the boiler.

| | |
|---|---|
| | |
|---|---|
| ![Bedroom by moonlight](docs/screenshots/bedroom.jpg) | ![The hallway](docs/screenshots/hallway.jpg) |
| ![Kitchen](docs/screenshots/kitchen.jpg) | ![Front foyer](docs/screenshots/foyer.jpg) |
| ![Nursery](docs/screenshots/nursery.jpg) | ![Bathroom](docs/screenshots/bathroom.jpg) |
| ![Basement by flashlight](docs/screenshots/basement.jpg) | ![Found: hiding in the wardrobe (retro mode)](docs/screenshots/found.jpg) |

**The cast**

![Everyone in the house](docs/screenshots/cast.jpg)

**Things that aren't her**

| | |
|---|---|
| ![The Smiling Man, closer every time you look back](docs/screenshots/smiler.jpg) | ![The girl looks up](docs/screenshots/girl.jpg) |
| ![Under the bed](docs/screenshots/underbed.jpg) | ![The flashlight came back on](docs/screenshots/flicker.jpg) |
| ![Eyes in the dark](docs/screenshots/eyes.jpg) | ![For two frames](docs/screenshots/subliminal.jpg) |
| ![Face to the wall…](docs/screenshots/corner-wall.jpg) | ![…until you look away](docs/screenshots/corner-turned.jpg) |

---

## PLAN

### ✅ Phase 1: The State Machine (Logic First)
`src/js/game.js` holds the core state (`day`, `noise`, `player`, `inventory`, `creature`, `phase`) as a DOM-free `Game` class with an event emitter. `src/js/world.js` defines the house, collision, line of sight and pathfinding. `npm test` runs 12 headless tests: room connectivity, walls and doors, noise, being spotted, grabbed, found while hiding, losing a day, game over, the full escape route, and apparitions.

### ✅ Phase 2: The Trivia Engine & JSON Database
`src/data/questions.json` has 99 questions about Mike Flanagan's work (easy, medium, hard), tagged `hill-house` (38), `flanagan-films` (20: *Oculus*, *Hush*, *Gerald's Game*, *Doctor Sleep*, *Before I Wake*, *Ouija: Origin of Evil*, *Absentia*), `bly-manor` (14), `midnight-mass` (12), `usher` (10) and `midnight-club` (5). The facts were checked against published episode guides and cast lists. They contain spoilers. `TriviaEngine` draws random, non-repeating questions weighted by difficulty and shuffles the answers every time.

### ✅ Phase 3: Atmosphere & Sound Design
Raycast first-person view, flashlight, flickering lights, film grain, 3D audio, reverb, chase music, apparitions, and the jump scare.

### ✅ Phase 3.5: First-person rebuild
Free movement like *Granny*, a hunting AI, hiding places, touch controls.

<details>
<summary>Spoiler: the jump scare</summary>

![Jump scare](docs/screenshots/jumpscare.jpg)
![Jump scare: the flashlight came back on](docs/screenshots/jolt.jpg)
</details>

---

## Project structure

```
dont-make-a-sound/
├── index.html            # ← THE GAME. Built single file.
├── build.mjs             # Rebuilds index.html from src/  (npm run build)
├── src/
│   ├── index.html        # Page template
│   ├── css/style.css
│   ├── data/questions.json
│   └── js/
│       ├── main.js       # UI, input (mouse/keys/touch), frame loop, encounters
│       ├── game.js       # Rules, noise, the creature's AI, encounters (no DOM)
│       ├── world.js      # House map, rooms, doors, lights, hiding places, A* (no DOM)
│       ├── scares.js     # Apparition director (no DOM)
│       ├── render3d.js   # WebGL2 renderer: geometry, lighting, bloom, tone mapping
│       ├── texhd.js      # 256px procedural textures + normal maps
│       ├── render.js     # Retro software raycaster (fallback)
│       ├── textures.js   # Procedural 64×64 textures
│       ├── sprites.js    # Procedural sprites (her, ghosts, furniture)
│       ├── scare.js      # Jump-scare face + animation
│       ├── audio.js      # Synthesized 3D sound
│       ├── trivia.js     # Trivia engine + validator
│       ├── storage.js    # localStorage
│       └── art.js        # Title-screen SVG
├── tests/game.test.mjs
└── docs/screenshots/
```

**Workflow:** edit `src/`, preview with `npm run dev` (serves `src/` at <http://localhost:8080>), then run `npm run build` to regenerate `index.html`, and commit both.

**Adding questions:** add entries to `src/data/questions.json` (`answer` is the index of the correct option, and options are shuffled at runtime), then run `npm test` and `npm run build`.

**Changing the house:** rooms, doors, furniture, lights, hiding places and item locations all live in `src/js/world.js`. Noise costs, the creature's speed and sight, and difficulty settings live at the top of `src/js/game.js`.

**Testing the scares:** open `index.html?debug`, then call `game.scares.trigger('smiler')` in the console (other kinds: `corner`, `follower`, `eyes`, `girl`, `underbed`, `flicker`, `watcher`, `behind`, `peek`…).

**Achievements:** First Blood · Final Girl · Ghost · Last Breath · Waking Nightmare · Don't Look Back · Horror Scholar · Ice in the Veins.

---

## BACKLOG

Ordered by priority. Each item is written to become a GitHub Issue; suggested labels are in brackets.

### 🔴 P1: Next up
- [ ] **Upstairs / second floor** `[content]`: an attic reached by a pull-down ladder, holding a second escape route (a car key plus a garage door).
- [ ] **Item drops on capture** `[gameplay]`: as in *Granny*, being caught drops one item back where it was found.
- [ ] **Throwable distractions** `[gameplay]`: throw a bottle or plate to make noise somewhere else and lure her away.
- [ ] **Peeking & leaning** `[gameplay]`: Q/E to lean around corners; peek through keyholes.
- [ ] **Hearing indicator option** `[a11y]`: an on-screen direction marker for her footsteps, for players who are deaf or hard of hearing or playing without headphones.
- [ ] **Gamepad support** `[input]`: Gamepad API mapping.

### 🟠 P2: Content & scares
- [ ] **More apparitions** `[scares]`: a face in the bathroom mirror, the portrait's eyes following you, footsteps on the ceiling, something in the wardrobe with you.
- [x] ~~Staring ghosts, eyes in the dark, a hand under the bed, the flashlight dying~~ (done)
- [ ] **She remembers** `[AI]`: she checks the hiding place you used last time first.
- [ ] **Story notes** `[narrative]`: collectible notes revealing who she is and who wrote the first note; multiple endings.
- [ ] **Question bank to 300+** `[content]` plus a category picker (Hill House only, Bly Manor only, the films…), and a spoiler-free mode.
- [ ] **Community question submissions** `[community]`: an issue template plus a CI check running `validateQuestions()`.

### 🟡 P3: Replayability
- [ ] **Randomized item placement** with shareable seeds `[gameplay]`.
- [ ] **Daily Challenge** (same seed and questions for everyone) and an online leaderboard `[meta]`.
- [ ] **Modifiers** `[meta]`: Blackout (flashlight battery drains), Deaf (no footstep audio), Speed Demon (5-second timers).

### 🟢 P4: Tech
- [ ] **GitHub Actions CI** `[devops]`: run `npm test` on every push and auto-deploy to Pages.
- [ ] **PWA / offline** `[tech]`: service worker + manifest; self-host the two fonts.
- [ ] **Flashlight shadow maps** `[tech]`: real-time shadows cast by furniture and by her in the beam.
- [ ] **3D character models** `[art]`: replace the billboard ghosts with low-poly skinned meshes.
- [ ] **Recorded audio layer** `[audio]`: optional CC0 samples, falling back to the synthesized sounds.

### 🐛 Known limitations
- [ ] Characters, the rocking chair and the coat rack are still billboard sprites, so they always face you.
- [ ] Textures are built in the background on the title screen; if you click Start immediately, a short "Building the house… N%" wait appears.
- [ ] Frame rate was tested only in a software-GL browser. On a weak GPU, choose Settings → Graphics → **Medium** (65% resolution) or **Retro**.
- [ ] Browsers need one click before any audio can play.
- [ ] Older iPhones may need the volume up: iOS mutes Web Audio when the ringer switch is set to silent.

---

## Credits & license

* Code: MIT (see `LICENSE`). All art and sound are generated in code.
* Fonts: [Special Elite](https://fonts.google.com/specimen/Special+Elite) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), both under the SIL Open Font License.
* Trivia questions reference Mike Flanagan's films and series for quiz and commentary purposes only. All titles and characters belong to their owners. This is an unofficial fan project, not affiliated with Netflix, Intrepid Pictures or Mike Flanagan. The game's house, story, characters and ghosts are original.
* Inspired by *Granny* (DVloper), *Five Nights at Freddy's* (Scott Cawthon) and *Buckshot Roulette* (Mike Klubnika).
