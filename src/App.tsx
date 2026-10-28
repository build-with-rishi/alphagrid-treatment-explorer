import { useEffect, useMemo, useState } from 'react'
import { catalog, getApplications, getBiomarkerOptions, getCell, getCivicVariantCount, getCivicVariants, getRelevantCohorts, type Catalogue, type Cell, type Iso3 } from './data/catalog'
import Discovery, { type DiscoverySelection } from './Discovery'

type View = 'workspace' | 'atlas' | 'sources' | 'model'

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const format = (value: number | null) => value == null ? 'Not available' : integer.format(value)
const titleCase = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase())

function Header({ view, onView }: { view: View; onView: (view: View) => void }) {
  const items: Array<[View, string]> = [['workspace', 'Discover'], ['atlas', 'Evidence atlas'], ['sources', 'Source registry'], ['model', 'Data model']]
  return (
    <header className="app-header">
      <button className="identity" onClick={() => onView('workspace')} aria-label="AlphaGrid Treatment Explorer home"><img className="identity-logo" src="/alphagrid-logo.png" alt="" /><span className="identity-names"><strong>AlphaGrid</strong><i /><small>Treatment Explorer</small></span></button>
      <nav aria-label="Primary navigation">
        {items.map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onView(id)}>{label}</button>)}
      </nav>
    </header>
  )
}

function DataState({ state }: { state: 'available' | 'partial' | 'missing' }) {
  return <span className={`data-state data-state--${state}`}><i />{state === 'available' ? 'Usable input' : state === 'partial' ? 'Supporting records' : 'Missing input'}</span>
}

function IntakeCoverage({ data }: { data: Catalogue }) {
  const coverage = [
    { label: 'Tumour types', current: data.tumours.length, target: 10 },
    { label: 'Tumour–biomarker pairs', current: data.biomarkers.length, target: 40 },
    { label: 'Countries', current: data.countries.length, target: 5 },
  ]

  return (
    <section className="intake-coverage" aria-label="MVP intake coverage">
      <div className="intake-heading"><strong>MVP intake coverage</strong><span>Retrieved / planned</span></div>
      {coverage.map((item) => (
        <div className="intake-row" key={item.label}>
          <div><span>{item.label}</span><strong>{item.current}<small> / {item.target}{item.label === 'Tumour–biomarker pairs' ? ' baseline' : ''}</small></strong></div>
          <progress aria-label={item.label === 'Tumour–biomarker pairs' ? `${item.label} cataloged: ${item.current}, baseline ${item.target}` : `${item.label} ingested: ${item.current} of ${item.target}`} value={Math.min(item.current, item.target)} max={item.target} />
        </div>
      ))}
    </section>
  )
}

function EvidenceMatrix({ cell, cohorts, civicCount, applicationCount, data }: { cell: Cell; cohorts: Catalogue['cohorts']; civicCount: number; applicationCount: number; data: Catalogue }) {
  const [open, setOpen] = useState(false)
  const cohortCount = cohorts.length
  const sourceWasRetrieved = (sourceId: string) => ['success', 'curated'].includes(data.sources.find((item) => item.sourceId === sourceId)?.status ?? '')
  const drugEvidenceState = civicCount > 0 || applicationCount > 0 ? 'partial' : 'missing'
  const incidenceState = cell.incidencePoint == null ? 'missing' : cell.directIncidenceSite ? 'available' : 'partial'
  const incidenceValue = cell.incidencePoint == null ? 'Not available in public export' : `${cell.globocanSite} site: ${format(cell.incidencePoint)}`
  const rows = [
    { label: 'Diagnosed cases', value: incidenceValue, note: cell.directIncidenceSite ? `GLOBOCAN ${cell.incidenceYear} site estimate` : `${cell.incidenceNote}; tumour subtype count is not established`, state: incidenceState, links: sourceWasRetrieved('globocan') && cell.incidenceSourcePdfUrl ? [[cell.incidenceSourcePdfUrl, 'Open country fact sheet']] : [] },
    { label: 'Eligible stage share', value: 'Not available', note: 'SEER / literature row required', state: 'missing', links: [] },
    { label: 'Testing rate', value: 'Not available', note: `${cell.countryName} literature row required`, state: 'missing', links: [] },
    { label: 'Biomarker frequency', value: `${cohortCount} candidate studies indexed`, note: 'Study metadata only; molecular data not retrieved and frequency not computed', state: cohortCount ? 'partial' : 'missing', links: cohortCount ? [['#cohort-heading', 'Inspect candidate study records']] : [] },
    { label: 'Drug evidence', value: `${civicCount} gene-indexed CIViC variants · ${applicationCount} FDA component/application records`, note: `Records require tumour, biomarker and indication review; status: ${cell.indicationEvidenceStatus}`, state: drugEvidenceState, links: drugEvidenceState === 'partial' ? [['#records-heading', 'Inspect exact drug records']] : [] },
    { label: 'Country access', value: cell.iso3 === 'USA' && applicationCount ? 'US application records available' : 'Not available', note: `${cell.regulator} indication and real-world access review required`, state: cell.iso3 === 'USA' && applicationCount ? 'partial' : 'missing', links: cell.iso3 === 'USA' && applicationCount ? [['#records-heading', 'Inspect FDA application records']] : [] },
    { label: 'Patients treated', value: 'Not available', note: `${cell.countryName} real-world study required`, state: 'missing', links: [] },
  ] as Array<{ label: string; value: string; note: string; state: 'available' | 'partial' | 'missing'; links: string[][] }>
  const totals = rows.reduce((result, row) => ({ ...result, [row.state]: result[row.state] + 1 }), { available: 0, partial: 0, missing: 0 })
  const availableAngle = totals.available / rows.length * 360
  const partialAngle = availableAngle + totals.partial / rows.length * 360
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <button className="evidence-overview" type="button" aria-label="Funnel input readiness" aria-expanded={open} aria-controls="evidence-stage-details" onClick={() => setOpen((value) => !value)}>
        <div className="evidence-intro"><h3 id="evidence-heading">Funnel input readiness</h3><p>A usable input can enter the calculation. Supporting records are inspectable metadata but do not establish the required input.</p></div>
        <div className="coverage-figure">
          <div className="coverage-donut" role="img" aria-label={`Funnel readiness: ${totals.available} usable inputs, ${totals.partial} supporting record sets, ${totals.missing} missing inputs`} style={{ background: `conic-gradient(var(--green) 0deg ${availableAngle}deg, var(--amber) ${availableAngle}deg ${partialAngle}deg, #d9dce5 ${partialAngle}deg 360deg)` }}>
            <div><strong>{totals.available + totals.partial}<small>/ {rows.length}</small></strong><span>with source records</span></div>
          </div>
          <div className="coverage-legend"><span><i className="legend-available" />Usable input <strong>{totals.available}</strong></span><span><i className="legend-partial" />Supporting records <strong>{totals.partial}</strong></span><span><i className="legend-missing" />Missing input <strong>{totals.missing}</strong></span></div>
          <span className="evidence-toggle" aria-hidden="true">{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && <ol className="evidence-stage-grid" id="evidence-stage-details" aria-label="Funnel input details">
        {rows.map((row, index) => (
          <li className={`evidence-stage evidence-stage--${row.state}`} key={row.label}>
            <div className="evidence-stage-top"><span>{String(index + 1).padStart(2, '0')}</span><DataState state={row.state} /></div>
            <div className="evidence-stage-value"><h4>{row.label}</h4><strong className={row.state === 'missing' ? 'not-available' : ''}>{row.value}</strong></div>
            <p>{row.note}</p>
            <div className="stage-sources">
              {row.links.map(([url, label]) => <a key={`${url}-${label}`} href={url} {...(url.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer' })}>{label}</a>)}
              {!row.links.length && <span>No source selected</span>}
            </div>
          </li>
        ))}
      </ol>}
    </section>
  )
}

function EvidenceRecords({ cell, data }: { cell: Cell; data: Catalogue }) {
  const [recordView, setRecordView] = useState<'civic' | 'fda'>('civic')
  const [showAllVariants, setShowAllVariants] = useState(false)
  const variants = getCivicVariants(cell.gene, data)
  const applications = getApplications(cell.drugId, data)
  const visibleVariants = showAllVariants ? variants : variants.slice(0, 12)

  useEffect(() => setShowAllVariants(false), [cell.gene])

  return (
    <section className="panel records-panel" aria-labelledby="records-heading">
      <div className="panel-heading records-heading">
        <div><h3 id="records-heading">Evidence records</h3><p>Inspectable source metadata for the selected gene and drug. These records do not establish tumour frequency, indication approval, access or treatment.</p></div>
        <div className="record-switch" role="group" aria-label="Evidence record type">
          <button aria-pressed={recordView === 'civic'} onClick={() => setRecordView('civic')}>CIViC variants ({variants.length})</button>
          <button aria-pressed={recordView === 'fda'} onClick={() => setRecordView('fda')}>FDA applications ({applications.length})</button>
        </div>
      </div>
      <div className="record-context">
        <span>{recordView === 'civic' ? `${cell.gene} gene-level index` : cell.drugName}</span>
        <strong>Indication review required</strong>
      </div>
      <div className="table-scroll records-table">
        {recordView === 'civic' ? (
          <table><thead><tr><th>Variant</th><th>Gene</th><th>CIViC ID</th><th>Scope</th></tr></thead><tbody>
            {visibleVariants.map((variant) => <tr key={variant.civicVariantId}><th><a href={variant.sourceUrl} target="_blank" rel="noreferrer">{variant.variantName}</a></th><td>{variant.gene}</td><td><code>{variant.civicVariantId}</code></td><td>Gene-level metadata; tumour relevance not asserted</td></tr>)}
            {!variants.length && <tr><td colSpan={4}>No CIViC variant metadata retrieved for this gene.</td></tr>}
          </tbody></table>
        ) : (
          <table><thead><tr><th>Application</th><th>Product</th><th>Sponsor</th><th>Earliest approved submission date</th><th>Relationship</th></tr></thead><tbody>
            {applications.map((application) => <tr key={`${application.applicationNumber}-${application.drugId}`}><th><a href={application.sourceUrl} target="_blank" rel="noreferrer">{application.applicationNumber}</a></th><td>{application.productName ?? 'Not specified'}</td><td>{application.sponsorName ?? 'Not specified'}</td><td>{application.statusDate ?? 'Not specified'}</td><td>{application.regimenId === cell.drugId ? 'Regimen component record' : 'Drug component record'}</td></tr>)}
            {!applications.length && <tr><td colSpan={5}>No FDA application metadata retrieved for this drug or its regimen components.</td></tr>}
          </tbody></table>
        )}
      </div>
      {(recordView === 'civic' && variants.length > 12) && <div className="record-footnote record-footnote--actions"><span>Showing {visibleVariants.length} of {variants.length} CIViC variants</span><button type="button" onClick={() => setShowAllVariants((value) => !value)}>{showAllVariants ? 'Show first 12' : `Show all ${variants.length}`}</button></div>}
    </section>
  )
}

type TrialLocation = { facility?: string; status?: string; city?: string; state?: string; country?: string }
type ClinicalTrialStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string }
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string; type?: string }; primaryCompletionDateStruct?: { date?: string; type?: string }; completionDateStruct?: { date?: string; type?: string }; lastUpdatePostDateStruct?: { date?: string; type?: string } }
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string; class?: string } }
    descriptionModule?: { briefSummary?: string }
    conditionsModule?: { conditions?: string[]; keywords?: string[] }
    designModule?: { studyType?: string; phases?: string[]; enrollmentInfo?: { count?: number; type?: string } }
    armsInterventionsModule?: { interventions?: Array<{ type?: string; name?: string; description?: string }> }
    outcomesModule?: { primaryOutcomes?: Array<{ measure?: string; description?: string; timeFrame?: string }>; secondaryOutcomes?: Array<{ measure?: string; timeFrame?: string }> }
    eligibilityModule?: { eligibilityCriteria?: string; healthyVolunteers?: boolean; sex?: string; minimumAge?: string; maximumAge?: string; stdAges?: string[] }
    contactsLocationsModule?: { locations?: TrialLocation[] }
  }
  hasResults?: boolean
}
type ClinicalTrialsApiResponse = Record<string, unknown> & {
  totalCount?: number
  studies?: ClinicalTrialStudy[]
  nextPageToken?: string
}

const trialLabel = (value?: string) => value ? titleCase(value.replaceAll('_', ' ').toLowerCase()) : 'Not reported'
const trialPhase = (value?: string) => value ? value.replace('PHASE', 'Phase ').replace('EARLY_', 'Early ') : 'Not reported'

function TrialStudyCard({ study, cell }: { study: ClinicalTrialStudy; cell: Cell }) {
  const protocol = study.protocolSection
  const identification = protocol?.identificationModule
  const status = protocol?.statusModule
  const design = protocol?.designModule
  const sponsor = protocol?.sponsorCollaboratorsModule?.leadSponsor
  const conditions = protocol?.conditionsModule?.conditions ?? []
  const keywords = protocol?.conditionsModule?.keywords ?? []
  const interventions = protocol?.armsInterventionsModule?.interventions ?? []
  const primaryOutcomes = protocol?.outcomesModule?.primaryOutcomes ?? []
  const locations = protocol?.contactsLocationsModule?.locations ?? []
  const countryLocations = locations.filter((location) => location.country === cell.countryName)
  const enrollment = design?.enrollmentInfo
  const nctId = identification?.nctId ?? 'NCT ID not reported'
  const title = identification?.briefTitle ?? identification?.officialTitle ?? 'Trial title not reported'
  const searchableRecord = JSON.stringify({ identification, conditions, keywords, interventions, eligibility: protocol?.eligibilityModule }).toLowerCase()
  const biomarkerMentioned = [cell.gene, cell.biomarkerName].some((term) => term.length > 2 && searchableRecord.includes(term.toLowerCase()))
  const drugMentioned = searchableRecord.includes(cell.drugName.toLowerCase())

  return (
    <article className="trial-study">
      <div className="trial-study-header">
        <div className="trial-study-id"><span className={`trial-status trial-status--${status?.overallStatus === 'RECRUITING' ? 'recruiting' : 'other'}`}>{trialLabel(status?.overallStatus)}</span><a href={`https://clinicaltrials.gov/study/${nctId}`} target="_blank" rel="noreferrer">{nctId}</a></div>
        <h4>{title}</h4>
        <p>{protocol?.descriptionModule?.briefSummary ?? 'No brief summary was returned.'}</p>
      </div>

      <div className="trial-relevance" aria-label={`Selected biomarker and drug mentions for ${nctId}`}>
        <span className={biomarkerMentioned ? 'mentioned' : 'not-mentioned'}>{biomarkerMentioned ? `${cell.biomarkerName} mentioned in record` : 'Selected biomarker not identified in this record'}</span>
        <span className={drugMentioned ? 'mentioned' : 'not-mentioned'}>{drugMentioned ? `${cell.drugName} mentioned in record` : 'Selected drug not identified in this record'}</span>
      </div>

      <dl className="trial-study-facts">
        <div><dt>Phase and design</dt><dd>{(design?.phases ?? []).map(trialPhase).join(', ') || 'Phase not reported'} · {trialLabel(design?.studyType)}</dd></div>
        <div><dt>Lead sponsor</dt><dd>{sponsor?.name ?? 'Not reported'}{sponsor?.class ? <small>{trialLabel(sponsor.class)}</small> : null}</dd></div>
        <div><dt>Enrollment</dt><dd>{enrollment?.count == null ? 'Not reported' : `${integer.format(enrollment.count)} ${enrollment.type?.toLowerCase() ?? ''}`.trim()}</dd></div>
        <div><dt>Study dates</dt><dd>{status?.startDateStruct?.date ?? 'Start not reported'} → {status?.completionDateStruct?.date ?? 'Completion not reported'}</dd></div>
      </dl>

      <div className="trial-study-body">
        <div>
          <h5>Conditions</h5>
          <div className="trial-tags">{conditions.length ? conditions.map((condition) => <span key={condition}>{condition}</span>) : <span>Not reported</span>}</div>
        </div>
        <div>
          <h5>Interventions</h5>
          <div className="trial-tags">{interventions.length ? interventions.map((intervention, index) => <span key={`${intervention.name}-${index}`}>{intervention.name ?? 'Unnamed intervention'}{intervention.type ? <small>{trialLabel(intervention.type)}</small> : null}</span>) : <span>Not reported</span>}</div>
        </div>
        <div className="trial-country-sites">
          <h5>{cell.countryName} sites <strong>{countryLocations.length}</strong></h5>
          {countryLocations.length ? <ul>{countryLocations.slice(0, 6).map((location, index) => <li key={`${location.facility}-${index}`}><strong>{location.facility ?? 'Unnamed facility'}</strong><span>{[location.city, location.state].filter(Boolean).join(', ') || cell.countryName} · {trialLabel(location.status)}</span></li>)}</ul> : <p>No site in {cell.countryName} was included in the returned location records.</p>}
          {countryLocations.length > 6 && <small>Plus {countryLocations.length - 6} more sites in this record.</small>}
        </div>
      </div>

      <details className="trial-study-details">
        <summary>Study outcomes and eligibility</summary>
        <div className="trial-details-grid">
          <div><h5>Primary outcomes</h5>{primaryOutcomes.length ? <ul>{primaryOutcomes.map((outcome, index) => <li key={`${outcome.measure}-${index}`}><strong>{outcome.measure ?? 'Unnamed outcome'}</strong><span>{outcome.timeFrame ?? 'Time frame not reported'}</span></li>)}</ul> : <p>No primary outcomes were returned.</p>}</div>
          <div><h5>Eligibility</h5><p className="trial-eligibility">{protocol?.eligibilityModule?.eligibilityCriteria ?? 'Eligibility criteria were not returned.'}</p></div>
        </div>
      </details>
    </article>
  )
}

function ClinicalTrialsResponse({ cell }: { cell: Cell }) {
  const [studies, setStudies] = useState<ClinicalTrialStudy[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const queryUrl = useMemo(() => {
    if (!cell.trialQueryUrl) return null
    const url = new URL(cell.trialQueryUrl)
    url.searchParams.set('pageSize', '10')
    return url.toString()
  }, [cell.trialQueryUrl])

  useEffect(() => {
    setStudies([])
    setTotalCount(null)
    setNextPageToken(null)
    setLoaded(false)
    setStatus('idle')
    setError('')
  }, [queryUrl])

  const loadTrials = async (pageToken?: string) => {
    if (!queryUrl) return
    setStatus('loading')
    setError('')

    try {
      const requestUrl = new URL(queryUrl)
      if (pageToken) requestUrl.searchParams.set('pageToken', pageToken)
      const result = await fetch(requestUrl.toString(), { headers: { Accept: 'application/json' } })
      if (!result.ok) throw new Error(`ClinicalTrials.gov returned HTTP ${result.status}`)
      const response = await result.json() as ClinicalTrialsApiResponse
      setStudies((current) => pageToken ? [...current, ...(response.studies ?? [])] : response.studies ?? [])
      setTotalCount(response.totalCount ?? cell.recruitingTrials)
      setNextPageToken(response.nextPageToken ?? null)
      setLoaded(true)
      setStatus('idle')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'The ClinicalTrials.gov response could not be loaded.')
    }
  }

  return (
    <section className="panel trials-response" aria-labelledby="trials-response-heading">
      <div className="panel-heading trials-response-heading">
        <div>
          <h3 id="trials-response-heading">Clinical trials found</h3>
          <p>Readable study records returned by ClinicalTrials.gov for the selected tumour and country. Open each NCT record to inspect the source directly.</p>
        </div>
        {queryUrl && <a className="trials-source-link" href={queryUrl} target="_blank" rel="noreferrer">Open exact API query</a>}
      </div>
      <dl className="trials-query-scope">
        <div><dt>Condition text</dt><dd>{cell.tumourName}</dd></div>
        <div><dt>Location text</dt><dd>{cell.countryName}</dd></div>
        <div><dt>Status filter</dt><dd>Recruiting</dd></div>
      </dl>
      <div className="trials-caution">
        <strong>What this query means</strong>
        <p>It uses tumour condition text, selected country and recruiting status. It does not filter by {cell.biomarkerName}, {cell.drugName}, patient eligibility, or routine treatment access. Each card therefore shows whether the selected biomarker and drug are mentioned in that record.</p>
      </div>
      <div className="trials-response-actions">
        <div>
          {loaded ? <>
            <strong>Showing {studies.length} of {format(totalCount)} matching records</strong>
            <span>{nextPageToken ? 'More records are available from ClinicalTrials.gov.' : 'All returned pages have been loaded.'}</span>
          </> : <>
            <strong>{format(cell.recruitingTrials)} matching records in the stored query result</strong>
            <span>Load up to 10 readable study records at a time.</span>
          </>}
        </div>
        {queryUrl
          ? !loaded
            ? <button type="button" onClick={() => loadTrials()} disabled={status === 'loading'}>{status === 'loading' ? 'Loading trial records…' : 'Load trial records'}</button>
            : nextPageToken
              ? <button type="button" onClick={() => loadTrials(nextPageToken)} disabled={status === 'loading'}>{status === 'loading' ? 'Loading next page…' : 'Load next page'}</button>
              : null
          : <span className="trials-unavailable">No API query is stored for this selection.</span>}
      </div>
      {status === 'error' && <p className="trials-error" role="alert">{error}</p>}
      {loaded && <div className="trial-study-list">{studies.map((study, index) => <TrialStudyCard key={`${study.protocolSection?.identificationModule?.nctId}-${index}`} study={study} cell={cell} />)}{!studies.length && <p className="trials-empty">The API returned no study records for this page.</p>}</div>}
    </section>
  )
}

function EvidenceChain({ cell, cohorts, civicCount, applicationCount, data }: { cell: Cell; cohorts: Catalogue['cohorts']; civicCount: number; applicationCount: number; data: Catalogue }) {
  const steps = [
    {
      label: 'Diagnosed population',
      value: cell.incidencePoint == null ? 'Source-site count unavailable' : `${format(cell.incidencePoint)} ${cell.globocanSite.toLowerCase()} site cases`,
      note: cell.directIncidenceSite ? `GLOBOCAN ${cell.incidenceYear} country/site estimate` : 'Parent-site estimate; tumour subtype count is not established',
      state: cell.incidencePoint == null ? 'unknown' : cell.directIncidenceSite ? 'reported' : 'supporting',
      link: cell.incidenceSourcePdfUrl, linkLabel: 'Open country fact sheet',
    },
    {
      label: 'Biomarker evidence',
      value: `${cell.biomarkerName}`,
      note: cohorts.length ? `${cohorts.length} related cohorts indexed; frequency not computed` : 'No related cohort metadata retrieved',
      state: cohorts.length ? 'supporting' : 'unknown',
      link: cohorts[0]?.sourceUrl, linkLabel: 'Inspect a related cohort',
    },
    {
      label: 'Candidate drug records',
      value: cell.drugName,
      note: civicCount || applicationCount ? `${civicCount} CIViC variants · ${applicationCount} FDA records; indication review required` : 'No supporting drug records retrieved',
      state: civicCount || applicationCount ? 'supporting' : 'unknown',
      link: '#records-heading', linkLabel: 'Inspect CIViC and FDA records',
    },
    {
      label: `${cell.countryName} approval & access`,
      value: 'Country approval and access not established',
      note: cell.iso3 === 'USA' && applicationCount ? 'FDA application metadata exists, but indication and real-world access still require review' : `${cell.regulator} indication, reimbursement, supply and affordability sources required`,
      state: 'unknown',
      link: cell.iso3 === 'USA' && applicationCount ? '#records-heading' : undefined, linkLabel: 'Inspect FDA application records',
    },
    {
      label: 'Mechanism',
      value: 'Official mechanism source not ingested',
      note: 'An official label or equivalent authoritative document is required',
      state: 'unknown',
      link: undefined, linkLabel: undefined,
    },
    {
      label: 'Recruiting trials',
      value: cell.recruitingTrials == null ? 'Query result unavailable' : `${format(cell.recruitingTrials)} recruiting records`,
      note: `ClinicalTrials.gov condition + ${cell.countryName} query; not proof of eligibility or routine access`,
      state: cell.trialQueryUrl ? 'reported' : 'unknown',
      link: cell.trialQueryUrl, linkLabel: 'Open exact trials query',
    },
  ] as const

  return (
    <section className="panel chain-panel" aria-labelledby="chain-heading">
      <div className="panel-heading"><div><h3 id="chain-heading">Source-reported evidence chain</h3><p>Follow what the selected sources establish. This does not match individual patients or infer treatment suitability.</p></div></div>
      <ol className="evidence-chain" aria-label="Source-reported evidence chain">
        {steps.map((step, index) => <li className={`chain-step chain-step--${step.state}`} key={step.label}>
          <div className="chain-index"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
          <span className="chain-label">{step.label}</span>
          <strong>{step.value}</strong>
          <p>{step.note}</p>
          {step.link ? <a href={step.link} {...(step.link.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer' })}>{step.linkLabel}</a> : <span className="chain-source">No cited value yet</span>}
        </li>)}
      </ol>
    </section>
  )
}

function PatientCountFunnel({ cell }: { cell: Cell }) {
  const diagnosed = format(cell.incidencePoint)
  return (
    <section className="panel patient-funnel" aria-labelledby="patient-funnel-heading">
      <div className="patient-funnel-heading">
        <div><h3 id="patient-funnel-heading">Patient-count funnel</h3><p>Counts appear only when the selected sources establish them. Unknown stages are not estimated.</p></div>
        <span>Source-backed counts</span>
      </div>
      <div className="patient-funnel-labels">
        <div><span>Diagnosed</span><strong>{diagnosed}</strong><small>{cell.globocanSite} site · {cell.countryName}</small></div>
        <div><span>Biomarker-positive</span><strong>Unknown</strong><small>Frequency not computed</small></div>
        <div><span>Drug-linked</span><strong>Unknown</strong><small>Indication review incomplete</small></div>
      </div>
      <div className="patient-funnel-track" role="img" aria-label={`Patient-count funnel: ${diagnosed} diagnosed; biomarker-positive unknown; drug-linked unknown`}>
        <i className="funnel-known" /><i className="funnel-unknown" /><i className="funnel-unknown" />
      </div>
    </section>
  )
}

function EvidenceQueueModal({ cell, cohortCount, civicCount, applicationCount, onClose }: { cell: Cell; cohortCount: number; civicCount: number; applicationCount: number; onClose: () => void }) {
  const tasks = [
    {
      stage: 'Stage 1a · Eligible stage', title: `${cell.tumourName} advanced-stage share`, status: 'Needs a source',
      current: 'No accepted value is stored.',
      question: `Among people newly diagnosed with ${cell.tumourName}, what share meets the disease-stage definition required by the selected drug indication?`,
      accepted: 'A national cancer registry, health-system audit, or peer-reviewed cohort that reports stage at diagnosis for this tumour. The stage definition and population must be stated.',
      record: 'Numerator at the eligible stage; denominator diagnosed; country or setting; diagnosis years; stage definition; point, low and high as 0–1; exact article URL plus page, table or figure.',
      storage: 'multiplier · stage=adv_stage. The brief\'s multiplier schema needs year and denominator fields before this can be accepted.',
    },
    {
      stage: 'Stage 2 · Profiled', title: `${cell.countryName} ${cell.gene} testing rate`, status: 'Needs a source',
      current: 'No country testing-rate value is stored.',
      question: `Among ${cell.countryName} patients who should be tested for ${cell.biomarkerName}, what share actually received the relevant test?`,
      accepted: 'A peer-reviewed real-world study, national audit, registry report, or health-system dataset for the same tumour, biomarker and care setting.',
      record: 'Number tested; eligible denominator; test or panel used; public/private setting; country; study years; point, low and high as 0–1; exact article URL plus page, table or figure.',
      storage: 'multiplier · stage=testing. A global survey without the selected tumour, biomarker and denominator is context only.',
    },
    {
      stage: 'Stage 3 · Biomarker-positive', title: `${cell.tumourName} ${cell.gene} frequency`, status: cohortCount ? 'Needs computation and review' : 'Needs a cohort source',
      current: cohortCount ? `${cohortCount} candidate cohort records are indexed, but no molecular results or frequency denominator were computed.` : 'No candidate cohort is indexed.',
      question: `Among unique ${cell.tumourName} patients successfully tested, what share has ${cell.biomarkerName}?`,
      accepted: 'A reproducible cBioPortal/GDC molecular query or a peer-reviewed tumour cohort with patient-level mutation results and a clear tested denominator.',
      record: 'Positive unique patients; tested unique-patient denominator; exact alteration definition; assay/profile; cohort IDs; ancestry and geography; point and confidence interval; exact query or article URL.',
      storage: 'multiplier · stage=frequency. Study count and sample count alone are not a frequency.',
    },
    {
      stage: 'Stage 4 · Drug indication', title: `${cell.drugName} indication for ${cell.biomarkerName}`, status: civicCount || applicationCount ? 'Needs indication review' : 'Needs an authoritative source',
      current: `${civicCount} CIViC gene-indexed variants and ${applicationCount} FDA application records are available; neither alone confirms this exact indication.`,
      question: `Does an authoritative source link ${cell.drugName} to this exact tumour, biomarker, disease stage and treatment setting?`,
      accepted: 'The regulator label or approval notice for the exact indication, supported by a CIViC evidence item when available. A CIViC gene or variant page alone is not enough.',
      record: 'Drug; tumour; exact biomarker; stage/line/setting; regulator; approval date; exact label or evidence-item URL; quoted locator; reviewer decision.',
      storage: 'indication · evidence_url must point to the exact label/evidence record, not a repository homepage; evidence_status changes only after review.',
    },
    {
      stage: 'Stage 5 · Country access', title: `${cell.countryName} access to ${cell.drugName}`, status: 'Needs country evidence',
      current: cell.iso3 === 'USA' && applicationCount ? 'US application metadata exists, but reimbursement, formulary coverage, supply and real access are not established.' : `No reviewed ${cell.regulator} indication or real-access record is stored.`,
      question: `In ${cell.countryName}, is ${cell.drugName} approved for this exact indication, reimbursed or on-formulary, supplied, and affordable to the relevant population?`,
      accepted: 'Exact regulator label plus official reimbursement, HTA, national formulary, procurement or health-system coverage sources. Approval and access must be recorded separately.',
      record: 'Approval status/date; exact indication; reimbursement/formulary status; payer/sector; coverage dates; supply evidence; exact URLs. Add a numeric access share only when a study reports a real numerator and denominator.',
      storage: 'indication for approval facts; multiplier · stage=access only for a measured access share. Do not convert “approved” into an assumed access rate.',
    },
    {
      stage: 'Stage 6 · Treated', title: `${cell.countryName} treated rate`, status: 'Needs a source',
      current: 'No treatment-uptake value is stored.',
      question: `Among ${cell.countryName} patients with this tumour and biomarker who were eligible for ${cell.drugName}, what share actually received it?`,
      accepted: 'A peer-reviewed real-world cohort, registry, national audit, payer dataset or health-system report that identifies the biomarker-positive eligible denominator.',
      record: 'Number receiving the drug; eligible biomarker-positive denominator; treatment line; sector; country; study years; point, low and high as 0–1; exact article URL plus page, table or figure.',
      storage: 'multiplier · stage=treated. Trial availability is not treatment uptake.',
    },
  ]
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="queue-heading" aria-describedby="queue-scope">
        <div className="review-modal-heading"><div><span>{tasks.length} unresolved requirements</span><h3 id="queue-heading">Evidence requirements for {cell.tumourName}, {cell.biomarkerName}, {cell.countryName}</h3><p id="queue-scope">This is the checklist for the selected atlas cell. It separates missing sources from records that already exist but still need analysis or review.</p></div><button type="button" aria-label="Close evidence queue" onClick={onClose}>×</button></div>
        <div className="queue-explanation"><strong>Why the same categories appear</strong><p>The database currently has no accepted eligible-stage, testing, frequency, access or treated-rate inputs for any of the 50 atlas cells. The categories therefore repeat, but the tumour, biomarker, drug, country, acceptable evidence and current records change with your selection.</p></div>
        <ol className="review-requirements" aria-label="Evidence requirements">
          {tasks.map((task) => <li key={task.stage}><div className="requirement-heading"><div><span>{task.stage}</span><h4>{task.title}</h4></div><strong>{task.status}</strong></div><p className="requirement-current">Current state: {task.current}</p><dl><div><dt>Question to answer</dt><dd>{task.question}</dd></div><div><dt>Accepted evidence</dt><dd>{task.accepted}</dd></div><div><dt>Required record</dt><dd>{task.record}</dd></div><div><dt>Where it goes</dt><dd>{task.storage}</dd></div></dl></li>)}
        </ol>
      </section>
    </div>
  )
}

function GlobocanSourceExtract({ cell }: { cell: Cell }) {
  if (!cell.incidenceSourcePageUrl && !cell.incidenceSourcePdfUrl) return null

  const lookup = `${cell.countryName} + ${cell.globocanSite} → New cases → Number`
  const logic = cell.directIncidenceSite
    ? `Direct source lookup: ${lookup}. No calculation or adjustment was applied.`
    : `Parent-site lookup: ${lookup}. No ${cell.tumourName.replace('Non-small cell lung cancer', 'NSCLC').replace('Cholangiocarcinoma', 'cholangiocarcinoma')} subtype share was applied.`

  return (
    <section className="panel source-extract" aria-labelledby="globocan-extract-heading">
      <div className="source-extract-heading">
        <div><h3 id="globocan-extract-heading">GLOBOCAN source extract</h3><p>{cell.incidenceDatasetVersion} · {cell.incidenceScope}</p></div>
        <div className="source-extract-links">
          {cell.incidenceSourcePageUrl && <a href={cell.incidenceSourcePageUrl} target="_blank" rel="noreferrer">Open country source page</a>}
          {cell.incidenceSourcePdfUrl && <a href={cell.incidenceSourcePdfUrl} target="_blank" rel="noreferrer">Open country fact sheet</a>}
        </div>
      </div>
      <div className="source-extract-values">
        <div><span>New cases</span><strong>{format(cell.incidencePoint)}</strong><small>{cell.globocanSite} site</small></div>
        <div><span>Deaths</span><strong>{format(cell.mortalityPoint)}</strong><small>{cell.globocanSite} site</small></div>
        <div><span>5-year prevalence</span><strong>{format(cell.fiveYearPrevalence)}</strong><small>{cell.globocanSite} site</small></div>
      </div>
      <div className="source-extract-trace">
        <p>{logic}</p>
        <dl><div><dt>Source locator</dt><dd>{cell.incidenceSourceLocator ?? 'Not supplied'}</dd></div><div><dt>Uncertainty</dt><dd>No uncertainty interval reported by GLOBOCAN</dd></div></dl>
      </div>
    </section>
  )
}

function Workspace({ tumourSlug, biomarkerId, iso3, onTumour, onBiomarker, onCountry, data }: { tumourSlug: string; biomarkerId: string; iso3: Iso3; onTumour: (value: string) => void; onBiomarker: (value: string) => void; onCountry: (value: Iso3) => void; data: Catalogue }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [showAllCohorts, setShowAllCohorts] = useState(false)
  const cell = useMemo(() => getCell(tumourSlug, iso3, data, biomarkerId), [tumourSlug, biomarkerId, iso3, data])
  const biomarkerOptions = useMemo(() => getBiomarkerOptions(tumourSlug, data), [tumourSlug, data])
  const countryCells = useMemo(() => data.tumours.map((tumour) => getCell(tumour.slug, iso3, data)), [iso3, data])
  const cohorts = useMemo(() => getRelevantCohorts(tumourSlug, data), [tumourSlug, data])
  const civicCount = getCivicVariantCount(cell.gene, data)
  const applications = getApplications(cell.drugId, data)
  const visibleCohorts = showAllCohorts ? cohorts : cohorts.slice(0, 8)

  useEffect(() => setShowAllCohorts(false), [tumourSlug])

  return (
    <div className="workspace">
      <section className="workspace-title">
        <div><h1>Unmatched Patient Atlas</h1><p>Trace what source data establishes for one tumour, biomarker and country—from diagnosed cases to treatment access. Unknown steps remain unknown.</p></div>
        <IntakeCoverage data={data} />
      </section>

      <section className="query-bar" role="group" aria-label="Evidence query wizard">
        <label><b aria-hidden="true">01</b><span>Tumour type</span><select aria-label="Tumour type" value={tumourSlug} onChange={(event) => onTumour(event.target.value)}>{data.tumours.map((tumour) => <option key={tumour.slug} value={tumour.slug}>{tumour.name}</option>)}</select></label>
        <span className="query-times" aria-hidden="true">×</span>
        <label><b aria-hidden="true">02</b><span>Biomarker</span><select aria-label="Biomarker" value={biomarkerId} onChange={(event) => onBiomarker(event.target.value)}>{biomarkerOptions.map((item) => <option key={item.biomarkerId} value={item.biomarkerId}>{item.biomarkerName} · {item.gene}</option>)}</select></label>
        <span className="query-times" aria-hidden="true">×</span>
        <label><b aria-hidden="true">03</b><span>Country</span><select aria-label="Country" value={iso3} onChange={(event) => onCountry(event.target.value as Iso3)}>{data.countries.map((country) => <option key={country.iso3} value={country.iso3}>{country.name}</option>)}</select></label>
      </section>

      <div className="workbench">
        <aside className="tumour-index" aria-label="Tumour index">
          <div className="rail-heading"><strong>Tumours</strong><span>{data.tumours.length}</span></div>
          {countryCells.map((row) => <button key={row.tumourSlug} aria-pressed={row.tumourSlug === tumourSlug} onClick={() => onTumour(row.tumourSlug)}><span>{row.tumourName}</span><strong>{format(row.incidencePoint)}</strong></button>)}
        </aside>

        <div className="analysis-column">
          <section className="selection-header">
            <div><span>{cell.oncotreeCode} · {cell.iso3}</span><h2>{cell.tumourName}</h2><p><span>{cell.biomarkerName}</span> · {cell.drugName}</p></div>
            <button className="needs-review" type="button" aria-label="Needs review" onClick={() => setReviewOpen(true)}><i /><span><strong>Needs review</strong><small>4 missing sources · 2 analyses</small></span></button>
          </section>

          <section className="measure-grid" aria-label="Retrieved evidence summary">
            <article><span>{cell.globocanSite} source-site cases</span><strong>{format(cell.incidencePoint)}</strong><small>{cell.incidencePoint == null ? 'Restricted from public export' : cell.incidenceLow == null || cell.incidenceHigh == null ? `No uncertainty interval reported by GLOBOCAN · ${cell.incidenceYear}` : `${format(cell.incidenceLow)}–${format(cell.incidenceHigh)} · ${cell.incidenceYear}`}</small><b>{cell.incidenceSourcePdfUrl ? <a href={cell.incidenceSourcePdfUrl} target="_blank" rel="noreferrer">Open country fact sheet</a> : 'Source not retrieved'}</b></article>
            <article><span>Related public cohorts</span><strong>{format(cohorts.length)}</strong><small>{cohorts.reduce((sum, item) => sum + (item.sampleCount ?? 0), 0).toLocaleString()} indexed samples</small><b>{cohorts[0] ? <a href={cohorts[0].sourceUrl} target="_blank" rel="noreferrer">Inspect contributing cohort records</a> : 'No contributing records'}</b></article>
            <article><span>CIViC variants for {cell.gene}</span><strong>{format(civicCount)}</strong><small>Gene-level index; tumour relevance not established</small><b>{civicCount ? <a href="#records-heading">Inspect gene-indexed records</a> : 'No records retrieved'}</b></article>
            <article><span>Recruiting trial records</span><strong>{format(cell.recruitingTrials)}</strong><small>{cell.countryName} condition/location query</small><b>{cell.trialQueryUrl ? <a href={cell.trialQueryUrl} target="_blank" rel="noreferrer">Reproduce ClinicalTrials.gov query</a> : 'Query not retrieved'}</b></article>
          </section>

          <PatientCountFunnel cell={cell} />

          <GlobocanSourceExtract cell={cell} />

          <EvidenceChain cell={cell} cohorts={cohorts} civicCount={civicCount} applicationCount={applications.length} data={data} />

          <EvidenceMatrix cell={cell} cohorts={cohorts} civicCount={civicCount} applicationCount={applications.length} data={data} />

          <EvidenceRecords cell={cell} data={data} />

          <ClinicalTrialsResponse cell={cell} />

          <section className="panel country-panel" aria-labelledby="countries-heading">
            <div className="panel-heading"><div><h3 id="countries-heading">Country comparison</h3><p>Retrieved fields for {cell.tumourName}.</p></div></div>
            <div className="table-scroll"><table><thead><tr><th>Country</th><th>{cell.globocanSite} source-site cases</th><th>Source interval</th><th>Recruiting trials</th><th>Testing</th><th>Treated</th></tr></thead><tbody>
              {data.countries.map((country) => { const row = getCell(tumourSlug, country.iso3, data, biomarkerId); return <tr key={country.iso3} className={country.iso3 === iso3 ? 'selected' : ''}><th><button className="row-select" aria-pressed={country.iso3 === iso3} onClick={() => onCountry(country.iso3)}>{country.name}</button></th><td>{row.incidencePoint == null ? 'Not available' : row.incidenceSourcePdfUrl ? <a href={row.incidenceSourcePdfUrl} target="_blank" rel="noreferrer">{format(row.incidencePoint)}</a> : format(row.incidencePoint)}</td><td>{row.incidencePoint != null && row.incidenceLow == null ? 'Not reported by source' : row.incidenceLow == null ? 'Not available' : `${format(row.incidenceLow)}–${format(row.incidenceHigh)}`}</td><td>{row.trialQueryUrl ? <a href={row.trialQueryUrl} target="_blank" rel="noreferrer">{format(row.recruitingTrials)}</a> : 'Not available'}</td><td>{format(row.testingRate)}</td><td>{format(row.treatedRate)}</td></tr> })}
            </tbody></table></div>
          </section>

          <section className="panel cohort-panel" aria-labelledby="cohort-heading">
            <div className="panel-heading"><div><h3 id="cohort-heading">Related cohort registry</h3><p>{cohorts.length} candidate studies matched by tumour terminology. These are study metadata—not biomarker-frequency results.</p></div><span>Showing {visibleCohorts.length} of {cohorts.length}</span></div>
            <div className="table-scroll"><table><thead><tr><th>Cohort</th><th>Repository</th><th>Cancer type</th><th>Samples</th><th>Open</th></tr></thead><tbody>
              {visibleCohorts.map((cohort) => <tr key={cohort.cohortId}><th><a href={cohort.sourceUrl} target="_blank" rel="noreferrer">{cohort.name}</a></th><td>{cohort.sourceId}</td><td>{cohort.cancerType || 'Not specified'}</td><td>{format(cohort.sampleCount)}</td><td>{cohort.public ? 'Yes' : 'No'}</td></tr>)}
            </tbody></table></div>
            <div className="cohort-footer"><span>Showing {visibleCohorts.length} of {cohorts.length} candidate studies</span>{cohorts.length > 8 && <button type="button" onClick={() => setShowAllCohorts((value) => !value)}>{showAllCohorts ? 'Show first 8' : `Show all ${cohorts.length}`}</button>}</div>
          </section>
        </div>
      </div>
      {reviewOpen && <EvidenceQueueModal cell={cell} cohortCount={cohorts.length} civicCount={civicCount} applicationCount={applications.length} onClose={() => setReviewOpen(false)} />}
    </div>
  )
}

function SourceRegistry({ data }: { data: Catalogue }) {
  const retrieved = data.sources.filter((source) => ['success', 'curated'].includes(source.status))
  const pending = data.sources.filter((source) => !['success', 'curated'].includes(source.status))
  const reusable = data.sources.filter((source) => source.redistributionAllowed)
  const currentUse: Record<string, string> = {
    globocan: `${data.counts.countryBurdenRows ?? 0} country/site burden rows`, oncotree: `${data.counts.oncotreeNodes ?? 0} tumour ontology nodes`,
    cbioportal: 'Study and cohort metadata only', gdc: 'Project metadata only', civic: `${data.counts.civicVariants ?? 0} gene/variant index records`,
    openfda: `${data.counts.regulatoryApplications ?? 0} application records`, clinicaltrials: `${data.counts.trialCells ?? 0} reproducible country queries`,
    worldbank: 'Country context indicators',
  }
  const nextAction: Record<string, string> = {
    globocan: 'Confirm redistribution terms before public release', oncotree: 'Keep taxonomy snapshot versioned',
    cbioportal: 'Retrieve molecular profiles and define cohort denominators', gdc: 'Retrieve mutation files for selected TCGA projects',
    civic: 'Ingest evidence assertions, diseases, therapies and citations', openfda: 'Review exact labels for tumour–biomarker indications',
    clinicaltrials: 'Retain as a trial layer, not routine access', worldbank: 'Use as context only',
  }

  return <section className="registry page">
    <div className="page-heading page-heading--actions"><div><h1>Source registry and acquisition status</h1><p>What has been retrieved, what it can support, and what must happen before it becomes a calculation input.</p></div><a className="export-link" href={data.includesRestrictedData ? '/data/catalog.local.json' : '/data/catalog.json'} download>Download source index</a></div>
    <section className="source-overview" aria-label="Source acquisition overview">
      <article><span>Current snapshots</span><strong>{retrieved.length}</strong><p>{retrieved.length} retrieved or curated</p></article>
      <article><span>Acquisition backlog</span><strong>{pending.length}</strong><p>{pending.length} not yet ingested</p></article>
      <article><span>Reusable upstream data</span><strong>{reusable.length}</strong><p>Licence currently permits redistribution</p></article>
    </section>
    <div className="registry-key"><span><i className="source-dot source-dot--ready" />Retrieved means records are stored</span><span><i className="source-dot source-dot--pending" />Retrieved does not automatically mean usable in the funnel</span></div>
    <div className="registry-table table-scroll"><table><thead><tr><th>Source</th><th>Role in the atlas</th><th>Acquisition</th><th>What we have</th><th>Access and reuse</th><th>Next action</th></tr></thead><tbody>
      {data.sources.map((source) => {
        const isRetrieved = ['success', 'curated'].includes(source.status)
        return <tr key={source.sourceId}><th><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>{source.licence}</small></th><td>{source.feedsStage.replaceAll('|', ', ')}</td><td><span className={`source-status source-status--${isRetrieved ? 'ready' : 'pending'}`}><i />{isRetrieved ? 'Retrieved' : 'Not ingested'}</span><small>{source.retrievedOn ?? 'No snapshot'}</small></td><td><strong>{source.recordCount.toLocaleString()} records</strong><small>{currentUse[source.sourceId] ?? 'No normalized records yet'}</small></td><td><span className={`access access--${source.accessClass}`}>{titleCase(source.accessClass)}</span><small>{source.redistributionAllowed ? 'Redistribution allowed' : 'Restricted or confirmation required'}</small></td><td>{nextAction[source.sourceId] ?? source.error ?? 'Credentials, licence, manual download, or curation required'}<small>{source.notes}</small></td></tr>
      })}
    </tbody></table></div>
  </section>
}

const schemaRows = [
  ['source', 'Repository access, licence and redistribution terms', 'source_id'],
  ['source_snapshot', 'Retrieval state and record count for each run', 'snapshot_id'],
  ['tumour', 'OncoTree join key and GLOBOCAN mapping', 'oncotree_code'],
  ['oncotree_node', 'Retrieved OncoTree taxonomy rows', 'node_id'],
  ['biomarker', 'HGNC symbol and alteration class', 'biomarker_id'],
  ['indication', 'Tumour–biomarker–drug relationship', 'indication_id'],
  ['regimen_component', 'Components of combination regimens', 'regimen + component'],
  ['incidence', 'Country/site annual cases and bounds', 'oncotree_code + iso3 + year'],
  ['multiplier', 'Stage inputs; unavailable values remain NULL', 'stage + tumour + biomarker + country'],
  ['cohort', 'cBioPortal and GDC cohort metadata', 'cohort_id'],
  ['civic_variant', 'CIViC gene/variant index', 'civic_variant_id'],
  ['regulatory_application', 'FDA application metadata', 'application_number + drug'],
  ['trial_availability', 'Recruiting-study counts and exact request URLs', 'tumour + country'],
]

function DataModel({ data }: { data: Catalogue }) {
  const stages = [
    ['Diagnosed cases', 'Annual new cases for the country and closest GLOBOCAN cancer site. This has no patient biomarkers or medicines.', 'ready'],
    ['Eligible stage', 'Share diagnosed at the disease stage where the drug could apply. Needs a registry, audit or cohort with stage counts and a diagnosed denominator.', 'missing'],
    ['Profiled', 'Share of eligible patients who actually received the selected biomarker test. Needs a country study or audit with tested and eligible counts.', 'missing'],
    ['Biomarker-positive', 'Share of tested unique patients who carry the exact alteration. Cohort metadata exists, but molecular results and the tested denominator have not been aggregated.', 'supporting'],
    ['Drug indication', 'Proof that the exact drug is authorised for this tumour, biomarker, disease stage and treatment setting. CIViC/FDA index records still need label-level review.', 'supporting'],
    ['Country access', 'Approval, reimbursement/formulary, supply and affordability are separate facts. A numeric access rate needs a real population denominator.', 'missing'],
    ['Treated', 'Share of eligible biomarker-positive patients who actually received the drug. Needs a real-world cohort, registry, audit or payer dataset.', 'missing'],
  ]

  return <section className="model-page page">
    <div className="page-heading"><h1>How AlphaGrid Treatment Explorer turns sources into an atlas</h1><p>Every public value should be traceable from an upstream record, through a normalized table, into one funnel input. Missing links remain visible and block the final estimate.</p></div>

    <section className="architecture-map" aria-label="AlphaGrid Treatment Explorer information architecture">
      <span className="sr-only" role="img" aria-label="AlphaGrid Treatment Explorer information architecture from upstream sources through DuckDB to funnel inputs and public outputs" />
      <article className="architecture-column architecture-column--sources"><h2>Upstream evidence</h2><p>Retrieved without changing the source meaning.</p><ul><li><strong>GLOBOCAN</strong><span>Incidence, mortality, prevalence</span></li><li><strong>OncoTree</strong><span>Tumour terminology</span></li><li><strong>cBioPortal + GDC</strong><span>Cohort metadata</span></li><li><strong>CIViC + openFDA</strong><span>Variant and application records</span></li><li><strong>Literature + regulators</strong><span>Rates and country access · incomplete</span></li></ul></article>
      <span className="architecture-arrow" aria-hidden="true">→</span>
      <article className="architecture-column architecture-column--database"><h2>Normalized in DuckDB</h2><p>Source snapshots retain retrieval date, URL and licence.</p><ul><li><code>tumour</code><span>OncoTree code</span></li><li><code>biomarker</code><span>HGNC symbol + alteration</span></li><li><code>incidence</code><span>ISO-3 + site + year</span></li><li><code>indication</code><span>Drug + tumour + biomarker</span></li><li><code>multiplier</code><span>Point + low + high + provenance</span></li></ul></article>
      <span className="architecture-arrow" aria-hidden="true">→</span>
      <article className="architecture-column architecture-column--inputs"><h2>Funnel inputs</h2><p>One row per tumour × biomarker × country.</p><ul><li><strong>Diagnosed</strong><span className="ia-ready">Retrieved</span></li><li><strong>Eligible + profiled</strong><span className="ia-missing">Missing</span></li><li><strong>Biomarker frequency</strong><span className="ia-supporting">Supporting metadata</span></li><li><strong>Drug exists</strong><span className="ia-supporting">Needs review</span></li><li><strong>Access + treated</strong><span className="ia-missing">Missing</span></li></ul></article>
      <span className="architecture-arrow" aria-hidden="true">→</span>
      <article className="architecture-column architecture-column--outputs"><h2>Open outputs</h2><p>Only licence-compatible, reviewed values are released.</p><ul><li><strong>Atlas JSON</strong><span>Value, range and source IDs</span></li><li><strong>Methods</strong><span>Join and calculation rules</span></li><li><strong>Source registry</strong><span>Retrieval and licence state</span></li><li><strong>Unknowns</strong><span>Contribution backlog</span></li></ul></article>
    </section>

    <section className="calculation-map" aria-labelledby="calculation-heading"><div className="calculation-heading"><div><h2 id="calculation-heading">How one atlas cell is calculated</h2><p>Each stage narrows the preceding population. A missing stage stops the chain; supporting metadata cannot substitute for a measured rate.</p></div><span>Not calculable yet</span></div><ol>{stages.map(([label, note, state], index) => <li className={`calculation-stage calculation-stage--${state}`} key={label}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong><p>{note}</p><small>{state === 'ready' ? 'Usable input' : state === 'supporting' ? 'Enrichment required' : 'Source required'}</small></li>)}</ol></section>

    <section className="enrichment-section" aria-labelledby="enrichment-heading"><div className="section-heading"><h2 id="enrichment-heading">Ways to close the gaps</h2><p>These are proposed enrichment paths, not inferred values.</p></div><div className="enrichment-grid"><article><span>Frequency</span><h3>Compute tumour-specific biomarker rates</h3><p>Retrieve molecular profiles from selected cBioPortal or GDC cohorts, define the tested denominator, calculate alteration frequency, and record cohort ancestry and assay limits.</p></article><article><span>Care pathway</span><h3>Curate country testing and treatment rates</h3><p>Extract rates from peer-reviewed or health-system studies. Keep population, denominator, setting, year and uncertainty with every value.</p></article><article><span>Access</span><h3>Verify indication and real access</h3><p>Join regulator labels to the exact tumour–biomarker pair, then add reimbursement, formulary, supply and affordability evidence separately.</p></article></div><div className="contribution-rule"><strong>How to propose a better method</strong><p>Describe the alternative retrieval or estimation approach and its limits. Every proposed input needs a source URL, denominator, geography, year and point–low–high values, followed by scientific review.</p></div></section>

    <section className="open-artifacts" aria-labelledby="artifacts-heading"><div className="section-heading"><h2 id="artifacts-heading">Reproducible open-source artifacts</h2><p>Raw upstream records stay private when licences require it; normalized provenance and permitted derived outputs remain reviewable.</p></div><div className="model-meta"><div><span>Local database</span><code>data/alphagrid.duckdb</code></div><div><span>Public-safe export</span><code>public/data/catalog.json</code></div><div><span>Rebuild</span><code>python3 -m pipelines.build_database</code></div><div><span>Restricted development export</span><code>data/catalog.local.json</code></div></div></section>

    <details className="schema-details"><summary>Inspect normalized DuckDB tables</summary><div className="table-scroll"><table><thead><tr><th>Table</th><th>Purpose</th><th>Primary join key</th></tr></thead><tbody>{schemaRows.map(([table, purpose, key]) => <tr key={table}><th><code>{table}</code></th><td>{purpose}</td><td><code>{key}</code></td></tr>)}</tbody></table></div></details>
  </section>
}

export default function App({ initialCatalog, initialView = 'workspace' }: { initialCatalog?: Catalogue; initialView?: View } = {}) {
  const startingData = initialCatalog ?? catalog
  const [view, setView] = useState<View>(initialView)
  const [discoverySelection, setDiscoverySelection] = useState<DiscoverySelection>({ tumourSlug: 'nsclc', biomarkerId: 'nsclc_egfr_sens', iso3: 'IND' })
  const [tumourSlug, setTumourSlug] = useState('nsclc')
  const [biomarkerId, setBiomarkerId] = useState(() => getBiomarkerOptions('nsclc', startingData)[0]?.biomarkerId ?? '')
  const [iso3, setIso3] = useState<Iso3>('IND')
  const [data, setData] = useState<Catalogue>(startingData)

  useEffect(() => {
    if (initialCatalog || !import.meta.env.DEV) return
    fetch('/data/catalog.local.json')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No local catalogue')))
      .then((localData: Catalogue) => {
        setData(localData)
        setBiomarkerId((current) => localData.cells.some((cell) => cell.tumourSlug === 'nsclc' && cell.biomarkerId === current)
          ? current
          : getBiomarkerOptions('nsclc', localData)[0]?.biomarkerId ?? '')
      })
      .catch(() => undefined)
  }, [initialCatalog])

  const selectTumour = (nextTumour: string) => {
    setTumourSlug(nextTumour)
    const nextBiomarker = getBiomarkerOptions(nextTumour, data)[0]
    if (nextBiomarker) setBiomarkerId(nextBiomarker.biomarkerId)
  }

  return <div className="app-shell"><Header view={view} onView={setView} />{view === 'workspace' ? <Discovery data={data} selection={discoverySelection} onSelection={setDiscoverySelection} onOpenAtlas={(nextTumour, nextCountry) => { selectTumour(nextTumour); setIso3(nextCountry); setView('atlas') }} /> : <main>{view === 'atlas' ? <Workspace tumourSlug={tumourSlug} biomarkerId={biomarkerId} iso3={iso3} onTumour={selectTumour} onBiomarker={setBiomarkerId} onCountry={setIso3} data={data} /> : view === 'sources' ? <SourceRegistry data={data} /> : <DataModel data={data} />}</main>}</div>
}
