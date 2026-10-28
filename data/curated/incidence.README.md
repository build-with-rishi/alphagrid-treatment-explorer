# Private incidence input

`incidence.csv` is intentionally git-ignored. Place an authorised GLOBOCAN development extract here before running the local data build. Required columns:

```text
oncotree_code,iso3,year,point,low,high,confidence,note
```

Without this file, the database still builds the source and metadata catalogue, but incidence remains unavailable. Do not commit or publish the extract until IARC confirms redistribution permission.
