import rawCatalog from '../../public/data/catalog.json'
import type { Biomarker, FdaMatch, StandardRegimen } from './discovery'

export type Iso3 = 'IND' | 'USA' | 'GBR' | 'BRA' | 'NGA'
export type Cell = {
  oncotreeCode: string
  tumourSlug: string
  tumourName: string
  globocanSite: string
  directIncidenceSite: boolean
  iso3: Iso3
  countryName: string
  regulator: string
  biomarkerId: string
  biomarkerName: string
  gene: string
  alterationClass: string
  drugId: string
  drugName: string
  indicationEvidenceStatus: string
  indicationEvidenceUrl: string
  incidencePoint: number | null
  incidenceLow: number | null
  incidenceHigh: number | null
  incidenceYear: number | null
  incidenceConfidence: string | null
  incidenceNote: string | null
  incidenceSourcePageUrl: string | null
  incidenceSourcePdfUrl: string | null
  incidenceSourceLocator: string | null
  incidenceDatasetVersion: string | null
  incidenceScope: string | null
  incidenceRank: number | null
  incidencePercent: number | null
  mortalityPoint: number | null
  fiveYearPrevalence: number | null
  recruitingTrials: number | null
  trialQueryUrl: string | null
  testingRate: number | null
  accessRate: number | null
  treatedRate: number | null
}

export type SourceRecord = {
  sourceId: string
  title: string
  url: string
  accessClass: string
  licence: string
  redistributionAllowed: boolean
  feedsStage: string
  notes: string
  status: string
  recordCount: number
  retrievedOn: string | null
  error: string | null
}

export type Catalogue = {
  generatedAt: string
  database: string
  includesRestrictedData: boolean
  counts: Record<string, number>
  sources: SourceRecord[]
  tumours: Array<{ oncotreeCode: string; slug: string; name: string; globocanSite: string; directIncidenceSite: boolean }>
  countries: Array<{ iso3: Iso3; name: string; regulator: string }>
  discoveryReviewedOn: string | null
  biomarkers: Biomarker[]
  fdaMatches: FdaMatch[]
  standardRegimens: StandardRegimen[]
  cells: Cell[]
  cohorts: Array<{ cohortId: string; sourceId: string; name: string; cancerType: string | null; sampleCount: number | null; public: boolean; sourceUrl: string }>
  civicGenes: Array<{ gene: string; variantCount: number }>
  civicVariants: Array<{ civicVariantId: number; gene: string; variantName: string; sourceUrl: string }>
  regulatoryApplications: Array<{ applicationNumber: string; drugId: string; regimenId: string | null; regulator: string; sponsorName: string | null; productName: string | null; statusDate: string | null; sourceUrl: string }>
  countryIndicators: Array<{ iso3: Iso3; indicatorCode: string; year: number; value: number }>
  countryCancerBurden: Array<{
    iso3: Iso3
    cancerSite: string
    year: number
    newCases: number | null
    incidenceRank: number | null
    incidencePercent: number | null
    incidenceCumulativeRisk: number | null
    deaths: number | null
    mortalityRank: number | null
    mortalityPercent: number | null
    mortalityCumulativeRisk: number | null
    fiveYearPrevalence: number | null
    prevalencePer100k: number | null
    datasetVersion: string
    scope: string
    sourcePageUrl: string
    sourcePdfUrl: string
    sourceLocator: string
  }>
}

export const catalog = rawCatalog as Catalogue

export function getCell(tumourSlug: string, iso3: Iso3, source: Catalogue = catalog, biomarkerId?: string): Cell {
  const cell = source.cells.find((item) => item.tumourSlug === tumourSlug && item.iso3 === iso3 && (!biomarkerId || item.biomarkerId === biomarkerId))
  if (!cell) throw new Error(`Unknown evidence cell: ${tumourSlug}/${iso3}`)
  return cell
}

export function getBiomarkerOptions(tumourSlug: string, source: Catalogue = catalog) {
  const unique = new Map<string, Pick<Cell, 'biomarkerId' | 'biomarkerName' | 'gene' | 'alterationClass'>>()
  source.cells.filter((item) => item.tumourSlug === tumourSlug).forEach((item) => {
    if (!unique.has(item.biomarkerId)) unique.set(item.biomarkerId, {
      biomarkerId: item.biomarkerId,
      biomarkerName: item.biomarkerName,
      gene: item.gene,
      alterationClass: item.alterationClass,
    })
  })
  return [...unique.values()]
}

export function getCountryCells(iso3: Iso3, source: Catalogue = catalog): Cell[] {
  return source.cells.filter((item) => item.iso3 === iso3)
}

const cohortTerms: Record<string, string[]> = {
  nsclc: ['lung', 'luad', 'lusc', 'nsclc'], breast: ['breast', 'brca'], colorectal: ['colon', 'rectal', 'colorectal', 'coad', 'read'],
  prostate: ['prostate', 'prad'], gastric: ['gastric', 'stomach', 'stad'], ovarian: ['ovarian', 'ovary'],
  pancreatic: ['pancrea', 'paad'], melanoma: ['melanoma', 'skin'], thyroid: ['thyroid', 'thca'], cholangiocarcinoma: ['cholangi', 'bile duct', 'chol'],
}

export function getRelevantCohorts(tumourSlug: string, source: Catalogue = catalog) {
  const terms = cohortTerms[tumourSlug] ?? []
  return source.cohorts.filter((cohort) => {
    const haystack = `${cohort.name} ${cohort.cancerType ?? ''}`.toLowerCase()
    return terms.some((term) => haystack.includes(term))
  })
}

export function getCivicVariantCount(gene: string, source: Catalogue = catalog): number {
  const symbols = gene === 'BRCA1/2' ? ['BRCA1', 'BRCA2'] : gene.split('/')
  return source.civicGenes.filter((item) => symbols.includes(item.gene)).reduce((sum, item) => sum + item.variantCount, 0)
}

export function getCivicVariants(gene: string, source: Catalogue = catalog) {
  const symbols = gene === 'BRCA1/2' ? ['BRCA1', 'BRCA2'] : gene.split('/')
  return (source.civicVariants ?? []).filter((item) => symbols.includes(item.gene))
}

export function getApplications(drugId: string, source: Catalogue = catalog) {
  return source.regulatoryApplications.filter((item) => item.drugId === drugId || item.regimenId === drugId)
}
