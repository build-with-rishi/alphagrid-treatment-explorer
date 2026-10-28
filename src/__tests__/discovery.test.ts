import { describe, expect, it } from 'vitest'
import { biomarkers, fdaMatches, standardRegimens, getCancerBiomarkers, getFdaMatches } from '../data/discovery'

describe('discovery catalog', () => {
  it('covers at least 40 sourced pairs across all ten cancers', () => {
    expect(biomarkers.length).toBeGreaterThanOrEqual(40)
    expect(new Set(biomarkers.map((item) => item.tumourSlug)).size).toBe(10)
    expect(biomarkers.every((item) => item.sourceUrl.startsWith('https://'))).toBe(true)
  })

  it('keeps biomarkers without an FDA match selectable', () => {
    expect(getCancerBiomarkers('ovarian').some((item) => item.id === 'ovarian_pik3ca')).toBe(true)
    expect(getFdaMatches('ovarian', 'ovarian_pik3ca')).toEqual([])
  })

  it('includes ovarian markers omitted by the first index and separate NACT evidence', () => {
    const ovarian = getCancerBiomarkers('ovarian')
    for (const id of ['ovarian_hrd', 'ovarian_fra', 'ovarian_kras_lgsoc', 'ovarian_pdl1_cps1']) {
      expect(ovarian.some((item) => item.id === id)).toBe(true)
      expect(getFdaMatches('ovarian', id).length).toBeGreaterThan(0)
    }
    expect(standardRegimens.find((item) => item.id === 'ovarian_nact_carbo_paclitaxel')?.sourceUrl).toContain('cancer.gov')
  })

  it('includes sourced markers beyond the initial forty', () => {
    expect(getCancerBiomarkers('nsclc').some((item) => item.id === 'nsclc_met_ex14')).toBe(true)
    expect(getCancerBiomarkers('breast').some((item) => item.id === 'breast_her2_low')).toBe(true)
    expect(getCancerBiomarkers('cholangiocarcinoma').some((item) => item.id === 'cholangiocarcinoma_nrg1')).toBe(true)
  })

  it('only exposes a source-backed FDA match for the exact pair', () => {
    expect(fdaMatches.every((item) => item.sourceUrl.startsWith('https://www.fda.gov/') || item.sourceUrl.startsWith('https://www.accessdata.fda.gov/'))).toBe(true)
    expect(getFdaMatches('colorectal', 'colorectal_kras_g12c').some((item) => item.drugName.includes('Sotorasib'))).toBe(true)
    expect(getFdaMatches('colorectal', 'colorectal_kras_g12c').some((item) => item.drugName.includes('Adagrasib'))).toBe(false)
    expect(getFdaMatches('ovarian', 'colorectal_kras_g12c')).toEqual([])
  })

  it('indexes established NSCLC matches and narrows BRAF to V600E', () => {
    for (const id of ['nsclc_alk', 'nsclc_ros1', 'nsclc_ret', 'nsclc_kras_g12c']) {
      expect(getFdaMatches('nsclc', id).length).toBeGreaterThan(0)
    }
    for (const id of ['nsclc_braf', 'colorectal_braf']) {
      expect(biomarkers.find((item) => item.id === id)?.name).toContain('V600E')
    }
    expect(getFdaMatches('nsclc', 'nsclc_ros1')[0].sourceLocator).toBeTruthy()
  })
})
