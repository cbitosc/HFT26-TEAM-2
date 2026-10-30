# Team Tetris Exoplanet Explorer — Build Progress (`docs/PROGRESS.md`)

## Phase Checklist

- [ ] **Phase 0 — Audit and probes (INCOMPLETE — Model Test, Independent Review & Human Gate Open)**
  - [x] Read `docs/ARCHITECTURE.md` completely
  - [x] Inspect `package.json`, folder tree, `vite.config.js`, Node version (`v25.8.2`), `git status`, `.gitignore`
  - [x] Audit `pscomppars` CSV (`49,052,758` bytes, `6,451` rows, `325` columns, `0` duplicates, no UTF-8 BOM) and move byte-for-byte to staging `data/raw/pscomppars.csv` (`DEC-001` approved & verified via SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`)
  - [x] Create `AGENTS.md` (and `.agents/rules/AGENTS.md` copy), `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/REVIEWS.md`
  - [x] Propose `data/config/columns.pscomppars.json` (73 columns) and `data/config/columns.ps.json` (31 columns)
  - [x] Create and run `scripts/probe-tap.js` → wrote `docs/probes/nasa-ps.md`, `docs/probes/exomercat.md`, `docs/probes/exoplanet-eu.md`
  - [x] Prepare strict smoke-test and dry-run/guard mode in `scripts/bakeoff-models.js`
  - [ ] Run live Featherless model test (pending review & authorization)
  - [ ] Complete independent Phase 0 review in `docs/REVIEWS.md` (previous notes are agent self-checks only)
  - [ ] Obtain human Phase 0 gate approval (including pending proposals `DEC-002`, `DEC-003`, `DEC-005`, `DEC-006`, `DEC-007`)
  - [x] Record human-approved WIP backup checkpoint exception on `phase/0-audit` (`DEC-008`; Phase 0 gate remains open)
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

## Shared-File Change Requests (Single-Writer Queue)

*(When Phase 1a begins after human approval of Phase 0)*:
1. **`package.json`:** Install allowed dependencies (`zustand`, `zod`, `d3-scale`, and devDependency `vitest`), and add scripts `dev:api`, `snapshot`, `verify:snapshot`, `probe:tap`, `bakeoff`, `test`.
2. **`.gitignore`:** Enforced `crosscatalog.json` licensing gate (`DEC-004`). Per `DEC-001`, `data/raw/` and its CSV files remain in regular Git (not ignored), with `.gitattributes` `data/raw/** -text` preserving raw byte-for-byte line endings.
3. **`README.md`:** Restore the CBIT Hacktoberfest Team Tetris header in `README.md` that was overwritten when `create-vite` ran (awaiting human approval).

---

## What We Learned

### Phase 0
1. **Exact CSV filename, exposure & staging move (`DEC-001`):** The 49.05 MB file (`49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`, `6,451` rows, `328` `#` comment lines, `325` columns, `0` duplicate `pl_name`s) was copied byte-for-byte to temporary staging `data/raw/pscomppars.csv` and removed from `public/data/` after SHA-256 verification. `npm run build` no longer copies the 49 MB file into `dist/`.
2. **`pscomppars` vs `ps` columns, dates & limits (`DEC-002` proposal):** `rowupdate` and `pl_refname`/`st_refname`/`sy_refname` exist only in `ps`, not `pscomppars`. `sy_distlim` does not exist in **either** `pscomppars` or `ps` (`TAP_SCHEMA` verified). `disc_pubdate` is discovery publication date, and `# Fri Oct 30 10:10:20 2026` is a file-generation timestamp with unspecified timezone. Proposed setting `fetchedAt: null` and `latestRowUpdate: null` when unknown, and `lim: null` (never `0`) when a limit column is absent or blank.
3. **Kopparapu HZ coefficients (`DEC-003` proposal):** Verified the complete corrected Table 3 from the 2013 Erratum (*Kopparapu et al. 2013, ApJ, 770, 82*), which yields `1.6886 AU` (`~1.689 AU`) for Maximum Greenhouse at $T_{\text{eff}} = 5780\text{ K}, L = 1\,L_\odot$ and passes all solar and non-solar checks.
4. **Live TAP probes:**
   - **NASA `ps` TAP** (`https://exoplanetarchive.ipac.caltech.edu/TAP/sync`): Live and fast (`1.33 s` for `TOP 5`); all 31 whitelisted columns in `columns.ps.json` verified across `40,350` rows.
   - **Exo-MerCat TAP** (`http://archives.ia2.inaf.it/vo/tap/projects/sync`): Live and fast (`248 ms` for `TOP 5`); table `exomercat.exomercat` has `17,617` rows and `68` columns including `nasa_name`, `eu_name`, `host`, `letter`, `status`, and `checked_status_string`.
   - **exoplanet.eu TAP** (`voparis-tap-planeto.obspm.fr`): Currently timing out on TCP connect (`UND_ERR_CONNECT_TIMEOUT`); documented fallback in `docs/probes/exoplanet-eu.md`.

