# Exoplanet Encyclopaedia (exoplanet.eu) TAP Probe Report

- **Probed at:** 2026-10-31T03:08:18.688Z
- **Primary Endpoints Tested:** `http://voparis-tap-planeto.obspm.fr/tap/sync`, `https://voparis-tap-planeto.obspm.fr/tap/sync`
- **Primary Live Probe Status:** Unreachable from current network (`UND_ERR_CONNECT_TIMEOUT` on `voparis-tap-planeto.obspm.fr`)
- **Standard EPN-TAP Table:** `exoplanet.epn_core` (IVOA ID `ivo://padc.obspm.planeto/exoplanet/q/epn_core`)
- **Working IVOA Mirror:** `https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync` (table `exoplanets`, verified 200 OK)

## Working IVOA Mirror Probe (HEASARC `exoplanets`)
- **Table:** `exoplanets` (Extrasolar Planets Encyclopedia)
- **Total rows:** ~8,384 records
- **Total columns:** 37 verified columns (including `name`, `planet_status`, `planet_mass`, `planet_radius`, `orbital_period`, `semi_major_axis`, `star_t_eff`)

## Documented `exoplanet.epn_core` Schema (EPN-TAP v2.0)
| Column | Unit | Maps to NASA Column | Notes |
|---|---|---|---|
| `target_name` | – | `pl_name` (via Exo-MerCat `eu_name`) | Planet designation in Exoplanet.eu |
| `star_name` | – | `hostname` | Host star designation |
| `planet_status` / `status` | – | Confirmed | Planet confirmation status |
| `mass` / `mass_error_min` / `mass_error_max` | `M_Jup` | `pl_bmasse` (`M_Earth`) | **Convert MJup to MEarth (× 317.82838)** before interval comparison |
| `radius` / `radius_error_min` / `radius_error_max` | `R_Jup` | `pl_rade` (`R_Earth`) | **Convert RJup to REarth (× 11.20898)** before interval comparison |
| `period` / `period_error_min` / `period_error_max` | `d` | `pl_orbper` (`d`) | Orbital period in days |
| `temp_calculated` / `temp_measured` | `K` | `pl_eqt` (`K`) | Equilibrium / measured temperature |
| `star_teff` / `star_teff_error_min` / `star_teff_error_max` | `K` | `st_teff` (`K`) | Stellar effective temperature |

## Fallback & Mirror Strategy (Architecture Section 15)
- Per Section 6.8 & Section 15: `crosscatalog.json` is Phase 7 (time-boxed, optional, and licensing-gated). If `voparis-tap-planeto.obspm.fr` remains unreachable in Phase 7, the IVOA HEASARC exoplanet mirror and Exo-MerCat bridge provide status and value comparisons, with unmatched planets labelled `"not compared"`.