# AlphaGrid Treatment Explorer data provenance

## Discovery catalog (28 October 2026)

`data/curated/discovery.json` contains 49 cancer–biomarker pairs and 45 FDA indication records across the ten current cancers. Each pair has a source URL; each drug match links to an FDA approval notice or prescribing record and preserves the indication conditions. This is a curated starting set, not an exhaustive index of approved drugs or biomarkers. The dated source set matters: the 2026 FDA withdrawal of adagrasib with cetuximab for KRAS G12C colorectal cancer excludes that combination; the FDA-approved sotorasib with panitumumab combination is included. Tissue-agnostic MSI-high, TMB-high and NTRK entries retain their label conditions. TMB-high uses the FDA's updated October 2026 threshold (≥13 mut/Mb).

The ovarian expansion adds source-backed HRD, FRα, KRAS-mutated low-grade serous disease, and PD-L1 CPS ≥1 records. Platinum–taxane regimens are stored separately in `standard_regimen` because they are treatment-context evidence rather than molecular biomarker indications. The carboplatin–paclitaxel neoadjuvant record comes from the NCI ovarian PDQ; the cisplatin–paclitaxel first-line record also links to the FDA paclitaxel label. Neither regimen is displayed as a biomarker-specific FDA match. These records still do not constitute a comprehensive ovarian treatment inventory.

The DuckDB build stores these records in `discovery_biomarker` and `fda_match`; public and local exports include the same catalog. The legacy `indication` table and atlas cells remain ten evidence-funnel exemplars. A pair without an indexed FDA match is an evidence-index gap, not a patient count or proof that no treatment exists.

Original atlas snapshot: 27 October 2026. Discovery catalog reviewed: 28 October 2026.

## Stored data

The reproducible local database is `data/alphagrid.duckdb`. It is git-ignored because it contains the restricted incidence development extract. `public/data/catalog.json` is the committed public-safe export; it preserves metadata and missingness but removes restricted incidence values. Local development additionally generates git-ignored `data/catalog.local.json`, exposed only by the development server.

| Source | Ingestion state | Stored metadata |
|---|---|---:|
| GLOBOCAN 2024 | Five supplied country CSV/PDF exports | 170 country/site burden rows; 50 mapped incidence facts |
| OncoTree | Live API snapshot | 897 taxonomy rows |
| cBioPortal | Live API snapshot | 551 study rows |
| NCI GDC | Live API snapshot | 93 project rows |
| CIViC | Live GraphQL snapshot | 598 variants across the MVP genes |
| openFDA Drugs@FDA | Live API snapshot | 30 component application rows |
| ClinicalTrials.gov | Live API queries | 50 tumour-country counts |
| World Bank | Live API snapshot | 20 population indicator rows |

Raw live responses are cached under `data/raw/<source>/<date>/` and are git-ignored. Each retrieved fact retains both a source identifier and the exact snapshot identifier. A source is marked successful only after payload validation, normalization and database insertion complete in one transaction.

## Incidence boundary

The local, git-ignored GLOBOCAN extract contains every cancer-site row in the five supplied country CSV exports. Each row retains the exact country page, country PDF and PDF-table locator. The dashboard derives its 50 tumour-country incidence facts using a literal key lookup: ISO-3 country plus the curated GLOBOCAN site, followed by the `New cases — Number` field. It does not calculate or adjust this value.

The supplied exports do not publish an uncertainty interval for the count. Incidence `low` and `high` are therefore stored as `NULL`; the interface explicitly says that no source interval was reported. Deaths and five-year prevalence are stored for source inspection but are not substituted into the funnel incidence input.

GLOBOCAN does not isolate NSCLC from lung cancer or cholangiocarcinoma from liver cancer. Those rows are explicitly labelled parent-site lookups, and the application does not apply an uncited subtype share. The other MVP mappings use the named country/site row directly.

This extract is development-only. Confirm in writing with IARC what may be redistributed before publishing it. The default exporter removes numerical incidence, mortality and prevalence values while preserving source metadata and exact citations; only `--include-restricted` produces the local development export.

## What the metadata does not establish

- The current cBioPortal adapter calls only `/api/studies?projection=SUMMARY`. It does not yet fetch clinical records, molecular profiles, mutations, copy-number data, structural variants or gene-panel coverage. Its matched-study count is therefore a candidate-study index, not a biomarker frequency.
- The current GDC adapter stores project metadata only. cBioPortal and GDC cohorts do not provide national biomarker prevalence, and TCGA-derived cohorts must not be counted twice across the two repositories.
- The current CIViC adapter stores gene and variant records only. It does not yet retrieve disease-specific evidence items, assertions, therapies, evidence levels or literature citations; a CIViC variant record does not by itself prove an approved indication.
- The current openFDA adapter stores application metadata and exact Drugs@FDA application links. An application record does not itself establish the selected tumour–biomarker indication, reimbursement, supply or approval outside the United States.
- A ClinicalTrials.gov location query counts records with overall status `RECRUITING`; it does not establish routine access.
- Country-specific biomarker testing and treatment rates are not exposed by a complete public API.

Accordingly, the committed `multiplier` rows for testing, access and treated share contain `NULL` values with `unknown` confidence. The workspace does not calculate an unmatched-patient total from substitute assumptions.

## Restricted and manual sources

AACR GENIE requires an account and acceptance of its terms. OncoKB requires licence approval and may require a commercial licence. Their raw data is not stored. EMA, CDSCO and WHO eEML are represented in the source registry but require a dedicated manual or bulk-download adapter and scientific indication review.

The live OncoTree snapshot is normalized into 897 `oncotree_node` rows. Validation against that snapshot corrected two proposal mappings: ovarian cancer uses `OVT` rather than `OV`, and thyroid uses `THYROID` rather than the TCGA project code `THCA`.
