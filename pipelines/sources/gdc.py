def normalize_projects(payload: dict) -> list[dict]:
    hits = payload.get("data", {}).get("hits") if isinstance(payload, dict) else None
    if not isinstance(hits, list):
        raise ValueError("GDC projects response omitted data.hits")
    if any(not isinstance(item, dict) or not item.get("project_id") for item in hits):
        raise ValueError("GDC project record omitted project_id")
    return [
        {
            "cohort_id": item["project_id"],
            "name": item.get("name") or item["project_id"],
            "cancer_type": "; ".join(item.get("primary_site") or []),
            "sample_count": None,
            "public": bool(item.get("released")),
            "source_url": f"https://portal.gdc.cancer.gov/projects/{item['project_id']}",
        }
        for item in hits
    ]
