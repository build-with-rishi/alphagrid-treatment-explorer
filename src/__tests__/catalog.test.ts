import { catalog, getBiomarkerOptions, getCell, getCountryCells, type Catalogue } from '../data/catalog'

describe('generated evidence catalogue', () => {
  it('matches the DuckDB export coverage', () => {
    expect(catalog.counts.tumours).toBe(10)
    expect(catalog.counts.countries).toBe(5)
    expect(catalog.counts.incidenceRows).toBe(50)
    expect(catalog.counts.cohorts).toBe(644)
    expect(catalog.cells).toHaveLength(50)
  })

  it('keeps unavailable funnel inputs null', () => {
    const cell = getCell('nsclc', 'IND')
    expect(cell.incidencePoint).toBeNull()
    expect(cell.testingRate).toBeNull()
    expect(cell.accessRate).toBeNull()
    expect(cell.treatedRate).toBeNull()
  })

  it('provides ten tumour rows for each country', () => {
    expect(getCountryCells('NGA')).toHaveLength(10)
  })

  it('selects a biomarker-specific cell and lists unique tumour biomarkers', () => {
    const multi = JSON.parse(JSON.stringify(catalog)) as Catalogue
    const added = multi.cells
      .filter((cell) => cell.tumourSlug === 'nsclc')
      .map((cell) => ({ ...cell, biomarkerId: 'MET_EX14', biomarkerName: 'MET exon 14 skipping', gene: 'MET', drugId: 'capmatinib', drugName: 'Capmatinib' }))
    multi.cells.push(...added)

    expect(getBiomarkerOptions('nsclc', multi).map((item) => item.biomarkerId)).toEqual(['EGFR_SENS', 'MET_EX14'])
    expect(getCell('nsclc', 'IND', multi, 'MET_EX14').drugName).toBe('Capmatinib')
  })
})
