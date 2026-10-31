# Exo-MerCat TAP Probe Report

- **Probed at:** 2026-10-31T03:08:20.857Z
- **Working Endpoint:** `http://archives.ia2.inaf.it/vo/tap/projects/sync`
- **Discovered Table:** `exomercat.exomercat`
- **Total rows in `exomercat.exomercat`:** 17617
- **Total columns in `exomercat.exomercat`:** 68
- **TOP 5 probe latency:** 315 ms

## Discovered Tables
- `exomercat.exomercat_legacy` (exomercat): 
- `exomercat.exomercat` (exomercat): Exo-MerCat v2.0.0: the Exoplanet Merged Catalog
- `exomercat.exomercat_global` (exomercat): 

## All Columns in `exomercat.exomercat`
| Column | Datatype | Unit | Description |
|---|---|---|---|
| `id` | `integer` | `` |  |
| `exomercat_name` | `char` | `` | Planet name chosen by Exo-MerCat |
| `nasa_name` | `char` | `` | Planet name in the NASA Exoplanet Archive |
| `toi_name` | `char` | `` | Planet name in the TESS Objects of Interest Table |
| `epic_name` | `char` | `` | Planet name in the Kepler/K2 Objects of Interest |
| `eu_name` | `char` | `` | Planet name in the Exoplanet Encyclopaedia |
| `oec_name` | `char` | `` | Planet name in the Open Exoplanet Catalog |
| `host` | `char` | `` | Host star name |
| `letter` | `char` | `` | Letter labeling the planet |
| `main_id` | `char` | `` | Main identifier of the host star from SIMBAD or TIC catalogs |
| `binary` | `char` | `` | String labeling the binary host star, if any |
| `main_id_ra` | `double` | `deg` | J2000 right ascension in degrees from SIMBAD |
| `main_id_dec` | `double` | `deg` | J2000 declination ascension in degrees from SIMBAD |
| `mass` | `double` | `'MJup'` | Planet mass in Jovian masses |
| `mass_max` | `double` | `'MJup'` | Positive error on the mass in Jovian masses |
| `mass_min` | `double` | `'MJup'` | Negative error on the mass in Jovian masses |
| `mass_url` | `char` | `` | Bibcode of the reference paper for the mass value |
| `msini` | `double` | `'MJup'` | Planet minimum mass in Jovian masses |
| `msini_url` | `char` | `` | Bibcode of the reference paper for the minimum mass value |
| `bestmass` | `double` | `'MJup'` | Most precise value between mass and minimum mass in Jovian masses |
| `bestmass_max` | `double` | `'MJup'` | Positive error on the best mass in Jovian masses |
| `bestmass_min` | `double` | `'MJup'` | Negative error on the best mass in Jovian masses |
| `bestmass_url` | `char` | `` | Bibcode of the reference paper for the best mass value |
| `bestmass_provenance` | `char` | `` | String labeling the origin of the best mass (mass or minimum mass) |
| `p` | `double` | `d` | Planet orbital period in days |
| `p_max` | `double` | `d` | Positive error on the period in days |
| `p_min` | `double` | `d` | Negative error on the period in days |
| `p_url` | `char` | `` | Bibcode of the reference paper for the period value |
| `r_url` | `char` | `` | Bibcode of the reference paper for the radius value |
| `a` | `double` | `au` | Planet semi-major axis in au |
| `a_max` | `double` | `au` | Positive error on the semi-major axis in au |
| `a_min` | `double` | `au` | Negative error on the semi-major axis in au |
| `a_url` | `char` | `` | Bibcode of the reference paper for the semi-major axis value |
| `e` | `double` | `` | Eccentricity of the planet (scalar between 0 and 1) |
| `e_max` | `double` | `` | Positive error on the eccentricity (scalar) |
| `e_min` | `double` | `` | Negative error on the eccentricity (scalar) |
| `e_url` | `char` | `` | Bibcode of the reference paper for the eccentricity value |
| `i` | `double` | `deg` | Planet inclination in degrees. |
| `i_max` | `double` | `deg` | Positive error on the inclination in degrees |
| `i_min` | `double` | `deg` | Negative error on the inclination in degrees |
| `i_url` | `char` | `` | Bibcode of the reference paper for the inclination value |
| `discovery_method` | `char` | `` | Planet discovery method |
| `status` | `char` | `` | Planet status of the planet preferred by Exo-MerCat |
| `original_status_string` | `char` | `` | String listing the planet status in all available input sources |
| `checked_status_string` | `char` | `` | String listing the planet status in all available input sources after the KOI check |
| `confirmed` | `integer` | `` | Number of CONFIRMED status in checked_status_string |
| `discovery_year` | `integer` | `yr` | Planet discovery year |
| `main_id_aliases` | `char` | `` | String listing all known aliases for the host star |
| `msini_max` | `double` | `'MJup'` | Positive error on the minimum mass in Jovian masses |
| `msini_min` | `double` | `'MJup'` | Negative error on the minimum mass in Jovian masses |
| `main_id_provenance` | `char` | `` | Provenance of the main identifier |
| `angular_separation_flag` | `integer` | `` | Flag for non-null values of angular_separation |
| `angular_separation` | `char` | `` | String listing the unique angular separations of the merged entries |
| `catalog` | `char` | `` | String listing the catalogs in which the target appears |
| `duplicate_catalog_flag` | `integer` | `` | Flag for duplicates during merging |
| `duplicate_names` | `char` | `` | String listing planet name in all available input sources (only if duplicate_catalog_flag is not null) |
| `binary_coordinate_mismatch_flag` | `integer` | `` | Flag for possible coordinate mismatches in binaries |
| `binary_complex_system_flag` | `integer` | `` | Flag for complex binary systems |
| `coordinate_mismatch_flag` | `integer` | `` | Flag for possible coordinate mismatches |
| `coordinate_mismatch` | `char` | `` | String labeling the coordinates for which a coordinate mismatch occurred, if any |
| `period_mismatch_flag` | `integer` | `` | Flag for potential duplicates in final catalog because of mismatching p or a |
| `fallback_merge_flag` | `integer` | `` | Flag for potential duplicates in final catalog because no p or a are available (fallback merge case) |
| `misnamed_duplicates_flag` | `integer` | `` | Flag for potential duplicates in final catalog because ofa mismatch in exo-mercat_name when p or a are the same |
| `row_update` | `char` | `` | Date of the last update of the row. |
| `exomercat_version` | `char` | `` | String listing the version of the code |
| `r` | `double` | `'RJup'` | Planet radius in Jovian radii |
| `r_max` | `double` | `'RJup'` | Positive error on the radius in Jovian radii |
| `r_min` | `double` | `'RJup'` | Negative error on the radius in Jovian radii |

## Name-Bridge Columns Sample (Row 1)
```json
{
  "id": "1",
  "exomercat_name": "*   3 Cnc b",
  "nasa_name": "",
  "toi_name": "",
  "epic_name": "",
  "eu_name": "3 Cnc b",
  "oec_name": "",
  "host": "3 Cnc",
  "letter": "b",
  "main_id": "*   3 Cnc",
  "main_id_ra": "120.19711479666998",
  "main_id_dec": "17.308700552619996",
  "status": "CONFIRMED",
  "original_status_string": "eu: CONFIRMED",
  "checked_status_string": "eu: CONFIRMED",
  "main_id_aliases": "",
  "main_id_provenance": "SIMBAD",
  "angular_separation_flag": "0",
  "angular_separation": "eu: 0.0",
  "catalog": "eu",
  "duplicate_catalog_flag": "0",
  "duplicate_names": "",
  "misnamed_duplicates_flag": "0"
}
```