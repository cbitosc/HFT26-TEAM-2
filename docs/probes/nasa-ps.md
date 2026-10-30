# NASA Exoplanet Archive `ps` TAP Probe Report

- **Probed at:** 2026-10-30T19:59:30.757Z
- **Endpoint:** `https://exoplanetarchive.ipac.caltech.edu/TAP/sync`
- **Table:** `ps` (Planetary Systems, DOI `10.26133/NEA12`)
- **Total rows currently in `ps`:** 40350
- **Total columns in `TAP_SCHEMA.columns` for `ps`:** 355
- **Whitelisted columns tested (31):** `pl_name`, `hostname`, `default_flag`, `soltype`, `pl_controv_flag`, `pl_refname`, `st_refname`, `sy_refname`, `rowupdate`, `pl_pubdate`, `pl_rade`, `pl_radeerr1`, `pl_radeerr2`, `pl_radelim`, `pl_bmasse`, `pl_bmasseerr1`, `pl_bmasseerr2`, `pl_bmasselim`, `pl_bmassprov`, `pl_orbper`, `pl_orbpererr1`, `pl_orbpererr2`, `pl_orbperlim`, `pl_eqt`, `pl_eqterr1`, `pl_eqterr2`, `pl_eqtlim`, `st_teff`, `st_tefferr1`, `st_tefferr2`, `st_tefflim`
- **Missing whitelisted columns:** None (all 31 columns verified)
- **TOP 5 query latency:** 1331 ms (returned 5 rows)

## Sample Reference & Metadata Format in `ps` (Row 1: `Kepler-6 b`)

- `default_flag`: `0`
- `soltype`: `Kepler Project Candidate (q1_q12_koi)`
- `rowupdate`: `2014-11-18`
- `pl_pubdate`: `2014-12-04`
- `pl_refname`: `<a refstr=Q1_Q12_KOI_TABLE href=https://exoplanetarchive.ipac.caltech.edu/docs/Kepler_KOI_docs.html target=ref>Q1-Q12 KOI Table</a>`
- `st_refname`: `<a refstr=Q1_Q12_KOI_TABLE href=https://exoplanetarchive.ipac.caltech.edu/docs/Kepler_KOI_docs.html target=ref>Q1-Q12 KOI Table</a>`
- `sy_refname`: `<a refstr=STASSUN_ET_AL__2019 href=https://ui.adsabs.harvard.edu/abs/2019AJ....158..138S/abstract target=ref>TICv8</a>`

## Notes
- Unlike `pscomppars` (which uses per-parameter `*_reflink` columns and has no `rowupdate`), `ps` provides solution-level `pl_refname`, `st_refname`, `sy_refname` (as HTML anchor tags) and `rowupdate` (YYYY-MM-DD).