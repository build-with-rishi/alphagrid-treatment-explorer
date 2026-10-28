import { describe, expect, it } from 'vitest'
import { biomarkers } from '../data/discovery'
import { matchFindingToCatalog, parseTempusSummary } from '../report/parseTempus'

const sampleLines = [
  'Diagnosis | Accession No.', 'Lung Sample', 'Adenocarcinoma | Lung 22024', 'Patient 22024',
  'Somatic - Potentially Actionable | Variant Allele Fraction',
  'KRAS | p.G12C | Missense variant (exon 2) - GOF | 23.8%',
  'Somatic - Biologically Relevant', 'STK11 | p.R331fs | Frameshift - LOF | 15.7%',
  'Germline - Pathogenic / Likely Pathogenic',
  'No germline pathogenic variants were found in the limited set of genes on which we report.',
  'Pertinent Negatives', 'No pathogenic variants found in:', 'EGFR | BRAF | ALK | ROS1 | RET | MET',
  'I M M U N O T H E R A P Y M A R K E R S',
  'Tumor Mutational Burden | Microsatellite Instability Status',
  '7.4 m/MB | 76th percentile | Stable | Equivocal | High',
  'FDA-APPROVED THERAPIES, CURRENT DIAGNOSIS', 'KRAS G12C | Sotorasib',
]

describe('Tempus summary extraction', () => {
  it('uses only the positive actionable section for a variant match', () => {
    const result = parseTempusSummary(sampleLines)
    expect(result.suggestedTumourSlug).toBe('nsclc')
    expect(result.findings).toEqual([expect.objectContaining({ gene: 'KRAS', alteration: 'p.G12C' })])
    expect(result.tmb).toBe(7.4)
    expect(result.negatives).toContain('EGFR')
    expect(matchFindingToCatalog(result.findings[0], 'nsclc', biomarkers).map((item) => item.id)).toEqual(['nsclc_kras_g12c'])
    expect(result.notes.join(' ')).toMatch(/MSI is not inferred/)
  })

  it('does not map a different KRAS variant or a gene-only finding to G12C', () => {
    const result = parseTempusSummary(sampleLines.map((line) => line.replace('p.G12C', 'p.G12D')))
    expect(matchFindingToCatalog(result.findings[0], 'nsclc', biomarkers)).toEqual([])
    expect(matchFindingToCatalog({ ...result.findings[0], gene: 'EGFR', alteration: 'p.R123H' }, 'nsclc', biomarkers)).toEqual([])
  })
})
