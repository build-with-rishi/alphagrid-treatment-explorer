import { useEffect, useMemo, useState } from 'react'
import { getCell, type Catalogue, type Iso3 } from './data/catalog'
import { biomarkers, fdaMatches, standardRegimens, getCancerBiomarkers, getFdaMatches, initialBiomarkerByCancer, type FdaMatch } from './data/discovery'
import ReportExplore from './report/ReportExplore'
import './discovery.css'

type Trial = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string }
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string }; completionDateStruct?: { date?: string } }
    designModule?: { phases?: string[]; enrollmentInfo?: { count?: number; type?: string } }
    conditionsModule?: { conditions?: string[]; keywords?: string[] }
    armsInterventionsModule?: { interventions?: Array<{ name?: string; type?: string }> }
    descriptionModule?: { briefSummary?: string }
    eligibilityModule?: { eligibilityCriteria?: string }
    outcomesModule?: { primaryOutcomes?: Array<{ measure?: string; timeFrame?: string }> }
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } }
    contactsLocationsModule?: { locations?: Array<{ country?: string; city?: string; facility?: string }> }
  }
}

const number = new Intl.NumberFormat('en-US')
const display = (value: number | null) => value == null ? 'Not available' : number.format(value)

function Trials({ queryUrl, countryName }: { queryUrl: string | null; countryName: string }) {
  const [studies, setStudies] = useState<Trial[]>([])
  const [pageToken, setPageToken] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [selected, setSelected] = useState<Trial | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setStudies([]); setPageToken(null); setTotal(null); setSelected(null); setError('') }, [queryUrl])
  useEffect(() => {
    if (!selected) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [selected])

  const load = async (token?: string) => {
    if (!queryUrl) return
    setLoading(true); setError('')
    try {
      const url = new URL(queryUrl)
      url.searchParams.set('pageSize', '10')
      if (token) url.searchParams.set('pageToken', token)
      const response = await fetch(url.toString())
      if (!response.ok) throw new Error(`ClinicalTrials.gov returned ${response.status}`)
      const result = await response.json() as { studies?: Trial[]; nextPageToken?: string; totalCount?: number }
      setStudies(result.studies ?? [])
      setPageToken(result.nextPageToken ?? null)
      setTotal(result.totalCount ?? null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Trial records could not be loaded') }
    finally { setLoading(false) }
  }

  return <section className="discover-trials" aria-labelledby="discover-trials-heading">
    <div className="discover-section-heading"><div><h2 id="discover-trials-heading">Clinical studies</h2><p>Recruiting records for this cancer and {countryName}. A record may not require the selected biomarker.</p></div><span>{total == null ? 'On demand' : `${display(total)} records`}</span></div>
    <div className="discover-trial-actions">
      <p>Only ten concise records appear at a time. Open a study for eligibility, outcomes and sites.</p>
      {queryUrl && <button type="button" onClick={() => load()} disabled={loading}>{loading ? 'Loading…' : studies.length ? 'First page' : 'Load studies'}</button>}
    </div>
    {error && <p role="alert" className="discover-error">{error}</p>}
    {studies.length > 0 && <div className="discover-trial-list">{studies.map((study, index) => {
      const p = study.protocolSection
      const id = p?.identificationModule?.nctId ?? `Study ${index + 1}`
      const interventions = p?.armsInterventionsModule?.interventions?.map((item) => item.name).filter(Boolean) ?? []
      const locations = p?.contactsLocationsModule?.locations
      const sites = locations?.filter((item) => item.country === countryName).length ?? 0
      return <article className="discover-trial-row" key={id}>
        <div><span>{id} · {(p?.designModule?.phases ?? []).join(', ').replaceAll('PHASE', 'Phase ') || 'Phase not reported'}</span><h3>{p?.identificationModule?.briefTitle ?? 'Study title not reported'}</h3><p>{interventions.slice(0, 3).join(' · ') || 'Interventions not reported'}</p></div>
        <div className="discover-trial-meta"><span>{p?.statusModule?.overallStatus?.replaceAll('_', ' ') ?? 'Status unknown'}</span><span>{p?.designModule?.enrollmentInfo?.count == null ? 'Enrollment unknown' : `${display(p.designModule.enrollmentInfo.count)} enrolled`}</span><span>{locations ? `${sites} ${sites === 1 ? 'site' : 'sites'} in ${countryName}` : 'Sites not reported'}</span><span>Cancer + country query</span></div>
        <button type="button" onClick={() => setSelected(study)}>View details</button>
      </article>
    })}</div>}
    {pageToken && <button type="button" className="discover-more" disabled={loading} onClick={() => load(pageToken)}>Next 10 studies</button>}
    {queryUrl && <a className="discover-source-link" href={queryUrl} target="_blank" rel="noreferrer">Open the exact ClinicalTrials.gov query</a>}
    {selected && <div className="discover-backdrop" onMouseDown={() => setSelected(null)}>
      <div className="discover-modal" role="dialog" aria-modal="true" aria-label="Clinical study details" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="discover-close" onClick={() => setSelected(null)} aria-label="Close study details">×</button>
        <span>ClinicalTrials.gov record · {selected.protocolSection?.identificationModule?.nctId}</span>
        <h2>{selected.protocolSection?.identificationModule?.briefTitle ?? 'Study details'}</h2>
        <p>{selected.protocolSection?.descriptionModule?.briefSummary ?? 'No summary reported.'}</p>
        <dl className="discover-study-facts"><div><dt>Status</dt><dd>{selected.protocolSection?.statusModule?.overallStatus?.replaceAll('_', ' ') ?? 'Not reported'}</dd></div><div><dt>Phase</dt><dd>{selected.protocolSection?.designModule?.phases?.join(', ').replaceAll('PHASE', 'Phase ') || 'Not reported'}</dd></div><div><dt>Enrollment</dt><dd>{display(selected.protocolSection?.designModule?.enrollmentInfo?.count ?? null)}</dd></div><div><dt>Sponsor</dt><dd>{selected.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name ?? 'Not reported'}</dd></div></dl>
        <h3>Interventions</h3><p>{selected.protocolSection?.armsInterventionsModule?.interventions?.map((item) => item.name).filter(Boolean).join(' · ') || 'Not reported.'}</p>
        <h3>Primary outcomes</h3>{selected.protocolSection?.outcomesModule?.primaryOutcomes?.length ? <ul>{selected.protocolSection.outcomesModule.primaryOutcomes.map((item, index) => <li key={index}>{item.measure ?? 'Unnamed outcome'}{item.timeFrame ? ` · ${item.timeFrame}` : ''}</li>)}</ul> : <p>Not reported.</p>}
        <h3>Eligibility</h3><p>{selected.protocolSection?.eligibilityModule?.eligibilityCriteria ?? 'Not reported.'}</p>
        <h3>Sites</h3>{selected.protocolSection?.contactsLocationsModule?.locations?.length ? <ul>{selected.protocolSection.contactsLocationsModule.locations.map((site, index) => <li key={index}>{[site.facility, site.city, site.country].filter(Boolean).join(', ')}</li>)}</ul> : <p>No sites reported.</p>}
        {selected.protocolSection?.identificationModule?.nctId && <a href={`https://clinicaltrials.gov/study/${selected.protocolSection.identificationModule.nctId}`} target="_blank" rel="noreferrer">Open original study record</a>}
      </div>
    </div>}
  </section>
}

export type DiscoverySelection = { tumourSlug: string; biomarkerId: string; iso3: Iso3 }

export default function Discovery({ data, selection, onSelection, onOpenAtlas }: { data: Catalogue; selection: DiscoverySelection; onSelection: (next: DiscoverySelection) => void; onOpenAtlas: (tumourSlug: string, iso3: Iso3) => void }) {
  const { tumourSlug, biomarkerId, iso3 } = selection
  const [selectedMatch, setSelectedMatch] = useState<FdaMatch | null>(null)
  useEffect(() => {
    if (!selectedMatch) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedMatch(null) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [selectedMatch])
  const sourceBiomarkers = data.biomarkers ?? biomarkers
  const sourceMatches = data.fdaMatches ?? fdaMatches
  const options = useMemo(() => getCancerBiomarkers(tumourSlug, sourceBiomarkers), [tumourSlug, sourceBiomarkers])
  const biomarker = options.find((item) => item.id === biomarkerId) ?? options[0]
  const cell = getCell(tumourSlug, iso3, data)
  const matches = getFdaMatches(tumourSlug, biomarker.id, sourceMatches)
  const regimens = (data.standardRegimens ?? standardRegimens).filter((item) => item.tumourSlug === tumourSlug).sort((a, b) => a.title.localeCompare(b.title))
  const tumour = data.tumours.find((item) => item.slug === tumourSlug)!
  const country = data.countries.find((item) => item.iso3 === iso3)!
  const matchedPairs = new Set(sourceBiomarkers.filter((item) => getFdaMatches(item.tumourSlug, item.id, sourceMatches).length).map((item) => item.id)).size

  const selectTumour = (next: string) => {
    const choices = getCancerBiomarkers(next, sourceBiomarkers)
    const preferred = choices.find((item) => item.id === initialBiomarkerByCancer[next]) ?? choices[0]
    onSelection({ ...selection, tumourSlug: next, biomarkerId: preferred?.id ?? '' })
    setSelectedMatch(null)
  }

  return <main className="discover-page">
    <header className="discover-hero"><div><h1>Explore Treatments</h1><p>Find source-backed treatment evidence and inspect where the case-count gaps remain.</p></div><div className="discover-coverage"><strong>{sourceBiomarkers.length}</strong><span>cancer–biomarker pairs cataloged</span><small>Curated starting index, not comprehensive · {data.tumours.length} cancer types · {matchedPairs} with an indexed FDA match{data.discoveryReviewedOn ? ` · checked ${data.discoveryReviewedOn}` : ''}</small></div></header>
    <section className="discover-query" aria-label="Explore cancer evidence"><label><span>Cancer type</span><select aria-label="Cancer type" value={tumourSlug} onChange={(event) => selectTumour(event.target.value)}>{data.tumours.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label><span>Biomarker or pathway</span><select aria-label="Biomarker" value={biomarker.id} onChange={(event) => { onSelection({ ...selection, biomarkerId: event.target.value }); setSelectedMatch(null) }}>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Country for population context</span><select aria-label="Country" value={iso3} onChange={(event) => onSelection({ ...selection, iso3: event.target.value as Iso3 })}>{data.countries.map((item) => <option key={item.iso3} value={item.iso3}>{item.name}</option>)}</select></label></section>
    <div className="discover-content">
      <ReportExplore data={data} selection={selection} onSelection={onSelection} />
      <p className="discover-profile">Exploring <strong>{tumour.name}</strong> with <strong>{biomarker.name}</strong>. Country context: <strong>{country.name}</strong>. <a href={biomarker.sourceUrl} target="_blank" rel="noreferrer">Source for this biomarker</a></p>
      {regimens.length > 0 && <section className="discover-regimens" aria-labelledby="regimens-heading"><div className="discover-section-heading"><div><h2 id="regimens-heading">Established treatment pathways</h2><p>These are cancer and treatment-context records. They do not depend on the selected biomarker and are separate from the FDA biomarker matches below.</p></div><span>NCI evidence</span></div><div className="discover-regimen-list">{regimens.map((regimen) => <article key={regimen.id}><div><span>{regimen.setting}</span><h3>{regimen.title}</h3><p>{regimen.summary}</p><small>{regimen.regulatoryNote}</small></div><div className="discover-regimen-links"><a href={regimen.sourceUrl} target="_blank" rel="noreferrer">{regimen.sourceName}</a>{regimen.fdaSourceUrl && <a href={regimen.fdaSourceUrl} target="_blank" rel="noreferrer">FDA agent label</a>}<span>{regimen.sourceLocator}</span></div></article>)}</div></section>}
      <div className="discover-answer-grid"><section className="discover-matches" aria-labelledby="matches-heading"><div className="discover-section-heading"><div><h2 id="matches-heading">FDA-approved drug matches</h2><p>US approval records linked to this profile in the current index. The exact indication may include additional conditions.</p></div><span>{matches.length} indexed</span></div>{matches.length ? <div className="discover-match-list">{matches.map((match) => <article key={`${match.biomarkerId}-${match.drugName}`}><div><span>FDA indication record</span><h3>{match.drugName}</h3><p>{match.indication}</p></div><button type="button" onClick={() => setSelectedMatch(match)}>Why this match</button></article>)}</div> : <div className="discover-empty"><strong>No FDA-approved match has been indexed for this pair yet.</strong><p>The index is still being expanded. This does not mean that no approved or other treatment exists.</p></div>}<a href={biomarker.sourceUrl} target="_blank" rel="noreferrer" className="discover-source-link">Open biomarker source</a></section><section className="discover-gap" aria-labelledby="gap-heading"><span>Evidence gap</span><h2 id="gap-heading">How many cases have no identified drug link?</h2><strong>Not yet measurable</strong><p>GLOBOCAN country totals do not say which cases have this biomarker. Research cohorts are not linked to those national counts.</p><small>Established regimens can exist without a biomarker match. A missing indexed FDA link is not a case without treatment.</small></section></div>
      <section className="discover-burden" aria-label="Country cancer burden"><div className="discover-section-heading"><div><h2>{country.name} cancer burden</h2><p>{cell.incidenceDatasetVersion ?? 'GLOBOCAN'} · {cell.globocanSite} site · {cell.incidenceYear ?? 'year unavailable'}{cell.directIncidenceSite ? '' : ' · broader site than selected subtype'}</p></div>{cell.incidenceSourcePdfUrl && <a href={cell.incidenceSourcePdfUrl} target="_blank" rel="noreferrer">Open country fact sheet</a>}</div><div className="discover-burden-grid"><article><span>New cases</span><strong>{display(cell.incidencePoint)}</strong><p>People newly diagnosed during the source year.</p></article><article><span>Deaths</span><strong>{display(cell.mortalityPoint)}</strong><p>Deaths from this cancer during the year, not necessarily from the new cases shown here.</p></article><article><span>Five-year prevalence</span><strong>{display(cell.fiveYearPrevalence)}</strong><p>People alive who were diagnosed in the preceding five years.</p></article></div>{!data.includesRestrictedData && <p className="discover-restriction">Numeric GLOBOCAN values are unavailable in this public export; open the source fact sheet for the original figures.</p>}</section>
      <Trials key={`${tumourSlug}-${iso3}`} queryUrl={cell.trialQueryUrl} countryName={country.name} />
      <section className="discover-deeper"><div><h2>Explore the evidence behind the numbers</h2><p>Inspect cohorts, sources and calculation gaps. The older atlas uses one exemplar biomarker per cancer, so the biomarker shown there may differ from your selection.</p></div><button type="button" onClick={() => onOpenAtlas(tumourSlug, iso3)}>Explore the evidence atlas</button></section>
    </div>
    {selectedMatch && <div className="discover-backdrop" onMouseDown={() => setSelectedMatch(null)}><div className="discover-modal" role="dialog" aria-modal="true" aria-label="FDA match evidence" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="discover-close" onClick={() => setSelectedMatch(null)} aria-label="Close match evidence">×</button><span>United States FDA · source {selectedMatch.sourceDate}</span><h2>{selectedMatch.drugName}</h2><p><strong>Matched profile:</strong> {tumour.name} · {biomarker.name}</p><h3>Indexed indication conditions</h3><p>{selectedMatch.indication}</p><dl className="discover-study-facts"><div><dt>Source locator</dt><dd>{selectedMatch.sourceLocator ?? 'Indication section of linked FDA record'}</dd></div><div><dt>Approval date</dt><dd>{selectedMatch.approvalDate ?? 'See linked FDA record'}</dd></div></dl>{selectedMatch.studyIds?.length ? <><h3>Studies cited by FDA</h3><ul>{selectedMatch.studyIds.map((id) => <li key={id}><a href={`https://clinicaltrials.gov/study/${id}`} target="_blank" rel="noreferrer">{id}</a></li>)}</ul></> : <p>Associated study identifiers have not been indexed for this record.</p>}<p>This is a source-linked regulatory match for a pathway, not a treatment recommendation for an individual.</p><a href={selectedMatch.sourceUrl} target="_blank" rel="noreferrer">Open FDA source record</a></div></div>}
  </main>
}
