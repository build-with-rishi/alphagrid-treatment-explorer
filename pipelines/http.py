from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any


USER_AGENT = "AlphaGridTreatmentExplorer/0.1 (open evidence atlas; contact: AlphaGrid Biosciences)"


def request(url: str, *, body: dict[str, Any] | None = None, attempts: int = 3) -> bytes:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=45) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def fetch_json(url: str, *, body: dict[str, Any] | None = None) -> Any:
    return json.loads(request(url, body=body))


def fetch_text(url: str) -> str:
    return request(url).decode("utf-8")
