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
- [ ] **Phase 3 — VERTICAL SLICE (`slice-v1`) (Offline HELM Preparation Completed — Not Yet Wired to UI or Live LLM)**
  - [x] Prepare minimal `/api/helm` server path (`server/helm/snapshotStore.js`, `server/helm/tools.js`, `server/helm/validate.js`, `server/helm/canned.js`, `server/helm/prompts.js`, `server/helm/index.js`, `api/helm.js`, `server/dev.js`) using the compact snapshot (`2026-10-30-79bb8609`) and `shared/snapshotCodec.js`
  - [x] Prepare offline deterministic Canned Query #1 (*"Which planets are about Earth's size and sit in the habitable zone?"*) and Canned Query #5 (*"Fly me to the nearest known exoplanet."*) in `src/helm/cannedQueries.js`, `src/helm/applyActions.js`, `src/helm/helmClient.js`, and verify with `tests/canned.test.js` & `tests/validate.test.js` (mocks/offline only; live AI not claimed)
- [ ] **Phase 4 — RECEIPTS + DISPUTE UI**
- [ ] **Phase 5 — HAB-LAB + VERSUS + FORGE-lite**
- [ ] **Phase 6 — Full HELM + TIMELAPSE**
- [ ] **Phase 7 — Cross-catalog (time-boxed)**
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
