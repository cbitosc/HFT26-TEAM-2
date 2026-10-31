# Phase Reviews (`docs/REVIEWS.md`)

Reviewer / Integrator (Claude Opus 4.6, or Argon 4 fallback) records findings for each phase diff against `docs/ARCHITECTURE.md` and `AGENTS.md` before human gate approval.

---

## Phase 0 — Agent Self-Check Notes (NOT an Independent Review)

> **Note:** The bullets below are **self-checks recorded by the coding agent**, not an independent review.

- **CSV Audit & Staging Move (`DEC-001` Approved):** Verified `49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`, no UTF-8 BOM, 328 `#` comment lines, 325 columns, 6,451 rows, 0 parse errors, 0 duplicate `pl_name`s. Copied byte-for-byte to `data/raw/pscomppars.csv` and removed `public/data/` after SHA-256 match.
- **Whitelist Count Corrected:** `data/config/columns.pscomppars.json` contains **83** columns (previously misstated as 73 in prose), and `data/config/columns.ps.json` contains **31** columns.
- **DOIs Verified:** NASA Exoplanet Archive `pscomppars` = `10.26133/NEA13`; `ps` = `10.26133/NEA12`.

---

## Phase 0 — Independent Review & Focused Data-First Closeout Check

- **Review Scope:** Direct inspection of `data/config/columns.pscomppars.json`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/REVIEWS.md`, `docs/probes/exomercat.md`, `scripts/bakeoff-models.js`, and `README.md`.

### 1. Corrected Assessment of `scripts/bakeoff-models.js`: NOT READY for Live Calls
- **Status:** **NOT READY for live calls (Deferred — Make 0 Featherless Calls; Repair and Re-Review Later)**
- **Findings Requiring Repair Before Any Live Execution:**
  1. **Smoke-mode override:** In `resolveConfig` (`scripts/bakeoff-models.js` lines 204–205), `const isFullMode = argv.includes('--full') || env.BAKEOFF_MODE === 'full'` takes precedence over `--smoke`. If `BAKEOFF_MODE=full` is set in the environment (or both `--smoke` and `--full` are passed), smoke mode is silently overridden and full mode (up to 60 requests) is enabled.
  2. **Unrestricted API host:** In `resolveConfig` (lines 207–210), `FEATHERLESS_BASE_URL` is checked only with `/^https:\/\/[a-z0-9.-]+(\/[a-z0-9._/-]*)?$/i`, which accepts **any** HTTPS hostname instead of pinning the host strictly to `api.featherless.ai`. An untrusted `FEATHERLESS_BASE_URL` override could send `Authorization: Bearer <FEATHERLESS_API_KEY>` to an external host.
  3. **Insufficient argument validation:** `validateToolCalls` (lines 330–353) only checks that `JSON.parse(rawArgs)` is a non-null, non-array object and that `fnName` appears in `expectedTools`, without validating the parsed arguments against each tool's schema (required keys, types, enums, numeric bounds) and without rejecting unknown CLI arguments in `process.argv`.

### 2. Verification of Focused Phase 0 Data-First Closeout Changes (Items 1–8)
1. **Whitelist count (`83` columns) & stale notes (`data/config/columns.pscomppars.json`):**
   - Verified `columns.length === 83` in `data/config/columns.pscomppars.json` (all 83 columns preserved).
   - Stale notes in `data/config/columns.pscomppars.json` updated to match `DEC-002` (`fetchedAt` and `latestRowUpdate` remain `null` when unknown; `sy_distlim` absent in both `pscomppars` and `ps`; missing limit flags remain `null`, never `0`).
2. **Approved `DEC-002` & `DEC-003` (`docs/DECISIONS.md`):**
   - `DEC-002` approved: unknown timestamps (`fetchedAt: null`, `latestRowUpdate: null`) and missing limit flags (`lim: null`, never `0`) remain `null`; whitelist count recorded as 83.
   - `DEC-003` approved: complete verified 2013 Kopparapu Erratum Table 3 recorded with solar and non-solar test expectations.
3. **Approved `DEC-005` Option A (`docs/DECISIONS.md`):**
   - Distinguishes NASA-calculated values (`refstr=CALCULATED_VALUE` or `pl_bmassprov === 'M-R relationship'`) using `type: 'archive_calculated'`, preserves raw references, keeps unknown NASA inputs as `inputs: null`, and labels `M-R relationship` masses as model-estimated without inventing inputs or provenance.
4. **Approved `DEC-006` & Corrected `DEC-007` (`docs/DECISIONS.md`):**
   - `DEC-006` approved: distinguishes `Msini` (minimum-mass lower bound, `low` confidence) from `Msin(i)/sin(i)` (inclination-corrected estimate, never mistaken for a minimum mass); does not treat a projected or uncertain distance as a known orbital distance (`hz.status = 'unknown'`).
   - `DEC-007` approved: missing errors are never turned into `0`; `lim === null` is unknown limit status (not confirmed non-limit); `contested: false` strictly requires at least two (`n >= 2`) valid, distinct assessable solutions (`lim === 0` with non-null `err1, err2`) and all non-bound solutions assessable with no disjoint pair (single-solution parenthetical removed).
5. **Phase 1a Start & Explicit Deferrals (`DEC-009` in `docs/DECISIONS.md` & `docs/PROGRESS.md`):**
   - Recorded human approval to start Phase 1a with explicit deferrals: Featherless smoke test and full bake-off have **not** run (`[ ]` unchecked; models remain unverified) and `npm test` was not run in Phase 0 (`[ ]` unchecked; set up in Phase 1a).
6. **`docs/probes/exomercat.md` Sample JSON Block Removal (`DEC-004`):**
   - Only the 1-row sample JSON block at the bottom of `docs/probes/exomercat.md` was removed; all probe metadata and the 68-column schema table are preserved, with a note recording that the sample block remains in the earlier public WIP commit (`9d92d42`) since Git history is not rewritten.
7. **`README.md` Secret Check & As-Is Backup:**
   - Inspected `README.md` (16 lines, standard Vite React template text): confirmed `0` secrets or sensitive values; ready to stage and back up as-is without rewriting or restoring.

---

## Phase 1a — Independent Code & Codec Review (`c5fc16a9-30ef-4d93-8556-e23c49e170d4`)

- **Review Scope:** Direct code audit of all 20 Phase 1a files (`shared/schemas.js`, `shared/snapshotCodec.js`, `shared/receipts.js`, `shared/filters.js`, `shared/domain/*.js`, `scripts/build-snapshot.js`, `scripts/verify-snapshot.js`, `scripts/lib/*.js`, `tests/domain.test.js`) cross-checked against `data/raw/pscomppars.csv`.
- **Blockers:** **None (`0` blockers found).**
- **Audit Checklist (6/6 PASS):**
  1. **NASA-calculated values (`DEC-005` Option A) — PASS:** `parseArchiveRef` (`scripts/lib/refs.js`) and `buildArchiveFieldFromRow` (`scripts/build-snapshot.js`) tag `refstr=CALCULATED_VALUE` / `/docs/pscp_calc.html` and `pl_bmassprov === 'M-R relationship'` as `type: 'archive_calculated'` with `inputs: null`, preserve `ref.raw`, resolve `/docs/pscp_calc.html` to `https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html`, and label `M-R relationship` masses as `model-estimated` (`formula: 'nasa_mr_relationship'`, `confidence: 'low'` in HAB-LAB). Verified in `pscomppars.csv` that all `3,035` `M-R relationship` rows carry `refstr=CALCULATED_VALUE`.
  2. **`Msini` vs `Msin(i)/sin(i)` (`DEC-006`) — PASS:** `'Msini'` is mapped to `'minimum-mass lower bound'`, caps HAB-LAB mass confidence at `'low'`, and adds `lim: -1` + `msini_lower_bound_caveat` on fallback bulk density. `'Msin(i)/sin(i)'` is mapped to `'inclination-corrected estimate'` and is never labelled a lower bound.
  3. **Missing values & limit flags (`DEC-002`, `DEC-007`) — PASS:** `parseNullableFloat` and `parseNullableLim` (`scripts/lib/csv.js`, with `dynamicTyping: false`) return `null` on blanks while preserving explicit `0`, `1`, and `-1`. In `shared/domain/dispute.js` and `shared/snapshotCodec.js`, `lim === null` is tracked in `nUnknownLim` (never treated as confirmed non-limit `lim === 0`), missing uncertainties set `uncertaintyMissing: true` (never zero-width intervals), and unavailable disputes (`available: false`) decode to `disputed: null` and `contested: null` (never `false`).
  4. **HZ distance rules (`DEC-003`, `DEC-006`) — PASS:** `shared/domain/hz.js` uses the verified 2013 Erratum Table 3 coefficients (`2600 K <= Teff <= 7200 K`), and `classifyHzPosition` returns `'unknown'` when `aAu` is missing/`<= 0` or `orbsmaxLim === 1 || orbsmaxLim === -1`. Cross-checked `pscomppars.csv`: `0` rows have a non-null archive `pl_orbsmax` with `pl_orbsmaxlim === null` (`5,953` have `lim === 0`, `3` have `lim === -1`), so `lim === null` on non-null `pl_orbsmax` occurs only on Kepler-3 `calculated` fallbacks (where `evalHzPositionIndicator` downgrades confidence to `'medium'`).
  5. **Receipts & codec round-trip (`DEC-010`) — PASS:** `shared/snapshotCodec.js` losslessly round-trips all 20 `Field` keys per planet, all `{ text, href, raw }` references (`2,377` unique refs), all `<planetId>.<fieldName>` receipt IDs, and all HAB-LAB and dispute fields (`assert.deepStrictEqual` verified across all `6,451` planets and `4,847` hosts against in-memory canonical build from raw CSV).
  6. **Browser compatibility of `shared/` — PASS:** Zero Node-only imports (`node:fs`, `node:path`, `node:crypto`, `node:zlib`, `Buffer`, `process`) exist anywhere in `shared/`.

---

## Focused Science Review (Task A) — Orbital Semi-Major Axis vs. Potentially Projected Separation (`cc99a777-6873-4900-a5e4-1fbb190ce046`)

- **Review Scope:** Read-only audit of `shared/domain/habLab.js`, `shared/domain/hz.js`, `scripts/build-snapshot.js`, `src/scene/SystemView.jsx`, `data/raw/pscomppars.csv` (`6,451` rows), and `public/snapshots/2026-10-30-79bb8609/planets.json`. **Zero files or snapshots were modified during this review.**
- **Blocker Found (`DEC-012` Proposed):**
  1. **Root Cause in `pscomppars.csv`:** NASA's `pscomppars` table has no separate column for sky-projected separation $s_\perp\text{ [AU]}$ and no distance-type provenance flag on `pl_orbsmax`. Sky-projected physical separations (`Imaging`, `Microlensing`, `Disk Kinematics`) and statistical deprojections are stored in `pl_orbsmax` with `pl_orbsmaxlim = 0`.
  2. **Case Study — `2M0437 b` (`rowid = 12`, `discoverymethod = "Imaging"`):**
     - Raw CSV: `pl_orbsmax = 118.0 ± 1.3`, `pl_orbsmaxlim = 0` (`Gaidos et al. 2022`), `pl_angsep = 918.0 mas`, `pl_orbper = null`, `pl_orbeccen = null`, `st_teff = 3100 K`, `st_lum = -1.16368`.
     - Literature reality: $118 \pm 1.3\text{ AU}$ is the sky-projected separation ($\sim 0.92''$ at $128.5\text{ pc}$); no 3D Keplerian orbit was fitted.
     - Current snapshot (`2026-10-30-79bb8609`) & UI behavior: `hab.hzPosition` classifies `2M0437 b` as `status: "outside_outer"`, `confidence: "high"`, `note: "Orbital eccentricity is unknown; circular orbit assumed for semi-major axis comparison."`, and `SystemView.jsx` places `2M0437 b` on a solid Keplerian orbit ring animated at a fallback speed.
  3. **Dataset-Wide Breakdown (`6,451` rows):**
     - `348` rows have `pl_orbsmax` (`lim = 0`) without a confirmed non-limit `pl_orbper` (`70` `Imaging` including `2M0437 b`, `GJ 504 b`, `GU Psc b`, `HD 95086 b`, `PDS 70 c`, `HR 2562 b`; `274` `Microlensing` including `Gaia23braL b`, `TCP J05074264+2447555 b`, `MOA-2007-BLG-192L b`; `1` `Disk Kinematics` `HD 97048 b`; `1` `Pulsar Timing` `PSR B1620-26 b`; `1` `TTV` `Kepler-539 c` with `pl_orbperlim = -1`; `1` `RV` `TOI-4010 e` with `pl_orbperlim = -1`).
     - `20` additional rows (`11` `Imaging` including `COCONUTS-2 b`, `HR 8799 b/c/d` and `9` `Microlensing` including `OGLE-2005-BLG-390L b`, `MOA-2011-BLG-293L b`) have `pl_orbper` populated from nominal/statistical projections without constrained non-limit eccentricity uncertainties.
     - `50` of these unestablished-distance planets currently receive a non-`unknown` `hab.hzPosition` (`49` `outside_outer`, `1` `outside_inner`). Zero (`0`) planets in `in_conservative` (`180`) or `in_optimistic_only` (`108`) are affected.
  4. **Minimal Fix Proposal (`DEC-012`):**
     - Add `isTrueOrbitalDistanceEstablished(fields, discoveryMethod)` in `shared/domain/hz.js` and wire into `classifyHzPosition`, `evaluateHabLab` (`shared/domain/habLab.js`), `resolveInsolationField` (`shared/domain/luminosity.js`), `scripts/build-snapshot.js`, and `src/scene/SystemView.jsx`.
     - When `!isTrueOrbitalDistanceEstablished`, retain the NASA `pl_orbsmax` value and `<planetId>.pl_orbsmax` receipt, set `hab.hzPosition` to `status: 'unknown', confidence: 'unknown'` with an honest explanatory note, and render the planet on the dashed ring in `SystemView.jsx`.

---

## Independent Featherless Smoke-Test Safety Audit (Task B) (`9af13322-c7b7-4077-a75a-59a07f3d474f`)

- **Review Scope:** Independent read-only audit of repaired `scripts/bakeoff-models.js`, `tests/bakeoff.test.js`, and `shared/schemas.js`.
- **Verdict:** **PASS — `scripts/bakeoff-models.js` is verified safe across all 5 Task B requirements (`11/11` offline guard checks, `18/18` Vitest unit tests, `0` live Featherless calls made).**
  1. **Mode Conflict & Flag Rejection (`PASS`):** `ALLOWED_CLI_FLAGS` rejects any unknown CLI flag or positional argument; `--smoke` + `--full`, `--smoke` + `BAKEOFF_MODE=full`, `--full` + `BAKEOFF_MODE=smoke`, and `BAKEOFF_MODE=full` without explicit `--full` on CLI all throw before any request or key load.
  2. **Strict Host Pinning & Redirect Blocking (`PASS`):** `validateFeatherlessBaseUrl` parses with `new URL()` and pins strictly to `https://api.featherless.ai/v1` (rejecting any other host, protocol, port, credentials, path, query, or hash before `loadLiveApiKey()`); `fetchImpl` passes `redirect: 'error'` and rejects any `res.redirected === true` or `3xx` status without reading the body.
  3. **Process Environment Key Loading Only (`PASS`):** All `fs` / `.env.local` file-reading code has been removed from `scripts/bakeoff-models.js`; `loadLiveApiKey` reads only `env.FEATHERLESS_API_KEY` after `resolveConfig` succeeds in live mode; `sanitizeErrorMessage` redacts any accidental key echo.
  4. **Zod Tool Argument Validation (`PASS`):** `validateToolCalls` validates every tool call's parsed arguments against `ToolArgumentSchemasByName` (`PlanetFiltersSchema`, `GetPlanetToolArgsSchema`, `ComparePlanetsToolArgsSchema`, `FocusCameraToolArgsSchema`, `HighlightToolArgsSchema`, `OpenTimelineToolArgsSchema`), rejecting invalid types, out-of-range limits, inverted ranges (`min > max`), missing conditional `targetId`/`planetIds`, and extra properties (`.strict()`).
  5. **Strict 2-Call Sequential Budget (`PASS`):** Enforces `Qwen/Qwen3-14B` and `Qwen/Qwen3-8B`, `1` prompt, `1` repeat, hard cap of `2` sequential requests, `0` retries, and `0` fallbacks.


