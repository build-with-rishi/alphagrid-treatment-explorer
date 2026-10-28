# AlphaGrid Treatment Explorer

AlphaGrid Treatment Explorer is a source-backed evidence workspace for examining the data needed to estimate gaps between an actionable cancer biomarker and treatment. The discovery view now catalogs 49 cancer–biomarker pairs across ten cancers, with 45 indexed FDA indication records. Its older evidence atlas retains one exemplar pair per cancer. Country context covers India, the United States, the United Kingdom, Brazil and Nigeria.

The application does not currently publish an unmatched-patient total. Source metadata is populated; public incidence values and national testing, access and treatment rates remain unavailable until publication rights and cited evidence are established.

The discovery view shows FDA-approved drug indications linked to selected biomarkers and pathways. These are research links to US regulatory records, not recommendations for a live case or evidence of access in another country. A missing indexed match does not mean that no treatment exists. The 49-pair catalog is a sourced starting set, not an exhaustive cancer biomarker inventory.

The optional report explorer reads the first page of a text-based Tempus xT-style PDF locally in the browser. It extracts reported positive variants, offers a cancer-type confirmation, and shows exact catalog matches with FDA source links. The PDF bytes are not uploaded, stored, or included in this repository. The parser does not infer MSI status from the sample report's text layer because it contains all three printed options; it does not treat negative findings or variants of unknown significance as positive. Scanned PDFs require OCR or manual selection. Report matching does not establish stage, previous treatment, or eligibility under an FDA indication.

## Data architecture

- `data/alphagrid.duckdb` is the analytical source of truth.
- `data/curated/` contains reviewed mappings; a private, git-ignored GLOBOCAN extract can be placed there locally.
- `data/curated/discovery.json` contains the source-linked cancer–biomarker catalog and FDA indication records shown in the new discovery view.
- `data/raw/` caches live source responses and is not committed.
- `pipelines/` contains source adapters, schema creation and export code.
- `public/data/catalog.json` is the browser-safe export consumed by the static UI.

The live pipeline currently retrieves metadata from OncoTree, cBioPortal, GDC, CIViC, openFDA, ClinicalTrials.gov and the World Bank. GENIE and OncoKB are registered but not fetched without the required account or licence. EMA, CDSCO and WHO eEML are registered as manual ingestion work.

## Build the data

Python 3.12 or newer is required to rebuild the data. Create an isolated environment and install the pinned dependency first:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

```bash
npm run data:build
```

For a deterministic rebuild using only committed curated inputs, without live source requests or private incidence values:

```bash
npm run data:offline
```

## Run the workspace

```bash
npm ci
npm run dev
```

## Verify

```bash
python3 -m unittest tests.test_database -v
npm test
npm run typecheck
npm run build
```

The data pipeline writes a local DuckDB file and a git-ignored `data/catalog.local.json` that may contain restricted development data. Vite serves that file only during local development. The committed `public/data/catalog.json` is public-safe and excludes numerical incidence values; production builds refuse a catalogue containing them. A fresh clone can run the app and frontend tests from the committed public catalogue without rebuilding data.

See [data provenance](docs/data-provenance.md) for current record counts and publication restrictions.

Code is Apache-2.0. Upstream data remains subject to each source’s terms.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, evidence review criteria, and data safety rules. Please open an issue for new biomarkers, drug indications, source integrations, or corrections with a traceable primary source.
