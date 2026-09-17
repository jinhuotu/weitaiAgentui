import { apiDownload, apiRequest } from './api'
import { getAccessToken } from './auth'

export type QuoteLine = {
  seq: string
  code: string
  name: string
  spec: string
  unit: string
  qty: number
  unitPrice: number
  amount: number
  source: string
  matchName: string
  note: string
}

export type QuoteRecognizeResult = {
  projectName: string
  lines: QuoteLine[]
  warnings: string[]
  catalogCount: number
  unmatched: number
  baseId?: string
  baseName?: string
}

export type QuoteGenerateResult = {
  id?: string
  xlsxFile: string
  downloadName: string
  totalExTax: number
  totalIncTax: number
  unmatched: number
  lineCount: number
}

export type QuoteRecordItem = {
  id: string
  projectName: string
  note: string
  baseId: string
  baseName: string
  taxRate: number
  totalExTax: number
  totalIncTax: number
  unmatched: number
  lineCount: number
  xlsxFile: string
  downloadName: string
  xlsxAvailable: boolean
  username: string
  createdAt: number
  lines?: QuoteLine[]
}

function token() {
  const t = getAccessToken()
  if (!t) throw new Error('请先登录')
  return t
}

export function emptyQuoteLine(): QuoteLine {
  return {
    seq: '',
    code: '',
    name: '',
    spec: '',
    unit: '项',
    qty: 1,
    unitPrice: 0,
    amount: 0,
    source: 'manual',
    matchName: '',
    note: '',
  }
}

export function lineAmount(row: QuoteLine) {
  const qty = Number(row.qty) || 0
  const price = Number(row.unitPrice) || 0
  return Math.round(qty * price * 100) / 100
}

export async function recognizeQuote(input: {
  files: File[]
  baseId: string
  note?: string
  projectName?: string
}): Promise<QuoteRecognizeResult> {
  const form = new FormData()
  for (const f of input.files) form.append('files', f)
  form.append('baseId', input.baseId)
  if (input.note) form.append('note', input.note)
  if (input.projectName) form.append('projectName', input.projectName)
  return apiRequest<QuoteRecognizeResult>('/api/v1/quotes/recognize', {
    method: 'POST',
    token: token(),
    body: form,
  })
}

export async function generateQuote(body: {
  projectName: string
  note?: string
  taxRate?: number
  baseId?: string
  baseName?: string
  lines: QuoteLine[]
}): Promise<QuoteGenerateResult> {
  return apiRequest<QuoteGenerateResult>('/api/v1/quotes/generate', {
    method: 'POST',
    token: token(),
    body,
  })
}

export async function downloadQuoteFile(fileName: string, downloadName: string): Promise<void> {
  const q = new URLSearchParams({ download_name: downloadName })
  await apiDownload(`/api/v1/quotes/files/${encodeURIComponent(fileName)}?${q}`, {
    token: token(),
    fallbackName: downloadName,
  })
}

export async function fetchQuoteRecords(params?: {
  q?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; items: QuoteRecordItem[] }> {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  const suffix = q.toString() ? `?${q.toString()}` : ''
  return apiRequest(`/api/v1/quotes/records${suffix}`, { token: token() })
}

export async function fetchQuoteRecord(recordId: string): Promise<QuoteRecordItem> {
  return apiRequest(`/api/v1/quotes/records/${encodeURIComponent(recordId)}`, {
    token: token(),
  })
}

export async function exportQuoteRecord(recordId: string): Promise<QuoteRecordItem> {
  return apiRequest(`/api/v1/quotes/records/${encodeURIComponent(recordId)}/export`, {
    method: 'POST',
    token: token(),
  })
}

export async function deleteQuoteRecord(recordId: string): Promise<{ deleted: boolean; id: string }> {
  return apiRequest(`/api/v1/quotes/records/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    token: token(),
  })
}

export async function clearMineQuoteRecords(): Promise<{ deleted: number; ids: string[] }> {
  return apiRequest('/api/v1/quotes/records/clear-mine', {
    method: 'POST',
    token: token(),
  })
}
