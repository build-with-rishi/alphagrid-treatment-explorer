import csv
import json
import tempfile
import unittest
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[1]


def synthetic_incidence(directory: str) -> Path:
    output = Path(directory) / "incidence.csv"
    with (ROOT / "data/curated/tumours.csv").open(newline="", encoding="utf-8") as handle:
        tumour_codes = [row["oncotree_code"] for row in csv.DictReader(handle)]
    with (ROOT / "data/curated/countries.csv").open(newline="", encoding="utf-8") as handle:
        countries = [row["iso3"] for row in csv.DictReader(handle)]
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["oncotree_code", "iso3", "year", "point", "low", "high", "confidence", "note"])
        for tumour_code in tumour_codes:
            for iso3 in countries:
                writer.writerow([tumour_code, iso3, 2022, 100, 90, 110, "synthetic", "Test fixture only"])
    return output


def synthetic_globocan_burden(directory: str) -> Path:
    from pipelines.sources.globocan_country import COUNTRY_EXPORTS, FIELDS

    output = Path(directory) / "globocan_country_burden.csv"
    sites = ["Lung", "Breast", "Colorectum", "Prostate", "Stomach", "Ovary", "Pancreas", "Melanoma", "Thyroid", "Liver"]
    overrides = {("IND", "Ovary"): 45566, ("USA", "Ovary"): 20820, ("GBR", "Lung"): 54541}
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for country in COUNTRY_EXPORTS.values():
            for index, site in enumerate(sites, start=1):
                point = overrides.get((country.iso3, site), 1000 + index)
                writer.writerow({
                    "iso3": country.iso3, "country_name": country.name, "population_code": country.population_code,
                    "year": 2024, "dataset_version": "GLOBOCAN 2024", "scope": "Both sexes, all ages",
                    "cancer_site": site, "new_cases": point, "incidence_rank": index, "incidence_percent": 2.5,
                    "incidence_cumulative_risk": 0.5, "deaths": point // 2, "mortality_rank": index,
                    "mortality_percent": 2.0, "mortality_cumulative_risk": 0.25,
                    "five_year_prevalence": point * 3, "prevalence_per_100k": 10.0,
                    "source_page_url": country.page_url, "source_pdf_url": country.pdf_url,
                    "source_locator": f"Page 2 · {site} · New cases → Number",
                })
    return output


class DatabaseBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "alphagrid.duckdb"
        self.incidence_path = synthetic_incidence(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_exports_discovery_catalog_and_fda_matches(self):
        from pipelines.build_database import build_database
        from pipelines.export import export_catalog

        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        connection = duckdb.connect(str(self.database_path), read_only=True)
        self.assertGreaterEqual(connection.sql("SELECT count(*) FROM discovery_biomarker").fetchone()[0], 40)
        self.assertEqual(connection.sql("SELECT count(DISTINCT tumour_slug) FROM discovery_biomarker").fetchone()[0], 10)
        self.assertGreaterEqual(connection.sql("SELECT count(*) FROM fda_match").fetchone()[0], 20)
        self.assertEqual(connection.sql("SELECT count(*) FROM standard_regimen WHERE tumour_slug = 'ovarian'").fetchone()[0], 2)
        connection.close()

        output = Path(self.temp_dir.name) / "catalog.json"
        export_catalog(self.database_path, output)
        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(payload["biomarkers"]), 40)
        self.assertGreaterEqual(len(payload["fdaMatches"]), 20)
        self.assertEqual({row["id"] for row in payload["standardRegimens"]}, {
            "ovarian_nact_carbo_paclitaxel", "ovarian_firstline_cisplatin_paclitaxel",
        })
        self.assertTrue(all(row["sourceUrl"].startswith("https://") for row in payload["biomarkers"]))

    def test_builds_normalized_reference_catalogue_with_provenance(self):
        from pipelines.build_database import build_database

        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        connection = duckdb.connect(str(self.database_path), read_only=True)

        self.assertEqual(connection.sql("SELECT count(*) FROM tumour").fetchone()[0], 10)
        self.assertEqual(connection.sql("SELECT count(*) FROM country").fetchone()[0], 5)
        self.assertEqual(connection.sql("SELECT count(*) FROM biomarker").fetchone()[0], 8)
        self.assertEqual(connection.sql("SELECT count(*) FROM indication").fetchone()[0], 10)
        self.assertEqual(connection.sql("SELECT count(*) FROM incidence").fetchone()[0], 50)
        self.assertEqual(
            connection.sql("SELECT count(*) FROM incidence WHERE source_id IS NULL").fetchone()[0],
            0,
        )
        self.assertEqual(
            connection.sql("SELECT status, record_count FROM source_snapshot WHERE source_id = 'globocan'").fetchone(),
            ("curated", 50),
        )
        self.assertEqual(connection.sql("SELECT count(*) FROM incidence WHERE snapshot_id IS NULL").fetchone()[0], 0)
        self.assertEqual(connection.sql("SELECT count(*) FROM regimen_component").fetchone()[0], 4)
        connection.close()

    def test_derives_2024_incidence_from_country_burden_with_exact_citation(self):
        from pipelines.build_database import build_database
        from pipelines.export import export_catalog

        burden_path = synthetic_globocan_burden(self.temp_dir.name)
        build_database(self.database_path, live=False, incidence_path=Path(self.temp_dir.name) / "absent.csv", globocan_country_path=burden_path)
        connection = duckdb.connect(str(self.database_path), read_only=True)

        ovary = connection.sql("""
          SELECT year, point, low, high, source_page_url, source_pdf_url, source_locator, dataset_version, scope
          FROM incidence WHERE oncotree_code = 'OVT' AND iso3 = 'IND'
        """).fetchone()
        burden_count = connection.sql("SELECT count(*) FROM country_cancer_burden").fetchone()[0]
        connection.close()

        self.assertEqual(ovary, (
            2024, 45566, None, None,
            "https://gco.iarc.who.int/today/en/fact-sheets-populations/356/india",
            "https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf",
            "Page 2 · Ovary · New cases → Number", "GLOBOCAN 2024", "Both sexes, all ages",
        ))
        self.assertEqual(burden_count, 50)

        public_path = Path(self.temp_dir.name) / "public.json"
        private_path = Path(self.temp_dir.name) / "private.json"
        export_catalog(self.database_path, public_path)
        export_catalog(self.database_path, private_path, include_restricted=True)
        public = json.loads(public_path.read_text(encoding="utf-8"))
        private = json.loads(private_path.read_text(encoding="utf-8"))
        private_cell = next(cell for cell in private["cells"] if cell["tumourSlug"] == "ovarian" and cell["iso3"] == "IND")
        public_cell = next(cell for cell in public["cells"] if cell["tumourSlug"] == "ovarian" and cell["iso3"] == "IND")

        self.assertEqual(private_cell["incidencePoint"], 45566)
        self.assertEqual(private_cell["mortalityPoint"], 22783)
        self.assertEqual(private_cell["incidenceSourcePdfUrl"], "https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf")
        self.assertEqual(private_cell["incidenceDatasetVersion"], "GLOBOCAN 2024")
        self.assertIsNone(public_cell["incidencePoint"])
        self.assertIsNone(public_cell["mortalityPoint"])
        self.assertEqual(len(private["countryCancerBurden"]), 50)
        self.assertEqual(private["countryCancerBurden"][0].keys() >= {"sourcePageUrl", "sourcePdfUrl", "sourceLocator"}, True)
        self.assertTrue(all(row["newCases"] is None for row in public["countryCancerBurden"]))


class SourceAdapterTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "alphagrid.duckdb"
        self.incidence_path = synthetic_incidence(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_normalizes_public_cohort_and_regulatory_metadata(self):
        from pipelines.sources.cbioportal import normalize_studies
        from pipelines.sources.gdc import normalize_projects
        from pipelines.sources.openfda import normalize_applications

        cbio = normalize_studies([
            {"studyId": "luad_tcga_pan_can_atlas_2018", "name": "Lung Adenocarcinoma", "cancerTypeId": "luad", "allSampleCount": 566, "publicStudy": True},
        ])
        gdc = normalize_projects({"data": {"hits": [{"project_id": "TCGA-LUAD", "name": "Lung Adenocarcinoma", "primary_site": ["Bronchus and lung"], "released": True}]}})
        fda = normalize_applications("osimertinib", {"results": [{"application_number": "NDA208065", "sponsor_name": "AstraZeneca", "products": [{"brand_name": "TAGRISSO"}], "submissions": [{"submission_status": "AP", "submission_status_date": "20151113"}]}]})

        self.assertEqual(cbio[0]["sample_count"], 566)
        self.assertEqual(gdc[0]["cohort_id"], "TCGA-LUAD")
        self.assertEqual(fda[0]["application_number"], "NDA208065")
        self.assertEqual(fda[0]["status_date"], "2015-11-13")

    def test_rejects_malformed_records_instead_of_silently_dropping_them(self):
        from pipelines.sources.cbioportal import normalize_studies
        from pipelines.sources.civic import normalize_genes
        from pipelines.sources.gdc import normalize_projects
        from pipelines.sources.openfda import normalize_applications

        malformed_payloads = [
            lambda: normalize_studies([{"name": "Missing ID"}]),
            lambda: normalize_projects({"data": {"hits": [{"name": "Missing ID"}]}}),
            lambda: normalize_genes({"data": {"genes": {"nodes": [{"name": "EGFR"}]}}}),
            lambda: normalize_applications("osimertinib", {"results": [{"sponsor_name": "Missing application"}]}),
        ]
        for normalize in malformed_payloads:
            with self.subTest(normalize=normalize):
                with self.assertRaises(ValueError):
                    normalize()

    def test_records_an_upstream_failure_without_inventing_rows(self):
        from pipelines.ingest import run_source

        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "failure.duckdb"
            from pipelines.build_database import build_database
            build_database(database_path, live=False, incidence_path=self.incidence_path)
            connection = duckdb.connect(str(database_path))

            def failing_fetcher():
                raise RuntimeError("upstream unavailable")

            result = run_source(connection, "cbioportal", failing_fetcher, Path(temp_dir) / "raw", "2026-10-26")
            snapshot = connection.sql("SELECT status, record_count, error FROM source_snapshot WHERE snapshot_id = 'cbioportal-2026-10-26'").fetchone()
            connection.close()

        self.assertEqual(result, None)
        self.assertEqual(snapshot[0], "failed")
        self.assertEqual(snapshot[1], 0)
        self.assertIn("upstream unavailable", snapshot[2])

    def test_rolls_back_normalization_before_marking_a_snapshot_successful(self):
        from pipelines.build_database import build_database
        from pipelines.ingest import run_source

        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        connection = duckdb.connect(str(self.database_path))

        def malformed_processor(payload, snapshot_id):
            connection.execute(
                "INSERT INTO cohort VALUES ('partial', 'cbioportal', 'Partial', NULL, NULL, true, NULL, ?)",
                [snapshot_id],
            )
            raise ValueError("unexpected upstream shape")

        result = run_source(
            connection, "cbioportal", lambda: {"wrong": "shape"}, Path(self.temp_dir.name) / "raw",
            "2026-10-27", processor=malformed_processor,
        )
        snapshot = connection.sql("SELECT status FROM source_snapshot WHERE snapshot_id = 'cbioportal-2026-10-27'").fetchone()
        partial = connection.sql("SELECT count(*) FROM cohort WHERE cohort_id = 'partial'").fetchone()[0]
        connection.close()

        self.assertIsNone(result)
        self.assertEqual(snapshot[0], "failed")
        self.assertEqual(partial, 0)

    def test_exports_a_browser_catalogue_that_matches_duckdb(self):
        from pipelines.build_database import build_database
        from pipelines.export import export_catalog

        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        connection = duckdb.connect(str(self.database_path))
        connection.execute(
            "INSERT INTO source_snapshot VALUES ('civic-test', 'civic', DATE '2026-10-26', 'success', 1, NULL, NULL)"
        )
        connection.execute(
            "INSERT INTO civic_variant VALUES (133, 'EGFR', 'Exon 19 Deletion', 'civic', "
            "'https://civicdb.org/variants/133/summary', 'civic-test')"
        )
        connection.execute(
            "INSERT INTO source_snapshot VALUES ('trials-test', 'clinicaltrials', DATE '2026-10-26', 'success', 1, NULL, NULL)"
        )
        connection.execute(
            "INSERT INTO trial_availability VALUES ('NSCLC', 'IND', 24, 'clinicaltrials', "
            "DATE '2026-10-26', 'https://clinicaltrials.gov/api/v2/studies?query.cond=Non-small-cell-lung-cancer', 'trials-test')"
        )
        connection.close()
        output = Path(self.temp_dir.name) / "catalog.json"
        export_catalog(self.database_path, output)
        catalog = json.loads(output.read_text(encoding="utf-8"))

        private_output = Path(self.temp_dir.name) / "catalog.local.json"
        export_catalog(self.database_path, private_output, include_restricted=True)
        private_catalog = json.loads(private_output.read_text(encoding="utf-8"))

        self.assertEqual(catalog["counts"]["tumours"], 10)
        self.assertEqual(catalog["counts"]["incidenceRows"], 50)
        self.assertEqual(len(catalog["cells"]), 50)
        self.assertIsNone(catalog["cells"][0]["testingRate"])
        self.assertIsNone(catalog["cells"][0]["incidencePoint"])
        self.assertEqual(private_catalog["cells"][0]["incidencePoint"], 100)
        self.assertEqual(catalog["sources"][0].keys() >= {"sourceId", "status", "recordCount"}, True)
        self.assertEqual(catalog["counts"]["civicVariants"], len(catalog["civicVariants"]))
        self.assertEqual(catalog["civicVariants"], [{
            "civicVariantId": 133,
            "gene": "EGFR",
            "variantName": "Exon 19 Deletion",
            "sourceUrl": "https://civicdb.org/variants/133/summary",
        }])
        nsclc_india = next(cell for cell in private_catalog["cells"] if cell["tumourSlug"] == "nsclc" and cell["iso3"] == "IND")
        self.assertEqual(nsclc_india["recruitingTrials"], 24)
        self.assertEqual(nsclc_india["trialQueryUrl"], "https://clinicaltrials.gov/api/v2/studies?query.cond=Non-small-cell-lung-cancer")

        with self.assertRaises(ValueError):
            export_catalog(self.database_path, ROOT / "public/data/unsafe-test.json", include_restricted=True)

    def test_parses_oncotree_rows_and_rejects_missing_trial_totals(self):
        from pipelines.sources.oncotree import normalize_tumour_types
        from pipelines.sources.clinical_trials import total_count

        text = "level_1\tlevel_2\tmetamaintype\nLung (LUNG)\tNon-Small Cell Lung Cancer (NSCLC)\tLung Cancer\n"
        rows = normalize_tumour_types(text)
        self.assertEqual(rows[0]["oncotree_code"], "NSCLC")
        self.assertEqual(rows[0]["name"], "Non-Small Cell Lung Cancer")
        with self.assertRaises(ValueError):
            total_count({"studies": []})

    def test_builds_a_reproducible_clinical_trials_query(self):
        from pipelines.ingest import _trial_query_url

        url = _trial_query_url("Non-small cell lung cancer", "India")
        self.assertIn("query.cond=Non-small+cell+lung+cancer", url)
        self.assertIn("query.locn=India", url)
        self.assertIn("filter.overallStatus=RECRUITING", url)
        self.assertIn("countTotal=true", url)

    def test_preserves_source_access_and_unknown_values(self):
        from pipelines.build_database import build_database

        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        connection = duckdb.connect(str(self.database_path), read_only=True)

        genie = connection.sql(
            "SELECT access_class, redistribution_allowed FROM source WHERE source_id = 'genie'"
        ).fetchone()
        oncokb = connection.sql(
            "SELECT access_class, redistribution_allowed FROM source WHERE source_id = 'oncokb'"
        ).fetchone()
        testing = connection.sql(
            "SELECT point FROM multiplier WHERE stage = 'testing' AND iso3 = 'IND' LIMIT 1"
        ).fetchone()

        self.assertEqual(genie, ("account-gated", False))
        self.assertEqual(oncokb, ("licensed", False))
        self.assertIsNone(testing[0])
        connection.close()

    def test_normalizes_globocan_country_rows_with_exact_provenance(self):
        from pipelines.sources.globocan_country import COUNTRY_EXPORTS, normalize_country_csv

        fixture = Path(self.temp_dir.name) / "india-incidence-mortality-and-prevalence-by-cancer-site.csv"
        fixture.write_text(
            ",New cases,,,,Deaths,,,,5-year prevalence,\n"
            "Cancer,Number,Rank,(%),Cum.risk,Number,Rank,(%),Cum.risk,Number,Prop. (per 100 000)\n"
            "Ovary,45 566,9,2.9,0.67,28 782,10,3.2,0.45,106 187,15.1\n",
            encoding="utf-8",
        )

        row = normalize_country_csv(fixture, COUNTRY_EXPORTS["IND"])[0]

        self.assertEqual(row["new_cases"], 45566)
        self.assertEqual(row["deaths"], 28782)
        self.assertEqual(row["five_year_prevalence"], 106187)
        self.assertEqual(row["year"], 2024)
        self.assertEqual(row["dataset_version"], "GLOBOCAN 2024")
        self.assertEqual(row["source_page_url"], "https://gco.iarc.who.int/today/en/fact-sheets-populations/356/india")
        self.assertEqual(row["source_pdf_url"], "https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf")
        self.assertEqual(row["source_locator"], "Page 2 · Ovary · New cases → Number")

    def test_rejects_malformed_globocan_country_headers(self):
        from pipelines.sources.globocan_country import COUNTRY_EXPORTS, normalize_country_csv

        fixture = Path(self.temp_dir.name) / "broken.csv"
        fixture.write_text("Cancer,Cases\nOvary,45 566\n", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "GLOBOCAN CSV headers"):
            normalize_country_csv(fixture, COUNTRY_EXPORTS["IND"])

    def test_rebuild_is_idempotent(self):
        from pipelines.build_database import build_database

        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        build_database(self.database_path, live=False, incidence_path=self.incidence_path)
        connection = duckdb.connect(str(self.database_path), read_only=True)
        self.assertEqual(connection.sql("SELECT count(*) FROM tumour").fetchone()[0], 10)
        self.assertEqual(connection.sql("SELECT count(*) FROM incidence").fetchone()[0], 50)
        connection.close()


if __name__ == "__main__":
    unittest.main()
