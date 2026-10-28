import { useMemo, useState } from 'react'
import type { Catalogue, Iso3 } from '../data/catalog'
import { getFdaMatches } from '../data/discovery'
import { matchFindingToCatalog, type ParsedTempusReport } from './parseTempus'
import { readTempusPdf } from './readPdf'

type Selection = { tumourSlug: string; biomarkerId: string; iso3: Iso3 }

export default function ReportExplore({ data, selection, onSelection }: { data: Catalogue; selection: Selection; onSelection: (next: Selection) => void }) {
  const [report, setReport] = useState<ParsedTempusReport | null>(null)
  const [tumourSlug, setTumourSlug] = useState(selection.tumourSlug)
  const [biomarkerId, setBiomarkerId] = useState('')
  const [confirmed, setConfirmed] = useState<{ tumourSlug: string; biomarkerId: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sourceBiomarkers = data.biomarkers
  const candidates = useMemo(() => {
    if (!report) return []
    const mapped = report.findings.flatMap((finding) => matchFindingToCatalog(finding, tumourSlug, sourceBiomarkers).map((marker) => ({ finding, marker })))
    return mapped.filter((candidate, index) => mapped.findIndex((item) => item.marker.id === candidate.marker.id) === index)
  }, [report, tumourSlug, sourceBiomarkers])
  const selectedCandidate = candidates.find((item) => item.marker.id === biomarkerId) ?? candidates[0]
  const confirmedMatches = confirmed ? getFdaMatches(confirmed.tumourSlug, confirmed.biomarkerId, data.fdaMatches) : []

  const loadFile = async (file?: File) => {
    if (!file) return
    setLoading(true); setError(''); setReport(null); setConfirmed(null)
    try {
      const parsed = await readTempusPdf(file)
      setReport(parsed)
      setTumourSlug(parsed.suggestedTumourSlug ?? selection.tumourSlug)
      setBiomarkerId('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not be read.') }
    finally { setLoading(false) }
  }

  const confirm = () => {
    if (!selectedCandidate) return
    const next = { tumourSlug, biomarkerId: selectedCandidate.marker.id }
    setConfirmed(next)
    onSelection({ ...selection, ...next })
  }

  return <section className="discover-report" aria-labelledby="report-heading">
    <div className="discover-section-heading"><div><h2 id="report-heading">Explore a molecular report</h2><p>Upload a text-based Tempus xT PDF to locate exact findings in the current FDA evidence index. Review the extracted cancer type and variant before matching.</p></div><span>Optional</span></div>
    <div className="discover-report-upload"><label htmlFor="tempus-report-upload">Choose report PDF</label><input id="tempus-report-upload" type="file" accept="application/pdf,.pdf" disabled={loading} onChange={(event) => { void loadFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /><p>Read locally in this browser. The PDF is not sent to the app server or saved. Text-based PDFs only; up to 20 MB.</p></div>
    {loading && <p role="status">Reading the report summary…</p>}
    {error && <p role="alert" className="discover-error">{error}</p>}
    {report && <div className="discover-report-results">
      <div className="discover-report-context"><div><span>Extracted context</span><h3>{report.format}</h3><p>{report.tumourReason}</p></div><label>Cancer type to use<select aria-label="Report cancer type" value={tumourSlug} onChange={(event) => { setTumourSlug(event.target.value); setBiomarkerId(''); setConfirmed(null) }}>{data.tumours.map((tumour) => <option value={tumour.slug} key={tumour.slug}>{tumour.name}</option>)}</select></label></div>
      <div className="discover-report-findings"><div><strong>{report.findings.length} positive summary {report.findings.length === 1 ? 'finding' : 'findings'} extracted</strong>{report.tmb != null && <span>TMB reported: {report.tmb} mut/Mb</span>}</div>{report.findings.length ? <ul>{report.findings.map((finding, index) => <li key={`${finding.gene}-${index}`}><b>{finding.gene} {finding.alteration}</b><span>{finding.section}</span></li>)}</ul> : <p>No positive variant was extracted from the summary page.</p>}{report.negatives.length > 0 && <p>Reported negative genes, excluded from matching: {report.negatives.join(', ')}.</p>}</div>
      {candidates.length ? <div className="discover-report-confirm"><label>Exact catalog match<select aria-label="Report biomarker match" value={selectedCandidate?.marker.id ?? ''} onChange={(event) => { setBiomarkerId(event.target.value); setConfirmed(null) }}>{candidates.map(({ finding, marker }) => <option key={marker.id} value={marker.id}>{finding.gene} {finding.alteration} → {marker.name}</option>)}</select></label><button type="button" onClick={confirm}>Show evidence matches</button></div> : <p className="discover-report-no-match">No exact variant match was found in this catalog for the confirmed cancer type. Use the manual biomarker selector above; do not infer a match from a gene name alone.</p>}
      {confirmed && <div className="discover-report-evidence" role="status"><h3>{confirmedMatches.length} FDA indication {confirmedMatches.length === 1 ? 'record' : 'records'} linked to the confirmed finding</h3><p>These are source-linked treatment leads for review. The report extraction does not establish stage, prior therapy, eligibility, or suitability.</p>{confirmedMatches.length ? <ul>{confirmedMatches.map((match) => <li key={`${match.biomarkerId}-${match.drugName}`}><strong>{match.drugName}</strong><span>{match.indication}</span><a href={match.sourceUrl} target="_blank" rel="noreferrer">FDA source</a></li>)}</ul> : <p>No FDA record is indexed for this exact pair.</p>}</div>}
      <details className="discover-report-notes"><summary>Extraction limits</summary><ul>{report.notes.map((note) => <li key={note}>{note}</li>)}</ul></details>
    </div>}
  </section>
}
