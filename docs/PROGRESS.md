# Team Tetris Exoplanet Explorer — Build Progress (`docs/PROGRESS.md`)

## Phase Checklist

- [x] **Phase 0 — Data-First Audit & Probes Closeout (Closed Out for Phase 1a Start per `DEC-009` with Explicit Deferrals Below)**
  - [x] Read `docs/ARCHITECTURE.md` completely
  - [x] Inspect `package.json`, folder tree, `vite.config.js`, Node version (`v25.8.2`), `git status`, `.gitignore`
  - [x] Audit `pscomppars` CSV (`49,052,758` bytes, `6,451` rows, `325` columns, `0` duplicates, no UTF-8 BOM) and move byte-for-byte to staging `data/raw/pscomppars.csv` (`DEC-001` approved & verified via SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`)
  - [x] Create `AGENTS.md` (and `.agents/rules/AGENTS.md` copy), `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/REVIEWS.md`
  - [x] Verify `data/config/columns.pscomppars.json` (**83** columns) and `data/config/columns.ps.json` (**31** columns)
  - [x] Create and run `scripts/probe-tap.js` → wrote `docs/probes/nasa-ps.md`, `docs/probes/exomercat.md` (sample JSON block removed per `DEC-004`, metadata kept), `docs/probes/exoplanet-eu.md`
  - [x] Obtain human approval for data decisions `DEC-001`, `DEC-002`, `DEC-003`, `DEC-005` (Option A), `DEC-006`, `DEC-007`, and `DEC-009` (Phase 1a start with explicit deferrals)
  - [x] Repair `scripts/bakeoff-models.js` (`--smoke` vs `BAKEOFF_MODE=full` conflict rejection, strict `https://api.featherless.ai/v1` host & `redirect: 'error'` pinning, process-env-only key access, Zod tool argument validation via `ToolArgumentSchemasByName`) and obtain independent safety review (`9af13322-c7b7-4077-a75a-59a07f3d474f` — **PASS**, `11/11` guard checks, `18/18` Vitest tests)
  - [ ] **DEFERRED (NOT PASSED):** Run live Featherless smoke test and full 5×3 bake-off (`0` live calls run; candidate models `Qwen/Qwen3-14B` and `Qwen/Qwen3-8B` remain **unverified**; script is now repaired and verified safe for when human authorizes live calls)
  - [ ] **DEFERRED TO PHASE 1A (NOT PASSED IN PHASE 0):** Configure and run `npm test` (installed and executed in Phase 1a below)
- [ ] **Phase 1a — Contracts + `pscomppars` snapshot (Independently Reviewed & Verified; Science Review `DEC-012` Proposed — Awaiting Human Sign-Off)**
  - [x] Install allowed dependencies (`zustand`, `zod`, `d3-scale`, devDependency `vitest`) and add scripts (`dev:api`, `snapshot`, `verify:snapshot`, `probe:tap`, `bakeoff`, `test`) in `package.json`
  - [x] Implement `shared/schemas.js`, `shared/receipts.js`, `shared/filters.js`, and lossless compact codec `shared/snapshotCodec.js` (`DEC-010`)
  - [x] Implement pure domain modules in `shared/domain/` (`thresholds.js`, `kepler.js`, `luminosity.js`, `hz.js`, `classify.js`, `completeness.js`, `dispute.js`, `habLab.js`, `galaxyPosition.js`)
  - [x] Implement pipeline helpers (`scripts/lib/csv.js`, `scripts/lib/refs.js`, `scripts/lib/names.js`, `scripts/lib/snapshotIO.js`), `scripts/build-snapshot.js`, and `scripts/verify-snapshot.js`
  - [x] Run `npm run snapshot` → generated compact snapshot `2026-10-30-79bb8609` (`galaxy.json`: `1,319,580` B `< 1,500,000` B; `planets.json` with embedded `refs`/`strings` tables: `11,690,661` B `< 12,000,000` B uncompressed, `1,349,024` B `< 3,000,000` B gzipped)
  - [x] Strengthen `scripts/verify-snapshot.js` and `tests/domain.test.js` with in-memory canonical rebuild (`canonicalMemoryComparison`) and verify in an isolated workspace without `2026-10-30-4c47327d`, then delete redundant uncommitted draft `public/snapshots/2026-10-30-4c47327d/` (`DEC-011`)
  - [x] Complete independent Phase 1a code & codec review (`c5fc16a9-30ef-4d93-8556-e23c49e170d4` recorded in `docs/REVIEWS.md`: `6/6 PASS`)
  - [x] Complete focused Science Review on orbital semi-major axis vs. potentially projected separation (`cc99a777-6873-4900-a5e4-1fbb190ce046`, including `2M0437 b`) and record minimal fix proposal `DEC-012` in `docs/DECISIONS.md` without overwriting `2026-10-30-79bb8609`
  - [ ] Obtain human sign-off on `DEC-012` and Phase 1a gate
- [ ] **Phase 1b — `ps` and DISPUTE**
- [ ] **Phase 2 — App shell and catalog (Initial Vertical Slice Built under `DEC-011` Overlap Exception — Awaiting Human Review)**
  - [x] Freeze `src/store/explorerStore.js` and `shared/snapshotCodec.js`
  - [x] Implement `src/data/loadSnapshot.js` and `src/data/fieldDictionary.js`
  - [x] Implement `src/components/UnknownValue.jsx`, `src/components/ReceiptChip.jsx` (preserving `0` and escaping raw reference HTML), and `src/components/DetectionBiasCaveat.jsx`
  - [x] Implement 3D scene (`src/scene/SceneRoot.jsx`, `src/scene/GalaxyPoints.jsx` single `THREE.Points` for `4,819` positioned hosts, `src/scene/SystemView.jsx` with dashed unknown-orbit ring & Kopparapu HZ band, `src/scene/PlanetView.jsx`, `src/scene/cameraDirector.js`)
  - [x] Implement app shell & panels (`src/panels/SearchBar.jsx` searching all `6,451` planets including `28` unpositioned, `src/panels/PlanetCard.jsx`, `src/panels/Footer.jsx`, `src/App.jsx`)
  - [x] Transform into scene-first full-screen architecture with floating on-demand HUD, contextual drawers, and expandable `HelmChat` copilot (`TASK A1`)
  - [x] Wrote `tests/scene-first-ui.test.js` (4 unit tests passing)
- [ ] **Phase 3 — VERTICAL SLICE (`slice-v1`) (Offline HELM Preparation Completed — Not Yet Wired to UI or Live LLM)**
  - [x] Prepare minimal `/api/helm` server path (`server/helm/snapshotStore.js`, `server/helm/tools.js`, `server/helm/validate.js`, `server/helm/canned.js`, `server/helm/prompts.js`, `server/helm/index.js`, `api/helm.js`, `server/dev.js`) using the compact snapshot (`2026-10-30-79bb8609`) and `shared/snapshotCodec.js`
  - [x] Prepare offline deterministic Canned Query #1 (*"Which planets are about Earth's size and sit in the habitable zone?"*) and Canned Query #5 (*"Fly me to the nearest known exoplanet."*) in `src/helm/cannedQueries.js`, `src/helm/applyActions.js`, `src/helm/helmClient.js`, and verify with `tests/canned.test.js` & `tests/validate.test.js` (mocks/offline only; live AI not claimed)
- [ ] **Phase 4 — RECEIPTS + DISPUTE UI**
- [ ] **Phase 5 — HAB-LAB + VERSUS + FORGE-lite**
- [ ] **Phase 6 — Full HELM + TIMELAPSE**
- [x] **Phase 7 — Cross-catalog (Build-time exoplanet.eu + Exo-MerCat pipeline completed; raw values git-ignored under DEC-004)**
  - [x] Probed live TAP schemas via `scripts/probe-tap.js` (Exo-MerCat at IA2, HEASARC exoplanet mirror fallback for unreachable Paris Observatory, NASA PS)
  - [x] Implemented `scripts/lib/names.js` with `normalizePlanetName` and `buildNameBridge`
  - [x] Implemented `scripts/crosscatalog.js` matching 5,834 of 6,451 NASA planets (90.4%) via Exo-MerCat bridge (5,622 exact, 212 normalized/alias)
  - [x] Unmatched planets (617, 9.6%) strictly assigned `status: 'not compared'` and never `disagree`
  - [x] Evaluated parameter interval consistency (`agree`, `disagree`, `cannot assess`, `not compared`) for `pl_rade`, `pl_bmasse`, `pl_orbper`, `pl_orbsmax`, `st_teff`
  - [x] Wrote `tests/crosscatalog.test.js` (19 unit tests passing)
  - [x] Published safe derived-only comparison flags to `public/snapshots/<id>/crosscatalog-flags.json` without raw values or uncertainties (`TASK F1.1`)
  - [x] Reconciled all counts: 5,834 matched, 617 unmatched, 5,770 agree, 62 disagree, 2 matched not-compared (`gj-96-b` & `hd-16760-b` with EU status `"FALSE"`)
  - [x] Integrated cross-catalog derived flags into contextual Planet Card and DISPUTE experience via `src/panels/DisputePanel.jsx` (`TASK F1.2`)
  - [x] Wrote `tests/crosscatalog-ui.test.js` (6 unit tests passing)
  - [x] Licensing Gate: `crosscatalog.json` remains git-ignored (`DEC-004`); raw cross-catalog values undeployed
- [ ] **Phase 8 — Stretch (optional)**
- [ ] **Phase 9 — QA, deployment, demo support**

---

## Shared-File Change Requests (Single-Writer Queue)

- **Executed by Integrator (`DEC-009`, `DEC-010`, `DEC-011`):** `package.json`, `shared/schemas.js`, `shared/receipts.js`, `shared/filters.js`, `shared/snapshotCodec.js`, `src/store/explorerStore.js`.

---

## What We Learned

### Phase 0
1. **Exact CSV filename, exposure & staging move (`DEC-001`):** The 49.05 MB file (`49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`, `6,451` rows, `328` `#` comment lines, `325` columns, `0` duplicate `pl_name`s) was copied byte-for-byte to temporary staging `data/raw/pscomppars.csv` and removed from `public/data/` after SHA-256 verification.
2. **Whitelist count (`83` columns), dates & limits (`DEC-002` approved):** `data/config/columns.pscomppars.json` has **83** verified columns. `fetchedAt` and `latestRowUpdate` remain `null` when unknown, and missing limit flags remain `null` (never `0`).
3. **Kopparapu HZ coefficients (`DEC-003` approved):** Verified the complete corrected Table 3 from the 2013 Erratum (*Kopparapu et al. 2013, ApJ, 770, 82*).
4. **Receipts provenance & science rules (`DEC-005` Option A, `DEC-006`, `DEC-007` approved):** Implemented in `shared/` and `scripts/` in Phase 1a.
5. **Bake-off script audit (`scripts/bakeoff-models.js`):** Marked **NOT READY** for live calls in `docs/REVIEWS.md`. Deferred for repair and re-review before any live Featherless calls.

### Phase 1a & Limited Phase 2 Overlap (`DEC-010`, `DEC-011`)
1. **Compact Snapshot (`2026-10-30-79bb8609`, `DEC-010`) & Measured Sizes:**
   - `galaxy.json`: **`1,319,580` B** (`< 1,500,000` B budget; gzip `202,230` B).
   - `planets.json` (including embedded `2,377` `refs` & `1,572` `strings` dictionaries): **`11,690,661` B** (`< 12,000,000` B uncompressed budget) and **`1,349,024` B** (`< 3,000,000` B gzip budget).
   - In-memory canonical rebuild (`canonicalMemoryComparison` in `verify-snapshot.js`) verifies `assert.deepStrictEqual` across all `6,451` planets and `4,847` hosts directly against `data/raw/pscomppars.csv` on every run without needing the `59 MB` uncompacted draft on disk.
2. **Old Draft Deleted After Isolated Workspace Verification (`DEC-011`):**
   - Confirmed `public/snapshots/2026-10-30-4c47327d/` was uncommitted and unreferenced, verified `verify-snapshot.js`, `vitest run`, and `vite build` in an isolated workspace without it, and deleted `public/snapshots/2026-10-30-4c47327d/`, reducing total `dist/` size from `72.37 MB` to `14.12 MB`.
3. **Remaining Plan for Raw CSV Location (`data/raw/<snapshotId>/pscomppars.csv`):**
   - `data/raw/pscomppars.csv` remains at its `DEC-001` staging path (`49,052,758` B). Once the final snapshot ID (`2026-10-30-79bb8609` or Phase 1b `ps`-joined snapshot ID) is frozen by human approval, `git mv data/raw/pscomppars.csv data/raw/<snapshotId>/pscomppars.csv` will move it inside Git without duplicating 49 MB on disk.

### Phase 7 (Cross-Catalog Integration)
1. **TAP Endpoints & Fallback:**
   - Exo-MerCat TAP (`http://archives.ia2.inaf.it/vo/tap/projects/sync`, table `exomercat.exomercat`) is active and provided 10,022 bridge records.
   - Primary `exoplanet.eu` TAP (`voparis-tap-planeto.obspm.fr`) was unreachable (`UND_ERR_CONNECT_TIMEOUT`); the pipeline falls back gracefully to the IVOA-registered HEASARC `exoplanets` mirror (`https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync`), yielding 8,384 records.
2. **Matching & Comparison Statistics:**
   - Reconciled **5,834** of 6,451 NASA planets (**90.4%** match rate; 5,622 exact, 212 normalized/alias); 617 unmatched planets (9.6%) are strictly marked `'not compared'` and never `'disagree'`.
   - Planet status agreement: 5,770 agree, 62 disagree, 619 not compared.
   - Parameter interval overlap evaluated across 5 fields (`pl_rade`, `pl_bmasse`, `pl_orbper`, `pl_orbsmax`, `st_teff`); missing uncertainties on both sides yield `'cannot assess'`.
   - Raw cross-catalog values and `crosscatalog.json` remain git-ignored in compliance with `DEC-004`.
3. **TASK F1.1 Safe Derived Flags & Count Reconciliation:**
   - Generated `public/snapshots/2026-10-30-79bb8609/crosscatalog-flags.json` (`3,734,968` B) containing only permitted derived flags (`agree`, `disagree`, `cannot assess`, `not compared`) for planet status and 5 parameters (`pl_rade`, `pl_bmasse`, `pl_orbper`, `pl_orbsmax`, `st_teff`).
   - Zero raw third-party numbers, source uncertainties, or source records are included in the public file. Raw `crosscatalog.json` remains strictly git-ignored under `DEC-004`.
   - Count Reconciliation: Total NASA confirmed planets = 6,451 (5,834 matched via Exo-MerCat + 617 unmatched).
   - Planet-level confirmation status: 5,770 agree, 62 disagree, 619 not compared.
   - The remaining 2 matched planets with status "not compared" are `gj-96-b` and `hd-16760-b`, whose Exoplanet.eu status was recorded as `"FALSE"` in the bridge, correctly yielding `"not compared"` rather than converting to disagreement.
   - Statuses clarified: planet-level status represents confirmation status agreement (Level 3); parameter-level statuses represent reported interval overlaps (Level 2).
4. **TASK F1.2 UI Integration (`DisputePanel.jsx` & `PlanetCard.jsx`):**
   - Implemented `src/panels/DisputePanel.jsx` rendering Level 1 intra-NASA disputes, Level 3 planet confirmation status badge, and Level 2 parameter interval overlaps for 5 fields.
   - Added compact EU status pill in `src/panels/PlanetCard.jsx` header for selected planets.
   - Preserves strict distinction between Level 2 and Level 3, treats unmatched as `"not compared"` (never `"disagree"`), credits Exo-MerCat strictly as the name bridge, and safely handles legacy snapshots.
   - Exposes zero raw comparison values or uncertainties. Verified with 6 unit tests in `tests/crosscatalog-ui.test.js`.

### Task A1 (Scene-First Experience Transformation)
1. **Full-Screen 3D Primacy:**
   - Replaced rigid 3-column dashboard grid with a full-screen 3D viewport backdrop (`SceneRoot`), moving controls and statistics into floating contextual glass panels with backdrop blur.
2. **Contextual Floating Controls:**
   - Implemented floating `src/panels/HelmChat.jsx` copilot dock with minimized pill, open card, and expanded modes over the scene.
   - Converted filters into an on-demand floating drawer (`showFilters`) and catalogue statistics into a lightweight HUD popover.
   - Contextual `PlanetCard` opens automatically on system/planet selection and is easily collapsible to provide unobstructed views of the Milky Way.
   - Retained all breadcrumbs, SearchBar, Timeline scrubber, Compare drawer, and Level 1–3 DISPUTE cross-catalog integration. Verified with `tests/scene-first-ui.test.js`.

### Task B1 (Live HELM AI Integration)
1. **Featherless AI Client & Security (`server/helm/llm.js`):**
   - Implemented OpenAI-compatible client pinned strictly to `https://api.featherless.ai/v1` (`redirect: 'error'`).
   - Rejects non-official hosts, ports, paths, queries, and fragments.
   - Accesses `process.env.FEATHERLESS_API_KEY` only on the server; API keys and auth headers are never logged, printed, or sent to the browser or build output.
   - Cleans `<think>...</think>` reasoning blocks and redacts keys from error messages.
   - Automatic HTTP 429 exponential backoff (1s, then 2s; max 2 retries) with 20s per-request timeout.
2. **Concurrency & Rate Limiting (`server/helm/queue.js`):**
   - Concurrency semaphore bounded by `HELM_MAX_INFLIGHT` (default 2 concurrent calls for $25 tier).
   - Queue wait timeout (`HELM_QUEUE_WAIT_MS`, default 8000ms) safely returning HTTP 429 to trigger fallback.
   - Sliding 1-minute per-IP rate limiter (`HELM_RATE_LIMIT_PER_MIN`, default 20).
3. **Server Pipeline & Typed Tools (`server/helm/handler.js` & `server/helm/prompt.js`):**
   - Server-side tool execution (`search_planets`, `focus_camera`, `highlight`, `compare_planets`, `open_timeline`, `get_planet`) using Zod argument schemas.
   - Single-retry recovery: model receives feedback on invalid tool arguments or prose validation violations before terminating with deterministic tool summary fallback.
   - Full preservation of all 5 canonical offline canned queries.
4. **Verification & End-to-End Smoke Test (Task B1.1):**
   - 99 tests passing across 9 test files (`tests/helm-live.test.js` covers live mocks, queue limits, all 5 actions, 1-retry recovery, and key redaction). Production build passes in 605ms.
   - Performed real live smoke test against Featherless API using environment credentials (`Qwen/Qwen3-14B`); verified native tool invocation (`search_planets`) and successful completion.
   - Traced all 5 actions (`focus`, `highlight`, `timeline`, `open_compare`, `select`) from HELM payload through `applyActions.js` to Zustand `explorerStore`.
   - Verified rejection of invalid tool arguments and zero credential exposure. All 5 offline canned queries pass with verified receipts.

### Task C1 (NASA Multiple Published Solutions Integration)
1. **TAP Retrieval & Verification (`scripts/lib/tap.js`):**
   - Probed `TAP_SCHEMA.columns` for `ps` on `https://exoplanetarchive.ipac.caltech.edu/TAP/sync`; verified all 31 whitelisted columns from `data/config/columns.ps.json`.
   - Retrieved all 40,350 published solution rows (`23,615,420` bytes, SHA-256 `35fdb3b8...`); cached locally in `data/raw/ps.csv`.
2. **DISPUTE Interval Comparison Engine (`shared/domain/dispute.js`):**
   - Implemented exact architecture-defined interval non-overlap comparisons across the 5 DISPUTE fields: `pl_rade`, `pl_bmasse`, `pl_orbper`, `pl_eqt`, and `st_teff`.
   - Never zero-fills missing errors; missing uncertainties strictly yield `cannot assess` (`contested: null`), never false or invented agreement.
   - Limit flags (`lim === 1 || -1`) counted in `nLimit` and excluded from intervals; `lim === null` tracked in `nUnknownLim`.
3. **Snapshot Generation & Coverage (`scripts/build-snapshot.js`):**
   - Joined 100% of 40,350 `ps` rows to the 6,451 confirmed canonical planets (0 unmapped rows).
   - Produced compact `public/snapshots/2026-10-30-79bb8609/solutions.json` (`6,167,355` bytes uncompressed, `1,095,377` bytes gzipped; satisfies `< 8 MB` budget).
   - Preserves individual solutions with provenance references, publication dates, and default flags without averaging.
   - Coverage: 5,505 multi-solution planets ($\ge 2$ solutions); 4,312 disputed planets (`contested: true`), 1,095 uncontested planets (`contested: false`), 1,044 cannot assess (`contested: null`).
   - Existing cross-catalog flags remain completely intact (5,834 matched, 6,451 total).
4. **Verification:**
   - 111 tests passing across 10 test files (`tests/dispute-solutions.test.js` covers interval overlap math, missing uncertainty edge cases, limits, exact planet joining, and size budgets). Production build passes in 582ms.

### Task C2 (DISPUTE Scientific Strip Plot Visualisation)
1. **Lazy Loading (`src/data/loadSnapshot.js`):**
   - Implemented `loadSolutions(snapshotId)`, `loadPlanetSolutions(snapshotId, planetId)`, and `getSolutionsForPlanet(planetId)`.
   - Loads `solutions.json` on-demand when the DISPUTE view mounts, avoiding eager download on initial scene load.
   - Graceful fallback for legacy snapshots without solutions without throwing.
2. **Interactive Scientific Strip Plot (`src/panels/DisputeStripPlot.jsx`):**
   - Supports all 5 DISPUTE parameters (`pl_rade`, `pl_bmasse`, `pl_orbper`, `pl_eqt`, `st_teff`) via tabbed selector.
   - Horizontal error-bar lanes showing individual published measurements with exact uncertainty intervals $[v + e_2, v + e_1]$.
   - Clearly distinguishes limit bounds (`lim === 1 || -1` with directional arrows), missing uncertainties (dashed points, never zero-width error bars), and adopted defaults (`★ Adopted`).
   - Uses precomputed DISPUTE summary from `planet.dispute` as the scientific source of truth (never recalculates in UI).
   - Provides author references, publication dates, and ADS abstract links on hover. Includes beginner-friendly legend and guide.
3. **Count Reconciliation & Level 2/3 Preservation (`src/panels/DisputePanel.jsx`):**
   - Reconciles the 5,505 multi-solution count (85.3%) against the 6,451 confirmed planet denominator; highlights 4,312 disputed planets (66.8%).
   - Preserves all Level 3 confirmation status badges and Level 2 cross-catalog parameter agreements from F1.2.
4. **Verification:**
   - 118 tests passing across 11 test suites (`tests/dispute-ui.test.js` covers tab switching, lazy loading, limits, missing error handling, and count reconciliation). Production build succeeds in 648ms.

### Task D1 (3D Star-System and Planet Visualisation)
1. **Host Star & Spectral Types (`src/scene/StarMesh.jsx`):**
   - Implemented `StarMesh` with Harvard spectral sequence temperature mapping (`starColorFromTeff`), cubic-root radius damping (`starDisplayRadius`), omnidirectional point lighting, and soft corona outer glow.
2. **Keplerian Orbital Paths (`src/scene/OrbitLine.jsx`):**
   - Implemented `OrbitLine` and `generateOrbitPoints` supporting circular and eccentric orbits ($0.05 \le e < 0.95$) with focus offset along the major axis.
   - Preserves dashed rendering for planets with missing or limit-bound semi-major axis.
3. **FORGE-lite Planet Visualisation (`src/scene/PlanetMesh.jsx`):**
   - Implemented procedural material configurations (`getPlanetMaterialConfig`) across all classes: terracotta terrestrial rocky, volatile-rich azure sub-Neptune, warm amber Jovian gas giant (with optional rings), incandescent glowing hot/lava, high-albedo specular icy, and honest neutral slate grey for unclassified bodies.
4. **Atmosphere Glow & Camera Director (`src/scene/AtmosphereGlow.jsx`, `src/scene/cameraDirector.js`):**
   - Added stable inverted backface Fresnel glow shell (`AtmosphereGlow`) tailored to atmospheric profiles.
   - Upgraded `cameraDirector.js` with exported `calculateCameraTargets`, view level transitions (`galaxy`, `system`, `planet`), framing based on radius, and reduced-motion safety.
5. **System & Planet Integration (`src/scene/SystemView.jsx`, `src/scene/PlanetView.jsx`):**
   - Composed modules in `SystemView` and `PlanetView` with speed-controlled orbital movement, interactive selection, and honest labels ("Artist's impression", "Orbit spacing and sizes not to scale").
6. **Verification:**
   - 143 tests passing across 12 test suites (`tests/scene-visuals.test.js` adds 25 tests covering spectral colors, orbit geometry, materials, atmospheres, camera targets, and scale monotonicity). Production build passes in 647ms.

### Task E1 (Functional Discovery Timeline Filtering)
1. **Store Selectors (`src/store/explorerStore.js`):**
   - Implemented `selectVisibleGalaxyHosts`, `selectTimelineFilteredPlanets`, and `selectTimelineStats`.
   - Strictly preserves unknown discovery years without fabricating or rounding; unknown years only appear when viewing all (year >= 2026).
2. **3D Point Cloud Filtering & Bias Colors (`src/scene/GalaxyPoints.jsx`):**
   - Connected `timelineYear` to 3D `GalaxyPoints`; backward scrubbing immediately hides systems discovered after selected year.
   - Points colored by observational detection method (`METHOD_COLORS`: Transit `#38bdf8`, Radial Velocity `#fb923c`, Microlensing `#c084fc`, Imaging `#34d399`, default `#94a3b8`, highlight `#ffcf4a`).
   - Stale hover state automatically dismissed when host falls outside timeline year.
3. **Timeline Bar & Playback Loop (`src/panels/TimelineBar.jsx`):**
   - Real-time cumulative discovery pill and scene status badge showing live visible hosts count.
   - Synchronized color dots on method pills to visualize detection bias directly.
   - Integrated `<DetectionBiasCaveat />` toggle and smooth continuous playback timer.
4. **Verification:**
   - 154 tests passing across 13 test suites (`tests/timeline.test.js` adds 11 tests covering year thresholds, backward scrubbing, method coloring, HELM open_timeline sync, and missing date handling). Production build passes in 622ms.

### Task E2 (Complete Interactive Planet Comparison)
1. **Store Actions (`src/store/explorerStore.js`):**
   - Added `compareOpen`, `addCompareId`, `removeCompareId`, `clearCompareIds`, and `setCompareOpen`.
   - Enforced a strict maximum of 3 selected bodies (replaces oldest when a 4th is added) while preserving all unrelated state.
2. **Comparison Selection Tray (`src/panels/CompareTray.jsx`):**
   - Displays live selection counter (`0/3`, `1/3`, `2/3`, `3/3`), body pills with one-click `×` removal, and quick presets (`TRAPPIST-1 e vs Earth`, `Proxima Cen b vs Earth`, `+ Earth`, `+ Jupiter`).
   - Retains `"Indicators only — no habitability verdict"` badge and table expand/collapse controls.
3. **Comparative Matrix Panel (`src/panels/ComparePanel.jsx`):**
   - Side-by-side comparison for 2–3 bodies across 9 core physical parameters with units, provenance receipts, uncertainties, and mass provenance.
   - Includes DISPUTE consensus indicators and 5 HAB-LAB confidence-rated checklist rows.
   - Missing values strictly render as grey `UnknownValue`; Earth/Jupiter tagged as `"Solar System Reference"`.
4. **Card & Drawer Integration (`src/panels/CompareDrawer.jsx`, `src/panels/PlanetCard.jsx`):**
   - `PlanetCard` updated with interactive `+ Add to Compare (X/3)` and removal toggle.
   - `CompareDrawer` composes `CompareTray` and `ComparePanel`, opening automatically via HELM `open_compare` actions.
5. **Verification:**
   - 167 tests passing across 14 test suites (`tests/compare.test.js` adds 13 tests covering add/remove/replace, 3-planet limit, live counter, reference body accuracy, and HELM sync). Production build passes in 669ms.

### Task G1 Loop Recovery (Science & Orbital Separation Preservation)
1. **Root Cause Recovered & Bounded:**
   - Identified previous agent loop caused by repeated external literature/TAP queries per planet instead of applying the bounded scientific decision rule `DEC-012`.
2. **Scientific Separation vs Keplerian Semi-Major Axis (`shared/domain/kepler.js`, `shared/domain/hz.js`, `shared/domain/habLab.js`, `shared/domain/luminosity.js`):**
   - Implemented and exported `isTrueOrbitalDistanceEstablished(fields, discoveryMethod)`: requires confirmed non-limit period and co-referenced constrained eccentricity for separation-risk methods (`Imaging`, `Microlensing`, `Disk Kinematics`).
   - For `2M0437 b`: preserved archive `pl_orbsmax` value (118.0 AU), uncertainties (±1.3 AU), limit flag (0), and Gaidos et al. 2022 receipt intact, while assigning `hab.hzPosition = 'unknown'` with honest scientific note explaining unestablished 3D orbital semi-major axis.
   - Fallback insolation calculation in `resolveInsolationField` is suppressed when true orbital semi-major axis is not established.
3. **Single Bounded Dataset Audit Pass (`scripts/audit-orbital-separation.js`):**
   - Audited all 6,451 confirmed planets in a single pass: 391 planets in separation-risk methods (98 Imaging, 292 Microlensing, 1 Disk Kinematics); 5,581 true orbital distances established; 870 unestablished.
4. **Verification & Test Suite:**
   - 173 tests passing across 15 test suites (`tests/orbital-separation.test.js` adds 6 tests covering 2M0437 b, Keplerian transit/RV planets, Kepler-3 fallback, limit bounds, eccentricity constraints, and insolation fallback suppression). Production build passes in 599ms.

### Task: Repair Compare Planets Buttons & Page Blanking Fix
1. **Compare Buttons Unification:**
   - Unified "Compare Planets" click paths across `HelmChat.jsx` and `FilterDrawer.jsx` through single store comparison state.
   - Preserves 3-planet limit, live counter (`0/3`, `1/3`, `2/3`, `3/3`), and drawer visibility.
2. **Vite HTTP Proxy Error Recovery (`vite.config.js`):**
   - Configured `proxy.on('error', ...)` to return a clean 503 JSON response when the local backend server is not running on port 8787, suppressing unhandled `AggregateError [ECONNREFUSED]` console logs.
3. **Resilient Error Boundaries (`src/components/PanelErrorBoundary.jsx`, `src/App.jsx`):**
   - Created `PanelErrorBoundary` and wrapped all floating HUD overlays (`CompareDrawer`, `PlanetCard`, `HelmChat`), preventing panel-level runtime exceptions from blanking the page or unmounting the 3D scene.
   - Enhanced `ComparePanel.jsx` and `CompareDrawer.jsx` with SSR snapshot state fallbacks and DISPUTE status handling.
4. **Verification:**
   - 180 unit and integration tests passing across all 16 test suites. Production build succeeds cleanly in ~600ms.

