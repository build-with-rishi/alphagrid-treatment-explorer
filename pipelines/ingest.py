from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import quote, urlencode

import duckdb

from pipelines.http import fetch_json, fetch_text
from pipelines.sources.cbioportal import normalize_studies
from pipelines.sources.civic import normalize_genes
from pipelines.sources.clinical_trials import total_count
from pipelines.sources.gdc import normalize_projects
from pipelines.sources.oncotree import normalize_tumour_types
from pipelines.sources.openfda import normalize_applications
from pipelines.sources.world_bank import normalize_indicator


def _record_count(value) -> int:
    if isinstance(value, (list, tuple)):
        return len(value)
    if isinstance(value, str):
        return max(0, len(value.splitlines()) - 1)
    return 1


def run_source(
    connection: duckdb.DuckDBPyConnection,
    source_id: str,
    fetcher,
    raw_dir: Path,
    retrieved_on: str,
    *,
    processor=None,
):
    snapshot_id = f"{source_id}-{retrieved_on}"
    try:
        payload = fetcher()
        source_dir = raw_dir / source_id / retrieved_on
        source_dir.mkdir(parents=True, exist_ok=True)
        raw_path = source_dir / ("response.txt" if isinstance(payload, str) else "response.json")
        raw_path.write_text(payload if isinstance(payload, str) else json.dumps(payload, indent=2), encoding="utf-8")
        relative_path = str(raw_path.relative_to(raw_dir.parent.parent))

        connection.execute("BEGIN TRANSACTION")
        connection.execute(
            "INSERT OR REPLACE INTO source_snapshot VALUES (?, ?, ?, 'running', 0, ?, NULL)",
            [snapshot_id, source_id, retrieved_on, relative_path],
        )
        result = processor(payload, snapshot_id) if processor else payload
        connection.execute(
            "UPDATE source_snapshot SET status = 'success', record_count = ? WHERE snapshot_id = ?",
            [_record_count(result), snapshot_id],
        )
        connection.execute("COMMIT")
        return result
    except Exception as error:
        try:
            connection.execute("ROLLBACK")
        except duckdb.TransactionException:
            pass
        connection.execute(
            "INSERT OR REPLACE INTO source_snapshot VALUES (?, ?, ?, 'failed', 0, NULL, ?)",
            [snapshot_id, source_id, retrieved_on, f"{type(error).__name__}: {error}"],
        )
        return None


def _insert_cohorts(connection, source_id: str, records: list[dict], snapshot_id: str) -> list[dict]:
    for row in records:
        connection.execute(
            "INSERT OR REPLACE INTO cohort VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [f"{source_id}:{row['cohort_id']}", source_id, row["name"], row["cancer_type"],
             row["sample_count"], row["public"], row["source_url"], snapshot_id],
        )
    return records


def _fetch_civic(symbols: list[str]) -> dict:
    query = """query($symbols: [String!]) { genes(entrezSymbols: $symbols, first: 100) { nodes { name variants(first: 500) { nodes { id name } } } } }"""
    return fetch_json("https://civicdb.org/api/graphql", body={"query": query, "variables": {"symbols": symbols}})


def _trial_query_url(condition: str, country: str) -> str:
    params = urlencode({
        "query.cond": condition,
        "query.locn": country,
        "filter.overallStatus": "RECRUITING",
        "pageSize": 1,
        "countTotal": "true",
        "format": "json",
    })
    return f"https://clinicaltrials.gov/api/v2/studies?{params}"


def _trial_count(condition: str, country: str) -> int:
    return total_count(fetch_json(_trial_query_url(condition, country)))


def ingest_open_sources(connection: duckdb.DuckDBPyConnection, raw_dir: Path) -> None:
    retrieved_on = date.today().isoformat()

    def process_oncotree(payload, snapshot_id):
        records = normalize_tumour_types(payload)
        for row in records:
            connection.execute(
                "INSERT INTO oncotree_node VALUES (?, ?, ?, ?, ?, 'oncotree', ?)",
                [row["node_id"], row["oncotree_code"], row["name"], row["main_type"], row["hierarchy_level"], snapshot_id],
            )
        expected = {code for (code,) in connection.sql("SELECT oncotree_code FROM tumour").fetchall()}
        stored = {row["oncotree_code"] for row in records}
        missing = sorted(expected - stored)
        if missing:
            raise ValueError(f"Curated OncoTree codes missing upstream: {', '.join(missing)}")
        return records

    run_source(
        connection, "oncotree", lambda: fetch_text("https://oncotree.mskcc.org/api/tumor_types.txt"),
        raw_dir, retrieved_on, processor=process_oncotree,
    )

    run_source(
        connection, "cbioportal",
        lambda: fetch_json("https://www.cbioportal.org/api/studies?projection=SUMMARY&pageSize=10000000&pageNumber=0"),
        raw_dir, retrieved_on,
        processor=lambda payload, snapshot_id: _insert_cohorts(connection, "cbioportal", normalize_studies(payload), snapshot_id),
    )

    run_source(
        connection, "gdc", lambda: fetch_json("https://api.gdc.cancer.gov/projects?size=1000"),
        raw_dir, retrieved_on,
        processor=lambda payload, snapshot_id: _insert_cohorts(connection, "gdc", normalize_projects(payload), snapshot_id),
    )

    symbols = set()
    for (value,) in connection.sql("SELECT hgnc_symbol FROM biomarker").fetchall():
        symbols.update(("BRCA1", "BRCA2") if value == "BRCA1/2" else value.split("/"))

    def process_civic(payload, snapshot_id):
        records = normalize_genes(payload)
        for row in records:
            connection.execute(
                "INSERT OR REPLACE INTO civic_variant VALUES (?, ?, ?, 'civic', ?, ?)",
                [row["civic_variant_id"], row["gene_symbol"], row["variant_name"], row["source_url"], snapshot_id],
            )
        return records

    run_source(connection, "civic", lambda: _fetch_civic(sorted(symbols)), raw_dir, retrieved_on, processor=process_civic)

    regimen_for_component = {
        component_id: regimen_id
        for component_id, regimen_id in connection.sql("SELECT component_drug_id, regimen_id FROM regimen_component").fetchall()
    }
    drug_queries = {
        drug_id: inn_name
        for drug_id, inn_name in connection.sql(
            "SELECT drug_id, inn_name FROM drug WHERE drug_id NOT IN (SELECT regimen_id FROM regimen_component)"
        ).fetchall()
    }

    def fetch_fda():
        results = []
        for drug_id, ingredient in drug_queries.items():
            url = f"https://api.fda.gov/drug/drugsfda.json?search=products.active_ingredients.name:%22{quote(ingredient.upper())}%22&limit=100"
            try:
                payload = fetch_json(url)
            except Exception as error:
                if "404" in str(error):
                    payload = {"results": []}
                else:
                    raise
            results.append({"drug_id": drug_id, "regimen_id": regimen_for_component.get(drug_id), "payload": payload})
        return results

    def process_fda(payload, snapshot_id):
        records = []
        for item in payload:
            for row in normalize_applications(item["drug_id"], item["payload"]):
                row["regimen_id"] = item["regimen_id"]
                records.append(row)
                connection.execute(
                    "INSERT OR REPLACE INTO regulatory_application VALUES (?, ?, ?, 'FDA', ?, ?, ?, 'openfda', ?, ?)",
                    [row["application_number"], row["drug_id"], row["regimen_id"], row["sponsor_name"],
                     row["product_name"], row["status_date"], row["source_url"], snapshot_id],
                )
        return records

    run_source(connection, "openfda", fetch_fda, raw_dir, retrieved_on, processor=process_fda)

    countries = connection.sql("SELECT iso3, name FROM country").fetchall()
    tumours = connection.sql("SELECT oncotree_code, name FROM tumour").fetchall()
    trial_jobs = [(code, iso3, tumour_name, country_name) for code, tumour_name in tumours for iso3, country_name in countries]

    def trial_job(job):
        code, iso3, condition, country = job
        return {
            "oncotree_code": code,
            "iso3": iso3,
            "count": _trial_count(condition, country),
            "query_url": _trial_query_url(condition, country),
        }

    def process_trials(payload, snapshot_id):
        if not isinstance(payload, list) or len(payload) != len(trial_jobs):
            raise ValueError("ClinicalTrials.gov result set is incomplete")
        for row in payload:
            connection.execute(
                "INSERT OR REPLACE INTO trial_availability VALUES (?, ?, ?, 'clinicaltrials', ?, ?, ?)",
                [row["oncotree_code"], row["iso3"], row["count"], retrieved_on, row["query_url"], snapshot_id],
            )
        return payload

    run_source(
        connection, "clinicaltrials",
        lambda: list(ThreadPoolExecutor(max_workers=8).map(trial_job, trial_jobs)),
        raw_dir, retrieved_on, processor=process_trials,
    )

    iso_codes = ";".join(iso3 for iso3, _ in countries)

    def process_world_bank(payload, snapshot_id):
        records = normalize_indicator(payload, "SP.POP.TOTL")
        for row in records:
            connection.execute(
                "INSERT OR REPLACE INTO country_indicator VALUES (?, ?, ?, ?, 'worldbank', ?)",
                [row["iso3"], row["indicator_code"], row["year"], row["value"], snapshot_id],
            )
        return records

    run_source(
        connection, "worldbank",
        lambda: fetch_json(f"https://api.worldbank.org/v2/country/{iso_codes}/indicator/SP.POP.TOTL?format=json&date=2022:2026&per_page=100"),
        raw_dir, retrieved_on, processor=process_world_bank,
    )
