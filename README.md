# Don't Make a Sound *(working title)*

> **Five days. One locked house. It hunts by sound — and only what you know about horror will keep you hidden.**

A high-tension, browser-based stealth escape game where **horror movie and video game trivia is your only tool** to stay hidden, pick locks, and survive five days inside a locked house.

![Title screen](docs/screenshots/title.png)

> ⚠️ **Content warning:** jump scares, loud sudden sounds, flashing images and horror themes. A **Reduced effects** option in Settings removes screen shake, flashing and static animation and softens the jump scare.

---

## ▶ Play it

**No build step and no dependencies.** It's plain HTML, CSS and ES-module JavaScript.

| Option | How |
|---|---|
| **GitHub Pages** | Repo → *Settings* → *Pages* → *Deploy from branch* → `main` / `root`. Your game will be live at `https://<you>.github.io/<repo>/`. |
| **Local** | `python3 -m http.server 8080` (or `npm start`) in the project folder, then open <http://localhost:8080>. |

> Opening `index.html` by double-clicking **won't work**. Browsers block ES modules and `fetch()` on `file://` URLs, so you need a local server.

🎧 **Play with headphones.** The footsteps are panned left and right, and they really do get closer.

### Controls

| Input | Action |
|---|---|
| **Mouse / tap** | Move the flashlight, click objects and doors |
| **1 – 4** | Answer trivia (fastest way to answer under pressure) |
| **F** | Toggle the flashlight |
| **M** | Mute / unmute |
| **Esc** | Close menus |

Add `?debug` to the URL (`index.html?debug`) to expose `window.game` in the console for testing.

---

## CONCEPT

* **The Pitch:** A high-tension, browser-based stealth escape game where horror movie and video game trivia is your only tool to stay hidden, pick locks, and survive five days inside a locked house.
* **Core Loop:** Explore rooms through a dark, atmospheric point-and-click interface → search for escape items (Basement Key, Bolt Cutters, Master Key) → generate noise → survive rapid-fire horror trivia encounters to "hide" before the pursuer reaches your room.
* **The Hook:** In ordinary trivia you casually read a question. Here you're trapped under a bed or inside a closet with a 10-second countdown, a violently shaking UI, and heavy footsteps getting louder in your headphones.
* **Target Audience:** Fans of indie horror games (*Granny*, *Five Nights at Freddy's*, *Buckshot Roulette*) and hardcore horror movie buffs who want high-stakes replayability.

![The bedroom](docs/screenshots/bedroom.png)

---

## SPECIFICATION

### Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | HTML5, CSS3, **Vanilla JavaScript (ES6 modules)** | No framework, no bundler. Easy to host on GitHub Pages. |
| Atmosphere | CSS | Vignette, blood overlay, cursor-following flashlight (`radial-gradient` + CSS variables), `@keyframes` screen shake and glitch text, canvas TV static |
| Audio | **Web Audio API, fully procedural** | Every sound (ambient drone, heartbeat, panned footsteps, creaks, whispers, hammer smash, jump scare) is synthesized at runtime, so there are **no audio files to license**. |
| Storage | `localStorage` | Settings, high score, fastest escape, lifetime stats and achievements |
| Tests | Node's built-in test runner | `npm test`. The game logic doesn't touch the DOM, so it is tested headlessly. |

### Game mechanics

**The 5-Day System.** You start on **Day 1**. Getting caught advances the clock to the next day, and the house gets worse: heavier TV static, a thicker blood vignette, and a figure that shows up more clearly in the background every day. **Getting caught on Day 5 means Game Over.** Your inventory survives being caught; your position and noise level don't.

**Noise Meter (0–100%).**

| Action | Noise |
|---|---|
| Moving between rooms | **+10%** |
| Stepping onto the creaky hallway floorboards | +5% extra |
| Walking with the flashlight on (light spills under doors) | +5% extra |
| Searching drawers / cupboards / closets | **+25%** |
| Fumbling around the dark basement without light | +15% |
| Failing to pick the kitchen lock | +25% |
| Using a loud tool (hammer on the toolbox) | **+50%** |
| Hiding under the bed (once per visit) | **−30%** |

Hitting **100%** triggers a **Pursuit Event**. Difficulty scales noise: Easy ×0.8, Nightmare ×1.25.

**Pursuit Event (Trivia Encounter).** A modal locks the screen. Footsteps approach, you dive into the room's hiding spot (*under the bed*, *inside the linen closet*, *behind the boiler*…), and then you must answer **1–3 rapid-fire questions** (the room's danger level), each on its own timer (10 s on Normal). The UI shakes harder and the footsteps get louder as the timer runs down.

* **Pass:** the pursuer walks away; noise resets to **20%**.
* **Fail or time out:** jump-scare audio and visuals; you lose a day and wake up back in the starting bedroom.

**Trivia also opens locks.** The locked kitchen drawer is a **2-question lockpick encounter**. Failing it is loud rather than fatal (+25% noise).

**Final standoff.** The front door needs the **Master Key + Bolt Cutters**, then a **3-question standoff** as the pursuer comes down the stairs behind you. Fail it and you get caught.

### Difficulty

| | Timer | Noise | Question mix (easy / medium / hard) |
|---|---|---|---|
| Easy | 15 s | ×0.8 | 60 / 30 / 10 |
| Normal | 10 s | ×1.0 | 40 / 40 / 20 |
| Nightmare | 7 s | ×1.25 | 20 / 40 / 40 |

### House map (MVP: 5 rooms)

```
                 ┌─────────────┐
                 │   BEDROOM   │  danger 1 · hide under the bed (−30%)
                 │ flashlight  │  note with the escape plan
                 └──────┬──────┘
┌─────────────┐  ┌──────┴──────┐  ┌──────────────┐
│   KITCHEN   ├──┤   HALLWAY   ├──┤ FRONT FOYER  │
│ locked      │  │ creaky +5%  │  │ chain + bolt │
│ drawer →    │  │ hammer in   │  │ 3-question   │
│ BasementKey │  │ linen closet│  │ standoff     │
└─────────────┘  └──────┬──────┘  └──────────────┘
  danger 2        danger 2  │        danger 3
                 ┌──────┴──────┐
                 │  BASEMENT   │  danger 3 · pitch black (needs flashlight)
                 │ BoltCutters │  locked: needs Basement Key
                 │ MasterKey in│  padlocked toolbox → smash with hammer (+50%)
                 │  toolbox    │
                 └─────────────┘
```

| # | Room | Holds | Rule |
|---|---|---|---|
| 1 | **Starting Bedroom** | Flashlight, the first clue (note) | Safe zone: hide under the bed to drop noise |
| 2 | **Hallway** | Claw hammer (linen closet), family portrait | Central hub; creaky floorboards add noise |
| 3 | **Kitchen** | **Basement Key** in a locked drawer | Pick the lock with a 2-question trivia encounter |
| 4 | **Basement** | **Bolt Cutters**, **Master Key** (padlocked toolbox) | Locked door; pitch black without the flashlight |
| 5 | **Front Foyer** | The exit door | Master Key + Bolt Cutters + 3-question final standoff |

**Escape route:** Flashlight → Hammer → pick the kitchen lock (Basement Key) → Basement: Bolt Cutters + smash the toolbox (Master Key) → Front door standoff.

![Pursuit encounter](docs/screenshots/encounter.png)

---

## PLAN

### ✅ Phase 1: The State Machine (Logic First)
The core game state (`currentDay`, `noiseLevel`, `currentRoom`, `inventory`, `isPursued`) lives in **`js/state.js`**. It's a DOM-free `Game` class with a small event emitter (`change`, `noise`, `message`, `sfx`, `encounter`, `caught`, `win`, `gameover`). **`tests/game.test.mjs`** shows you can walk between rooms, trigger trivia, win and lose without a browser:

```bash
npm test     # or: node --test tests/*.test.mjs
```

### ✅ Phase 2: The Trivia Engine & JSON Database
* **`data/questions.json`**: 86 questions split into `easy` / `medium` / `hard` and tagged `slasher`, `supernatural`, `creature`, `horror-games`.
* **`js/trivia.js`**: a `TriviaEngine` that draws **random, non-repeating** questions weighted by difficulty, shuffles the answer order every time, and only recycles questions once the whole pool has been used. It also has `validateQuestions()` (run in the tests and on page load).

### ✅ Phase 3: Atmosphere & Sound Design
* Dark-mode CSS, cursor-following flashlight (`--mx`/`--my` radial gradient), a pitch-black basement that only your beam can reveal, CSS `@keyframes` shake whose strength rises as the timer runs out, glitch title, canvas TV static, day-based blood vignette.
* **Procedural sound instead of .mp3/.wav files:** creaking wood, heavy panned footsteps that get closer, a heartbeat whose tempo follows your noise level (52 → 150 bpm), a detuned tritone drone, whispers from Day 3 on, and the jump scare.

<details>
<summary>Spoiler: the jump scare</summary>

![Jump scare](docs/screenshots/jumpscare.png)
</details>

---

## Project structure

```
dont-make-a-sound/
├── index.html            # All screens & overlays
├── css/style.css         # Atmosphere: vignette, flashlight, shake, glitch, layout
├── js/
│   ├── main.js           # UI layer: rendering, encounters, timers, input, ambience
│   ├── state.js          # Game state machine (no DOM)
│   ├── trivia.js         # TriviaEngine + question validator (no DOM)
│   ├── config.js         # Rooms, hotspots, items, noise costs, difficulty: tweak here
│   ├── audio.js          # Procedural Web Audio sound engine
│   ├── storage.js        # localStorage: settings, high scores, achievements
│   └── art.js            # Inline SVG room silhouettes + hotspot positions
├── data/questions.json   # The trivia database
├── tests/game.test.mjs   # Headless logic tests
└── docs/screenshots/
```

### Adding questions

Add an entry to `data/questions.json`:

```json
{
  "id": "sn-029",
  "difficulty": "medium",
  "tags": ["supernatural"],
  "question": "In The Conjuring 2 (2016), which demon takes the form of a nun?",
  "options": ["Valak", "Bughuul", "Paimon", "Pazuzu"],
  "answer": 0
}
```

* `answer` is the index of the correct option. Options get shuffled at runtime, so you can always list the correct one first.
* `id`s must be unique. Run `npm test`: the validator catches duplicates, bad difficulties, out-of-range answers and repeated options.

### Tuning balance
Every number (noise costs, timers, room danger levels, which hotspot gives which item) lives in **`js/config.js`**.

### Achievements (saved locally)
First Blood · Final Girl · Ghost · Last Breath · Waking Nightmare · Don't Look Back · Horror Scholar · Ice in the Veins

---

## BACKLOG

Ordered by priority. Each item is written to become a GitHub Issue. Suggested labels are in brackets.

### 🔴 P1: Next up (post-MVP polish)
- [ ] **Real illustrated room art** `[art]`: replace the SVG silhouettes in `js/art.js` with painted/pixel backgrounds (`assets/rooms/*.webp`) and line up hotspot positions in `HOTSPOT_POS`.
- [ ] **Optional recorded audio layer** `[audio]`: let `AudioEngine` load royalty-free samples from `assets/audio/` (CC0 sources such as freesound.org) for footsteps and the scream, and fall back to the synthesized sounds if loading fails.
- [ ] **Pursuer roaming AI** `[gameplay]`: the pursuer patrols between rooms on a timer instead of only reacting at 100%. Its position (heard through panned footsteps) raises danger in the rooms next to it.
- [ ] **Noise decay & "freeze" mechanic** `[gameplay]`: hold a key to stand perfectly still; noise slowly drains, but the clock keeps ticking.
- [ ] **Item confiscation on capture** `[gameplay]`: being caught returns one random item to its original spot (Granny-style), so getting caught costs more.
- [ ] **Answer-streak bonus** `[gameplay]`: 3 correct answers in a row gives +2 s on the next question or −10% noise.
- [ ] **Accessibility pass** `[a11y]`: full keyboard navigation of hotspots and exits (arrow keys), screen-reader announcements of timer milestones, a high-contrast mode, and an untimed "Story mode".

### 🟠 P2: Content
- [ ] **Question bank to 300+** `[content]`: more coverage of J-horror, '80s creature features, indie horror games (*Mouthwashing*, *Iron Lung*, *Signalis*), and recent releases.
- [ ] **Category picker** `[content]`: choose movies-only, games-only, or a specific era before a run (the `TriviaEngine` already supports `tags`).
- [ ] **New question types** `[content]`: "Name the film from the tagline", "Which came first?", silhouette or sound-cue identification.
- [ ] **Community question submissions** `[community]`: a GitHub Issue template (`.github/ISSUE_TEMPLATE/question.yml`) plus a CI check that runs `validateQuestions()` on pull requests.
- [ ] **More rooms** `[content]`: Attic (hide in a trunk; holds a fuse for the foyer lights), Bathroom (a mirror that occasionally shows the pursuer), Garage (alternate car-key exit).
- [ ] **Multiple endings** `[narrative]`: escape on Day 1 (true ending), on Day 5 (it lets you go… or does it?), or a secret ending for reading every note.
- [ ] **Lore notes** `[narrative]`: collectible notes around the house that slowly reveal who the pursuer is and who left the first note.

### 🟡 P3: Replayability & meta
- [ ] **Randomized item placement** `[gameplay]`: shuffle which container holds each key every run (seeded, with a shareable seed code).
- [ ] **Daily Challenge** `[meta]`: same seed and same questions for everyone that day, with a local leaderboard.
- [ ] **Online leaderboard** `[backend]`: optional score submission through a lightweight serverless function (Supabase or Cloudflare Workers).
- [ ] **Unlockable modifiers** `[meta]`: "Blackout" (flashlight battery drains), "Deaf" (no footstep audio cues), "Speed Demon" (5-second timers).
- [ ] **Run history** `[meta]`: the last 10 runs in `localStorage`, with day reached, questions missed, and the correct answers to review.

### 🟢 P4: Tech & infrastructure
- [ ] **GitHub Actions CI** `[devops]`: run `npm test` and a JSON schema check on every push and PR; auto-deploy to GitHub Pages.
- [ ] **PWA / offline play** `[tech]`: service worker + manifest so the game installs on phones and works offline.
- [ ] **Self-host the fonts** `[tech]`: bundle *Special Elite* and *IBM Plex Mono* (both OFL) instead of using Google Fonts, for privacy and offline play.
- [ ] **Browser E2E tests** `[testing]`: a Playwright script that plays a full escape using `?debug`.
- [ ] **Mobile haptics** `[tech]`: `navigator.vibrate()` heartbeat pulses during encounters on Android.
- [ ] **Localization** `[i18n]`: move UI strings and questions into locale files (`data/questions.es.json`, …).
- [ ] **Consider a React port** `[tech]`: only if the UI grows complex enough to need it. The state machine is already framework-agnostic.

### 🐛 Known issues / limitations
- [ ] Hotspot buttons are positioned by percentage, so on very wide or very tall windows they can drift away from the silhouettes they label.
- [ ] Browsers need one click before any audio plays (an autoplay policy). The *Enter the house* button handles this, but the title screen itself is silent.
- [ ] Safari's older `webkitAudioContext` is supported, but low-power mode may throttle the heartbeat timer.

---

## Credits & license

* Code: MIT (see `LICENSE`).
* Fonts: [Special Elite](https://fonts.google.com/specimen/Special+Elite) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), both under the SIL Open Font License.
* All sound is generated in code. All art is original inline SVG.
* Trivia questions reference films and games for commentary and quiz purposes only. All titles and characters belong to their respective owners, and this project is not affiliated with any of them.
* Inspired by *Granny* (DVloper), *Five Nights at Freddy's* (Scott Cawthon) and *Buckshot Roulette* (Mike Klubnika).
