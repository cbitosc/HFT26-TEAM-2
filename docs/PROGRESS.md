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
  - [ ] **DEFERRED (NOT PASSED):** Run live Featherless smoke test and full 5×3 bake-off (`0` calls run; candidate models `Qwen/Qwen3-14B` and `Qwen/Qwen3-8B` remain **unverified**; `scripts/bakeoff-models.js` marked **NOT READY** for live calls in `docs/REVIEWS.md` and will be repaired and re-reviewed later)
  - [ ] **DEFERRED TO PHASE 1A (NOT PASSED IN PHASE 0):** Configure and run `npm test` (`vitest` to be installed and configured in Phase 1a per `DEC-009`)
- [ ] **Phase 1a — Contracts + `pscomppars` snapshot**
- [ ] **Phase 1b — `ps` and DISPUTE**
- [ ] **Phase 2 — App shell and catalog**
- [ ] **Phase 3 — VERTICAL SLICE (`slice-v1`)**
- [ ] **Phase 4 — RECEIPTS + DISPUTE UI**
- [ ] **Phase 5 — HAB-LAB + VERSUS + FORGE-lite**
- [ ] **Phase 6 — Full HELM + TIMELAPSE**
- [ ] **Phase 7 — Cross-catalog (time-boxed)**
- [ ] **Phase 8 — Stretch (optional)**
- [ ] **Phase 9 — QA, deployment, demo support**

---

## Shared-File Change Requests (Single-Writer Queue — Approved for Phase 1a Integrator Execution)

1. **`package.json`:** Install allowed dependencies (`zustand`, `zod`, `d3-scale`, and devDependency `vitest`), and add scripts `dev:api`, `snapshot`, `verify:snapshot`, `probe:tap`, `bakeoff`, `test`.
2. **`shared/schemas.js`:** Define Zod schemas incorporating approved `DEC-002` (`fetchedAt: z.string().nullable()`, `latestRowUpdate: z.string().nullable()`, `lim: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable()`) and `DEC-005` Option A (`Field.type` includes `'archive_calculated'`).
3. **`README.md`:** Backed up as-is in the Phase 0 closeout checkpoint commit (`DEC-009`) after secret check; do not edit, delete, or rewrite without human instructions.

---

## What We Learned

### Phase 0
1. **Exact CSV filename, exposure & staging move (`DEC-001`):** The 49.05 MB file (`49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`, `6,451` rows, `328` `#` comment lines, `325` columns, `0` duplicate `pl_name`s) was copied byte-for-byte to temporary staging `data/raw/pscomppars.csv` and removed from `public/data/` after SHA-256 verification. `npm run build` no longer copies the 49 MB file into `dist/`.
2. **Whitelist count (`83` columns), dates & limits (`DEC-002` approved):** `data/config/columns.pscomppars.json` has **83** verified columns (corrected from earlier prose that misstated 73). `rowupdate` and `pl_refname`/`st_refname`/`sy_refname` exist only in `ps`, not `pscomppars`. `sy_distlim` does not exist in **either** `pscomppars` or `ps` (`TAP_SCHEMA` verified). `fetchedAt` and `latestRowUpdate` remain `null` when unknown, and missing limit flags remain `null` (never `0`).
3. **Kopparapu HZ coefficients (`DEC-003` approved):** Verified the complete corrected Table 3 from the 2013 Erratum (*Kopparapu et al. 2013, ApJ, 770, 82*), which yields `1.6886 AU` (`~1.689 AU`) for Maximum Greenhouse at $T_{\text{eff}} = 5780\text{ K}, L = 1\,L_\odot$ and passes all solar and non-solar checks.
4. **Receipts provenance & science rules (`DEC-005` Option A, `DEC-006`, `DEC-007` approved):**
   - `DEC-005` Option A: NASA-calculated composite values use `type: 'archive_calculated'` with preserved raw reference and `inputs: null`; `M-R relationship` masses are labelled model-estimated.
   - `DEC-006`: `Msini` is a minimum-mass lower bound (`low` confidence), whereas `Msin(i)/sin(i)` is an inclination-corrected estimate (never mistaken for a lower bound). Uncertain or projected distances are not treated as known orbital distances (`hz.status = 'unknown'`).
   - `DEC-007`: Missing errors are never turned into `0`; `lim === null` is unknown limit status (not confirmed non-limit); `contested: false` requires $\ge 2$ valid, distinct assessable solutions (`lim === 0` with non-null `err1, err2`) with no disjoint pair.
5. **Bake-off script audit (`scripts/bakeoff-models.js`):** Marked **NOT READY** for live calls in `docs/REVIEWS.md` due to smoke-mode override (`BAKEOFF_MODE=full` / `--full` overriding `--smoke`), unrestricted `FEATHERLESS_BASE_URL` host pattern, and insufficient tool-call argument validation. Deferred for repair and re-review before any live Featherless calls.
