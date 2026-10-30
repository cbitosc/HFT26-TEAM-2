# Phase Reviews (`docs/REVIEWS.md`)

Reviewer / Integrator (Claude Opus 4.6, or Argon 4 fallback) records findings for each phase diff against `docs/ARCHITECTURE.md` and `AGENTS.md` before human gate approval.

---

## Phase 0 — Agent Self-Check Notes (NOT an Independent Review)

> **Note:** The bullets below are **self-checks recorded by the coding agent**, not an independent review. Independent Reviewer (Claude Opus 4.6) review and human Phase 0 gate sign-off remain **OPEN**.

- **CSV Audit & Staging Move (`DEC-001` Approved):** Verified `49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`, no UTF-8 BOM, 328 `#` comment lines, 325 columns, 6,451 rows, 0 parse errors, 0 duplicate `pl_name`s. Copied byte-for-byte to `data/raw/pscomppars.csv` and removed `public/data/` after SHA-256 match.
- **Schema & Science Proposals Flagged for Review (`DEC-002` through `DEC-007`):**
  - `DEC-002`: `rowupdate`, `sy_distlim` (absent in both `ps` and `pscomppars`), and `pl_refname`/`st_refname`/`sy_refname` differences; `fetchedAt: null` and `latestRowUpdate: null` when unknown; missing limit flags `null`, never `0`.
  - `DEC-003`: Complete 2013 Erratum (*ApJ*, 770, 82) Table 3 coefficients verified for solar (`1.6886 AU` max greenhouse) and non-solar temperatures.
  - `DEC-005`: Receipts provenance distinguishing published archive values, NASA-calculated composite values (`inputs: null`), and Explorer calculations.
  - `DEC-006`: `Msini` minimum-mass lower bound vs `Msin(i)/sin(i)` inclination-corrected estimate; HZ position `unknown` when a usable orbital distance cannot be established.
  - `DEC-007`: DISPUTE missing uncertainty handling (`contested: true` if any two assessable intervals are disjoint, `false` only when all relevant solutions are assessable and none disjoint, `null` otherwise; framed as an explorer heuristic).
- **DOIs Verified:** NASA Exoplanet Archive `pscomppars` = `10.26133/NEA13`; `ps` = `10.26133/NEA12`.
- **Open Before Phase 0 Gate Approval:**
  1. Independent review by Reviewer (Claude Opus 4.6) recorded below.
  2. Live Featherless smoke test / model test execution.
  3. Human approval of proposals `DEC-002`, `DEC-003`, `DEC-005`, `DEC-006`, `DEC-007` and Phase 0 gate.

---

## Phase 0 — Independent Review (Recorded Against `AGENTS.md` & `docs/ARCHITECTURE.md`)

- **Review Scope:** Direct inspection of all tracked and untracked Phase 0 files (`AGENTS.md`, `.agents/rules/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `data/config/columns.pscomppars.json`, `data/config/columns.ps.json`, `scripts/bakeoff-models.js`, `scripts/probe-tap.js`, `docs/probes/*.md`, `.gitignore`, `.gitattributes`, `.env.example`, `package.json`, `vite.config.js`, and disk contents of `public/` and `dist/`).

### 1. Blockers Before Phase 1a (Require Human Decision / Fix Before Gate Closure)
1. **Stale note in `data/config/columns.pscomppars.json` (lines 5–6):**
   - Line 5 still reads `"rowupdate does not exist in pscomppars (only in ps); disc_pubdate and the CSV header timestamp are used until ps is joined."` This contradicts the corrected `DEC-002` proposal (`fetchedAt: null` and `latestRowUpdate: null` when unknown; never substitute `disc_pubdate` or the file-generation timestamp for `rowupdate`).
   - Line 6 reads `"sy_distlim does not exist in pscomppars."` and should note that `sy_distlim` is absent in **both** `pscomppars` and `ps`.
2. **Parenthetical in `DEC-007` (`docs/DECISIONS.md` line 110) on single-solution fields:**
   - Line 110 includes a parenthetical `"(or when only 1 non-limit solution exists and has known uncertainties, if single-solution fields are marked uncontested; confirm preference)"`.
   - Per `docs/ARCHITECTURE.md` Section 6.5 (`n = number of distinct solutions`, comparing pairs of solutions), returning `contested: false` **must require at least two valid, distinct non-limit solutions (`n >= 2`), all with known uncertainties (`err1` and `err2` present), and no non-overlapping pair**. If `n < 2`, multi-solution agreement cannot be assessed (`contested: null`), so the single-solution parenthetical in `DEC-007` should be removed before approval.
3. **Unapproved Science & Schema Proposals (`DEC-002`, `DEC-003`, `DEC-005`, `DEC-006`, `DEC-007`):**
   - None of `DEC-002`, `DEC-003`, `DEC-005`, `DEC-006`, or `DEC-007` have human approval yet. In particular, `DEC-002` (nullable `fetchedAt` and `latestRowUpdate` in `manifest.json`) and `DEC-005` (choosing Option 5A `'archive_calculated'` in `Field.type` vs Option 5B `type: 'archive'` with `formula: 'nasa_pscp_calc'` and `inputs: null`) directly determine `shared/schemas.js` in Phase 1a.
4. **Live Featherless Model Test & `npm test` Not Yet Run:**
   - `0` live Featherless requests have been executed so far (neither the 2-call smoke test nor the full 5×3 bake-off has run).
   - `npm test` has not run because `vitest` and the `"test"` script in `package.json` are not yet installed/configured (scheduled for Phase 1a).

### 2. Non-Blockers / Observations
1. **Report-writing in `scripts/bakeoff-models.js` `--full` mode:** `executeBakeoff` and `main` never call `fs.writeFileSync` even if `--full` is passed. This guarantees zero file writes during the smoke test; if the full 5×3 bake-off is later run, report-writing to `docs/probes/bakeoff-models.md` can be re-enabled then.
2. **`.agents/rules/AGENTS.md` vs Root `AGENTS.md`:** Root `AGENTS.md` (67 lines) has the full Section 2 ownership table; `.agents/rules/AGENTS.md` (11 lines) is a short summary pointer.
3. **`exoplanet.eu` TAP timeout:** `voparis-tap-planeto.obspm.fr` timed out (`UND_ERR_CONNECT_TIMEOUT`) during Phase 0 probing; documented in `docs/probes/exoplanet-eu.md` and non-blocking until Phase 7.
4. **Modified `README.md`:** `README.md` remains unstaged (` M README.md`) from `create-vite` overwriting the CBIT Hacktoberfest starter README.

### 3. Readiness of `scripts/bakeoff-models.js` for the Two-Call Smoke Test
- **READY & SAFE:** Direct code audit of `scripts/bakeoff-models.js` confirms:
  - Defaults to `mode: 'smoke'` with `APPROVED_SMOKE_MODELS = ['Qwen/Qwen3-14B', 'Qwen/Qwen3-8B']`, `1` prompt, `1` repeat, and `HARD_SMOKE_MAX_REQUESTS = 2`.
  - Makes **no** `/v1/models` call, executes requests **sequentially** (`for ... await`), enforces `if (requestsMade >= config.maxRequests) throw ...` before `fetchImpl`, and has **zero retries and zero fallbacks**.
  - On non-2xx HTTP status (`!res.ok`), returns `{ ok: false, status: res.status, elapsedMs }` without reading `res.text()` or `res.json()`. Never prints `FEATHERLESS_API_KEY`, headers, raw error bodies, or model `<think>`/text content, and writes no files to disk.

### 4. Raw CSV Git Attributes, Secret Protection & Disk Check for `crosscatalog.json`
- **Raw CSV (`data/raw/pscomppars.csv`):** `.gitattributes` sets `data/raw/** -text` (`text: unset` verified for both `data/raw/pscomppars.csv` and nested `data/raw/<snapshotId>/pscomppars.csv`). Unfiltered and filtered Git blob SHA-1 hashes match (`64ac72063ca91ed54b80e95dbcb5c568c311e8f9`), and raw file SHA-256 is `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`.
- **Secret protection:** `.env.local` is ignored by `.gitignore:13:*.local` and untracked (`git ls-files -- .env.local` empty). `.env.example` contains variable names only.
- **`crosscatalog.json` disk & Git check:** Verified on disk that neither `public/` nor `dist/` (nor any subfolder of the workspace) contains `crosscatalog.json`, and `.gitignore` blocks both `public/snapshots/*/crosscatalog.json` and `**/crosscatalog.json`.

### 5. Safe Explicit Git Staging Plan (Do Not Use `git add .` or Touch `README.md`)
When human gate approval is granted to commit on `phase/0-audit`, stage files **only by explicit path** so the modified `README.md` and any unapproved files are never staged:
```powershell
git add -- .gitignore .gitattributes .env.example AGENTS.md .agents/rules/AGENTS.md
git add -- package.json package-lock.json vite.config.js eslint.config.js index.html
git add -- public/favicon.svg public/icons.svg src/
git add -- data/config/columns.pscomppars.json data/config/columns.ps.json data/raw/pscomppars.csv
git add -- docs/ARCHITECTURE.md docs/DECISIONS.md docs/PROGRESS.md docs/REVIEWS.md docs/probes/
git add -- scripts/probe-tap.js scripts/bakeoff-models.js
```

