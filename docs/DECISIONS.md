# Architectural Decisions & Proposals (`docs/DECISIONS.md`)

Any deviation from `docs/ARCHITECTURE.md` or unresolved schema/licensing question must be recorded here as a proposal and **approved by a human** before coding.

---

## DEC-001 — Move Raw CSV out of `public/data/` to Temporary Staging `data/raw/pscomppars.csv` (APPROVED & EXECUTED)

- **Context:** The 49.05 MB raw NASA file (`49,052,758` bytes, SHA-256 `57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`) originally sat at `public/data/pscomppars.csv.csv`, causing Vite to serve it publicly and copy all 49 MB into `dist/` on every build.
- **Approved Decision:**
  1. Copy `public/data/pscomppars.csv.csv` byte-for-byte to `data/raw/pscomppars.csv` as a **temporary staging location**, verify identical byte size (`49,052,758`) and SHA-256 (`57f0ccfa4cff4f7c9a6900d96e518959a360bba4be501c8f208c92f3c5795995`), and remove `public/data/pscomppars.csv.csv` and the empty `public/data/` directory.
  2. Keep the complete NASA raw CSV in regular Git (do **not** add an ignore rule for `data/raw/` or its CSV files in `.gitignore`), with `.gitattributes` setting `data/raw/** -text`.
  3. The final `data/raw/<snapshotId>/pscomppars.csv` location is written by the approved snapshot pipeline in Phase 1a while keeping the raw CSV outside `public/`.
- **Status:** **APPROVED by Human (Executed on `phase/0-audit`)**

---

## DEC-002 — Whitelist Count (83 Columns), Dates, Limits, and Manifest Metadata (APPROVED)

- **Context:** Section 6.2 of `docs/ARCHITECTURE.md` lists candidate columns to verify against the real header (`rowupdate`, `sy_distlim`, `pl_refname`, `st_refname`, `sy_refname`) and manifest timestamps (`fetchedAt`, `latestRowUpdate`).
- **Verified Reality (`pscomppars` CSV & NASA `TAP_SCHEMA.columns`):**
  1. `data/config/columns.pscomppars.json` contains **83** verified columns (previously miscounted in prose as 73), and `data/config/columns.ps.json` contains **31** verified columns.
  2. `rowupdate` does **not** exist in `pscomppars` (it exists in `ps`). In `pscomppars`, `disc_pubdate` is a discovery publication date (`YYYY-MM`), not a last-update date.
  3. Comment line 2 of the CSV (`# Fri Oct 30 10:10:20 2026`) is a file-generation timestamp with its **timezone unspecified**, not a planet last-update date and not the HTTP download time.
  4. `sy_distlim` does **not** exist in **either** `pscomppars` or `ps` (confirmed via `TAP_SCHEMA.columns`).
  5. `pl_refname`, `st_refname`, `sy_refname` exist in `ps`, while `pscomppars` uses per-parameter `*_reflink` columns plus `disc_refname`.
- **Approved Decision:**
  - Keep all **83** verified columns in `data/config/columns.pscomppars.json` and all **31** verified columns in `data/config/columns.ps.json`. Do **not** add the 5 `pl_angsep*` columns without demonstrated need and approval.
  - Keep the CSV header timestamp string (`"Fri Oct 30 10:10:20 2026"`) in `manifest.json` (`headerTimestampRaw`) with its timezone unspecified.
  - Set `fetchedAt: null` and `latestRowUpdate: null` in `manifest.json` when unknown (`fetchedAt: z.string().nullable()`, `latestRowUpdate: z.string().nullable()` in `shared/schemas.js`).
  - **Missing limit flags:** Whenever a field has no `*lim` column (`sy_dist`) or its `*lim` cell is blank in the CSV, `Field.lim` must remain `null`, never silently `0`.
  - Distinguish raw CSV file checksum (`rawCsvSha256`) from the deterministic snapshot content hash (`contentHash`) in `manifest.json`.
- **Status:** **APPROVED by Human**

---

## DEC-003 — Habitable-Zone Coefficients from 2013 Erratum Table 3 (APPROVED)

- **Context:** Section 6.4 of `docs/ARCHITECTURE.md` requires verifying the Kopparapu et al. (2013) habitable-zone polynomial coefficients against the published table and the Sun unit test (`Teff = 5780 K, L = 1 L☉`).
- **Approved Decision & Verified Table 3:**
  Use the complete corrected Table 3 from *Kopparapu et al. 2013, ApJ, 770, 82* (`https://iopscience.iop.org/article/10.1088/0004-637X/770/1/82`), where $S_{\text{eff}} = S_{\text{eff}\odot} + aT + bT^2 + cT^3 + dT^4$, $T = T_{\text{eff}} - 5780\text{ K}$ (valid for $2600\text{ K} \le T_{\text{eff}} \le 7200\text{ K}$), and $d = \sqrt{L / S_{\text{eff}}}\text{ [AU]}$:

  | Boundary | $S_{\text{eff}\odot}$ | $a$ | $b$ | $c$ | $d$ |
  |---|---|---|---|---|---|
  | **Recent Venus** (optimistic inner) | `1.7763` | `1.4335e-4` | `3.3954e-9` | `-7.6364e-12` | `-1.1950e-15` |
  | **Runaway Greenhouse** (conservative inner) | `1.0385` | `1.2456e-4` | `1.4612e-8` | `-7.6345e-12` | `-1.7511e-15` |
  | **Moist Greenhouse** | `1.0146` | `8.1884e-5` | `1.9394e-9` | `-4.3618e-12` | `-6.8260e-16` |
  | **Maximum Greenhouse** (conservative outer) | `0.3507` | `5.9578e-5` | `1.6707e-9` | `-3.0058e-12` | `-5.1925e-16` |
  | **Early Mars** (optimistic outer) | `0.3207` | `5.4471e-5` | `1.5275e-9` | `-2.1709e-12` | `-3.8282e-16` |

  - **Solar unit test ($T_{\text{eff}} = 5780\text{ K}, L = 1.0\,L_\odot$):** Recent Venus `0.750312 AU`, Runaway Greenhouse `0.981289 AU`, Moist Greenhouse `0.992779 AU`, Maximum Greenhouse `1.688621 AU` (`~1.689 AU`, within `1.67 ± 0.03 AU`), Early Mars `1.765837 AU`.
  - **Non-solar unit tests:** K-dwarf ($4800\text{ K}, 0.3\,L_\odot$) and M-dwarf ($3800\text{ K}, 0.05\,L_\odot$) polynomial checks, plus out-of-range guard ($T_{\text{eff}} < 2600\text{ K}$ or $T_{\text{eff}} > 7200\text{ K} \Rightarrow \text{unknown / null}$).
- **Status:** **APPROVED by Human**

---

## DEC-004 — Cross-Catalog Licensing Gate (`crosscatalog.json` & Probe Sample Removal)

- **Context:** Section 6.8 requires `crosscatalog.json` to remain git-ignored and excluded from deployment until a human verifies and records `exoplanet.eu` licensing terms here.
- **Probe Report Update:** The 1-row sample JSON block in `docs/probes/exomercat.md` (which contained an `eu` catalog entry) was removed in the Phase 0 closeout commit while keeping the probe metadata and column schema table. Because Git history is never rewritten or force-pushed, that sample block remains in the earlier public WIP commit (`9d92d42`).
- **Status:** **GATED (Unverified — Keep `crosscatalog.json` git-ignored and undeployed)**

---

## DEC-005 — Receipts Provenance Option A: `archive_calculated` Type & Model-Estimated M-R Masses (APPROVED)

- **Context:** In `pscomppars.csv`, some archive cells carry `<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=_blank>Calculated Value</a>` (e.g., 1,539 `pl_rade` rows) or `pl_bmassprov = "M-R relationship"` (3,035 `pl_bmasse` rows), representing values calculated by NASA's composite pipeline rather than direct literature measurements or our own pipeline's formulas.
- **Approved Decision (Option A):**
  1. **Published archive measurement:** `type: 'archive'`, `formula: null`, `inputs: null`, `ref` preserves raw reference text and parsed ADS/DOI URL.
  2. **NASA-calculated composite value (`refstr=CALCULATED_VALUE` or `pl_bmassprov === 'M-R relationship'`):**
     - Use `type: 'archive_calculated'` in `Field.type` (`'archive' | 'archive_calculated' | 'calculated' | 'derived' | 'reference'`).
     - Preserve the raw reference string (`ref.raw` / `ref.text`) and resolve relative `href="/docs/pscp_calc.html"` to `https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html`.
     - Keep unknown NASA calculation inputs as `inputs: null` (never invent NASA's inputs or provenance).
     - Label `pl_bmassprov === 'M-R relationship'` masses explicitly as **model-estimated** (`M-R relationship`) in provenance/HAB-LAB without inventing inputs or provenance.
  3. **Our app's calculation (only when the archive value is missing):** `type: 'calculated'`, with our explicit `formula` name and exact `inputs` receipt IDs (`<planetId>.<fieldName>`).
- **Status:** **APPROVED by Human (Option A)**

---

## DEC-006 — Mass Provenance (`Msini` vs `Msin(i)/sin(i)`) and Orbital Distance / HZ Unknown Rules (APPROVED)

- **Context:** `pl_bmassprov` has four values in `pscomppars.csv`: `'Mass'` (2,477), `'M-R relationship'` (3,035), `'Msini'` (924), and `'Msin(i)/sin(i)'` (15). Additionally, some planets lack `pl_orbper` or have uncertain/projected orbital distances.
- **Approved Decision:**
  1. **`Msini` vs `Msin(i)/sin(i)`:**
     - `'Msini'` is a **minimum-mass estimate** ($M \sin i$ lower bound): label it as a minimum-mass lower bound, cap HAB-LAB mass-plausibility confidence at `low`, and caveat any bulk density calculated from it.
     - `'Msin(i)/sin(i)'` is an **inclination-corrected estimate**, **not** a minimum mass / lower bound: never mistake or label `'Msin(i)/sin(i)'` as a minimum mass.
     - `'M-R relationship'` is labelled as a **model-estimated** mass (`DEC-005`), with HAB-LAB mass-plausibility confidence capped at `low`.
  2. **Orbital distance & HZ position:**
     - Do not treat a projected or uncertain distance as a known orbital distance. Note that if `pl_orbsmaxlim !== 0` (i.e., `lim` is `1`, `-1`, or `null` when `pl_orbsmax` is a limit), it is not a confirmed non-limit semi-major axis.
     - Missing `pl_orbper` alone does **not** prove `pl_orbsmax` is a projected separation; however, if `pl_orbsmax` is flagged as a limit (`lim === 1` or `lim === -1`) or missing and Kepler-3 fallback cannot be computed (requiring non-limit positive `st_mass` and `pl_orbper`), a usable orbital distance cannot be established and **HZ position must be `unknown`** (`status: 'unknown'`, `confidence: 'unknown'`).
- **Status:** **APPROVED by Human**

---

## DEC-007 — DISPUTE Handling of Missing Uncertainties and Limit Flags (APPROVED)

- **Context:** Section 6.5 defines `contested` using interval overlap across published solutions in `ps`, where some solutions lack upper/lower uncertainties (`err1`, `err2`) or have `null` limit flags.
- **Approved Decision:**
  1. **Never turn missing errors into `0`:** A solution with missing `err1` or `err2` has an unknown uncertainty interval (`uncertaintyMissing: true`) and is never treated as a zero-width $[v, v]$ interval.
  2. **Null limit flag is unknown, not confirmed non-limit:**
     - `lim === 1` or `lim === -1` is a bound (counted in `nLimit`).
     - `lim === null` is **unknown limit status**, **not** a confirmed non-limit measurement.
     - An **assessable solution** is strictly a solution with confirmed non-limit status (`lim === 0`) and non-null `v`, `err1` ($\ge 0$), and `err2` ($\le 0$), forming interval $[v + e_2, v + e_1]$.
  3. **Evaluating `contested`:**
     - **`contested: true`:** Returned if there are at least two distinct assessable solutions (`lim === 0`, non-null `v, err1, err2`) and **any** pair of assessable solutions has non-overlapping intervals — even if other solutions for that field have missing errors or unknown limit status.
     - **`contested: false`:** Returned **only** when there are **at least two (`n >= 2`) valid, distinct assessable solutions**, **all** non-bound solutions (`lim !== 1 && lim !== -1`) for that field are assessable (`lim === 0` with non-null `err1` and `err2`; none have `lim === null` or missing uncertainties), and **no** pair of intervals is disjoint.
     - **`contested: null` (`"cannot assess"`):** Returned in all other cases (including whenever fewer than 2 valid, distinct assessable solutions exist, or when no assessable pair is disjoint and at least one non-bound solution has `lim === null` or missing uncertainties).
  4. **Framing:** Describe and label this interval non-overlap check in the UI and documentation as an **explorer heuristic** for highlighting spread across published values, **not** proof of statistical significance.
- **Status:** **APPROVED by Human**

---

## DEC-008 — Human-Approved WIP Backup Checkpoint on `phase/0-audit` (APPROVED EXCEPTION)

- **Context:** With limited hackathon time remaining, the human approved creating and pushing a clearly labelled `WIP` backup checkpoint commit (`9d92d42`) on branch `phase/0-audit` using the explicitly reviewed file list while Phase 0 remained incomplete.
- **Status:** **APPROVED by Human (Executed in `9d92d42`)**

---

## DEC-009 — Data-First Phase 0 Closeout & Phase 1a Start with Explicit Deferrals (APPROVED)

- **Context:** To unblock the deterministic data pipeline (`shared/schemas.js`, `shared/domain/*`, `scripts/build-snapshot.js`, `scripts/verify-snapshot.js`, and Vitest unit tests) without making any Featherless API calls while `scripts/bakeoff-models.js` requires repair and re-review.
- **Approved Decision:**
  1. Close out the data/audit portion of Phase 0 and **proceed to Phase 1a** with the following **explicitly recorded deferrals**:
     - The Featherless 2-call smoke test and full 5×3 bake-off have **not** run (`0` live calls made). The candidate models (`Qwen/Qwen3-14B`, `Qwen/Qwen3-8B`) remain **unverified** and must **not** be marked as passed.
     - `scripts/bakeoff-models.js` is marked **NOT READY for live calls** in `docs/REVIEWS.md` (due to smoke-mode env/flag override, unrestricted `FEATHERLESS_BASE_URL` host, and insufficient tool-call argument validation) and will be repaired and re-reviewed later before any live Featherless call.
     - `npm test` (`vitest`) was not run in Phase 0 and will be installed and configured in Phase 1a.
  2. Back up the current local `README.md` as-is (after verifying it contains no secrets) in the Phase 0 closeout checkpoint commit on `phase/0-audit`; do not delete, restore, or rewrite it.
- **Status:** **APPROVED by Human**

---

## DEC-010 — Compact On-Disk Snapshot Format with Lossless Shared Codec (APPROVED)

- **Context:** Uncompressed canonical JSON for all 6,451 planets (`2026-10-30-4c47327d`) was `57,548,026` bytes (`54.88 MiB`) and `galaxy.json` was `1,538,938` bytes (exceeding the `< 12,000,000` B and `< 1,500,000` B uncompressed targets).
- **Approved Decision:**
  1. Use the compact on-disk snapshot format (`exoplanet-snapshot-compact-v1`) implemented in `shared/snapshotCodec.js` (`encodeGalaxySnapshot`, `decodeGalaxySnapshot`, `encodePlanetsSnapshot`, `decodePlanetsSnapshot`), which deduplicates `refs` (`2,377` unique `{ text, href, raw }` entries) and repeated string literals (`1,572` entries) inside `planets.json` and omits optional `null`/`false` keys on disk.
  2. Decoding reconstructs the **exact** canonical `PlanetRecord` and `GalaxyHost` objects (`assert.deepStrictEqual` verified across all `6,451` planets and `4,847` hosts against the uncompacted draft `2026-10-30-4c47327d`). Missing values and limit flags decode to `null` (never `0`), and unavailable disputes decode to `disputed: null` and `contested: null` (never `false`).
  3. Include every file needed to reconstruct the snapshot (`galaxy.json` and `planets.json` with its embedded `refs` and `strings` dictionaries) in `contentHash` (`79bb8609...`), kept distinct from `rawCsvSha256` (`57f0ccfa...`).
  4. Do not delete or overwrite the existing draft `public/snapshots/2026-10-30-4c47327d` without explicit human permission.
- **Status:** **APPROVED by Human (Implemented & Verified in `2026-10-30-79bb8609`)**

---

## DEC-011 — Limited Workflow Overlap Exception (Phase 1a Verification ∥ Phase 2 App Shell & Basic 3D) and Old Draft Deletion Authorization (APPROVED)

- **Context:** To keep the hackathon build on schedule, the human authorized:
  1. Overlapping Phase 1a independent verification and old-draft cleanup (`Workstream A`) with building the Phase 2 app shell and basic 3D scene (`Workstream B`) on branch `phase/1a-contracts-snapshot`, while keeping Phase 1a marked unapproved until independent review and human sign-off.
  2. Deleting **only** `public/snapshots/2026-10-30-4c47327d/` if and only if: (a) it is confirmed uncommitted and not externally referenced/deployed, (b) `verify-snapshot.js` and `tests/domain.test.js` perform full raw-source, provenance, null/limit, hash, and codec round-trip checks without depending on that draft, (c) verification, `npm test`, and `npm run build` pass in an isolated workspace without that draft, and (d) the independent reviewer inspects the actual codec and pipeline code.
  3. Keeping `data/raw/pscomppars.csv` at its current staging path until human sign-off on moving/copying it to `data/raw/<snapshotId>/pscomppars.csv` (so no 49 MB move or duplicate occurs without human approval).
- **Status:** **APPROVED by Human (Phase 1a Gate Remains Open Until Independent Review & Human Sign-Off)**

---

## DEC-012 — Distinguishing Established Orbital Semi-Major Axis from Potentially Projected or Unconstrained Separation in `pscomppars` (PROPOSAL — AWAITING HUMAN APPROVAL)

- **Context:** Independent Science Review (`cc99a777-6873-4900-a5e4-1fbb190ce046`) of `data/raw/pscomppars.csv` (`6,451` rows), `shared/domain/hz.js`, `shared/domain/habLab.js`, `scripts/build-snapshot.js`, and `src/scene/SystemView.jsx` revealed a scientific blocker:
  - NASA's `pscomppars` table has no separate column for sky-projected physical separation $s_\perp\text{ [AU]}$ and no distance-provenance column on `pl_orbsmax`. When papers report a projected physical separation $s_\perp = \theta \cdot d$ in AU (or a Bayesian/statistical deprojection) as `value ± uncertainty` rather than an inequality (`<` or `>`), `pscomppars` stores that value in `pl_orbsmax` with **`pl_orbsmaxlim = 0`**.
  - **Example (`2M0437 b`, `discoverymethod = "Imaging"`):** Gaidos et al. 2022 reported a $\sim 0.92''$ sky-projected separation at $128.5\text{ pc}$ ($\approx 118 \pm 1.3\text{ AU}$) without a 3D Keplerian orbit fit. In `pscomppars.csv`, `pl_orbsmax = 118.0`, `pl_orbsmaxlim = 0`, `pl_orbper = null`, `pl_orbeccen = null`. The current snapshot (`2026-10-30-79bb8609`) and `SystemView.jsx` treat `pl_orbsmaxlim === 0` as proof of a true orbital semi-major axis, assigning `hab.hzPosition` `status: "outside_outer"`, `confidence: "high"` (with note *"circular orbit assumed"*) and rendering `2M0437 b` on a solid Keplerian orbit ring.
  - Across all `6,451` rows: `348` rows have `pl_orbsmax` (`lim = 0`) without a confirmed non-limit `pl_orbper` (`70` `Imaging`, `274` `Microlensing`, `1` `Disk Kinematics` `HD 97048 b`, `1` `Pulsar Timing` `PSR B1620-26 b`, `1` `TTV` `Kepler-539 c` with `pl_orbperlim = -1`, `1` `RV` `TOI-4010 e` with `pl_orbperlim = -1`). Additionally, `11` `Imaging` rows (e.g., `COCONUTS-2 b`, `HR 8799 b/c/d`) and `9` `Microlensing` rows (e.g., `OGLE-2005-BLG-390L b`, `MOA-2011-BLG-293L b`) have `pl_orbper` populated from statistical/nominal projections without constrained non-limit eccentricity uncertainties. Conversely, `7` `Imaging` rows (e.g., `PDS 70 c`, `HR 2562 b`) have Keplerian orbital posteriors (`pl_orbeccen` with `lim = 0` and uncertainties) where $P$ in days was not tabulated in `pscomppars`.
- **Proposed Decision (Minimal Fix):**
  1. **Retain NASA Value & Receipt:** Always retain the archive `fields.pl_orbsmax` value, uncertainties, `lim`, reference, and `<planetId>.pl_orbsmax` receipt untouched. Never relabel `pl_orbsmax` as `"projected separation"`, because missing `pl_orbper` alone does not prove projected separation, and `lim === 0` alone does not prove a true 3D orbital semi-major axis.
  2. **Criterion for Established True Orbital Semi-Major Axis (`isTrueOrbitalDistanceEstablished(fields, discoveryMethod)` in `shared/domain/hz.js`):**
     - `pl_orbsmax` is treated as an established orbital semi-major axis **if and only if**:
       - `pl_orbsmax.type === 'calculated'` (Kepler's Third Law fallback from positive confirmed non-limit `st_mass` and `pl_orbper`), **OR**
       - `pl_orbsmax.v > 0 && pl_orbsmax.lim === 0` **AND** `pl_orbper.v > 0 && pl_orbper.lim === 0` **AND** for methods where `pscomppars` mixes sky-projected/statistical separations into `pl_orbsmax` (`Imaging`, `Microlensing`, `Disk Kinematics`), a co-referenced 3D Keplerian eccentricity constraint (`pl_orbeccen.v !== null && pl_orbeccen.lim === 0 && pl_orbeccen.e1 !== null && pl_orbeccen.e2 !== null` from the same reference as `pl_orbsmax` and `pl_orbper`) is also present.
  3. **When Distance Type Cannot Be Established (`!isTrueOrbitalDistanceEstablished`):**
     - `hab.hzPosition` returns `status: 'unknown'`, `confidence: 'unknown'`, retains `receipts: ['<planetId>.pl_orbsmax']` (when `pl_orbsmax.v !== null`), and includes an explicit note stating that the archive `pl_orbsmax` value is retained with its receipt, but whether it represents a true 3D orbital semi-major axis or a potentially projected/unconstrained separation cannot be established from the archive fields.
     - `resolveInsolationField` (`shared/domain/luminosity.js`) only computes fallback $S = L / a^2$ when `isTrueOrbitalDistanceEstablished` is `true`.
     - `src/scene/SystemView.jsx` places planets with `!isTrueOrbitalDistanceEstablished` on the **dashed ring** (`"Dashed ring: True orbital semi-major axis not established or limit-bound in archive"`) while still displaying their retained archive AU value (`"<val> AU (orbit type unestablished)"`).
  4. **Dataset Impact (Once Approved):** Changes `50` planets (including `2M0437 b`, `GJ 504 b`, `GU Psc b`, `COCONUTS-2 b`, `Gaia23braL b`, `TCP J05074264+2447555 b`, `Kepler-539 c`, `TOI-4010 e`) from `outside_outer`/`outside_inner` to `hzPosition.status = 'unknown'`, moves `368` unestablished-orbit planets onto the dashed ring in `SystemView.jsx`, and alters **zero (`0`)** planets in `in_conservative` (`180`) or `in_optimistic_only` (`108`).
- **Status:** **PROPOSAL — Awaiting Human Approval (Existing Snapshot `2026-10-30-79bb8609` Not Overwritten)**



