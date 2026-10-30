# Architectural Decisions & Proposals (`docs/DECISIONS.md`)

Any deviation from `docs/ARCHITECTURE.md` or unresolved schema/licensing question must be recorded here as a proposal and **approved by a human** before coding.

---

## DEC-001 — Move Raw CSV out of `public/data/` to Temporary Staging `data/raw/pscomppars.csv` (APPROVED & EXECUTED)

- **Context:** The 49.05 MB raw NASA file (`49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`) originally sat at `public/data/pscomppars.csv.csv`, causing Vite to serve it publicly and copy all 49 MB into `dist/` on every build.
- **Approved Decision:**
  1. Copy `public/data/pscomppars.csv.csv` byte-for-byte to `data/raw/pscomppars.csv` as a **temporary staging location**, verify identical byte size (`49,052,758`) and SHA-256 (`57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`), and remove `public/data/pscomppars.csv.csv` and the empty `public/data/` directory.
  2. Keep the complete NASA raw CSV in regular Git (do **not** add an ignore rule for `data/raw/` or its CSV files in `.gitignore`).
  3. The final `data/raw/<snapshotId>/` location will be determined by the approved snapshot pipeline in Phase 1a.
- **Status:** **APPROVED by Human (Executed on `phase/0-audit`)**

---

## DEC-002 — Columns, Dates, Limits, and Manifest Metadata (PROPOSED — Waiting for Human Approval)

- **Context:** Section 6.2 of `docs/ARCHITECTURE.md` lists candidate columns to verify against the real header (`rowupdate`, `sy_distlim`, `pl_refname`, `st_refname`, `sy_refname`) and manifest timestamps (`fetchedAt`, `latestRowUpdate`).
- **Verified Reality (`pscomppars` CSV & NASA `TAP_SCHEMA.columns`):**
  1. `rowupdate` does **not** exist in `pscomppars` (it exists in `ps`). In `pscomppars`, `disc_pubdate` is a discovery publication date (`YYYY-MM`), not a last-update date.
  2. Comment line 2 of the CSV (`# Fri Oct 30 10:10:20 2026`) is a file-generation timestamp with its **timezone unspecified**, not a planet last-update date and not necessarily the HTTP download time.
  3. `sy_distlim` does **not** exist in **either** `pscomppars` or `ps` (confirmed via `TAP_SCHEMA.columns`).
  4. `pl_refname`, `st_refname`, `sy_refname` exist in `ps`, while `pscomppars` uses per-parameter `*_reflink` columns plus `disc_refname`.
- **Proposal (requires human approval, including manifest/schema adjustment):**
  - Keep `data/config/columns.pscomppars.json` at the 73 verified columns and `data/config/columns.ps.json` at the 31 verified columns. Do **not** add the 5 `pl_angsep*` columns unless a concrete use is demonstrated and approved.
  - Keep the CSV header timestamp string (`"Fri Oct 30 10:10:20 2026"`) with its timezone unspecified (`headerTimestampRaw`).
  - Set `fetchedAt: null` and `latestRowUpdate: null` in `manifest.json` when building from the local `pscomppars` CSV where download time and `rowupdate` are unknown (proposing `fetchedAt: z.string().nullable()` and `latestRowUpdate: z.string().nullable()` in `shared/schemas.js`).
  - When `ps` is later fetched in Phase 1b, record `ps`'s `rowupdate` separately (e.g., `latestPsRowUpdate`) so `ps` row updates are distinguished from the freshness of the `pscomppars` source.
  - **Missing limit flags:** Whenever a field has no `*lim` column (`sy_dist`) or its `*lim` cell is blank in the CSV, `Field.lim` must be `null`, never silently `0`.
- **Status:** **PROPOSED (Awaiting Human Approval)**

---

## DEC-003 — Habitable-Zone Coefficients from 2013 Erratum Table 3 (PROPOSED — Waiting for Human Approval)

- **Context:** Section 6.4 of `docs/ARCHITECTURE.md` requires verifying the Kopparapu et al. (2013) habitable-zone polynomial coefficients against the published table and the Sun unit test (`Teff = 5780 K, L = 1 L☉`).
- **Verified Published Erratum Table 3:**
  From *Kopparapu et al. 2013, ApJ, 770, 82* (`https://iopscience.iop.org/article/10.1088/0004-637X/770/1/82`), where $S_{\text{eff}} = S_{\text{eff}\odot} + aT + bT^2 + cT^3 + dT^4$, $T = T_{\text{eff}} - 5780\text{ K}$ (valid for $2600\text{ K} \le T_{\text{eff}} \le 7200\text{ K}$), and $d = \sqrt{L / S_{\text{eff}}}\text{ [AU]}$:

  | Boundary | $S_{\text{eff}\odot}$ | $a$ | $b$ | $c$ | $d$ |
  |---|---|---|---|---|---|
  | **Recent Venus** (optimistic inner) | `1.7763` | `1.4335e-4` | `3.3954e-9` | `-7.6364e-12` | `-1.1950e-15` |
  | **Runaway Greenhouse** (conservative inner) | `1.0385` | `1.2456e-4` | `1.4612e-8` | `-7.6345e-12` | `-1.7511e-15` |
  | **Moist Greenhouse** | `1.0146` | `8.1884e-5` | `1.9394e-9` | `-4.3618e-12` | `-6.8260e-16` |
  | **Maximum Greenhouse** (conservative outer) | `0.3507` | `5.9578e-5` | `1.6707e-9` | `-3.0058e-12` | `-5.1925e-16` |
  | **Early Mars** (optimistic outer) | `0.3207` | `5.4471e-5` | `1.5275e-9` | `-2.1709e-12` | `-3.8282e-16` |

- **Proposal & Test Expectations:**
  - Use the complete corrected 2013 Erratum Table 3 above in `shared/domain/hz.js`.
  - **Solar unit test ($T_{\text{eff}} = 5780\text{ K}, L = 1.0\,L_\odot$):**
    - Recent Venus: $d = 0.750312\text{ AU}$ (`~0.750 AU`)
    - Runaway Greenhouse: $d = 0.981289\text{ AU}$ (`~0.981 AU`)
    - Moist Greenhouse: $d = 0.992779\text{ AU}$ (`~0.993 AU`)
    - Maximum Greenhouse: $d = 1.688621\text{ AU}$ (**`~1.689 AU`**, passing the architecture's `1.67 ± 0.03 AU` check)
    - Early Mars: $d = 1.765837\text{ AU}$ (`~1.766 AU`)
  - **Non-solar unit tests (exercising $a, b, c, d$ polynomial terms):**
    - K-dwarf ($T_{\text{eff}} = 4800\text{ K}, L = 0.3\,L_\odot$): $S_{\text{eff}} = [1.645163, 0.936035, 0.939692, 0.296268, 0.270476] \Rightarrow d = [0.427028, 0.566128, 0.565025, 1.006278, 1.053165]\text{ AU}$.
    - M-dwarf ($T_{\text{eff}} = 3800\text{ K}, L = 0.05\,L_\odot$): $S_{\text{eff}} = [1.546688, 0.881504, 0.883440, 0.254637, 0.229803] \Rightarrow d = [0.179797, 0.238162, 0.237901, 0.443123, 0.466452]\text{ AU}$.
    - Out-of-range guard: $T_{\text{eff}} < 2600\text{ K}$ or $T_{\text{eff}} > 7200\text{ K} \Rightarrow \text{unknown / null}$.
- **Status:** **PROPOSED (Awaiting Human Approval)**

---

## DEC-004 — Cross-Catalog Licensing Gate (`crosscatalog.json`)

- **Context:** Section 6.8 requires `crosscatalog.json` to remain git-ignored and excluded from deployment until a human verifies and records `exoplanet.eu` licensing terms here.
- **Status:** **GATED (Unverified — Keep `crosscatalog.json` git-ignored and undeployed)**

---

## DEC-005 — Receipts Provenance: Published Measurements vs NASA-Calculated Values vs Explorer Calculations (PROPOSED — Waiting for Human Approval)

- **Context:** In `pscomppars.csv`, some archive cells carry `<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=_blank>Calculated Value</a>` (e.g., 1,539 `pl_rade` rows) or `pl_bmassprov = "M-R relationship"` (3,035 `pl_bmasse` rows), representing values calculated by NASA's composite pipeline rather than direct literature measurements or our own pipeline's formulas.
- **Proposal:**
  1. **Published archive measurement:** `type: 'archive'`, `formula: null`, `inputs: null`, `ref` preserves raw reference text and parsed ADS/DOI URL.
  2. **NASA-calculated composite value (`refstr=CALCULATED_VALUE` or `pl_bmassprov === 'M-R relationship'`):**
     - Preserve the raw reference string and resolve relative `href="/docs/pscp_calc.html"` to `https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html`.
     - Do **not** invent NASA's exact calculation inputs (`inputs: null`).
     - **Schema proposal for human approval:** Either (a) add `'archive_calculated'` to `Field.type` in `shared/schemas.js` (`'archive' | 'archive_calculated' | 'calculated' | 'derived' | 'reference'`), or (b) keep `Field.type = 'archive'` and set `formula: 'nasa_pscp_calc'` (or `formula: 'nasa_mr_relation'`) with `inputs: null` so the UI badge and popover explicitly distinguish a NASA-calculated value from a published measurement and from our app's calculations.
  3. **Our app's calculation (only when the archive value is missing):** `type: 'calculated'`, with our explicit `formula` name and exact `inputs` receipt IDs.
- **Status:** **PROPOSED (Awaiting Human Approval)**

---

## DEC-006 — Mass Provenance (`Msini` vs `Msin(i)/sin(i)`) and Orbital Distance / HZ Unknown Rules (PROPOSED — Waiting for Human Approval)

- **Context:** `pl_bmassprov` has four values in `pscomppars.csv`: `'Mass'` (2,477), `'M-R relationship'` (3,035), `'Msini'` (924), and `'Msin(i)/sin(i)'` (15). Additionally, some planets lack `pl_orbper` or have `pl_orbsmax` from direct imaging.
- **Proposal:**
  1. **`Msini` vs `Msin(i)/sin(i)`:**
     - `'Msini'` is a **minimum-mass estimate** ($M \sin i$ lower bound): label it as a minimum-mass lower bound, cap HAB-LAB mass-plausibility confidence at `low`, and caveat any bulk density calculated from it.
     - `'Msin(i)/sin(i)'` is an **inclination-corrected estimate**, **not** automatically a lower bound: preserve and display `'Msin(i)/sin(i)'` without labelling it a minimum-mass lower bound.
  2. **Orbital distance & HZ position:**
     - Missing `pl_orbper` alone does **not** prove `pl_orbsmax` is a projected separation.
     - We only compute a fallback semi-major axis via Kepler's third law when `pl_orbsmax` is missing and both `st_mass` and `pl_orbper` are present.
     - If a usable orbital distance (`pl_orbsmax` or Kepler-3 fallback) cannot be established, **HZ position must be `unknown`** (`status: 'unknown'`, `confidence: 'unknown'`).
- **Status:** **PROPOSED (Awaiting Human Approval)**

---

## DEC-007 — DISPUTE Handling of Missing Uncertainties (PROPOSED — Waiting for Human Approval)

- **Context:** Section 6.5 defines `contested` using interval overlap across published solutions in `ps`, where some solutions lack upper/lower uncertainties (`err1`, `err2`).
- **Proposal:**
  1. **Never turn missing errors into `0`:** A solution with missing `err1` or `err2` has an unknown uncertainty interval (`uncertaintyMissing: true`) and is never treated as a zero-width $[v, v]$ interval for claiming non-overlap.
  2. **Evaluating `contested`:**
     - Define an *assessable solution* as a non-limit solution (`lim === 0` or `null`) with non-null `v`, `err1`, and `err2` forming interval $[v + e_2, v + e_1]$.
     - **`contested: true`:** Returned if **any** pair of assessable solutions has non-overlapping intervals — even if one or more other solutions for that field have missing errors.
     - **`contested: false`:** Returned **only** when there are at least 2 relevant non-limit solutions, **all** of them are assessable (no missing errors among them), and **no** pair has non-overlapping intervals (or when only 1 non-limit solution exists and has known uncertainties, if single-solution fields are marked uncontested; confirm preference).
     - **`contested: null` (`"cannot assess"`):** Returned in all other cases (e.g., no pair of assessable intervals is disjoint, and at least one solution has missing uncertainties or fewer than 2 assessable solutions exist).
  3. **Framing:** Describe and label this interval non-overlap check in the UI and documentation as an **explorer heuristic** for highlighting spread across published values, **not** proof of statistical significance.
- **Status:** **PROPOSED (Awaiting Human Approval)**

---

## DEC-008 — Human-Approved WIP Backup Checkpoint on `phase/0-audit` (APPROVED EXCEPTION)

- **Context:** With limited hackathon time remaining, the human approved creating and pushing a clearly labelled `WIP` backup checkpoint commit on branch `phase/0-audit` using the explicitly reviewed file list (including `data/raw/pscomppars.csv` and `.gitattributes`) while Phase 0 remains incomplete (model test, pending decision approvals, and Phase 0 gate sign-off remain open).
- **Status:** **APPROVED by Human (Backup Exception Only — Phase 0 Gate Remains Open)**
