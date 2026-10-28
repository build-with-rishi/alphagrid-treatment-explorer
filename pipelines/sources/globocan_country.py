from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CountryExport:
    iso3: str
    name: str
    population_code: int
    slug: str
    csv_name: str

    @property
    def page_url(self) -> str:
        return f"https://gco.iarc.who.int/today/en/fact-sheets-populations/{self.population_code}/{self.slug}"

    @property
    def pdf_url(self) -> str:
        return f"https://gco.iarc.who.int/media/globocan/factsheets/populations/{self.population_code}-{self.slug}-fact-sheet.pdf"


COUNTRY_EXPORTS = {
    "GBR": CountryExport("GBR", "United Kingdom", 826, "united-kingdom", "united-kingdom-incidence-mortality-and-prevalence-by-cancer-site.csv"),
    "NGA": CountryExport("NGA", "Nigeria", 566, "nigeria", "nigeria-incidence-mortality-and-prevalence-by-cancer-site.csv"),
    "USA": CountryExport("USA", "United States", 840, "united-states-of-america", "united-states-of-america-incidence-mortality-and-prevalence-by-cancer-site.csv"),
    "IND": CountryExport("IND", "India", 356, "india", "india-incidence-mortality-and-prevalence-by-cancer-site.csv"),
    "BRA": CountryExport("BRA", "Brazil", 76, "brazil", "brazil-incidence-mortality-and-prevalence-by-cancer-site.csv"),
}

FIELDS = [
    "iso3", "country_name", "population_code", "year", "dataset_version", "scope",
    "cancer_site", "new_cases", "incidence_rank", "incidence_percent", "incidence_cumulative_risk",
    "deaths", "mortality_rank", "mortality_percent", "mortality_cumulative_risk",
    "five_year_prevalence", "prevalence_per_100k", "source_page_url", "source_pdf_url", "source_locator",
]

GROUP_HEADER = ["", "New cases", "", "", "", "Deaths", "", "", "", "5-year prevalence", ""]
COLUMN_HEADER = ["Cancer", "Number", "Rank", "(%)", "Cum.risk", "Number", "Rank", "(%)", "Cum.risk", "Number", "Prop. (per 100 000)"]


def _integer(value: str) -> int | None:
    cleaned = value.strip().replace(" ", "")
    return None if cleaned in {"", "-"} else int(cleaned)


def _decimal(value: str) -> float | None:
    cleaned = value.strip()
    return None if cleaned in {"", "-"} else float(cleaned)


def normalize_country_csv(path: Path, country: CountryExport) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))
    if len(rows) < 3 or rows[0] != GROUP_HEADER or rows[1] != COLUMN_HEADER:
        raise ValueError(f"Unexpected GLOBOCAN CSV headers in {path.name}")

    normalized: list[dict] = []
    seen: set[str] = set()
    for values in rows[2:]:
        if not values or not values[0].strip():
            continue
        if len(values) != len(COLUMN_HEADER):
            raise ValueError(f"Malformed GLOBOCAN row in {path.name}: {values}")
        site = values[0].strip()
        if site in seen:
            raise ValueError(f"Duplicate GLOBOCAN cancer site in {path.name}: {site}")
        seen.add(site)
        normalized.append({
            "iso3": country.iso3,
            "country_name": country.name,
            "population_code": country.population_code,
            "year": 2024,
            "dataset_version": "GLOBOCAN 2024",
            "scope": "Both sexes, all ages",
            "cancer_site": site,
            "new_cases": _integer(values[1]),
            "incidence_rank": _integer(values[2]),
            "incidence_percent": _decimal(values[3]),
            "incidence_cumulative_risk": _decimal(values[4]),
            "deaths": _integer(values[5]),
            "mortality_rank": _integer(values[6]),
            "mortality_percent": _decimal(values[7]),
            "mortality_cumulative_risk": _decimal(values[8]),
            "five_year_prevalence": _integer(values[9]),
            "prevalence_per_100k": _decimal(values[10]),
            "source_page_url": country.page_url,
            "source_pdf_url": country.pdf_url,
            "source_locator": f"Page 2 · {site} · New cases → Number",
        })
    return normalized


def write_normalized_extract(input_dir: Path, output_path: Path) -> Path:
    records: list[dict] = []
    for country in COUNTRY_EXPORTS.values():
        source = input_dir / country.csv_name
        if not source.exists():
            raise FileNotFoundError(f"Missing GLOBOCAN country export: {source}")
        records.extend(normalize_country_csv(source, country))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(records)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize local GLOBOCAN 2024 country CSV exports")
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(write_normalized_extract(args.input_dir, args.output))


if __name__ == "__main__":
    main()
