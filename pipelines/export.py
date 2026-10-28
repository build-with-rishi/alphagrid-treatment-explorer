from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[1]


def _json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _rows(connection: duckdb.DuckDBPyConnection, query: str) -> list[dict]:
    cursor = connection.execute(query)
    columns = [item[0] for item in cursor.description]
    return [dict(zip(columns, (_json_value(value) for value in row))) for row in cursor.fetchall()]


def export_catalog(database_path: Path | str, output_path: Path | str, *, include_restricted: bool = False) -> Path:
    database = Path(database_path)
    output = Path(output_path)
    if include_restricted:
        resolved = output.resolve()
        for public_root in (ROOT / "public", ROOT / "dist"):
            if resolved.is_relative_to(public_root.resolve()):
                raise ValueError(f"Restricted exports cannot be written under {public_root.relative_to(ROOT)}")
    connection = duckdb.connect(str(database), read_only=True)
    try:
        counts = connection.sql("""
          SELECT
            (SELECT count(*) FROM tumour) AS tumours,
            (SELECT count(*) FROM country) AS countries,
            (SELECT count(*) FROM indication) AS indications,
            (SELECT count(*) FROM incidence) AS incidence_rows,
            (SELECT count(*) FROM cohort) AS cohorts,
            (SELECT count(*) FROM civic_variant) AS civic_variants,
            (SELECT count(*) FROM regulatory_application) AS regulatory_applications,
            (SELECT count(*) FROM trial_availability) AS trial_cells
            ,(SELECT count(*) FROM oncotree_node) AS oncotree_nodes
            ,(SELECT count(*) FROM country_cancer_burden) AS country_burden_rows
            ,(SELECT count(*) FROM discovery_biomarker) AS discovery_biomarkers
            ,(SELECT count(*) FROM fda_match) AS fda_matches
        """).fetchone()
        catalog = {
            "generatedAt": date.today().isoformat(),
            "database": database.name,
            "counts": dict(zip(
                ["tumours", "countries", "indications", "incidenceRows", "cohorts", "civicVariants", "regulatoryApplications", "trialCells", "oncotreeNodes", "countryBurdenRows", "discoveryBiomarkers", "fdaMatches"],
                counts,
            )),
            "sources": _rows(connection, """
              WITH latest AS (
                SELECT *, row_number() OVER (PARTITION BY source_id ORDER BY retrieved_on DESC) AS rank
                FROM source_snapshot
              )
              SELECT s.source_id AS sourceId, s.title, s.url, s.access_class AS accessClass,
                     s.licence, s.redistribution_allowed AS redistributionAllowed,
                     s.feeds_stage AS feedsStage, s.notes,
                     coalesce(l.status, 'not_fetched') AS status,
                     coalesce(l.record_count, 0) AS recordCount,
                     l.retrieved_on AS retrievedOn, l.error
              FROM source s LEFT JOIN latest l ON s.source_id = l.source_id AND l.rank = 1
              ORDER BY s.source_id
            """),
            "tumours": _rows(connection, """
              SELECT oncotree_code AS oncotreeCode, slug, name, globocan_site AS globocanSite,
                     direct_incidence_site AS directIncidenceSite
              FROM tumour ORDER BY name
            """),
            "countries": _rows(connection, "SELECT iso3, name, regulator FROM country ORDER BY name"),
            "discoveryReviewedOn": _json_value(connection.sql("SELECT max(reviewed_on) FROM discovery_biomarker").fetchone()[0]),
            "biomarkers": _rows(connection, """
              SELECT id, tumour_slug AS tumourSlug, name, pathway, source_url AS sourceUrl
              FROM discovery_biomarker ORDER BY tumour_slug, id
            """),
            "fdaMatches": _rows(connection, """
              SELECT tumour_slug AS tumourSlug, biomarker_id AS biomarkerId, drug_name AS drugName,
                     indication, source_url AS sourceUrl, source_date AS sourceDate,
                     source_locator AS sourceLocator, approval_date AS approvalDate,
                     study_ids AS studyIds
              FROM fda_match ORDER BY tumour_slug, biomarker_id, drug_name
            """),
            "standardRegimens": _rows(connection, """
              SELECT id, tumour_slug AS tumourSlug, title, setting, summary,
                     source_name AS sourceName, source_url AS sourceUrl,
                     source_locator AS sourceLocator, regulatory_note AS regulatoryNote,
                     fda_source_url AS fdaSourceUrl
              FROM standard_regimen ORDER BY tumour_slug, id
            """),
            "cells": _rows(connection, """
              SELECT t.oncotree_code AS oncotreeCode, t.slug AS tumourSlug, t.name AS tumourName,
                     t.globocan_site AS globocanSite, t.direct_incidence_site AS directIncidenceSite,
                     c.iso3, c.name AS countryName, c.regulator,
                     b.biomarker_id AS biomarkerId, b.display_name AS biomarkerName,
                     b.hgnc_symbol AS gene, b.alteration_class AS alterationClass,
                     d.drug_id AS drugId, d.inn_name AS drugName,
                     ind.evidence_status AS indicationEvidenceStatus, ind.evidence_url AS indicationEvidenceUrl,
                     i.point AS incidencePoint, i.low AS incidenceLow, i.high AS incidenceHigh,
                     i.year AS incidenceYear, i.confidence AS incidenceConfidence, i.note AS incidenceNote,
                     i.source_page_url AS incidenceSourcePageUrl, i.source_pdf_url AS incidenceSourcePdfUrl,
                     i.source_locator AS incidenceSourceLocator, i.dataset_version AS incidenceDatasetVersion,
                     i.scope AS incidenceScope, b.incidence_rank AS incidenceRank,
                     b.incidence_percent AS incidencePercent, b.deaths AS mortalityPoint,
                     b.five_year_prevalence AS fiveYearPrevalence,
                     tr.recruiting_trials AS recruitingTrials, tr.query_url AS trialQueryUrl,
                     mt.point AS testingRate, ma.point AS accessRate, mr.point AS treatedRate
              FROM indication ind
              JOIN tumour t USING (oncotree_code)
              JOIN biomarker b USING (biomarker_id)
              JOIN drug d USING (drug_id)
              CROSS JOIN country c
              LEFT JOIN incidence i ON i.oncotree_code = t.oncotree_code AND i.iso3 = c.iso3
              LEFT JOIN country_cancer_burden b ON b.iso3 = c.iso3 AND b.year = i.year
                   AND b.cancer_site = CASE WHEN t.globocan_site = 'Melanoma of skin' THEN 'Melanoma' ELSE t.globocan_site END
              LEFT JOIN trial_availability tr ON tr.oncotree_code = t.oncotree_code AND tr.iso3 = c.iso3
              LEFT JOIN multiplier mt ON mt.oncotree_code = t.oncotree_code AND mt.biomarker_id = b.biomarker_id AND mt.iso3 = c.iso3 AND mt.stage = 'testing'
              LEFT JOIN multiplier ma ON ma.oncotree_code = t.oncotree_code AND ma.biomarker_id = b.biomarker_id AND ma.iso3 = c.iso3 AND ma.stage = 'access'
              LEFT JOIN multiplier mr ON mr.oncotree_code = t.oncotree_code AND mr.biomarker_id = b.biomarker_id AND mr.iso3 = c.iso3 AND mr.stage = 'treated'
              ORDER BY c.name, t.name
            """),
            "cohorts": _rows(connection, """
              SELECT cohort_id AS cohortId, source_id AS sourceId, name, cancer_type AS cancerType,
                     sample_count AS sampleCount, public, source_url AS sourceUrl
              FROM cohort ORDER BY source_id, name
            """),
            "civicGenes": _rows(connection, """
              SELECT gene_symbol AS gene, count(*) AS variantCount
              FROM civic_variant GROUP BY gene_symbol ORDER BY gene_symbol
            """),
            "civicVariants": _rows(connection, """
              SELECT civic_variant_id AS civicVariantId, gene_symbol AS gene,
                     variant_name AS variantName, source_url AS sourceUrl
              FROM civic_variant ORDER BY gene_symbol, variant_name, civic_variant_id
            """),
            "regulatoryApplications": _rows(connection, """
              SELECT application_number AS applicationNumber, drug_id AS drugId, regimen_id AS regimenId, regulator,
                     sponsor_name AS sponsorName, product_name AS productName,
                     status_date AS statusDate, source_url AS sourceUrl
              FROM regulatory_application ORDER BY drug_id, status_date
            """),
            "countryIndicators": _rows(connection, """
              SELECT iso3, indicator_code AS indicatorCode, year, value
              FROM country_indicator ORDER BY iso3, year DESC
            """),
            "countryCancerBurden": _rows(connection, """
              SELECT iso3, cancer_site AS cancerSite, year, new_cases AS newCases,
                     incidence_rank AS incidenceRank, incidence_percent AS incidencePercent,
                     incidence_cumulative_risk AS incidenceCumulativeRisk, deaths,
                     mortality_rank AS mortalityRank, mortality_percent AS mortalityPercent,
                     mortality_cumulative_risk AS mortalityCumulativeRisk,
                     five_year_prevalence AS fiveYearPrevalence, prevalence_per_100k AS prevalencePer100k,
                     dataset_version AS datasetVersion, scope,
                     source_page_url AS sourcePageUrl, source_pdf_url AS sourcePdfUrl,
                     source_locator AS sourceLocator
              FROM country_cancer_burden ORDER BY iso3, incidence_rank NULLS LAST, cancer_site
            """),
        }
        if not include_restricted:
            for cell in catalog["cells"]:
                cell["incidencePoint"] = None
                cell["incidenceLow"] = None
                cell["incidenceHigh"] = None
                cell["incidenceConfidence"] = None
                cell["incidenceNote"] = "Restricted development extract omitted from the public export"
                cell["incidenceRank"] = None
                cell["incidencePercent"] = None
                cell["mortalityPoint"] = None
                cell["fiveYearPrevalence"] = None
            for row in catalog["countryCancerBurden"]:
                for field in (
                    "newCases", "incidenceRank", "incidencePercent", "incidenceCumulativeRisk", "deaths",
                    "mortalityRank", "mortalityPercent", "mortalityCumulativeRisk", "fiveYearPrevalence", "prevalencePer100k",
                ):
                    row[field] = None
        catalog["includesRestrictedData"] = include_restricted
    finally:
        connection.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Export browser-safe data from AlphaGrid Treatment Explorer DuckDB")
    parser.add_argument("--database", type=Path, default=ROOT / "data" / "alphagrid.duckdb")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--include-restricted", action="store_true", help="Include rows whose source forbids unapproved redistribution")
    args = parser.parse_args()
    output = args.output or (ROOT / "data" / "catalog.local.json" if args.include_restricted else ROOT / "public" / "data" / "catalog.json")
    print(export_catalog(args.database, output, include_restricted=args.include_restricted))


if __name__ == "__main__":
    main()
