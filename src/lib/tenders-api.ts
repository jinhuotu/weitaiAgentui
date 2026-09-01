import { apiDownload, apiRequest } from './api'
import { getAccessToken } from './auth'

export type PlaceholderItem = {
  key: string
  title: string
  hint: string
}

export type SlotFileInfo = {
  name: string
  sizeBytes: number
}

export type SlotStatus = {
  key: string
  title: string
  hint: string
  fileCount: number
  files: SlotFileInfo[]
}

export type QuoteLineIn = {
  seq: string
  name: string
  spec: string
  unit: string
  qty: number
  unitPrice: number
  amount: number
}

export type BidBrief = {
  projectName: string
  tenderer: string
  bidContent: string
  quality: string
  deliveryDays: number
  warrantyYears: number
  bidValidityDays: number
  bidPriceYuan: number
  prepaidPct: number
  arrivalPct: number
  settlementPct: number
  warrantyPct: number
  bidDate: string
  bidderName: string
  bidderNature: string
  bidderAddress: string
  bidderWebsite: string
  bidderPhone: string
  bidderFax: string
  bidderPostcode: string
  bidderEmail: string
  foundedDate: string
  businessTerm: string
  legalPersonName: string
  legalPersonGender: string
  legalPersonAge: string
  legalPersonTitle: string
  legalPersonIdNo: string
  agentName: string
  agentIdNo: string
  agentAuthUntil: string
  trafficFeeNote: string
  extraNote: string
  attachQualifications: boolean
  includePlaceholders: boolean
  includeCommitment: boolean
  extraPlaceholders: PlaceholderItem[]
  quoteTitle: string
  quoteTaxRate: number
  quoteSourceIncTax: number
  quoteSource: string
  quoteLines: QuoteLineIn[]
}

export type QualificationStatus = {
  found: boolean
  pathHint: string
  sizeBytes: number
}

export type TenderDefaults = BidBrief & {
  qualification: QualificationStatus
  slots: SlotStatus[]
}

export type GenerateResult = {
  id?: string
  projectName?: string
  tenderer?: string
  bidPriceYuan?: number
  legalPersonName?: string
  docxFile: string
  pdfFile: string | null
  downloadName: string
  pdfDownloadName: string | null
  warnings: string[]
  username?: string
  createdAt?: number
  docxAvailable?: boolean
  pdfAvailable?: boolean
}

export type TenderRecordItem = {
  id: string
  projectName: string
  tenderer: string
  bidPriceYuan: number
  legalPersonName: string
  docxFile: string
  pdfFile: string | null
  downloadName: string
  pdfDownloadName: string | null
  warnings: string[]
  username: string
  createdAt: number
  docxAvailable: boolean
  pdfAvailable: boolean
  brief?: BidBrief
}

export type TenderEditorConfig = {
  documentServerUrl: string
  config: Record<string, unknown>
}

export type ParseInvitationResult = {
  brief: BidBrief
  filledKeys: string[]
  notes: string[]
  placeholders: PlaceholderItem[]
  slots?: SlotStatus[]
  fileName: string
  charCount: number
  preview: string
  knowledgeHits: { name?: string; docId?: string }[]
  quoteFileName?: string | null
}

function token(): string {
  const t = getAccessToken()
  if (!t) throw new Error('请先登录')
  return t
}

export async function fetchTenderDefaults(): Promise<TenderDefaults> {
  return apiRequest<TenderDefaults>('/api/v1/tenders/defaults', { token: token() })
}

export async function fetchTenderLibrary(): Promise<{
  slots: SlotStatus[]
  filledCount: number
  totalCount: number
  hint: string
}> {
  return apiRequest('/api/v1/tenders/library', { token: token() })
}

export async function fetchTenderSlots(extras?: PlaceholderItem[]): Promise<SlotStatus[]> {
  const q =
    extras && extras.length
      ? `?extras=${encodeURIComponent(JSON.stringify(extras))}`
      : ''
  const data = await apiRequest<{ slots: SlotStatus[] }>(`/api/v1/tenders/slots${q}`, {
    token: token(),
  })
  return data.slots || []
}

export async function uploadTenderSlot(
  key: string,
  file: File,
  options: { replace?: boolean } = {},
): Promise<SlotStatus & { fileName: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('replace', options.replace === false ? 'false' : 'true')
  return apiRequest(`/api/v1/tenders/slots/${encodeURIComponent(key)}`, {
    method: 'POST',
    token: token(),
    body: form,
  })
}

export async function clearTenderSlot(key: string): Promise<SlotStatus> {
  return apiRequest(`/api/v1/tenders/slots/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    token: token(),
  })
}

export async function parseTenderInvitation(
  file: File,
  options: { kbIds?: string[]; current?: BidBrief; quoteFile?: File | null } = {},
): Promise<ParseInvitationResult> {
  const form = new FormData()
  form.append('file', file)
  if (options.quoteFile) {
    form.append('quoteFile', options.quoteFile)
  }
  if (options.kbIds?.length) {
    form.append('kbIds', JSON.stringify(options.kbIds))
  }
  if (options.current) {
    form.append('current', JSON.stringify(options.current))
  }
  return apiRequest<ParseInvitationResult>('/api/v1/tenders/parse-invitation', {
    method: 'POST',
    token: token(),
    body: form,
  })
}

export async function generateTender(body: BidBrief): Promise<GenerateResult> {
  return apiRequest<GenerateResult>('/api/v1/tenders/generate', {
    method: 'POST',
    token: token(),
    body,
  })
}

export async function fetchTenderRecords(params?: {
  q?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; items: TenderRecordItem[] }> {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.offset != null) q.set('offset', String(params.offset))
  const qs = q.toString()
  return apiRequest(`/api/v1/tenders/records${qs ? `?${qs}` : ''}`, { token: token() })
}

export async function fetchTenderRecord(recordId: string): Promise<TenderRecordItem> {
  return apiRequest(`/api/v1/tenders/records/${encodeURIComponent(recordId)}`, {
    token: token(),
  })
}

export async function fetchTenderEditorConfig(
  fileName: string,
  downloadName: string,
  heightPx?: number,
): Promise<TenderEditorConfig> {
  const q = new URLSearchParams({ download_name: downloadName })
  if (heightPx && heightPx >= 400) {
    q.set('height', String(Math.round(heightPx)))
  }
  return apiRequest<TenderEditorConfig>(
    `/api/v1/tenders/files/${encodeURIComponent(fileName)}/editor-config?${q}`,
    { token: token() },
  )
}

export async function downloadTenderFile(fileName: string, downloadName: string): Promise<void> {
  const q = new URLSearchParams({ download_name: downloadName })
  await apiDownload(`/api/v1/tenders/files/${encodeURIComponent(fileName)}?${q}`, {
    token: token(),
    fallbackName: downloadName,
  })
}
