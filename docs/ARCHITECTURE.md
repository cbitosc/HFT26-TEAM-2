# Team Tetris Exoplanet Explorer — Final Technical Architecture

Status: FINAL for the 24-hour hackathon build. Supersedes the technology-neutral "Dataset Decision and System Architecture" brief (30 Oct 2026), whose product and data decisions are all kept. This file adds the *how*.

How to read this: **Part A** (sections 1–3) explains what we are building, how a user moves through it, and what each feature does. **Part B** (sections 4–17) is the technical blueprint a developer or coding agent follows.

---

# PART A — WHAT WE ARE BUILDING

## 1. Goal

A non-expert should be able to **ask questions about exoplanets in plain language, explore them in 3D, and see how much each number can be trusted.**

Four things make it different (pitch wording: "we found no documented equivalent", never "first ever"):

1. **HELM** — an AI astronomer that *operates the interface*: it flies the camera, filters, highlights and opens comparisons through typed tools, instead of only chatting beside a scene.
2. **RECEIPTS** — every number carries its source, its type (archive / calculated / explorer-derived) and a snapshot ID. Missing data is a grey "unknown". The AI never estimates.
3. **DISPUTE** — visible disagreement: between published solutions inside NASA's tables, between catalogs (NASA vs exoplanet.eu), and in planet status.
4. **HAB-LAB** — a habitability *checklist* that refuses to give a verdict, with a confidence level per indicator.

Honest limits (state them in the app's About panel and in the pitch):

- We cannot fix NASA's data. We mitigate gaps, mixed sources and detection bias, and solve navigation, conflict visibility, provenance and reproducibility.
- We never claim any planet is habitable, never present candidates as confirmed, never claim a data licence we have not verified.
- Planet surfaces are artist's impressions. Scene scales are not real scales.

**Out of scope (do not build):** YourAge, Sunrise, Sonification, What-If Slider, Postcards / light-travel postcard, Journey Calculator, Voice, RealScale mode, astronaut guide character, JWST badge, Open Exoplanet Catalogue ingestion, Gaia comparison, accounts/login, any database server.

## 2. How a user navigates

One continuous scene with three zoom levels, plus a chat panel that can drive all of them.

```
+--------------------------------------------------------------------------------+
| [Search planets/stars…]   Galaxy › TRAPPIST-1 › TRAPPIST-1 e      [Scientist ◐]  |
+--------------+---------------------------------------------+-------------------+
| FILTERS      |                                             |  RIGHT PANEL      |
| radius       |            3D CANVAS (the stage)            |  tab: HELM chat   |
| temperature  |   galaxy points → system → planet           |  tab: Planet card |
| method       |                                             |   (Data·Disputes· |
| distance     |   legend + "not to scale" labels            |    HAB-LAB·Compare)|
| year         |                                             |                   |
| contested ☐  |                                             |  [5 canned queries]|
+--------------+---------------------------------------------+-------------------+
| TIMELINE ▶ ──●────────── 1992 … 2026   count: 5,xxx planets   COMPARE TRAY [A][B]|
+--------------------------------------------------------------------------------+
| Attribution footer: NASA Exoplanet Archive · Exoplanet Encyclopaedia · Snapshot ID |
+--------------------------------------------------------------------------------+
```

**Journey:**

1. **Open the app → Galaxy view.** Each dot is a host star with known sky position and distance (the Sun/Earth is at the centre, labelled). Orbit with the mouse. Hover shows a tooltip (star, number of planets). The timeline at the bottom colours dots by detection method.
2. **Find something** three ways: type in the search bar, use filters (radius, temperature, method, distance, year, "contested only"), or ask HELM ("planets about Earth's size in the habitable zone").
3. **Click a dot (or a search result) → camera flies to the System view.** The star sits at centre, its planets orbit it. A speed slider controls animation. Labels read "orbit spacing and sizes not to scale". If the stellar inputs exist, a translucent habitable-zone band is drawn with a model caveat; otherwise nothing is drawn.
4. **Click a planet → Planet view.** A larger sphere in an artist's-impression style (labelled). The Planet card opens with four tabs:
   - **Data** — values with uncertainty bars, limit-flag markers, grey "unknown", and a RECEIPT chip on every number (click = open source). A DISPUTE badge shows when values conflict.
   - **Disputes** — a strip plot of every published solution per field (radius, mass, period, equilibrium temperature, stellar temperature) plus cross-catalog and status flags.
   - **HAB-LAB** — the checklist (habitable-zone position, size plausibility, mass plausibility, stellar type, data completeness), each with a confidence level and receipts, under a permanent detection-bias caveat. No verdict.
   - **Compare** — "Add to compare" puts the planet in the tray.
5. **Compare (VERSUS)**: select 2–3 planets (or "vs Earth", "vs Jupiter"); a side-by-side table shows values, uncertainty, unknowns and DISPUTE flags.
6. **Ask HELM at any time.** Answers contain receipt chips instead of raw numbers, and a line "Actions: focused camera on …". If the AI service is down, the five canned query buttons still work and everything else is unaffected.
7. **Scientist toggle** (stretch LEVELS): shows uncertainties and conflicts inline instead of on demand.
8. **Back**: breadcrumb clicks, `Esc`, or "Back to galaxy". The selected planet/system is single source of truth, so the canvas, card and chat can never disagree.

## 3. Features: behaviour, build recipe, acceptance

Priority order. Build in this order; later items are cut first.

### 3.1 HELM (must-build #1)
- **Does:** natural-language question → AI answer + scene actions (search/filter, focus camera, highlight, open comparison, drive timeline).
- **Build:** browser `helmClient` POSTs to `/api/helm`; server runs a bounded tool loop against Featherless; returns `{segments, actions, meta}`; browser validates and applies actions via `applyActions`. Details in section 8.
- **Accept:** tools are the only data path (no SQL/free-form queries); invalid tool arguments rejected and retried once; five canned queries work with the AI disabled; no digit appears in an answer without a receipt token; never says habitable/uninhabitable.

### 3.2 RECEIPTS (#2)
- **Does:** every number in the UI or an AI answer is a chip: value + type badge (A archive, C calculated, D explorer-derived) + short source label; click opens the source or a popover with formula and input chips; popover always shows the snapshot ID.
- **Build:** every field in the snapshot is a `Field` object with provenance (section 6.6). `<ReceiptChip planetId field />` reads it. Unknown → `<UnknownValue/>` (grey, "unknown").
- **Accept:** snapshot ID + field reproduces the number from `data/raw`; unknowns are grey; calculated chips list their inputs.

### 3.3 DISPUTE (#3)
- **Does:** flags planets whose published values conflict; shows the spread.
- **Build:** build-time statistics from NASA `ps` (level 1), optional cross-catalog flags from exoplanet.eu (level 2) and status flags (level 3). Strip plot = SVG with `d3-scale`. Algorithm in 6.5.
- **Accept:** covers radius, mass, orbital period, equilibrium temperature, stellar temperature; "contested" exactly follows the documented rule; unmatched cross-catalog planets read "not compared", never "disagree".

### 3.4 HAB-LAB (#4)
- **Does:** five-indicator checklist with confidence levels; permanent caveat: *"Detection methods favour certain planets, so this catalogue is not a representative sample. These are indicators, not a verdict."*
- **Build:** pure functions in `shared/domain/habLab.js`, computed at build time and stored; UI only renders. Rules in 6.4.
- **Accept:** no single "habitable" output anywhere (code, UI, AI); every indicator has a receipt; missing inputs yield "unknown", never a guess.

### 3.4b VERSUS (#5)
- **Does:** side-by-side for 2–3 planets plus Earth and Jupiter reference columns; shows uncertainty, unknown states and DISPUTE flags.
- **Build:** `CompareTray` + `ComparePanel` read `compareIds` from the store; references are constants tagged `type: 'reference'`.
- **Accept:** reference values are visually distinct from measured ones; orbit comparison is labelled not to scale.

### 3.5 FORGE-lite (#6)
- **Does:** class-based look: rocky, gas giant, hot/lava, icy, unclassified, plus atmosphere glow; always labelled "Artist's impression".
- **Build:** start with flat coloured spheres + fresnel glow (this *is* the accepted fallback and ships in the vertical slice). Only if ahead of schedule, add a small noise shader per class.
- **Accept:** class comes from the radius/temperature rule in 6.3; unknown radius → grey "unclassified".

### 3.6 TIMELAPSE (#7)
- **Does:** discovery scrubber 1992 → latest year, dots coloured by detection method (a visual of detection bias), play/pause, counter; HELM can drive it ("discoveries through 2015").
- **Build:** `timelineYear` in the store; galaxy shader hides hosts whose first discovery year > year. Counter counts planets from `planets.json`.
- **Accept:** scrubbing never reloads data; HELM `open_timeline` sets the year.

### 3.7 Stretch (in this order, only after the freeze checklist is green)
1. **LEVELS** — kid / student / scientist explanation levels (changes the HELM system prompt tone + Scientist toggle).
2. **TWIN** — Earth Twin Finder: ranks planets by an *indicative* Earth-similarity score built from HAB-LAB inputs; only planets with ≥4 of 5 inputs are ranked; labelled "indicative, not a habitability claim".
3. **EXTREMES** — Hall of Extremes (hottest, densest, closest…); each entry is one HELM action over `search_planets` with a sort.
4. **TOUR** — AI-written cinematic tours; only if HELM is stable. Probably skip.

---

# PART B — TECHNICAL BLUEPRINT

## 4. Final technology stack

| Layer | Choice | Why | Trade-off |
|---|---|---|---|
| Frontend | **Vite + React (JavaScript)**, existing repo | Repo already exists; beginners; zero migration cost | No compile-time types → compensated by Zod validation at every boundary and JSDoc on shared functions |
| 3D | **three + @react-three/fiber + @react-three/drei** (already installed) | Declarative scene; drei `CameraControls` gives smooth `setLookAt(..., true)` camera moves | Learning curve for beginners; mitigated by tiny reusable components |
| State | **zustand** | One store = one source of truth, trivially readable from canvas and DOM | One extra tiny dependency |
| UI/styling | **Plain CSS with CSS variables** | No build config, no dependency | More hand-written CSS than Tailwind |
| Charts | **SVG + `d3-scale`** | Strip plot and uncertainty bars are simple; full control; tiny | No chart library niceties |
| Validation | **zod** (shared JS) | Tool args, actions, snapshot shape, one definition both sides | Extra dependency; worth it |
| Data pipeline | **Node.js scripts** using built-in `fetch` + existing `papaparse` | Same language as the app (beginners), no Python toolchain | Pandas-style analysis is clunkier; our maths is simple |
| Runtime backend | **One Vercel serverless function** (`api/helm.js`) | Only feature needing a server is the secret AI key; host is free/simple | In-memory queue is per-instance (acceptable at demo traffic) |
| Data at runtime | **Static JSON snapshot** in `public/snapshots/<id>/`, loaded into memory by browser and function | 6.5k planets/~40k solutions fit memory; no DB to run | No ad-hoc queries (by design: AI uses typed filters only) |
| AI | **Featherless** (OpenAI-compatible `/v1/chat/completions`), Qwen 3 family candidate | Documented native tool calling for Qwen 3 / Kimi K2 | Plan has 4 concurrency units; see 8.8 |
| Tests | **vitest** (pure domain functions) + Node verify scripts | Calculations are where honesty bugs live | One dev dependency |
| Hosting | **Vercel** (GitHub import) | Static + function in one place | Function timeout limits; see 16 |

**Allowed new dependencies (and only these):** `zustand`, `zod`, `d3-scale`, `vitest` (dev). Anything else requires a human-approved entry in `docs/DECISIONS.md`. Remove `papaparse` from browser bundles (pipeline-only use).

**Why we changed two of the earlier suggestions:** earlier discussion floated TypeScript and a Python pipeline. The repo is JavaScript and the team is new to coding, so a single language with runtime validation is lower risk than two languages and a type system.

## 5. System overview and data flow

```
 BUILD TIME (run by us, results committed)                  RUNTIME (browser + 1 function)
 ───────────────────────────────────────────                 ───────────────────────────────
 NASA TAP: pscomppars ─┐                                   ┌─► public/snapshots/<id>/
 NASA TAP: ps ─────────┤  scripts/build-snapshot.js        │     manifest.json  galaxy.json
 exoplanet.eu TAP ─────┤  1 fetch + pin columns            │     planets.json   solutions.json
 Exo-MerCat TAP ───────┘  2 normalise + names              │     crosscatalog.json (gated)
                          3 derive (Kepler, L, S, class)   │
 data/raw/<id>/*.csv ◄─── 4 DISPUTE stats from ps          │    Browser                       Vercel fn /api/helm
   (immutable copy)       5 HAB-LAB + completeness         │    ┌──────────────┐  POST     ┌──────────────────┐
                          6 receipts provenance            │    │ React+R3F    │──────────►│ tool loop         │
                          7 write snapshot + hash ─────────┘    │ zustand store│ message   │ Featherless LLM   │
                                                                │ loads JSON   │◄──────────│ typed tools over  │
                                                                └──────┬───────┘ segments  │ in-memory snapshot│
                                                                  applyActions    actions   └──────────────────┘
                                                                  → camera/highlight/timeline/compare
```

**Flow, source to screen:**

1. **Fetch (build time).** `build-snapshot.js` pulls `pscomppars` (one canonical row per planet) and `ps` (every published solution) from NASA's TAP service as CSV, using a pinned column whitelist. Until `ps` is fetched, the already-downloaded `pscomppars` CSV in the repo is the input (so the app works early).
2. **Connect `ps` and `pscomppars`.** Join key = `pl_name` (exact string). `pscomppars` gives the canonical value shown by default; `ps` rows with the same `pl_name` are the "solutions" behind DISPUTE.
3. **Cross-catalog (optional, time-boxed).** exoplanet.eu rows are fetched through its TAP service; Exo-MerCat is used **as a name bridge only** (it keeps the single most precise value, so it cannot show disagreement by itself). Value comparison is NASA vs exoplanet.eu. Unmatched → "not compared".
4. **Derive.** Semi-major axis, luminosity, insolation, density, planet class, HZ edges, HAB-LAB indicators, completeness, DISPUTE stats — each stored as a `Field` tagged `calculated` or `derived`, with inputs.
5. **Snapshot.** Files written to `public/snapshots/<snapshotId>/`; manifest records fetch time, row counts, content hash, latest `rowupdate`. `public/snapshots/latest.json` points to the active ID. Raw CSVs are kept in `data/raw/<snapshotId>/`.
6. **Browser load.** `loadSnapshot()` fetches `latest.json` → `manifest.json` → `galaxy.json` (small, drawn immediately) → `planets.json` (details; loaded in the background) → `solutions.json` only when the Disputes tab opens.
7. **Interaction.** Zustand store holds `viewLevel`, `selectedPlanetId`, `selectedSystemId`, filters, highlights, timeline, compare list. Canvas and panels subscribe to it.
8. **AI.** Browser sends the message + a tiny UI context to `/api/helm`. The function loads the same snapshot, runs the LLM tool loop, executes **data tools** locally (typed filters over memory) and records **scene tools** as action objects. It returns text with receipt tokens plus the action list. The browser validates the actions again and applies them, which moves the camera, highlights and so on. **The AI never touches a database, a file or the DOM.**

## 6. Data pipeline and calculations

### 6.1 Sources and roles

| Source | Role | Fetch |
|---|---|---|
| NASA Exoplanet Archive `pscomppars` | Canonical row per planet (galaxy, system, cards) | TAP `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=<ADQL>&format=csv`; existing repo CSV usable as input |
| NASA `ps` | All solutions per planet → DISPUTE | Same TAP, whitelisted columns only (full `ps` is very wide) |
| exoplanet.eu (Exoplanet Encyclopaedia) | Independent second catalog (value + status) | TAP at `voparis-tap-planeto.obspm.fr` (discover table/columns with `scripts/probe-tap.js`; do not guess names) |
| Exo-MerCat | Name reconciliation | TAP at `archives.ia2.inaf.it` (probe first) |

Not used: Open Exoplanet Catalogue, Gaia DR3 (dropped to protect the schedule), ExoFOP, ADS, exo.MAST, PHL HWC (private sanity check only, never bundled).

### 6.2 Schema pinning
- `data/config/columns.pscomppars.json` and `columns.ps.json` are the pinned whitelists, created in Phase 0 **from the real CSV header**, not from memory.
- Needed per planet (verify actual names): `pl_name, hostname, discoverymethod, disc_year, disc_facility, pl_rade, pl_bmasse, pl_bmassprov, pl_orbper, pl_orbsmax, pl_orbeccen, pl_eqt, pl_insol, st_teff, st_rad, st_mass, st_lum, sy_dist, ra, dec, rowupdate`, each with its `err1`, `err2`, `lim` columns where they exist, plus the reference columns (`*_reflink` and/or `pl_refname`, `st_refname`, `sy_refname`) and the Gaia DR3 ID column if present (NASA split the Gaia ID column in Oct 2025).
- **The build fails loudly** (non-zero exit, message naming the column) if any whitelisted column is missing. Never silently continue.
- The full 49 MB CSV remains an immutable raw source (`data/raw/…`); the *runtime* snapshot contains only whitelisted columns plus derived fields. This is how we keep every record while keeping the app fast.

### 6.3 Derived values (each stored with `type` and `inputs`)

| Value | Rule | Type |
|---|---|---|
| Semi-major axis (if `pl_orbsmax` missing) | `a[AU] = cbrt(M★[M☉] · (P[d]/365.25)²)` needs `st_mass`, `pl_orbper` | calculated |
| Stellar luminosity | `L[L☉] = 10^st_lum` (archive gives log10). If missing: `L = (st_rad)² · (st_teff/5772)⁴` | calculated (second route has lower confidence) |
| Insolation (if `pl_insol` missing) | `S[S⊕] = L / a²` | calculated |
| Bulk density | `ρ = 5.51 · M[M⊕] / R[R⊕]³` g/cm³; only if both known; flag when mass is a Msini lower bound (`pl_bmassprov`) | calculated |
| Habitable-zone edges | Kopparapu et al. 2013 polynomial, see 6.4 | calculated |
| Planet class (FORGE) | Radius bands (explorer heuristic): `R ≤ 1.6` rocky; `1.6 < R ≤ 6` sub-Neptune/Neptune-like; `R > 6` gas giant. Overrides: `pl_eqt ≥ 1000 K` and rocky → "hot/lava"; `pl_eqt ≤ 250 K` and rocky/sub-Neptune → "icy"; no radius → "unclassified" | explorer-derived |
| Completeness | fraction of 12 key fields present: radius, mass, period, semi-major axis, eccentricity, eq. temperature, insolation, star Teff, star radius, star mass, star luminosity, distance | explorer-derived |
| Galaxy position | `x = d·cosδ·cosα`, `y = d·cosδ·sinα`, `z = d·sinδ` (d in pc); display radius compressed with `r' = k·ln(1 + r/r0)` keeping direction | explorer-derived (display only) |

All thresholds live in `shared/domain/thresholds.js` with a comment "explorer heuristic" and are shown in help text. **Missing inputs produce `null`, never 0.**

### 6.4 HAB-LAB rules (no verdict, ever)

Habitable-zone model (Kopparapu et al. 2013): `Seff = Seff☉ + aT + bT² + cT³ + dT⁴`, `T = Teff − 5780 K`, edge distance `d[AU] = sqrt(L / Seff)`. Valid roughly for 2600 K ≤ Teff ≤ 7200 K; outside that, HZ = unknown.

Coefficients (written from memory — **the agent MUST verify them with the unit test below and by checking the published table if network allows; if either fails, stop and report**):

| Edge | Seff☉ | a | b | c | d |
|---|---|---|---|---|---|
| Recent Venus (optimistic inner) | 1.7753 | 1.4316e-4 | 2.9875e-9 | −7.5702e-12 | −1.1635e-15 |
| Runaway greenhouse (conservative inner) | 1.0512 | 1.3242e-4 | 1.5418e-8 | −7.9895e-12 | −1.8328e-15 |
| Moist greenhouse | 1.0140 | 8.1774e-5 | 1.7063e-9 | −4.3241e-12 | −6.6462e-16 |
| Maximum greenhouse (conservative outer) | 0.3438 | 5.8942e-5 | 1.6558e-9 | −3.0045e-12 | −5.2983e-16 |
| Early Mars (optimistic outer) | 0.3179 | 5.4513e-5 | 1.5313e-9 | −2.7786e-12 | −4.8997e-16 |

Unit test: Teff = 5780, L = 1 must give about 0.75 AU (recent Venus), about 0.97 AU (runaway), about 0.99 AU (moist), about 1.67 AU (max greenhouse), about 1.77 AU (early Mars), tolerance ±0.03 AU.

Indicators (stored under `planet.hab`, each `{status, label, confidence, receipts[]}`; `confidence ∈ high|medium|low|unknown`):

1. **HZ position** — status is one of `in_conservative`, `in_optimistic_only`, `outside_inner`, `outside_outer`, `unknown`. Confidence = minimum over inputs (measured=high, calculated=medium, derived L route=low). Note if eccentricity is large or unknown.
2. **Size plausibility** — `R ≤ 1.6 R⊕`: "in the range commonly associated with rocky planets"; `1.6 < R ≤ 2.5`: "uncertain, may retain thick gas envelope"; `R > 2.5`: "likely gas-rich". Confidence from radius relative error (<10% high, otherwise medium; limit flag → low).
3. **Mass plausibility** — mass `0.1–10 M⊕`; if `pl_bmassprov` shows Msini, confidence is capped at low and the label says "lower bound".
4. **Stellar type** — class from Teff (O/B/A/F/G/K/M ranges). Status is descriptive only.
5. **Data completeness** — the completeness score.

Permanent caveat component `<DetectionBiasCaveat/>` is mounted in HAB-LAB, the timeline legend and the AI system prompt.

### 6.5 DISPUTE algorithm (build time, from `ps`)

For each planet and each field in `{pl_rade, pl_bmasse, pl_orbper, pl_eqt, st_teff}`:

1. Collect solutions: all `ps` rows with that `pl_name`, keep rows with a non-null value. Drop solutions whose limit flag is set (they are bounds, not measurements) but count them in `nLimit`.
2. Interval for each solution: `[v + err2, v + err1]` (NASA `err2` is negative). Missing uncertainty → zero-width interval and set `uncertaintyMissing: true`.
3. `n` = number of distinct solutions; `nRefs` = number of distinct reference strings; `min`, `max`.
4. `contested = true` iff `n ≥ 2` and at least one pair of intervals does not overlap. This is the documented rule shown in the UI. If every solution lacks uncertainty, report `contested: null` ("cannot assess") rather than guessing a threshold.
5. Planet-level flag `disputed = any field contested`.

Cross-catalog (level 2): per field compare NASA canonical interval with the exoplanet.eu interval using the same overlap rule; if neither side has uncertainty → "cannot assess". Status (level 3): NASA confirmed vs EU status string → `agree | disagree | not_compared`.

### 6.6 Receipts data model

Every displayed number is a `Field`:

```js
// shared/schemas.js (zod) — conceptual shape
Field = {
  v: number | null,           // value
  e1: number | null,          // upper uncertainty (positive)
  e2: number | null,          // lower uncertainty (negative)
  lim: -1 | 0 | 1 | null,     // lower limit / not a limit / upper limit
  type: 'archive' | 'calculated' | 'derived' | 'reference',
  ref: { text: string, href: string | null } | null,   // source paper for archive values
  formula: string | null,     // e.g. 'kepler3', 'kopparapu2013:runaway'
  inputs: string[] | null,    // receipt ids of inputs for calculated/derived
}
// receipt id = `${planetId}.${fieldName}` e.g. "trappist-1-e.pl_rade"
```

- `planetId` = slug of `pl_name` (lowercase, non-alphanumerics → `-`), collisions get `-2`, `-3`. `systemId` = slug of `hostname`.
- Reference parsing: archive reference columns may be HTML anchors. Parse `href` and visible label with a tolerant regex; always keep the raw string; if parsing fails show the raw text and drop the link (documented fallback).
- Snapshot ID format `YYYY-MM-DD-<8 hex of content hash>`.
- **Manifest** stores: `snapshotId, fetchedAt, sources[{name, url/query, rowCount}], contentHash, latestRowUpdate, columnWhitelistHash, counts{planets,hosts,withPosition,withSolutions}, fileSizes`.

### 6.7 Name reconciliation (cross-catalog)
1. Exo-MerCat's reconciled names / aliases first.
2. Fallback: normalised name (lowercase, strip spaces/hyphens/punctuation) plus sky position within a small tolerance.
3. Still unmatched → `not_compared`.

### 6.8 Licensing gate
Licensing of exoplanet.eu is unverified. `crosscatalog.json` is **git-ignored by default**. The app must work without it (cross-catalog UI shows "not compared"). Before it may be committed or deployed, a human records the verified terms in `docs/DECISIONS.md` and removes it from `.gitignore`. Credit exoplanet.eu in the footer regardless.

### 6.9 Size budget (report actual sizes at the end of Phase 1)
`galaxy.json` < 1.5 MB, `planets.json` < 12 MB (gzip < 3 MB), `solutions.json` < 8 MB. If exceeded: drop non-essential fields from `solutions.json` first (keep the five DISPUTE fields + reference), never drop receipts.

## 7. Frontend architecture

- **Store** (`src/store/explorerStore.js`, zustand): `snapshot`, `viewLevel` (`galaxy|system|planet`), `selectedSystemId`, `selectedPlanetId`, `hoverId`, `filters`, `highlightIds`, `timelineYear`, `timelinePlaying`, `compareIds`, `scientistMode`, `helm {messages, status}`, `cameraRequest`. Only actions mutate it.
- **Scene** (`src/scene/`):
  - `SceneRoot` — `<Canvas>`, `<CameraControls>` ref, background stars, switches children by `viewLevel`.
  - `GalaxyPoints` — one `THREE.Points` with a small custom shader: per-vertex size, colour, visibility (timeline), highlight ring. Hover/click picking in **screen space**: project ~4.8k points on pointer move and take the nearest within 12 px (robust and cheap, avoids raycaster threshold problems).
  - `SystemView` — `StarMesh`, `OrbitLine`, `PlanetMesh`, optional `HabitableZoneBand`. Orbit radii use a log mapping of semi-major axis; planets without any orbit estimate go on a dashed "orbit unknown" ring. Orbital angular speed from period (relative), scaled by the speed slider. Labels: "orbit spacing and sizes not to scale".
  - `PlanetView` — larger `PlanetMesh` + `AtmosphereGlow`; "Artist's impression" label.
  - `cameraDirector.js` — the only place that calls `cameraControls.setLookAt(...)`; store `cameraRequest` objects are consumed here. Guard against interrupting a running transition (queue or replace).
- **Panels** (`src/panels/`): `SearchBar`, `FiltersPanel`, `PlanetCard` (+ `DataTab`, `DisputePanel`, `HabLabPanel`), `HelmChat`, `CompareTray`/`ComparePanel`, `Timeline`, `Footer`. **Components**: `ReceiptChip`, `UnknownValue`, `UncertaintyBar`, `Tooltip`, `DetectionBiasCaveat`.
- **Performance rules:** render only the active level's objects; never create one 3D object per planet; one shared geometry/material per class; galaxy = one draw call; `solutions.json` loaded lazily; no per-frame React state updates (animate in `useFrame`).
- **Field dictionary:** `src/data/fieldDictionary.js`, about 25 fields (label, unit, plain-language explanation, source type) surfaced as tooltips.
- **Footer:** the NASA acknowledgement ("This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program."), the Archive DOI **only after the agent verifies it on the Archive's citation page**, Exoplanet Encyclopaedia credit, snapshot ID and fetch date.
- **Accessibility/motion:** labelled controls, high-contrast panels, respect `prefers-reduced-motion` (instant camera moves, no auto-play).

## 8. HELM architecture (AI astronomer)

### 8.1 Request path
`HelmChat → helmClient.send(message) → POST /api/helm → server/helm/handler.js → (Featherless) → JSON response → validate → applyActions + render chips`.

### 8.2 Request / response contracts

```jsonc
// POST /api/helm  (request)
{ "message": "string (<=500 chars)",
  "history": [ {"role":"user|assistant","text":"..."} ],   // last <= 4 turns, text only
  "ui": { "viewLevel":"galaxy|system|planet", "selectedPlanetId": "id|null", "timelineYear": 2026 } }

// 200 response
{ "segments": [ {"t":"text","v":"…"}, {"t":"receipt","id":"trappist-1-e.pl_rade"} ],
  "actions":  [ /* see 8.4 */ ],
  "meta": { "snapshotId":"…", "model":"…", "source":"ai|canned|fallback", "notice": "string|null" } }
// errors: 400 invalid request, 429 busy (client shows canned queries), 503 AI unavailable → client uses fallback path
```

### 8.3 Tools (typed, validated with zod, executed server-side)

**Data tools** (result goes back to the model):
- `search_planets(filters)` → at most 10 rows: `{id, name, host, status, distancePc, fields:{…as receipt tokens + short value}, disputed}`.
  `filters`: `nameQuery?, radiusEarth{min?,max?}, massEarth{min?,max?}, eqTempK{min?,max?}, periodDays{min?,max?}, distancePc{max?}, discYear{min?,max?}, method?(enum from snapshot), hz? ('in_conservative'|'in_optimistic'), contestedOnly?, hasFields?(string[]), sortBy?(enum), sortDir?, limit?(<=10)`.
- `get_planet({planetId})` → compact record: key fields as `{token, value, status:'known|unknown'}`, hab indicators, dispute summary.
- `compare_planets({planetIds: [2–3 ids or 'earth'|'jupiter']})` → compact table; **also emits** an `open_compare` action.

**Scene tools** (return `{ok:true}` to the model; emit an action):
- `focus_camera({targetId, level:'system'|'planet'|'galaxy'})` → action `focus`.
- `highlight({planetIds[≤50], mode:'set'|'clear'})` → action `highlight`.
- `open_timeline({throughYear, playing?})` → action `timeline`.

Invalid arguments never reach the data layer: zod rejects them, the server returns `{error:"…field…"}` as the tool result once so the model can retry; a second failure ends the loop with the fallback answer.

### 8.4 Actions (server → browser, zod-validated again in the browser)
`{type:'focus', targetId, level}`, `{type:'highlight', ids, mode}`, `{type:'timeline', year, playing}`, `{type:'open_compare', ids}`, `{type:'select', id}`. `applyActions` maps each to store updates; `cameraDirector` performs the move. Unknown action types are ignored and logged.

### 8.5 Preventing invented science (defence in depth)
1. **Tools only.** No tool takes free text beyond a name query; the model never sees raw tables.
2. **Number tokens.** Tool results give values for reasoning but the system prompt requires the model to write `{{r:<receiptId>}}` instead of digits. The browser renders a chip.
3. **Output validator** (`server/helm/validate.js`): scans the final text outside tokens; allowed bare numbers are small counts (≤ 20) and years 1992–2026; any other number → one regeneration with a corrective message; second failure → deterministic template answer built from the tool results.
4. **Forbidden phrases** (regex): "is habitable", "uninhabitable", "can support life", "Earth-like world" as a claim, "confirmed candidate", etc. ("habitable zone" is allowed). Same regeneration/fallback path.
5. **Unknowns:** tool results mark missing fields `status:'unknown'` and the prompt says to say "unknown".
6. **Candidates:** the snapshot contains confirmed planets only; any `status` other than `confirmed` must be described as a candidate. Dispute flags returned by tools must be mentioned when present.
7. **Strip `<think>…</think>`** blocks before validation (Qwen 3 may emit them; try Featherless chat-template options to disable thinking and verify behaviour in the bake-off).

### 8.6 System prompt (≤ ~700 tokens, in `server/helm/prompt.js`)
Contents: role (HELM, an astronomer who operates the explorer through tools); rules 1–6 from section 8.5 in plain imperative sentences; "never declare a planet habitable or uninhabitable; talk about indicators and the habitable zone"; "mention detection-method bias when discussing habitability or discovery counts"; "after tool calls, answer in ≤ 120 words"; "use the user's selected planet from the UI context only if the user refers to 'this planet'". No datasets or numbers embedded.

### 8.7 Canned queries (work with the AI off; `src/helm/cannedQueries.js` + same tool executors on the server or in-browser)
1. "Which planets are about Earth's size and sit in the habitable zone?" → `search_planets{radius 0.8–1.6, hz in_optimistic}` + `highlight` + `focus_camera` (galaxy).
2. "Which planets have the most disputed measurements?" → `search_planets{contestedOnly, sortBy: nSolutions desc}` + `highlight`.
3. "Compare TRAPPIST-1 e with Earth." → `compare_planets` + `open_compare` (agent verifies the planet exists in the snapshot).
4. "Show discoveries through 2015." → `open_timeline{2015}`.
5. "Fly me to the nearest known exoplanet." → `search_planets{sortBy: distance asc, limit 1}` + `focus_camera`.
Answers use templates with receipt chips. Each query is covered by a test that runs against the real snapshot.

### 8.8 Featherless specifics and limits
- Base URL `https://api.featherless.ai/v1`, OpenAI-compatible, `Authorization: Bearer <server key>`.
- Native tool calling is documented for the **Qwen 3 family** and **Kimi-K2-Instruct** (doc last edited Aug 2025; catalogue has newer families, so test the exact model ID). No strict JSON-schema output is documented, so we **validate with zod and retry** rather than rely on constrained decoding.
- Plan: **$25 Premium = 4 concurrency units**: four ≤15B requests, or two ≤34B, or one 70B+ (Kimi/DeepSeek/GLM). Extra requests return HTTP 429. Context is reported as up to ~32K on third-party listings, not confirmed in official docs: keep tool results small anyway.
- **Model selection** by `scripts/bakeoff-models.js` in Phase 0: run the five canned prompts × 3 repeats against candidates (a ≤15B Qwen 3, a ≤34B Qwen 3, optionally a newer Qwen), measure valid-tool-call rate, correct-tool rate, latency, `<think>` leakage. Pick the smallest model with ≥ 90% valid calls (more lanes = more demo reliability). Set via `FEATHERLESS_MODEL`; `FEATHERLESS_FALLBACK_MODEL` is tried once on failure.
- **Queue and limits** (`server/helm/queue.js`): semaphore sized by `HELM_MAX_INFLIGHT` (≤ units / model cost), waiters time out after `HELM_QUEUE_WAIT_MS` and return 429; upstream 429 → backoff 1 s then 2 s (max 2 retries); per-call timeout 20 s; per-IP limit `HELM_RATE_LIMIT_PER_MIN`; the loop makes at most 3 model calls per user message.
- **Team rule:** the key is shared; freeze AI testing while recording the demo.
- The terms of an individual plan have not been read; skim them before a public demo. A Scale plan ($75+/month) is the safety margin.

## 9. API and module contracts (summary)

| Contract | Defined in | Used by |
|---|---|---|
| Snapshot file shapes, `Field`, manifest | `shared/schemas.js` | pipeline writes; browser + function read; `verify-snapshot.js` checks |
| Tool args/results, actions, request/response | `shared/schemas.js` | server validates; browser validates actions |
| Filters semantics | `shared/filters.js` (`applyFilters(planets, filters)`) | browser filters panel AND server `search_planets` (identical behaviour) |
| Receipt token format `{{r:id}}` | `shared/receipts.js` (`formatToken`, `parseSegments`) | server output; `HelmChat` |
| Domain maths | `shared/domain/*.js` | pipeline; tests; (UI never recomputes science) |

Changing a contract = proposal in `docs/DECISIONS.md` → human approval → Integrator edits `shared/` → other agents update. Nobody else edits `shared/schemas.js`.

## 10. Security and environment variables

| Variable | Where | Notes |
|---|---|---|
| `FEATHERLESS_API_KEY` | server only (`.env.local`, Vercel env) | never in `VITE_*`, public files, Git, logs or error messages |
| `FEATHERLESS_BASE_URL` | server | default `https://api.featherless.ai/v1` |
| `FEATHERLESS_MODEL`, `FEATHERLESS_FALLBACK_MODEL` | server | from bake-off |
| `HELM_MAX_INFLIGHT` (default 2), `HELM_QUEUE_WAIT_MS` (8000), `HELM_RATE_LIMIT_PER_MIN` (20) | server | |
| `SNAPSHOT_ID` | server, optional | override of `latest.json` |

Rules: `.env.local` in `.gitignore` (verify in Phase 0); commit `.env.example` with names and no values; agents never read, print or paste the key — the human creates the file; the function returns generic errors (no upstream bodies); CORS: same-origin only; message length cap 500 chars; history cap; no user data stored.

## 11. Project directory structure

```
Exoplanet-explorer/
├─ AGENTS.md                      # short project rules for every agent (< 150 lines)
├─ docs/
│  ├─ ARCHITECTURE.md             # this file
│  ├─ PROGRESS.md                 # phase checklist, updated at every gate
│  ├─ DECISIONS.md                # approved deviations, licensing notes
│  ├─ REVIEWS.md                  # reviewer notes per phase
│  └─ probes/                     # TAP probe reports
├─ data/
│  ├─ raw/<snapshotId>/           # immutable source CSVs (move existing CSV here after human approval)
│  └─ config/columns.pscomppars.json, columns.ps.json
├─ scripts/
│  ├─ build-snapshot.js  verify-snapshot.js  probe-tap.js  bakeoff-models.js  crosscatalog.js
│  └─ lib/ (tap.js, csv.js, refs.js, names.js, snapshotIO.js)
├─ shared/                        # plain ESM JS used by pipeline, server AND browser
│  ├─ schemas.js  filters.js  receipts.js
│  └─ domain/ (kepler.js, luminosity.js, hz.js, classify.js, completeness.js, dispute.js, habLab.js, galaxyPosition.js, thresholds.js)
├─ server/
│  ├─ dev.js                      # local node:http wrapper for the function
│  └─ helm/ (handler.js, llm.js, tools.js, prompt.js, validate.js, canned.js, queue.js, snapshotStore.js)
├─ api/helm.js                    # Vercel function → server/helm/handler.js
├─ public/snapshots/<id>/ (manifest.json, galaxy.json, planets.json, solutions.json, crosscatalog.json*)
├─ public/snapshots/latest.json
├─ src/
│  ├─ main.jsx  App.jsx  styles/
│  ├─ store/explorerStore.js
│  ├─ data/ (loadSnapshot.js, fieldDictionary.js)
│  ├─ scene/ (SceneRoot, GalaxyPoints, SystemView, PlanetView, StarMesh, OrbitLine, PlanetMesh, AtmosphereGlow, HabitableZoneBand, cameraDirector.js)
│  ├─ panels/ (SearchBar, FiltersPanel, PlanetCard, DataTab, DisputePanel, StripPlot, HabLabPanel, HelmChat, ComparePanel, CompareTray, Timeline, Footer)
│  ├─ components/ (ReceiptChip, UnknownValue, UncertaintyBar, Tooltip, DetectionBiasCaveat)
│  └─ helm/ (helmClient.js, applyActions.js, cannedQueries.js)
├─ tests/ (domain.*.test.js, filters.test.js, validate.test.js, snapshot.test.js, canned.test.js)
├─ vercel.json   .env.example   .gitignore   package.json   vite.config.js
```
\* gated, see 6.8.

npm scripts: `dev` (Vite), `dev:api` (`node --env-file=.env.local server/dev.js`, needs Node ≥ 20.6, otherwise allow `dotenv`), `snapshot`, `verify:snapshot`, `probe:tap`, `bakeoff`, `test`, `build`. Vite dev server proxies `/api` to `localhost:8787`.

## 12. Antigravity workflow (you run it from ONE machine)

**Setup before coding (Phase 0):** copy this file to `docs/ARCHITECTURE.md`; create `AGENTS.md` (hard rules + pointers, kept short so it stays in context; if your Antigravity version expects project rules in another location such as `.agent/rules/`, put a copy there too); create `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/REVIEWS.md`; commit on a branch.

**Model roles** (all three appear in your picker; Argon 4 is documented as unsupported in the standalone IDE, so if it disappears or errors, Opus takes the hard modules and Flash the rest; Opus 4.6 is scheduled for removal from Antigravity on 2 November 2026 — if the build runs past that, Argon reviews):

| Role (separate conversation) | Model | Owns / does |
|---|---|---|
| **Data engineer** | Argon 4 | `scripts/`, `shared/domain/`, `data/`, snapshot, DISPUTE/HAB-LAB maths + tests |
| **HELM engineer** | Argon 4 | `server/`, `api/`, `shared/schemas.js` consumers, tool loop, validator, bake-off |
| **3D / frontend engineer** | Flash for panels, CSS, tooltips, tests; Argon 4 for `scene/` and camera director | `src/` |
| **Reviewer / Integrator** | Opus 4.6 | Reads each phase diff against this file and `AGENTS.md`; writes findings to `docs/REVIEWS.md`; does final integration, cross-module debugging and the only edits to `shared/schemas.js`; final code review before freeze |

Rule of thumb: **Argon builds hard things, Flash builds repetitive things, Opus checks and joins things.** Escalate a bug that survives two Flash attempts to Argon, then to Opus.

**Parallelism (one machine, beginners): at most 2 writing conversations at once, in disjoint folders.**

| Can run in parallel | Must be sequential |
|---|---|
| Data pipeline (`scripts/`, `shared/domain/`) ∥ frontend shell (`src/`) once `galaxy.json` v0 and `schemas.js` exist | Phase 0 audit → contracts (`schemas.js`) → everything else |
| HELM server ∥ scene work (after contracts) | Any change to `shared/schemas.js`, `package.json`, store shape |
| Tests ∥ UI polish | Phase gates, merges to `main`, deployment |

**Preventing conflicting decisions:** this file is the single authority; `AGENTS.md` repeats the rules; each agent starts a *new* conversation per phase and begins by reading `AGENTS.md`, `docs/PROGRESS.md` and the relevant sections; any deviation goes into `docs/DECISIONS.md` for human approval before coding; folder ownership as in the table (a conversation edits only its folders; for anything else it writes a request in `docs/PROGRESS.md`).

**Git:** `main` is always deployable and only a human merges to it. Work on `phase/<n>-<name>` branches. Commit after each green checkpoint (`feat(data): …`, `fix(scene): …`). Tag gates: `slice-v1`, `freeze`. Never force-push, never rewrite history, `git status` clean before starting a phase. Agents may commit to the phase branch after build + tests pass, but never push, merge or switch branches without being asked.

**Gate protocol (every phase):** run `npm run build` and `npm test`; report changed files, test results, sizes, open risks and what was *not* done in plain language; update `docs/PROGRESS.md`; commit to the branch; **stop for human review**.

## 13. Implementation sequence

Hours are from kickoff. Feature freeze at hour 19; demo video at hour 22.

| Phase | Hours | Build | Files / modules | Depends on | Who | Verify |
|---|---|---|---|---|---|---|
| **0 Audit + Hour-1 probes** | 0–1 | Audit repo; CSV header, size, row count; propose whitelist; move CSV out of `public/` (after approval); test TAP `ps` with a tiny query; read-only probes of EU/Exo-MerCat TAP; model bake-off (human provides key in `.env.local`); create docs + `AGENTS.md` | `docs/*`, `AGENTS.md`, `scripts/probe-tap.js`, `scripts/bakeoff-models.js`, `data/config/*` | – | Opus (docs/review), Argon (probes, bake-off) | Report with real header, row count, probe results, chosen model |
| **1a Contracts + pscomppars snapshot** | 1–3 | `shared/schemas.js`; derive fields; write snapshot v0 from the existing CSV: `manifest`, `galaxy`, `planets` | `shared/*`, `scripts/build-snapshot.js`, `scripts/verify-snapshot.js`, `tests/domain.*` | 0 | Argon (+Opus review of schemas) | `npm run snapshot` + `verify:snapshot` green; counts match CSV; HZ unit test passes; sizes reported |
| **1b `ps` + DISPUTE** | 2–4 ∥ with 2 | Fetch `ps` (whitelisted); `solutions.json`; DISPUTE stats | same + `lib/tap.js` | 1a | Argon | Spot-check 5 planets against NASA's site manually; fallback: DISPUTE on mass and radius only |
| **2 App shell + catalog** | 2–5 ∥ with 1b | Layout, store, `loadSnapshot`, search, filters, minimal Planet card with RECEIPT chips and grey unknowns, footer | `src/store`, `src/data`, `src/panels`, `src/components`, `shared/filters.js` | 1a | Flash (UI) + Argon (store) | Search finds a planet; unknown fields grey; chip shows source + snapshot ID |
| **3 VERTICAL SLICE** | 4–8 | Galaxy points; click → system → planet (flat coloured spheres + glow); camera director; **HELM with `search_planets` + `focus_camera` through Featherless**; canned query #5 and #1 working without AI; deploy a preview | `src/scene/*`, `server/*`, `api/helm.js`, `src/helm/*`, `vercel.json` | 1a, 2 | Argon (scene, HELM), Flash (labels), Opus (integrate + review) | See slice acceptance below; **tag `slice-v1`** |
| **4 RECEIPTS + DISPUTE UI** | 8–11 | Full chips (calculated popovers with inputs), uncertainty bars, limit markers, DISPUTE badge, Disputes tab + strip plot | `src/components`, `src/panels/DisputePanel`, `StripPlot` | 1b, 3 | Flash + Argon | Click-through of 5 chosen planets; contested rule matches the unit tests |
| **5 HAB-LAB + VERSUS + FORGE-lite** | 11–14 | HAB-LAB tab and caveat; compare tray + panel with Earth/Jupiter refs; class styling | `shared/domain/habLab.js`, `src/panels/*`, `scene/PlanetMesh` | 1a, 4 | Argon (logic), Flash (UI) | No verdict anywhere (grep test); references visually distinct |
| **6 Full HELM + TIMELAPSE** | 12–16 | `get_planet`, `compare_planets`, `highlight`, `open_timeline`; validator; all 5 canned queries; fallback template; timeline scrubber | `server/helm/*`, `src/panels/Timeline`, `GalaxyPoints` | 3, 4 | Argon | Validator tests (digits, forbidden phrases); kill the key → canned queries still work |
| **7 Cross-catalog (time-boxed 3 h)** | 14–17 | EU fetch, name matching, value + status flags; gated file | `scripts/crosscatalog.js`, UI badges | 1b | Argon | Matched share reported; "not compared" shown for rest; if matching is messy → restrict to Exo-MerCat matches |
| **8 Stretch** | 16–19 | LEVELS → TWIN → EXTREMES (stop when time is out) | – | 6 | Flash/Argon | Each is optional |
| **FREEZE** | 19 | Freeze checklist (section 14) | – | – | Opus review | All must-build acceptance items pass |
| **9 QA + deploy + demo** | 19–22 | Mobile/layout pass, console errors, performance, Vercel production deploy, demo script and video | – | – | Opus + humans | Deployed URL works with the key removed (canned only) and with it |

**Vertical slice acceptance (hour 8, non-negotiable):**
1. Galaxy view shows one dot per host with position (count equals the pipeline report).
2. Clicking a dot flies to the system; clicking a planet opens the card.
3. The card shows the radius with a RECEIPT chip (source + type + snapshot ID) and grey "unknown" where data is missing.
4. Asking HELM (or clicking a canned query) triggers a real `search_planets` and `focus_camera`, and the camera moves.
5. With the API key removed, the canned query still works.
6. A Vercel preview URL runs all of the above.

## 14. Testing and acceptance

**Automated (`npm test`):** Kepler third law; luminosity from `st_lum` and from R/T; HZ edges for the Sun; density; class bands incl. unknown; completeness; DISPUTE (overlap/non-overlap/missing errors/limits); `applyFilters`; token parsing; output validator (bare digits, forbidden phrases, `<think>` stripping); canned queries against the real snapshot; snapshot verifier (hash, counts, no NaN, no zeros where source is empty).

**Verify script (`verify-snapshot.js`):** input rows = output records; every planet has an id; duplicate names listed; missing-value counts per required column; sizes within budget; every `Field` with `type: calculated` has inputs.

**Manual checklist before freeze:** unknown stays grey everywhere; no planet called habitable (UI + AI); candidates never shown as confirmed; "not to scale" and "artist's impression" labels present; footer attribution and snapshot ID visible; app works offline from snapshot; AI outage does not break any non-AI view; galaxy stays interactive on a laptop (about 5k points, smooth orbiting); no console errors; no secret in the built bundle (`grep` the `dist/` for the key prefix).

## 15. Failure handling and fallbacks

| Risk | Fallback |
|---|---|
| NASA TAP unreachable or CORS | Runtime never calls NASA. Build uses committed raw CSV/snapshot; browsers load static JSON |
| Column renamed/dropped | Build fails loudly naming the column; committed snapshot keeps the app running |
| `ps` fetch slow or too big | Run once and commit output; cut DISPUTE to mass and radius; if impossible, show "DISPUTE unavailable in this snapshot" |
| Reference links don't parse | Show raw reference text; drop mixed-source count |
| Cross-catalog matching messy / licence unverified | Restrict to Exo-MerCat-matched planets, label the rest "not compared"; or ship without `crosscatalog.json` |
| Large dataset performance | One-draw-call points; lazy `planets.json`/`solutions.json`; no per-planet 3D objects |
| Featherless 429/timeouts | Queue, backoff, fallback model, then template answer; canned queries always work |
| Model tool calls unreliable | zod validate + one retry; choose model by bake-off; keep five canned queries |
| Model invents numbers/verdicts | Token requirement + validator + forbidden-phrase filter + template fallback |
| Shader work overruns | Flat coloured spheres with glow |
| Function timeout on Vercel | Max 3 model calls per message, 20 s per call, set `maxDuration`; if still too slow move the function to a small Node host (Render/Railway) unchanged |
| Agent conflicts | Folder ownership, one writer for shared files, human-approved contracts |
| Gaia / extras | Dropped |

## 16. Deployment (beginner steps)

1. Local: `npm install`, create `.env.local` (copy `.env.example`, add your key yourself), `npm run dev` and `npm run dev:api` in two terminals.
2. Make sure the committed snapshot exists (`public/snapshots/latest.json`); do **not** rely on a build-time fetch from NASA.
3. `vercel.json`: `{"functions":{"api/helm.js":{"includeFiles":"public/snapshots/**","maxDuration":60}}}` — verify in a preview that the function can read the snapshot; if not, have it fetch the static `/snapshots/...` URL instead. Confirm the allowed `maxDuration` for your Vercel plan.
4. Push the branch → import the GitHub repo in Vercel → set environment variables (section 10) in the project settings → deploy a preview → run the slice acceptance → promote to production after the freeze review.
5. Final check on the production URL: with and without the key, mobile width, the footer, the console.

## 17. Items not verified (check, do not assume)

- Featherless model-specific tool-calling reliability for the exact model chosen; context limit of the $25 plan; terms of use of an individual plan for a public demo; whether disabling Qwen thinking is supported via chat-template options.
- The Kopparapu coefficients above (unit test required) and the NASA Archive DOIs (verify on the citation page).
- Exact reference-link column names and format in the real CSV; the TAP table/column names of exoplanet.eu and Exo-MerCat (`probe-tap.js`).
- exoplanet.eu licence; Vercel function timeout limits.
- That Antigravity reads `AGENTS.md`; copy the rules to the location your version expects.
- The original problem statement was not available; map each requirement to a feature in a traceability table in `docs/PROGRESS.md` once you paste it.
