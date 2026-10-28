# Contributing to AlphaGrid Treatment Explorer

Thanks for helping make treatment evidence easier to inspect. Contributions to the interface, source adapters, documentation, and reviewed evidence catalogue are welcome.

## Start locally

Use Node.js 22 or newer. The committed public catalogue is enough to run the app:

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run build
```

For Python pipeline changes, use Python 3.12 or newer:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m unittest tests.test_database -v
```

`npm run data:offline` rebuilds from committed curated records. It may change the generated catalogue because the published snapshot also contains metadata from earlier live retrievals. Include generated catalogue changes only when they are intended and reviewed.

## Evidence changes

The editable biomarker and drug-indication catalogue is `data/curated/discovery.json`. For each new or corrected record, provide an exact primary source URL and preserve tumour type, biomarker or pathway, stage, prior-treatment, and combination conditions stated by that source. FDA approval means US regulatory approval for the labelled indication; it does not establish access elsewhere or suitability for an individual. Put standard regimens in their separate treatment-context records, rather than treating them as biomarker-specific approvals.

Describe the source, what it supports, and any limitation in the pull request. A missing record is an indexing gap, not evidence that a treatment is unknown. Do not compute an unmatched-patient count from cohort metadata or unverified national rates.

## Data and privacy

Do not commit patient reports, protected health information, credentials, raw source downloads, local DuckDB files, or restricted GLOBOCAN extracts. Use synthetic or clearly licensed fixtures in tests and issues. The report explorer parses PDFs in the browser; changes to that behavior should retain the local-only privacy boundary unless a new design is explicitly reviewed.

The default public export excludes numerical GLOBOCAN incidence, mortality, and prevalence values pending redistribution permission. Keep that boundary intact and verify `npm run build` passes. See [data provenance](docs/data-provenance.md) and [private incidence input](data/curated/incidence.README.md).

## Pull requests

Keep changes focused, explain the user-facing effect, link supporting sources, and include the verification commands you ran. Issues are a good place to discuss a new data source or a larger UX change before implementation.
