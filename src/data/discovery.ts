import curated from '../../data/curated/discovery.json'

export type Biomarker = {
  id: string
  tumourSlug: string
  name: string
  pathway: string
  sourceUrl: string
}

export type FdaMatch = {
  tumourSlug: string
  biomarkerId: string
  drugName: string
  indication: string
  sourceUrl: string
  sourceDate: string
  sourceLocator?: string
  approvalDate?: string
  studyIds?: string[]
}

export type StandardRegimen = {
  id: string
  tumourSlug: string
  title: string
  setting: string
  summary: string
  sourceName: string
  sourceUrl: string
  sourceLocator: string
  regulatoryNote: string
  fdaSourceUrl?: string | null
}

export const catalogReviewedOn = curated.reviewedOn
export const biomarkers: Biomarker[] = curated.biomarkers
export const fdaMatches: FdaMatch[] = curated.fdaMatches
export const standardRegimens: StandardRegimen[] = curated.standardRegimens

export const initialBiomarkerByCancer: Record<string, string> = {
  nsclc: 'nsclc_egfr_sens', breast: 'breast_her2', colorectal: 'colorectal_kras_g12c',
  prostate: 'prostate_brca', gastric: 'gastric_her2', ovarian: 'ovarian_brca',
  pancreatic: 'pancreatic_brca', melanoma: 'melanoma_braf', thyroid: 'thyroid_ret_fusion',
  cholangiocarcinoma: 'cholangiocarcinoma_fgfr2',
}

export function getCancerBiomarkers(tumourSlug: string, source: Biomarker[] = biomarkers): Biomarker[] {
  return source.filter((item) => item.tumourSlug === tumourSlug)
}

export function getFdaMatches(tumourSlug: string, biomarkerId: string, source: FdaMatch[] = fdaMatches): FdaMatch[] {
  return source.filter((item) => item.tumourSlug === tumourSlug && item.biomarkerId === biomarkerId)
}
