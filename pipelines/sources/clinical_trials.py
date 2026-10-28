def total_count(payload: dict) -> int:
    if not isinstance(payload, dict) or "totalCount" not in payload:
        raise ValueError("ClinicalTrials.gov response omitted totalCount")
    value = payload["totalCount"]
    if not isinstance(value, int) or value < 0:
        raise ValueError("ClinicalTrials.gov totalCount is invalid")
    return value
