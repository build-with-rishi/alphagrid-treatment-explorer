def normalize_indicator(payload: list, indicator_code: str) -> list[dict]:
    if len(payload) < 2 or not isinstance(payload[1], list):
        raise ValueError("World Bank response omitted indicator rows")
    rows = []
    for item in payload[1]:
        if item.get("value") is None:
            continue
        rows.append({
            "iso3": item["countryiso3code"],
            "indicator_code": indicator_code,
            "year": int(item["date"]),
            "value": float(item["value"]),
        })
    return rows
