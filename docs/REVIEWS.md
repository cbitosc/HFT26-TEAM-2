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
