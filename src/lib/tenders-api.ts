import { apiDownload, apiFetchBlob, apiRequest } from './api'
import { getAccessToken } from './auth'

export type PlaceholderItem = {
  key: string
  title: string
  hint: string
}

export type PerformanceLine = {
  projectName: string
  spec: string
  location: string
  client: string
  contact: string
  amountYuan: number
  summary: string
  note: string
  ongoing: boolean
  chargerRelated?: boolean
}

export type SlotFileInfo = {
  id?: string
  fileId?: string
  name: string
  fileName?: string
  sizeBytes: number
  fileType?: string
  kind?: 'image' | 'pdf' | 'file'
  performance?: PerformanceLine
}

export type SlotStatus = {
  key: string
  title: string
  hint: string
  fileCount: number
  files: SlotFileInfo[]
  docId?: string
  pinned?: boolean
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

export type DeviationLine = {
  seq: string
  requirement: string
  response: string
  deviation: string
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
  factoryRole: string
  attachQualifications: boolean
  includePlaceholders: boolean
  includeCommitment: boolean
  extraPlaceholders: PlaceholderItem[]
  requiredSlotKeys: string[]
  includeSlotKeys: string[]
  quoteTitle: string
  quoteTaxRate: number
  quoteSourceIncTax: number
  quoteSource: string
  quoteLines: QuoteLineIn[]
  deviationLines: DeviationLine[]
  performanceLines: PerformanceLine[]
  constructionPlan: string
  layoutPlan: string
  powerPlan: string
  omPlan: string
  schedulePlan: string
  techPlanNote: string
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

export type AttachmentMatchItem = {
  key: string
  title: string
  fileCount: number
  required?: boolean
  created?: boolean
}

export type AttachmentMatch = {
  matched: AttachmentMatchItem[]
  missingFiles: AttachmentMatchItem[]
  createdItems: AttachmentMatchItem[]
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
  attachmentMatch?: AttachmentMatch
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
  catalogSlots?: SlotStatus[]
  requiredSlotKeys?: string[]
  includeSlotKeys?: string[]
  attachmentMatch?: AttachmentMatch
  fileName: string
  charCount: number
  pageCount?: number
  ocrPages?: number
  ocrCapped?: boolean
  ocrMaxPages?: number
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

const FILE_ID_RE = /^([a-f0-9]{10,16})\.(png|jpe?g|webp|gif|bmp|pdf)$/i

export function resolveLibraryFileId(
  file: Pick<SlotFileInfo, 'id' | 'fileId' | 'fileName' | 'name'>,
): string {
  const direct = String(file.fileId || file.id || '').trim()
  if (direct) return direct
  const n = String(file.fileName || file.name || '').trim()
  const m = FILE_ID_RE.exec(n)
  return m?.[1] || ''
}

export function inferLibraryFileKind(
  file: Pick<SlotFileInfo, 'kind' | 'fileType' | 'fileName' | 'name'>,
): NonNullable<SlotFileInfo['kind']> {
  if (file.kind === 'image' || file.kind === 'pdf' || file.kind === 'file') return file.kind
  const raw = `${file.fileType || ''} ${file.fileName || ''} ${file.name || ''}`.toLowerCase()
  if (raw.includes('pdf')) return 'pdf'
  if (/\.(png|jpe?g|webp|gif|bmp)\b/.test(raw) || /\b(png|jpe?g|webp|gif|bmp)\b/.test(raw)) {
    return 'image'
  }
  return 'file'
}

export function tenderLibraryFilePath(
  docId: string,
  opts?: { thumb?: boolean; withToken?: boolean },
): string {
  const q = new URLSearchParams()
  if (opts?.thumb) q.set('thumb', '1')
  if (opts?.withToken) {
    const t = getAccessToken()
    if (t) q.set('access_token', t)
  }
  const qs = q.toString()
  return `/api/v1/tenders/library/files/${encodeURIComponent(docId)}${qs ? `?${qs}` : ''}`
}

export async function fetchTenderLibraryFile(
  docId: string,
  opts?: { thumb?: boolean },
): Promise<Blob> {
  return apiFetchBlob(tenderLibraryFilePath(docId, { thumb: opts?.thumb }), { token: token() })
}

export async function fetchTenderLibrary(): Promise<{
  slots: SlotStatus[]
  filledCount: number
  totalCount: number
  hint: string
  baseId?: string
}> {
  return apiRequest('/api/v1/tenders/library', { token: token() })
}

export async function createTenderLibraryItem(body: {
  title: string
  hint?: string
  key?: string
}): Promise<SlotStatus> {
  return apiRequest('/api/v1/tenders/library/items', {
    method: 'POST',
    token: token(),
    body,
  })
}

export async function updateTenderLibraryItem(
  key: string,
  body: { title?: string; hint?: string },
): Promise<SlotStatus> {
  return apiRequest(`/api/v1/tenders/library/items/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    token: token(),
    body,
  })
}

export async function deleteTenderLibraryItem(key: string): Promise<{ key: string; deleted: boolean }> {
  return apiRequest(`/api/v1/tenders/library/items/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    token: token(),
  })
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

export async function deleteTenderLibraryFile(docId: string): Promise<SlotStatus> {
  return apiRequest(`/api/v1/tenders/library/files/${encodeURIComponent(docId)}`, {
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

export async function regenerateTenderRecord(recordId: string): Promise<GenerateResult> {
  return apiRequest(`/api/v1/tenders/records/${encodeURIComponent(recordId)}/regenerate`, {
    method: 'POST',
    token: token(),
  })
}

export async function deleteTenderRecord(
  recordId: string,
): Promise<{ deleted: boolean; id: string; removedFiles: string[] }> {
  return apiRequest(`/api/v1/tenders/records/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    token: token(),
  })
}

export async function fetchTenderEditorConfig(
  fileName: string,
  downloadName: string,
  heightPx?: number,
  mode: 'edit' | 'view' = 'edit',
): Promise<TenderEditorConfig> {
  const q = new URLSearchParams({ download_name: downloadName, mode })
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
