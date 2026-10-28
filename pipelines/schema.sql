CREATE TABLE source (
  source_id VARCHAR PRIMARY KEY,
  title VARCHAR NOT NULL,
  url VARCHAR NOT NULL,
  access_class VARCHAR NOT NULL,
  licence VARCHAR,
  redistribution_allowed BOOLEAN NOT NULL,
  feeds_stage VARCHAR,
  notes VARCHAR
);

CREATE TABLE source_snapshot (
  snapshot_id VARCHAR PRIMARY KEY,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  retrieved_on DATE NOT NULL,
  status VARCHAR NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  raw_path VARCHAR,
  error VARCHAR
);

CREATE TABLE country (
  iso3 VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  regulator VARCHAR NOT NULL
);

CREATE TABLE tumour (
  oncotree_code VARCHAR PRIMARY KEY,
  slug VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  globocan_site VARCHAR NOT NULL,
  globocan_site_code INTEGER NOT NULL,
  direct_incidence_site BOOLEAN NOT NULL,
  source_id VARCHAR NOT NULL REFERENCES source(source_id)
);

CREATE TABLE oncotree_node (
  node_id VARCHAR PRIMARY KEY,
  oncotree_code VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  main_type VARCHAR,
  hierarchy_level INTEGER NOT NULL,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id)
);

CREATE TABLE biomarker (
  biomarker_id VARCHAR PRIMARY KEY,
  hgnc_symbol VARCHAR NOT NULL,
  alteration_class VARCHAR NOT NULL,
  display_name VARCHAR NOT NULL
);

CREATE TABLE discovery_biomarker (
  id VARCHAR PRIMARY KEY,
  tumour_slug VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  pathway VARCHAR NOT NULL,
  source_url VARCHAR NOT NULL,
  reviewed_on DATE NOT NULL
);

CREATE TABLE fda_match (
  biomarker_id VARCHAR NOT NULL REFERENCES discovery_biomarker(id),
  tumour_slug VARCHAR NOT NULL,
  drug_name VARCHAR NOT NULL,
  indication VARCHAR NOT NULL,
  source_url VARCHAR NOT NULL,
  source_date VARCHAR NOT NULL,
  source_locator VARCHAR,
  approval_date VARCHAR,
  study_ids VARCHAR[],
  reviewed_on DATE NOT NULL,
  PRIMARY KEY (biomarker_id, drug_name)
);

CREATE TABLE standard_regimen (
  id VARCHAR PRIMARY KEY,
  tumour_slug VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  setting VARCHAR NOT NULL,
  summary VARCHAR NOT NULL,
  source_name VARCHAR NOT NULL,
  source_url VARCHAR NOT NULL,
  source_locator VARCHAR NOT NULL,
  regulatory_note VARCHAR NOT NULL,
  fda_source_url VARCHAR,
  reviewed_on DATE NOT NULL
);

CREATE TABLE drug (
  drug_id VARCHAR PRIMARY KEY,
  inn_name VARCHAR NOT NULL
);

CREATE TABLE regimen_component (
  regimen_id VARCHAR NOT NULL REFERENCES drug(drug_id),
  component_drug_id VARCHAR NOT NULL REFERENCES drug(drug_id),
  PRIMARY KEY (regimen_id, component_drug_id)
);

CREATE TABLE indication (
  indication_id VARCHAR PRIMARY KEY,
  oncotree_code VARCHAR NOT NULL REFERENCES tumour(oncotree_code),
  biomarker_id VARCHAR NOT NULL REFERENCES biomarker(biomarker_id),
  drug_id VARCHAR NOT NULL REFERENCES drug(drug_id),
  evidence_source_id VARCHAR NOT NULL REFERENCES source(source_id),
  evidence_status VARCHAR NOT NULL,
  evidence_url VARCHAR,
  ancestry_note VARCHAR
);

CREATE TABLE incidence (
  oncotree_code VARCHAR NOT NULL REFERENCES tumour(oncotree_code),
  iso3 VARCHAR NOT NULL REFERENCES country(iso3),
  year INTEGER NOT NULL,
  point INTEGER NOT NULL,
  low INTEGER,
  high INTEGER,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  confidence VARCHAR NOT NULL,
  note VARCHAR,
  source_page_url VARCHAR,
  source_pdf_url VARCHAR,
  source_locator VARCHAR,
  dataset_version VARCHAR,
  scope VARCHAR,
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id),
  PRIMARY KEY (oncotree_code, iso3, year)
);

CREATE TABLE country_cancer_burden (
  iso3 VARCHAR NOT NULL REFERENCES country(iso3),
  cancer_site VARCHAR NOT NULL,
  year INTEGER NOT NULL,
  new_cases INTEGER,
  incidence_rank INTEGER,
  incidence_percent DOUBLE,
  incidence_cumulative_risk DOUBLE,
  deaths INTEGER,
  mortality_rank INTEGER,
  mortality_percent DOUBLE,
  mortality_cumulative_risk DOUBLE,
  five_year_prevalence INTEGER,
  prevalence_per_100k DOUBLE,
  dataset_version VARCHAR NOT NULL,
  scope VARCHAR NOT NULL,
  source_page_url VARCHAR NOT NULL,
  source_pdf_url VARCHAR NOT NULL,
  source_locator VARCHAR NOT NULL,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id),
  PRIMARY KEY (iso3, cancer_site, year)
);

CREATE TABLE multiplier (
  stage VARCHAR NOT NULL,
  oncotree_code VARCHAR NOT NULL REFERENCES tumour(oncotree_code),
  biomarker_id VARCHAR,
  iso3 VARCHAR,
  point DOUBLE,
  low DOUBLE,
  high DOUBLE,
  confidence VARCHAR NOT NULL,
  ancestry_note VARCHAR,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  PRIMARY KEY (stage, oncotree_code, biomarker_id, iso3)
);

CREATE TABLE cohort (
  cohort_id VARCHAR PRIMARY KEY,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  name VARCHAR NOT NULL,
  cancer_type VARCHAR,
  sample_count INTEGER,
  public BOOLEAN,
  source_url VARCHAR,
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id)
);

CREATE TABLE civic_variant (
  civic_variant_id INTEGER PRIMARY KEY,
  gene_symbol VARCHAR NOT NULL,
  variant_name VARCHAR NOT NULL,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  source_url VARCHAR NOT NULL,
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id)
);

CREATE TABLE regulatory_application (
  application_number VARCHAR NOT NULL,
  drug_id VARCHAR NOT NULL REFERENCES drug(drug_id),
  regimen_id VARCHAR REFERENCES drug(drug_id),
  regulator VARCHAR NOT NULL,
  sponsor_name VARCHAR,
  product_name VARCHAR,
  status_date DATE,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  source_url VARCHAR,
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id),
  PRIMARY KEY (application_number, drug_id, regulator)
);

CREATE TABLE trial_availability (
  oncotree_code VARCHAR NOT NULL REFERENCES tumour(oncotree_code),
  iso3 VARCHAR NOT NULL REFERENCES country(iso3),
  recruiting_trials INTEGER,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  retrieved_on DATE NOT NULL,
  query_url VARCHAR NOT NULL,
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id),
  PRIMARY KEY (oncotree_code, iso3)
);

CREATE TABLE country_indicator (
  iso3 VARCHAR NOT NULL REFERENCES country(iso3),
  indicator_code VARCHAR NOT NULL,
  year INTEGER NOT NULL,
  value DOUBLE,
  source_id VARCHAR NOT NULL REFERENCES source(source_id),
  snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(snapshot_id),
  PRIMARY KEY (iso3, indicator_code, year)
);
