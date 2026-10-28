from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[1]
CURATED = ROOT / "data" / "curated"
SCHEMA = Path(__file__).with_name("schema.sql")
GLOBOCAN_EXTRACT_DATE = "2026-10-27"


def _rows(filename: str) -> list[dict[str, str]]:
    with (CURATED / filename).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _bool(value: str) -> bool:
    return value.strip().lower() == "true"


def _seed_sources(connection: duckdb.DuckDBPyConnection) -> None:
    for row in _rows("sources.csv"):
        connection.execute(
            "INSERT INTO source VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                row["source_id"], row["title"], row["url"], row["access_class"],
                row["licence"], _bool(row["redistribution_allowed"]),
                row["feeds_stage"], row["notes"],
            ],
        )


def _seed_reference_entities(connection: duckdb.DuckDBPyConnection) -> None:
    for row in _rows("countries.csv"):
        connection.execute("INSERT INTO country VALUES (?, ?, ?)", list(row.values()))

    for row in _rows("tumours.csv"):
        connection.execute(
            "INSERT INTO tumour VALUES (?, ?, ?, ?, ?, ?, 'oncotree')",
            [row["oncotree_code"], row["slug"], row["name"], row["globocan_site"],
             int(row["globocan_site_code"]), _bool(row["direct_incidence_site"])],
        )

    indications = _rows("indications.csv")
    for row in indications:
        connection.execute(
            "INSERT OR IGNORE INTO biomarker VALUES (?, ?, ?, ?)",
            [row["biomarker_id"], row["hgnc_symbol"], row["alteration_class"], row["biomarker_name"]],
        )
        connection.execute(
            "INSERT OR IGNORE INTO drug VALUES (?, ?)",
            [row["drug_id"], row["inn_name"]],
        )
        if " + " in row["inn_name"]:
            for component_name in row["inn_name"].split(" + "):
                component_id = component_name.lower().replace(" ", "_")
                connection.execute("INSERT OR IGNORE INTO drug VALUES (?, ?)", [component_id, component_name])
                connection.execute(
                    "INSERT OR IGNORE INTO regimen_component VALUES (?, ?)",
                    [row["drug_id"], component_id],
                )
        connection.execute(
            "INSERT INTO indication VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [row["indication_id"], row["oncotree_code"], row["biomarker_id"], row["drug_id"],
             row["evidence_source_id"], row["evidence_status"], row["evidence_url"], row["ancestry_note"]],
        )

    discovery = json.loads((CURATED / "discovery.json").read_text(encoding="utf-8"))
    reviewed_on = discovery["reviewedOn"]
    known_tumours = {row[0] for row in connection.sql("SELECT slug FROM tumour").fetchall()}
    for row in discovery["biomarkers"]:
        if row["tumourSlug"] not in known_tumours:
            raise ValueError(f"Unknown discovery tumour: {row['tumourSlug']}")
        connection.execute(
            "INSERT INTO discovery_biomarker VALUES (?, ?, ?, ?, ?, ?)",
            [row["id"], row["tumourSlug"], row["name"], row["pathway"], row["sourceUrl"], reviewed_on],
        )
    for row in discovery["fdaMatches"]:
        connection.execute(
            "INSERT INTO fda_match VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [row["biomarkerId"], row["tumourSlug"], row["drugName"], row["indication"],
             row["sourceUrl"], row["sourceDate"], row.get("sourceLocator"),
             row.get("approvalDate"), row.get("studyIds", []), reviewed_on],
        )
    for row in discovery.get("standardRegimens", []):
        if row["tumourSlug"] not in known_tumours:
            raise ValueError(f"Unknown regimen tumour: {row['tumourSlug']}")
        connection.execute(
            "INSERT INTO standard_regimen VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [row["id"], row["tumourSlug"], row["title"], row["setting"],
             row["summary"], row["sourceName"], row["sourceUrl"],
             row["sourceLocator"], row["regulatoryNote"],
             row.get("fdaSourceUrl"), reviewed_on],
        )


def _seed_facts(connection: duckdb.DuckDBPyConnection, incidence_rows: list[dict[str, str]]) -> None:
    snapshot_id = f"globocan-{GLOBOCAN_EXTRACT_DATE}"
    for row in incidence_rows:
        connection.execute(
            "INSERT INTO incidence VALUES (?, ?, ?, ?, ?, ?, 'globocan', ?, ?, ?, ?, ?, ?, ?, ?)",
            [row["oncotree_code"], row["iso3"], int(row["year"]), int(row["point"]),
             int(row["low"]) if row.get("low") else None, int(row["high"]) if row.get("high") else None,
             row["confidence"], row["note"], row.get("source_page_url"), row.get("source_pdf_url"),
             row.get("source_locator"), row.get("dataset_version"), row.get("scope"), snapshot_id],
        )

    indications = connection.sql("SELECT oncotree_code, biomarker_id FROM indication ORDER BY indication_id").fetchall()
    countries = connection.sql("SELECT iso3 FROM country ORDER BY iso3").fetchall()
    for oncotree_code, biomarker_id in indications:
        for (iso3,) in countries:
            for stage in ("testing", "access", "treated"):
                connection.execute(
                    "INSERT INTO multiplier VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'unknown', NULL, 'literature')",
                    [stage, oncotree_code, biomarker_id, iso3],
                )


def _optional_number(value: str, cast):
    return None if value in {"", None} else cast(value)


def _seed_country_burden(connection: duckdb.DuckDBPyConnection, rows: list[dict[str, str]]) -> None:
    snapshot_id = f"globocan-{GLOBOCAN_EXTRACT_DATE}"
    burden: dict[tuple[str, str], dict[str, str]] = {}
    for row in rows:
        key = (row["iso3"], row["cancer_site"])
        if key in burden:
            raise ValueError(f"Duplicate GLOBOCAN burden row: {key}")
        burden[key] = row
        connection.execute(
            "INSERT INTO country_cancer_burden VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'globocan', ?)",
            [
                row["iso3"], row["cancer_site"], int(row["year"]), _optional_number(row["new_cases"], int),
                _optional_number(row["incidence_rank"], int), _optional_number(row["incidence_percent"], float),
                _optional_number(row["incidence_cumulative_risk"], float), _optional_number(row["deaths"], int),
                _optional_number(row["mortality_rank"], int), _optional_number(row["mortality_percent"], float),
                _optional_number(row["mortality_cumulative_risk"], float), _optional_number(row["five_year_prevalence"], int),
                _optional_number(row["prevalence_per_100k"], float), row["dataset_version"], row["scope"],
                row["source_page_url"], row["source_pdf_url"], row["source_locator"], snapshot_id,
            ],
        )

    site_aliases = {"Melanoma of skin": "Melanoma"}
    tumours = connection.sql("SELECT oncotree_code, globocan_site, direct_incidence_site FROM tumour").fetchall()
    countries = connection.sql("SELECT iso3 FROM country").fetchall()
    for oncotree_code, mapped_site, direct in tumours:
        source_site = site_aliases.get(mapped_site, mapped_site)
        for (iso3,) in countries:
            row = burden.get((iso3, source_site))
            if not row or not row.get("new_cases"):
                raise ValueError(f"Missing GLOBOCAN burden row for {oncotree_code}/{iso3}: {source_site}")
            note = "IARC modelled national site estimate" if direct else f"IARC modelled {source_site} parent-site estimate; tumour subtype count unavailable"
            connection.execute(
                "INSERT INTO incidence VALUES (?, ?, ?, ?, NULL, NULL, 'globocan', 'modelled', ?, ?, ?, ?, ?, ?, ?)",
                [
                    oncotree_code, iso3, int(row["year"]), int(row["new_cases"]), note,
                    row["source_page_url"], row["source_pdf_url"],
                    f"Page 2 · {source_site} · New cases → Number", row["dataset_version"], row["scope"], snapshot_id,
                ],
            )


def _register_offline_snapshots(connection: duckdb.DuckDBPyConnection, record_count: int, raw_path: str | None) -> None:
    today = date.today().isoformat()
    connection.execute(
        "INSERT INTO source_snapshot VALUES (?, 'globocan', ?, ?, ?, ?, ?)",
        [f"globocan-{GLOBOCAN_EXTRACT_DATE}", GLOBOCAN_EXTRACT_DATE,
        "curated" if record_count else "not_fetched", record_count, raw_path,
         "Development extract; public redistribution requires IARC confirmation" if record_count else "Private GLOBOCAN extract not supplied"],
    )
    for source_id in ("genie", "oncokb", "ema", "cdsco", "who_eml", "literature"):
        connection.execute(
            "INSERT INTO source_snapshot VALUES (?, ?, ?, 'not_fetched', 0, NULL, ?)",
            [f"{source_id}-{today}", source_id, today, "Credentials, licence, manual download, or curation required"],
        )


def build_database(path: Path | str, *, live: bool = True, incidence_path: Path | str | None = None, globocan_country_path: Path | str | None = None) -> Path:
    output = Path(path)
    private_incidence = Path(incidence_path) if incidence_path else CURATED / "incidence.csv"
    incidence_rows = _csv_rows(private_incidence) if private_incidence.exists() else []
    private_burden = Path(globocan_country_path) if globocan_country_path else CURATED / "globocan_country_burden.csv"
    burden_rows = _csv_rows(private_burden) if private_burden.exists() and (globocan_country_path is not None or incidence_path is None) else []
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    connection = duckdb.connect(str(output))
    try:
        connection.execute(SCHEMA.read_text(encoding="utf-8"))
        _seed_sources(connection)
        _seed_reference_entities(connection)
        _register_offline_snapshots(
            connection,
            len(burden_rows) or len(incidence_rows),
            "data/curated/globocan_country_burden.csv" if burden_rows else "data/curated/incidence.csv" if incidence_rows else None,
        )
        if burden_rows:
            _seed_country_burden(connection, burden_rows)
            _seed_facts(connection, [])
        else:
            _seed_facts(connection, incidence_rows)
        if live:
            from pipelines.ingest import ingest_open_sources
            ingest_open_sources(connection, ROOT / "data" / "raw")
        connection.execute("CHECKPOINT")
    finally:
        connection.close()
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the AlphaGrid Treatment Explorer DuckDB evidence catalogue")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "alphagrid.duckdb")
    parser.add_argument("--offline", action="store_true", help="Seed curated data without network requests")
    parser.add_argument("--incidence-csv", type=Path, help="Private authorised GLOBOCAN extract; defaults to data/curated/incidence.csv when present")
    parser.add_argument("--globocan-country-csv", type=Path, help="Normalized private GLOBOCAN country burden extract")
    args = parser.parse_args()
    build_database(args.output, live=not args.offline, incidence_path=args.incidence_csv, globocan_country_path=args.globocan_country_csv)
    print(args.output)


if __name__ == "__main__":
    main()
