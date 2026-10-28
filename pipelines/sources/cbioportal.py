def normalize_studies(payload: list[dict]) -> list[dict]:
    if not isinstance(payload, list):
        raise ValueError("cBioPortal studies response must be a list")
    if any(not isinstance(item, dict) or not item.get("studyId") for item in payload):
        raise ValueError("cBioPortal study record omitted studyId")
    return [
        {
            "cohort_id": item["studyId"],
            "name": item.get("name") or item["studyId"],
            "cancer_type": item.get("cancerTypeId"),
            "sample_count": item.get("allSampleCount"),
            "public": bool(item.get("publicStudy", True)),
            "source_url": f"https://www.cbioportal.org/study/summary?id={item['studyId']}",
        }
        for item in payload
    ]
