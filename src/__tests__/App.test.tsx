import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'
import App from '../App'
import { catalog, type Catalogue } from '../data/catalog'

const localCatalog = JSON.parse(JSON.stringify(catalog)) as Catalogue
localCatalog.includesRestrictedData = true
Object.assign(localCatalog, {
  civicVariants: [{ civicVariantId: 133, gene: 'EGFR', variantName: 'Exon 19 Deletion', sourceUrl: 'https://civicdb.org/variants/133/summary' }],
})
Object.assign(localCatalog.cells.find((cell) => cell.tumourSlug === 'nsclc' && cell.iso3 === 'IND')!, {
  incidencePoint: 112659,
  incidenceLow: null,
  incidenceHigh: null,
  incidenceYear: 2024,
  incidenceDatasetVersion: 'GLOBOCAN 2024',
  incidenceScope: 'Both sexes, all ages',
  incidenceSourcePageUrl: 'https://gco.iarc.who.int/today/en/fact-sheets-populations/356/india',
  incidenceSourcePdfUrl: 'https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf',
  incidenceSourceLocator: 'Page 2 · Lung · New cases → Number',
  mortalityPoint: 98687,
  fiveYearPrevalence: 153469,
})
Object.assign(localCatalog.cells.find((cell) => cell.tumourSlug === 'breast' && cell.iso3 === 'NGA')!, { incidencePoint: 44196, incidenceLow: null, incidenceHigh: null, incidenceYear: 2024 })
Object.assign(localCatalog.cells.find((cell) => cell.tumourSlug === 'nsclc' && cell.iso3 === 'USA')!, {
  incidencePoint: 226788,
  incidenceLow: null,
  incidenceHigh: null,
  incidenceYear: 2024,
  incidenceDatasetVersion: 'GLOBOCAN 2024',
  incidenceScope: 'Both sexes, all ages',
  incidenceSourcePageUrl: 'https://gco.iarc.who.int/today/en/fact-sheets-populations/840/united-states-of-america',
  incidenceSourcePdfUrl: 'https://gco.iarc.who.int/media/globocan/factsheets/populations/840-united-states-of-america-fact-sheet.pdf',
  incidenceSourceLocator: 'Page 2 · Lung · New cases → Number',
  mortalityPoint: 129504,
  fiveYearPrevalence: 310985,
})

afterEach(() => vi.restoreAllMocks())

describe('AlphaGrid Treatment Explorer evidence workspace', () => {
  it('queries source-backed tumour and country cells', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    expect(screen.getByRole('button', { name: 'AlphaGrid Treatment Explorer home' }).querySelector('img')).toHaveAttribute('src', '/alphagrid-logo.png')
    expect(screen.getByRole('heading', { name: 'Unmatched Patient Atlas' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Evidence query wizard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Non-small cell lung cancer/i })).toBeInTheDocument()
    expect(screen.getAllByText('112,659').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Funnel readiness: 0 usable inputs, 3 supporting record sets, 4 missing inputs' })).toBeInTheDocument()
    expect(screen.getByText('with source records')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open country fact sheet' })[0]).toHaveAttribute('href', 'https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf')
    expect(screen.queryByRole('link', { name: 'CIViC source' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'cBioPortal source' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'GDC source' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'openFDA source' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Funnel input readiness' }))
    expect(screen.getByRole('link', { name: 'Inspect candidate study records' })).toHaveAttribute('href', '#cohort-heading')
    expect(screen.getByRole('link', { name: 'Inspect exact drug records' })).toHaveAttribute('href', '#records-heading')
    expect(screen.getByText('Testing rate')).toBeInTheDocument()
    expect(screen.getByText(/candidate studies indexed/i)).toBeInTheDocument()
    expect(screen.getByText(/molecular data not retrieved and frequency not computed/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Evidence records' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exon 19 Deletion' })).toHaveAttribute('href', 'https://civicdb.org/variants/133/summary')

    await user.click(screen.getByRole('button', { name: /FDA applications/i }))
    expect(screen.getByRole('link', { name: 'NDA208065' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Earliest approved submission date' })).toBeInTheDocument()
    expect(screen.getByText('Indication review required')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Tumour type'), 'breast')
    await user.selectOptions(screen.getByLabelText('Country'), 'NGA')

    expect(screen.getByRole('heading', { name: /Breast cancer/i })).toBeInTheDocument()
    expect(screen.getAllByText('44,196').length).toBeGreaterThan(0)
    expect(screen.getAllByText('HER2 amplification / overexpression').length).toBeGreaterThan(0)
  })

  it('shows intake coverage against the written MVP scope', () => {
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    expect(screen.getByRole('progressbar', { name: 'Tumour types ingested: 10 of 10' })).toHaveAttribute('value', '10')
    expect(screen.getByRole('progressbar', { name: 'Tumour–biomarker pairs cataloged: 49, baseline 40' })).toHaveAttribute('value', '40')
    expect(screen.getByRole('progressbar', { name: 'Countries ingested: 5 of 5' })).toHaveAttribute('value', '5')
  })

  it('presents a cited evidence chain without implying patient matching', () => {
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    expect(screen.getByRole('list', { name: 'Source-reported evidence chain' })).toBeInTheDocument()
    expect(screen.getByText(/does not match individual patients or infer treatment suitability/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open country fact sheet' })[0]).toHaveAttribute('href', 'https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf')
    expect(screen.getByRole('link', { name: 'Open exact trials query' })).toHaveAttribute('href', expect.stringContaining('query.cond=Non-small+cell+lung+cancer'))
    expect(screen.getByRole('link', { name: 'Open exact trials query' })).toHaveAttribute('href', expect.stringContaining('query.locn=India'))
    expect(screen.getByText('Official mechanism source not ingested')).toBeInTheDocument()
    expect(screen.getByText('Country approval and access not established')).toBeInTheDocument()
  })

  it('shows the exact GLOBOCAN extract and discloses the direct lookup logic', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    expect(screen.getByRole('heading', { name: 'GLOBOCAN source extract' })).toBeInTheDocument()
    expect(screen.getByText('GLOBOCAN 2024 · Both sexes, all ages')).toBeInTheDocument()
    expect(screen.getByText('Page 2 · Lung · New cases → Number')).toBeInTheDocument()
    expect(screen.getByText(/Parent-site lookup: India \+ Lung → New cases → Number/i)).toBeInTheDocument()
    expect(screen.getByText(/No NSCLC subtype share was applied/i)).toBeInTheDocument()
    expect(screen.getByText('98,687')).toBeInTheDocument()
    expect(screen.getByText('153,469')).toBeInTheDocument()
    expect(screen.getAllByText('No uncertainty interval reported by GLOBOCAN').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open country source page' })).toHaveAttribute('href', 'https://gco.iarc.who.int/today/en/fact-sheets-populations/356/india')

    await user.selectOptions(screen.getByLabelText('Country'), 'USA')
    expect(screen.getAllByText('226,788').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Open country fact sheet' })[0]).toHaveAttribute('href', 'https://gco.iarc.who.int/media/globocan/factsheets/populations/840-united-states-of-america-fact-sheet.pdf')
  })

  it('lets a tumour expose and select more than one biomarker', async () => {
    const user = userEvent.setup()
    const multi = JSON.parse(JSON.stringify(localCatalog)) as Catalogue
    const added = multi.cells
      .filter((cell) => cell.tumourSlug === 'nsclc')
      .map((cell) => ({ ...cell, biomarkerId: 'MET_EX14', biomarkerName: 'MET exon 14 skipping', gene: 'MET', drugId: 'capmatinib', drugName: 'Capmatinib' }))
    multi.cells.push(...added)

    render(<App initialView="atlas" initialCatalog={multi} />)
    expect(screen.getAllByRole('option', { name: /EGFR/i })).not.toHaveLength(0)
    expect(screen.getByRole('option', { name: /MET exon 14 skipping/i })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Biomarker'), 'MET_EX14')
    expect(screen.getByText('Capmatinib')).toBeInTheDocument()
    expect(screen.getByLabelText('Biomarker')).toHaveValue('MET_EX14')
  })

  it('initializes from the catalogue instead of assuming a fixed biomarker id', () => {
    const renamed = JSON.parse(JSON.stringify(localCatalog)) as Catalogue
    renamed.cells.filter((cell) => cell.tumourSlug === 'nsclc').forEach((cell) => {
      cell.biomarkerId = 'EGFR_CURRENT'
    })

    render(<App initialView="atlas" initialCatalog={renamed} />)

    expect(screen.getByLabelText('Biomarker')).toHaveValue('EGFR_CURRENT')
  })

  it('prioritizes summary statistics and keeps detailed review work progressive', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    expect(screen.queryByText(/DuckDB snapshot/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cell key/i)).not.toBeInTheDocument()
    expect(screen.queryByText('NSCLC:EGFR_SENS:IND')).not.toBeInTheDocument()

    const stats = screen.getByRole('region', { name: 'Retrieved evidence summary' })
    const chain = screen.getByRole('region', { name: 'Source-reported evidence chain' })
    expect(stats.compareDocumentPosition(chain) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByRole('img', { name: 'Patient-count funnel: 112,659 diagnosed; biomarker-positive unknown; drug-linked unknown' })).toBeInTheDocument()
    expect(screen.getByText('Biomarker-positive')).toBeInTheDocument()
    expect(screen.getByText('Drug-linked')).toBeInTheDocument()

    const readiness = screen.getByRole('button', { name: 'Funnel input readiness' })
    expect(readiness).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: 'Testing rate' })).not.toBeInTheDocument()
    await user.click(readiness)
    expect(readiness).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Testing rate' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Funnel input details' })).getAllByRole('listitem')).toHaveLength(7)

    expect(screen.queryByRole('dialog', { name: 'Evidence queue' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Needs review' }))
    expect(screen.getByRole('dialog', { name: /Evidence requirements for Non-small cell lung cancer, EGFR sensitising mutation, India/i })).toBeInTheDocument()
    expect(screen.getByText('Why the same categories appear')).toBeInTheDocument()
    expect(screen.getByText(/no accepted eligible-stage, testing, frequency, access or treated-rate inputs for any of the 50 atlas cells/i)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Evidence requirements' })).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Stage 1a · Eligible stage')).toBeInTheDocument()
    expect(screen.getAllByText('Accepted evidence').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Required record').length).toBeGreaterThan(0)
    expect(screen.getByText(/The brief's multiplier schema needs year and denominator fields before this can be accepted/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close evidence queue' }))
    expect(screen.queryByRole('dialog', { name: 'Evidence queue' })).not.toBeInTheDocument()
  })

  it('makes the review queue specific to the selected tumour biomarker and country', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    await user.selectOptions(screen.getByLabelText('Tumour type'), 'ovarian')
    await user.selectOptions(screen.getByLabelText('Country'), 'USA')
    await user.click(screen.getByRole('button', { name: 'Needs review' }))

    expect(screen.getByRole('dialog', { name: /Evidence requirements for Ovarian cancer, BRCA1\/2 alteration, United States/i })).toBeInTheDocument()
    expect(screen.getByText('United States BRCA1/2 testing rate')).toBeInTheDocument()
    expect(screen.getByText('Ovarian cancer BRCA1/2 frequency')).toBeInTheDocument()
    expect(screen.getByText('United States access to Olaparib')).toBeInTheDocument()
  })

  it('previews CIViC variants and can reveal the complete matched index', async () => {
    const user = userEvent.setup()
    const manyVariants = JSON.parse(JSON.stringify(localCatalog)) as Catalogue
    manyVariants.civicVariants = Array.from({ length: 15 }, (_, index) => ({
      civicVariantId: index + 1,
      gene: 'EGFR',
      variantName: `EGFR variant ${index + 1}`,
      sourceUrl: `https://civicdb.org/variants/${index + 1}/summary`,
    }))

    render(<App initialView="atlas" initialCatalog={manyVariants} />)
    const records = screen.getByRole('region', { name: 'Evidence records' })
    expect(within(records).getByText('Showing 12 of 15 CIViC variants')).toBeInTheDocument()
    await user.click(within(records).getByRole('button', { name: 'Show all 15' }))
    expect(within(records).getByRole('button', { name: 'Show first 12' })).toBeInTheDocument()
    expect(within(records).getAllByRole('row')).toHaveLength(16)
  })

  it('renders ClinicalTrials.gov studies as inspectable trial records with pagination', async () => {
    const user = userEvent.setup()
    const firstResponse = {
      totalCount: 6,
      studies: [{
        protocolSection: {
          identificationModule: {
            nctId: 'NCT03067181',
            briefTitle: 'Active Surveillance, Bleomycin, Etoposide, Carboplatin or Cisplatin',
          },
          statusModule: { overallStatus: 'RECRUITING' },
          sponsorCollaboratorsModule: { leadSponsor: { name: "Children's Oncology Group", class: 'NETWORK' } },
          descriptionModule: { briefSummary: 'A phase 3 treatment study.' },
          conditionsModule: { conditions: ['Germ Cell Tumor'], keywords: ['miRNA'] },
          designModule: { studyType: 'INTERVENTIONAL', phases: ['PHASE3'], enrollmentInfo: { count: 1780, type: 'ESTIMATED' } },
          armsInterventionsModule: { interventions: [{ type: 'DRUG', name: 'Carboplatin' }] },
          outcomesModule: { primaryOutcomes: [{ measure: 'Overall survival', timeFrame: 'Two years' }] },
          eligibilityModule: { eligibilityCriteria: 'Inclusion Criteria: newly diagnosed disease', sex: 'ALL', minimumAge: '1 Year' },
          contactsLocationsModule: { locations: [{ facility: 'Tata Memorial Hospital', city: 'Mumbai', country: 'India', status: 'RECRUITING' }] },
        },
      }],
      nextPageToken: 'ZVNj7o2Elu8o3lpzTIj75q2tmpOQJJxsY_Cj2PEW',
    }
    const secondResponse = {
      totalCount: 6,
      studies: [{ protocolSection: { identificationModule: { nctId: 'NCT09999999', briefTitle: 'Second returned trial' }, statusModule: { overallStatus: 'RECRUITING' } } }],
    }
    const expectedUrlObject = new URL(localCatalog.cells.find((cell) => cell.tumourSlug === 'nsclc' && cell.iso3 === 'IND')!.trialQueryUrl!)
    expectedUrlObject.searchParams.set('pageSize', '10')
    const expectedUrl = expectedUrlObject.toString()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => firstResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => secondResponse } as Response)

    render(<App initialView="atlas" initialCatalog={localCatalog} />)
    const trials = screen.getByRole('region', { name: 'Clinical trials found' })

    expect(within(trials).getByText(/uses tumour condition text, selected country and recruiting status/i)).toBeInTheDocument()
    expect(within(trials).getByRole('link', { name: 'Open exact API query' })).toHaveAttribute('href', expectedUrl)
    await user.click(within(trials).getByRole('button', { name: 'Load trial records' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expectedUrl, { headers: { Accept: 'application/json' } }))
    expect(within(trials).getByText('Showing 1 of 6 matching records')).toBeInTheDocument()
    expect(within(trials).getByRole('heading', { name: 'Active Surveillance, Bleomycin, Etoposide, Carboplatin or Cisplatin' })).toBeInTheDocument()
    expect(within(trials).getByRole('link', { name: 'NCT03067181' })).toHaveAttribute('href', 'https://clinicaltrials.gov/study/NCT03067181')
    expect(within(trials).getByText("Children's Oncology Group")).toBeInTheDocument()
    expect(within(trials).getByText('1,780 estimated')).toBeInTheDocument()
    expect(within(trials).getByText('Tata Memorial Hospital')).toBeInTheDocument()
    expect(within(trials).getByText('Selected biomarker not identified in this record')).toBeInTheDocument()
    expect(within(trials).queryByLabelText('ClinicalTrials.gov JSON response')).not.toBeInTheDocument()

    await user.click(within(trials).getByRole('button', { name: 'Load next page' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toEqual(expect.stringContaining('pageToken=ZVNj7o2Elu8o3lpzTIj75q2tmpOQJJxsY_Cj2PEW'))
    expect(within(trials).getByRole('heading', { name: 'Second returned trial' })).toBeInTheDocument()
    expect(within(trials).getByText('Showing 2 of 6 matching records')).toBeInTheDocument()
  })

  it('explains the candidate cohort preview and can reveal every matched study', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    const registry = screen.getByRole('region', { name: 'Related cohort registry' })
    expect(within(registry).getByText('Showing 8 of 69 candidate studies')).toBeInTheDocument()
    const showAll = within(registry).getByRole('button', { name: 'Show all 69' })
    await user.click(showAll)
    expect(within(registry).getByRole('button', { name: 'Show first 8' })).toBeInTheDocument()
    expect(within(registry).getAllByRole('row')).toHaveLength(70)
  })

  it('keeps the data export in the source registry rather than the query workspace', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={localCatalog} />)

    expect(screen.queryByRole('link', { name: /Download local JSON/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Source registry' }))
    expect(screen.getByRole('link', { name: 'Download source index' })).toHaveAttribute('href', '/data/catalog.local.json')
  })

  it('keeps the workspace usable with a catalogue from before record export', () => {
    const legacyCatalog = JSON.parse(JSON.stringify(catalog)) as Catalogue
    delete (legacyCatalog as Partial<Catalogue>).civicVariants

    render(<App initialView="atlas" initialCatalog={legacyCatalog} />)

    expect(screen.getByRole('heading', { name: 'Evidence records' })).toBeInTheDocument()
    expect(screen.getByText('No CIViC variant metadata retrieved for this gene.')).toBeInTheDocument()
  })

  it('counts FDA-only drug metadata as partial evidence', async () => {
    const user = userEvent.setup()
    const fdaOnlyCatalog = JSON.parse(JSON.stringify(localCatalog)) as Catalogue
    fdaOnlyCatalog.civicGenes = fdaOnlyCatalog.civicGenes.filter((item) => item.gene !== 'EGFR')
    fdaOnlyCatalog.civicVariants = fdaOnlyCatalog.civicVariants.filter((item) => item.gene !== 'EGFR')

    render(<App initialView="atlas" initialCatalog={fdaOnlyCatalog} />)

    expect(screen.getByRole('img', { name: 'Funnel readiness: 0 usable inputs, 3 supporting record sets, 4 missing inputs' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Funnel input readiness' }))
    expect(screen.getByRole('link', { name: 'Inspect exact drug records' })).toBeInTheDocument()
  })

  it('cites only repositories that contributed retrieved metadata', async () => {
    const user = userEvent.setup()
    const singleCohortSourceCatalog = JSON.parse(JSON.stringify(localCatalog)) as Catalogue
    singleCohortSourceCatalog.cohorts = singleCohortSourceCatalog.cohorts.filter((item) => item.sourceId !== 'gdc')
    Object.assign(singleCohortSourceCatalog.sources.find((item) => item.sourceId === 'gdc')!, { status: 'failed', recordCount: 0 })
    Object.assign(singleCohortSourceCatalog.sources.find((item) => item.sourceId === 'globocan')!, { status: 'not_fetched', recordCount: 0 })
    singleCohortSourceCatalog.cells.forEach((cell) => {
      cell.incidenceSourcePageUrl = null
      cell.incidenceSourcePdfUrl = null
    })

    render(<App initialView="atlas" initialCatalog={singleCohortSourceCatalog} />)

    await user.click(screen.getByRole('button', { name: 'Funnel input readiness' }))
    expect(screen.getByRole('link', { name: 'Inspect candidate study records' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'GDC source' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open country fact sheet' })).not.toBeInTheDocument()
  })

  it('explains source acquisition status and what each repository contributes', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={catalog} />)

    await user.click(screen.getByRole('button', { name: 'Source registry' }))
    expect(screen.getByRole('heading', { name: 'Source registry and acquisition status' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Source acquisition overview' })).toBeInTheDocument()
    expect(screen.getByText('8 retrieved or curated')).toBeInTheDocument()
    expect(screen.getByText('6 not yet ingested')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OncoTree' })).toBeInTheDocument()
    expect(screen.getByText('897 records')).toBeInTheDocument()
    expect(screen.getByText(/Account[- ]Gated/i)).toBeInTheDocument()
    expect(screen.getAllByText(/credentials, licence, manual download, or curation required/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: 'Role in the atlas' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'What we have' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Next action' })).toBeInTheDocument()
  })

  it('visualizes the open-source information architecture and calculation gaps', async () => {
    const user = userEvent.setup()
    render(<App initialView="atlas" initialCatalog={catalog} />)

    expect(screen.queryByText(/Project spark/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Find the gap between/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Data model' }))
    expect(screen.getByRole('heading', { name: 'How AlphaGrid Treatment Explorer turns sources into an atlas' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /information architecture from upstream sources through duckdb to funnel inputs and public outputs/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upstream evidence' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Normalized in DuckDB' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Funnel inputs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open outputs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How one atlas cell is calculated' })).toBeInTheDocument()
    expect(screen.getByText('Not calculable yet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ways to close the gaps' })).toBeInTheDocument()
    expect(screen.getByText(/source URL, denominator, geography, year and point–low–high values/i)).toBeInTheDocument()
    expect(screen.getByText('data/alphagrid.duckdb')).toBeInTheDocument()
    expect(screen.queryByLabelText(/formula/i)).not.toBeInTheDocument()
  })
})
