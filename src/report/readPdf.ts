import { parseTempusSummary, type ParsedTempusReport } from './parseTempus'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export async function readTempusPdf(file: File): Promise<ParsedTempusReport> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a PDF under 20 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('This file is not a PDF.')
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: bytes })
  const pdf = await task.promise
  try {
    const page = await pdf.getPage(1)
    const content = await page.getTextContent()
    const items = content.items.filter((item): item is typeof item & { str: string; transform: number[] } => 'str' in item && 'transform' in item && Boolean(item.str.trim()))
      .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x)
    const grouped: Array<{ y: number; items: typeof items }> = []
    for (const item of items) {
      let line = grouped.find((candidate) => Math.abs(candidate.y - item.y) < 1.4)
      if (!line) { line = { y: item.y, items: [] }; grouped.push(line) }
      line.items.push(item)
    }
    const lines = grouped.map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' | '))
    if (lines.join(' ').trim().length < 40) throw new Error('No readable text was found on the first page. Scanned PDFs need OCR or manual selection.')
    return parseTempusSummary(lines)
  } finally {
    await task.destroy()
  }
}
