import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { catalog, type Catalogue } from '../data/catalog'
import { biomarkers } from '../data/discovery'
import { afterEach, vi } from 'vitest'
import { readTempusPdf } from '../report/readPdf'

vi.mock('../report/readPdf', () => ({ readTempusPdf: vi.fn() }))

const source = JSON.parse(JSON.stringify(catalog)) as Catalogue
source.includesRestrictedData = true
source.cells.filter((cell) => cell.tumourSlug === 'nsclc' && cell.iso3 === 'IND').forEach((cell) => Object.assign(cell, {
  incidencePoint: 112659, mortalityPoint: 98687, fiveYearPrevalence: 153469,
  incidenceYear: 2024, incidenceScope: 'Both sexes, all ages',
  trialQueryUrl: 'https://clinicaltrials.gov/api/v2/studies?query.cond=Non-small+cell+lung+cancer&query.locn=India&filter.overallStatus=RECRUITING&countTotal=true',
}))
afterEach(() => vi.restoreAllMocks())

describe('discovery-first workspace', () => {
  it('answers a cancer and biomarker selection before showing atlas detail', async () => {
    const user = userEvent.setup()
    render(<App initialCatalog={source} />)

    expect(screen.getByRole('heading', { name: /Explore Treatments/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /FDA-approved drug matches/i })).toBeInTheDocument()
    expect(screen.getByText('Osimertinib + platinum chemotherapy')).toBeInTheDocument()
    expect(screen.getByText(/Not yet measurable/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Cancer type'), 'ovarian')
    expect(screen.getByLabelText('Biomarker')).toHaveValue('ovarian_brca')
    await user.selectOptions(screen.getByLabelText('Biomarker'), 'ovarian_pik3ca')
    expect(screen.getByText(/No FDA-approved match has been indexed for this pair yet/i)).toBeInTheDocument()
    expect(screen.getByText(String(biomarkers.length))).toBeInTheDocument()
    expect(screen.getByText('cancer–biomarker pairs cataloged')).toBeInTheDocument()
  })

  it('explains country burden without treating it as a treatment-gap count', async () => {
    const user = userEvent.setup()
    render(<App initialCatalog={source} />)
    const burden = screen.getByRole('region', { name: 'Country cancer burden' })
    expect(within(burden).getByText('112,659')).toBeInTheDocument()
    expect(within(burden).getByText('98,687')).toBeInTheDocument()
    expect(within(burden).getByText('153,469')).toBeInTheDocument()
    expect(within(burden).getByText(/diagnosed in the preceding five years/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Explore the evidence atlas' }))
    expect(screen.getByRole('heading', { name: 'Unmatched Patient Atlas' })).toBeInTheDocument()
  })

  it('opens the FDA indication evidence and cited study', async () => {
    const user = userEvent.setup()
    render(<App initialCatalog={source} />)
    await user.selectOptions(screen.getByLabelText('Biomarker'), 'nsclc_ros1')
    expect(screen.getByText('Repotrectinib')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Why this match' }))
    const modal = screen.getByRole('dialog', { name: 'FDA match evidence' })
    expect(within(modal).getByText(/Matched profile:/i)).toBeInTheDocument()
    expect(within(modal).getByText(/FDA approval notice, opening indication paragraph/i)).toBeInTheDocument()
    expect(within(modal).getByRole('link', { name: 'NCT03093116' })).toHaveAttribute('href', 'https://clinicaltrials.gov/study/NCT03093116')
  })

  it('shows ovarian platinum and taxane regimens separately from biomarker matches', async () => {
    const user = userEvent.setup()
    render(<App initialCatalog={source} />)
    await user.selectOptions(screen.getByLabelText('Cancer type'), 'ovarian')
    const section = screen.getByRole('region', { name: /Established treatment pathways/i })
    expect(within(section).getByText('Carboplatin + paclitaxel')).toBeInTheDocument()
    expect(within(section).getByText('Cisplatin + paclitaxel')).toBeInTheDocument()
    expect(within(section).getByText(/neoadjuvant combination/i)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Biomarker'), 'ovarian_fra')
    expect(screen.getByText('Mirvetuximab soravtansine')).toBeInTheDocument()
    expect(within(section).getByText('Carboplatin + paclitaxel')).toBeInTheDocument()
  })

  it('shows compact trials and opens full details on demand', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ totalCount: 357, nextPageToken: 'next', studies: [{ protocolSection: { identificationModule: { nctId: 'NCT12345678', briefTitle: 'EGFR study' }, statusModule: { overallStatus: 'RECRUITING' }, designModule: { phases: ['PHASE2'], enrollmentInfo: { count: 88 } }, descriptionModule: { briefSummary: 'Full study summary' }, eligibilityModule: { eligibilityCriteria: 'EGFR-positive adults' }, outcomesModule: { primaryOutcomes: [{ measure: 'Progression-free survival', timeFrame: '2 years' }] }, contactsLocationsModule: { locations: [{ facility: 'Example Hospital', city: 'Mumbai', country: 'India' }] }, armsInterventionsModule: { interventions: [{ name: 'Osimertinib' }] } } }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ totalCount: 357, studies: [{ protocolSection: { identificationModule: { nctId: 'NCT87654321', briefTitle: 'Next study' } } }] }) } as Response)
    render(<App initialCatalog={source} />)
    await user.click(screen.getByRole('button', { name: 'Load studies' }))
    expect(screen.getByText('357 records')).toBeInTheDocument()
    expect(screen.getByText('EGFR study')).toBeInTheDocument()
    expect(screen.getByText('1 site in India')).toBeInTheDocument()
    expect(screen.queryByText('Full study summary')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View details' }))
    expect(screen.getByRole('dialog', { name: 'Clinical study details' })).toBeInTheDocument()
    expect(screen.getByText('EGFR-positive adults')).toBeInTheDocument()
    expect(screen.getByText(/Progression-free survival/)).toBeInTheDocument()
    expect(screen.getByText(/Example Hospital, Mumbai, India/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Clinical study details' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next 10 studies' }))
    expect(screen.getByText('Next study')).toBeInTheDocument()
    expect(screen.queryByText('EGFR study')).not.toBeInTheDocument()
  })

  it('keeps the selected cancer and biomarker when returning from the atlas', async () => {
    const user = userEvent.setup()
    render(<App initialCatalog={source} />)
    await user.selectOptions(screen.getByLabelText('Cancer type'), 'ovarian')
    await user.selectOptions(screen.getByLabelText('Biomarker'), 'ovarian_pik3ca')
    await user.click(screen.getByRole('button', { name: 'Explore the evidence atlas' }))
    await user.click(screen.getByRole('button', { name: 'Discover' }))
    expect(screen.getByLabelText('Cancer type')).toHaveValue('ovarian')
    expect(screen.getByLabelText('Biomarker')).toHaveValue('ovarian_pik3ca')
  })

  it('uses biomarkers supplied by the exported catalog', async () => {
    const custom = JSON.parse(JSON.stringify(source)) as Catalogue
    custom.biomarkers.push({ id: 'ovarian_custom', tumourSlug: 'ovarian', name: 'Custom sourced marker', pathway: 'Test pathway', sourceUrl: 'https://example.org/marker' })
    const user = userEvent.setup()
    render(<App initialCatalog={custom} />)
    await user.selectOptions(screen.getByLabelText('Cancer type'), 'ovarian')
    expect(screen.getByRole('option', { name: 'Custom sourced marker' })).toBeInTheDocument()
  })

  it('reviews extracted report findings before showing source-linked drugs', async () => {
    const user = userEvent.setup()
    vi.mocked(readTempusPdf).mockResolvedValueOnce({
      format: 'Tempus xT-style summary', suggestedTumourSlug: 'nsclc',
      tumourReason: 'Inferred from lung specimen and adenocarcinoma diagnosis; confirm the primary cancer type.',
      findings: [{ gene: 'KRAS', alteration: 'p.G12C', section: 'Somatic — potentially actionable', sourceLine: 'KRAS | p.G12C' }],
      tmb: 7.4, negatives: ['EGFR'], notes: ['MSI is not inferred.'],
    })
    render(<App initialCatalog={source} />)
    await user.upload(screen.getByLabelText('Choose report PDF'), new File(['%PDF-test'], 'sample.pdf', { type: 'application/pdf' }))
    expect((await screen.findAllByText(/KRAS p.G12C/)).length).toBeGreaterThan(0)
    expect(screen.queryByText('Sotorasib')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show evidence matches' }))
    expect(screen.getAllByText('Sotorasib').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Adagrasib').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Biomarker')).toHaveValue('nsclc_kras_g12c')
  })
})
