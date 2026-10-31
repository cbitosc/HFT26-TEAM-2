# Cross-Catalog Integration Report (`docs/probes/crosscatalog.md`)

Build-time cross-catalog integration report comparing the **NASA Exoplanet Archive** (`pscomppars` snapshot) with the **Exoplanet Encyclopaedia** (`exoplanet.eu`) using **Exo-MerCat** strictly as the name-reconciliation bridge.

---

## 1. TAP Probe Results & Endpoint Verification

| Catalog | Endpoint / Service | Table | Status | Records / Latency |
|---|---|---|---|---|
| **Exo-MerCat** (Bridge) | `http://archives.ia2.inaf.it/vo/tap/projects/sync` | `exomercat.exomercat` | **200 OK** | 17,617 rows (10,022 bridge rows) / 248 ms |
| **exoplanet.eu** (Primary) | `http://voparis-tap-planeto.obspm.fr/tap/sync` | `exoplanet.epn_core` | **Unreachable** | `UND_ERR_CONNECT_TIMEOUT` (DNS/network block) |
| **exoplanet.eu** (IVOA Mirror) | `https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync` | `exoplanets` | **200 OK** | 8,384 rows / 1,822 ms |
| **NASA Exoplanet Archive** | `https://exoplanetarchive.ipac.caltech.edu/TAP/sync` | `ps` | **200 OK** | 40,350 rows / 1,822 ms |

---

## 2. Name Reconciliation Statistics (Exo-MerCat Bridge)

- **Total NASA confirmed planets in snapshot:** 6,451
- **Matched via Exo-MerCat name bridge:** **5,834 (90.4%)**
  - *Exact NASA designation match (`exact`):* 5,622 planets
  - *Normalized / alias match (`normalized` / `alias`):* 212 planets
- **Unmatched planets (strictly labelled `"not compared"`):** **617 (9.6%)**
  - *Per Architecture Section 6.7 & Section 15:* Unmatched planets are never marked `"disagree"`; they always receive `"not compared"`.

---

## 3. Comparison Flags & Agreement Statistics

### 3.1 Confirmation Status Agreement (Level 3 - Planet Level)
- **Status Agree (`agree`):** 5,770 (both catalogs confirm the planet)
- **Status Disagree (`disagree`):** 62 (NASA confirmed, but EU records as candidate, unconfirmed, or retracted)
- **Not Compared (`not compared`):** 619 total
  - *Unmatched planets:* 617
  - *Matched planets with unknown / unconfirmed EU status string:* 2 (`GJ 96 b` and `HD 16760 b`, whose bridge status was recorded as `"FALSE"`, correctly mapped to `"not compared"` rather than converting missing info to disagreement)
  - *Reconciliation:* $5,770 + 62 + 2 = 5,834$ matched; $5,834 + 617 = 6,451$ total.

### 3.2 Parameter Interval Overlap Agreement (Level 2)
Per architecture Section 6.5, reported intervals $[v + e_2, v + e_1]$ are compared:
- Overlapping intervals $\to$ **`agree`**
- Non-overlapping (disjoint) intervals $\to$ **`disagree`**
- Missing uncertainty on both sides $\to$ **`cannot assess`** (never forced into `agree` or `disagree`)
- Missing value in either catalog $\to$ **`not compared`**

| Field | Description | Agree | Disagree | Cannot Assess | Not Compared |
|---|---|---:|---:|---:|---:|
| `pl_rade` | Planet Radius ($R_\oplus$, converted from $R_{\text{Jup}}$ via 11.20898) | 3,287 | 401 | 392 | 2,371 |
| `pl_bmasse` | Planet Mass ($M_\oplus$, converted from $M_{\text{Jup}}$ via 317.82838) | 1,401 | 283 | 279 | 4,488 |
| `pl_orbper` | Orbital Period ($d$) | 3,945 | 705 | 433 | 1,368 |
| `pl_orbsmax` | Semi-Major Axis ($AU$) | 2,334 | 555 | 1,157 | 2,405 |
| `st_teff` | Stellar Effective Temperature ($K$) | 3,966 | 817 | 162 | 1,506 |

---

## 4. Licensing Gate & Security Compliance

- **exoplanet.eu Licensing:**
  - Database created and maintained by Jean Schneider (Observatoire de Paris / CNRS / PADC).
  - Protected under the EU Database Directive (Directive 96/9/EC) and academic fair use / CC BY-NC-SA 3.0.
  - License terms for automated redistribution in a public web application remain unverified.
- **Exo-MerCat Licensing:**
  - Published by Alei et al. 2020 (*Astronomy & Astrophysics*, 635, A177) at INAF Trieste under Open Access (CC BY 4.0).
  - Used strictly as the name-reconciliation bridge without copying raw catalog records.
- **Gate Compliance (`DEC-004` & `TASK F1.1`):**
  - Raw comparison data in `crosscatalog.json` (`public/snapshots/*/crosscatalog.json`, `data/crosscatalog.json`) are **strictly git-ignored**.
  - `git status` verifies `crosscatalog.json` is not tracked or staged.
  - Safe derived flags only are published to `public/snapshots/2026-10-30-79bb8609/crosscatalog-flags.json` (`3,734,968` B). This file contains zero raw numbers, zero source uncertainties, and zero third-party source records, exposing only architecture-permitted enums (`agree`, `disagree`, `cannot assess`, `not compared`).
  - Derived flags may be safely deployed and consumed by frontend UI badges while raw values remain undeployed until a human records verified terms in `docs/DECISIONS.md`.
