from datetime import datetime


def _date(value: str | None) -> str | None:
    if not value or len(value) != 8:
        return None
    return datetime.strptime(value, "%Y%m%d").date().isoformat()


def normalize_applications(drug_id: str, payload: dict) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("openFDA response omitted results")
    if any(not isinstance(item, dict) or not item.get("application_number") for item in payload["results"]):
        raise ValueError("openFDA result omitted application_number")
    rows = []
    for item in payload.get("results", []):
        approved = [submission for submission in item.get("submissions", []) if submission.get("submission_status") == "AP"]
        dates = [value for value in (_date(submission.get("submission_status_date")) for submission in approved) if value]
        products = item.get("products") or []
        rows.append({
            "application_number": item.get("application_number"),
            "drug_id": drug_id,
            "sponsor_name": item.get("sponsor_name"),
            "product_name": products[0].get("brand_name") if products else None,
            "status_date": min(dates) if dates else None,
            "source_url": f"https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo={''.join(filter(str.isdigit, item.get('application_number', '')))}",
        })
    return rows
