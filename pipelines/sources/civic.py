def normalize_genes(payload: dict) -> list[dict]:
    if not isinstance(payload, dict) or payload.get("errors"):
        raise ValueError("CIViC GraphQL returned errors")
    nodes = payload.get("data", {}).get("genes", {}).get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("CIViC response omitted data.genes.nodes")
    rows = []
    for gene in nodes:
        if not isinstance(gene, dict) or not gene.get("name"):
            raise ValueError("CIViC gene record omitted name")
        variants = gene.get("variants", {}).get("nodes")
        if not isinstance(variants, list):
            raise ValueError("CIViC gene record omitted variants.nodes")
        if any(not isinstance(variant, dict) or variant.get("id") is None or not variant.get("name") for variant in variants):
            raise ValueError("CIViC variant record omitted id or name")
        for variant in variants:
            rows.append({
                "civic_variant_id": int(variant["id"]),
                "gene_symbol": gene["name"],
                "variant_name": variant["name"],
                "source_url": f"https://civicdb.org/variants/{variant['id']}/summary",
            })
    return rows
