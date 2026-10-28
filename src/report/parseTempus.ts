import type { Biomarker } from '../data/discovery'

export type ReportFinding = {
  gene: string
  alteration: string
  section: 'Somatic — potentially actionable' | 'Germline — pathogenic or likely pathogenic'
  sourceLine: string
}

export type ParsedTempusReport = {
  format: string
  suggestedTumourSlug: string | null
  tumourReason: string
  findings: ReportFinding[]
  tmb: number | null
  negatives: string[]
  notes: string[]
}

const geneToken = /^[A-Z][A-Z0-9]{1,10}$/
const alterationToken = /^(?:p\.[A-Za-z*0-9_]+|c\.[A-Za-z0-9_+>\-]+|exon\s+\d+\b)/i

export function parseTempusSummary(lines: string[]): ParsedTempusReport {
  const firstPage = lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const header = firstPage.slice(0, 15).join(' ')
  const specimen = firstPage.find((line, index) => /tumou?r specimen\s*:/i.test(line) && index < 30)
  const specimenLine = specimen ? firstPage[firstPage.indexOf(specimen) + 1] ?? '' : ''
  const headerAndSpecimen = `${header} ${specimenLine}`
  let suggestedTumourSlug: string | null = null
  let tumourReason = 'Cancer type was not identified from the summary page.'
  if (/\blung\b/i.test(headerAndSpecimen) && /\badenocarcinoma\b/i.test(header)) {
    suggestedTumourSlug = 'nsclc'
    tumourReason = 'Inferred from lung specimen and adenocarcinoma diagnosis; confirm the primary cancer type.'
  } else {
    const tumourTerms: Array<[RegExp, string]> = [
      [/\bovarian\b/i, 'ovarian'], [/\bbreast\b/i, 'breast'], [/\bcolorectal\b|\bcolon\b/i, 'colorectal'],
      [/\bprostate\b/i, 'prostate'], [/\bgastric\b|\bstomach\b/i, 'gastric'], [/\bpancrea(?:s|tic)\b/i, 'pancreatic'],
      [/\bmelanoma\b/i, 'melanoma'], [/\bthyroid\b/i, 'thyroid'], [/\bcholangiocarcinoma\b|\bbile duct\b/i, 'cholangiocarcinoma'],
    ]
    const found = tumourTerms.find(([pattern]) => pattern.test(headerAndSpecimen))
    if (found) {
      suggestedTumourSlug = found[1]
      tumourReason = 'Inferred from report heading or specimen; confirm the primary cancer type.'
    }
  }

  let section: ReportFinding['section'] | null = null
  const findings: ReportFinding[] = []
  for (const line of firstPage) {
    if (/Somatic\s*-\s*Potentially Actionable/i.test(line)) { section = 'Somatic — potentially actionable'; continue }
    if (/Somatic\s*-\s*Biologically Relevant/i.test(line)) { section = null; continue }
    if (/Germline\s*-\s*Pathogenic\s*\/\s*Likely Pathogenic/i.test(line)) { section = 'Germline — pathogenic or likely pathogenic'; continue }
    if (/Pertinent Negatives|IMMUNOTHERAPY MARKERS|I M M U N O T H E R A P Y/i.test(line)) { section = null; continue }
    if (!section) continue
    const parts = line.split('|').map((part) => part.trim())
    const geneIndex = parts.findIndex((part, index) => geneToken.test(part) && alterationToken.test(parts[index + 1] ?? ''))
    if (geneIndex >= 0) findings.push({ gene: parts[geneIndex], alteration: parts[geneIndex + 1], section, sourceLine: line })
  }

  const tmbLine = firstPage.find((line) => /\b\d+(?:\.\d+)?\s*m\s*\/\s*MB\b/i.test(line))
  const tmbMatch = tmbLine?.match(/\b(\d+(?:\.\d+)?)\s*m\s*\/\s*MB\b/i)
  const negativesIndex = firstPage.findIndex((line) => /Pertinent Negatives/i.test(line))
  const negativeText = negativesIndex >= 0 ? firstPage.slice(negativesIndex + 1, negativesIndex + 5).join(' ') : ''
  const negatives = [...new Set((negativeText.match(/\b(?:EGFR|BRAF|ALK|ROS1|RET|MET|ERBB2|HER2|KRAS|BRCA1|BRCA2)\b/g) ?? []))]
  const notes = [
    'The text layer does not reveal which MSI option is visually selected, so MSI is not inferred.',
    'Negative findings and variants of unknown significance are never used as positive matches.',
    'Stage, prior therapy, and other FDA indication conditions are not established by this extraction.',
  ]
  if (!findings.length) notes.unshift('No potentially actionable or pathogenic variant was extracted from the summary page.')
  return { format: /TEMPUS|xT/i.test(firstPage.join(' ')) ? 'Tempus xT-style summary' : 'PDF molecular report', suggestedTumourSlug, tumourReason, findings, tmb: tmbMatch ? Number(tmbMatch[1]) : null, negatives, notes }
}

export function matchFindingToCatalog(finding: ReportFinding, tumourSlug: string, biomarkers: Biomarker[]): Biomarker[] {
  const variant = finding.alteration.toUpperCase()
  const exactIds: string[] = []
  if (finding.gene === 'KRAS' && /\bG12C\b/.test(variant)) exactIds.push(`${tumourSlug}_kras_g12c`)
  if (finding.gene === 'EGFR' && (variant.includes('L858R') || /EXON\s*19.*(?:DEL|DELETION)/.test(variant))) exactIds.push('nsclc_egfr_sens')
  if (finding.gene === 'BRAF' && variant.includes('V600E')) exactIds.push(`${tumourSlug}_braf`)
  if (finding.gene === 'BRAF' && variant.includes('V600K') && tumourSlug === 'melanoma') exactIds.push('melanoma_braf')
  if (finding.gene === 'MET' && /EXON\s*14.*SKIP/.test(variant)) exactIds.push('nsclc_met_ex14')
  return biomarkers.filter((item) => item.tumourSlug === tumourSlug && exactIds.includes(item.id))
}
