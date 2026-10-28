from __future__ import annotations

import hashlib
import re


CODE = re.compile(r"^(.*?)\s*\(([^()]+)\)$")


def normalize_tumour_types(payload: str) -> list[dict]:
    if not payload.startswith("level_1\t"):
        raise ValueError("OncoTree response is not the expected TSV schema")
    rows = []
    for index, line in enumerate(payload.splitlines()[1:], start=1):
        coded_segments = [match for value in line.split("\t") if (match := CODE.match(value.strip()))]
        if not coded_segments:
            raise ValueError(f"OncoTree row {index} has no coded hierarchy segment")
        match = coded_segments[-1]
        rows.append({
            "node_id": hashlib.sha1(f"{index}:{line}".encode()).hexdigest(),
            "oncotree_code": match.group(2),
            "name": match.group(1).strip(),
            "main_type": None,
            "hierarchy_level": len(coded_segments),
        })
    if not rows:
        raise ValueError("OncoTree response contained no tumour rows")
    return rows
