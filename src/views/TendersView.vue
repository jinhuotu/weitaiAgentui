<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileUp,
  FolderOpen,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Sparkles,
  TriangleAlert,
  Upload,
  ImagePlus,
} from 'lucide-vue-next'
import { PageHeader, Panel } from '@/components/ui-kit'
import AppAlertDialog from '@/components/ui/AppAlertDialog.vue'
import { fmtSize, KB_UPLOAD_MAX_BYTES } from '@/lib/read-file-smart'
import { ApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'
import {
  clearTenderSlot,
  deleteTenderRecord,
  downloadTenderFile,
  fetchTenderDefaults,
  fetchTenderLibrary,
  fetchTenderRecord,
  fetchTenderRecords,
  fetchTenderSlots,
  generateTender,
  parseTenderInvitation,
  regenerateTenderRecord,
  uploadTenderSlot,
  type BidBrief,
  type DeviationLine,
  type GenerateResult,
  type AttachmentMatch,
  type AttachmentMatchItem,
  type PerformanceLine,
  type QualificationStatus,
  type SlotFileInfo,
  type SlotStatus,
  type TenderRecordItem,
} from '@/lib/tenders-api'
import TenderDocEditor from '@/components/tenders/TenderDocEditor.vue'

function emptyBrief(): BidBrief {
  return {
    projectName: '',
    tenderer: '',
    bidContent: '',
    quality: '合格',
    deliveryDays: 30,
    warrantyYears: 2,
    bidValidityDays: 60,
    bidPriceYuan: 0,
    prepaidPct: 30,
    arrivalPct: 50,
    settlementPct: 17,
    warrantyPct: 3,
    bidDate: new Date().toISOString().slice(0, 10),
    bidderName: '河南伟泰光电科技有限公司',
    bidderNature: '有限责任公司',
    bidderAddress:
      '河南省郑州市高新区开发区梧桐街与红松路交叉口东南角远大产业园区内6号楼三层',
    bidderWebsite: '',
    bidderPhone: '17630567052',
    bidderFax: '',
    bidderPostcode: '',
    bidderEmail: 'gzwceo@163.com',
    foundedDate: '2017年07月',
    businessTerm: '长期',
    legalPersonName: '张朝文',
    legalPersonGender: '男',
    legalPersonAge: '28',
    legalPersonTitle: '执行董事',
    legalPersonIdNo: '410521199802104053',
    agentName: '',
    agentIdNo: '',
    agentAuthUntil: '',
    trafficFeeNote: '',
    extraNote: '',
    factoryRole: '',
    attachQualifications: false,
    includePlaceholders: true,
    includeCommitment: true,
    extraPlaceholders: [],
    requiredSlotKeys: [],
    includeSlotKeys: [],
    quoteTitle: '',
    quoteTaxRate: 0.13,
    quoteSourceIncTax: 0,
    quoteSource: '',
    quoteLines: [],
    deviationLines: [],
    performanceLines: [],
    constructionPlan: '',
    layoutPlan: '',
    powerPlan: '',
    omPlan: '',
    schedulePlan: '',
    techPlanNote: '',
  }
}

function emptyDeviationLine(): DeviationLine {
  return { seq: '', requirement: '', response: '', deviation: '无偏差' }
}

function emptyPerformanceLine(): PerformanceLine {
  return {
    projectName: '',
    spec: '',
    location: '',
    client: '',
    contact: '',
    amountYuan: 0,
    summary: '',
    note: '',
    ongoing: false,
    chargerRelated: false,
  }
}

/** 本公司固定信息：接口/识别返回的空字符串不得覆盖这些默认值 */
const COMPANY_DEFAULT_KEYS = [
  'bidderName',
  'bidderNature',
  'bidderAddress',
  'bidderWebsite',
  'bidderPhone',
  'bidderFax',
  'bidderPostcode',
  'bidderEmail',
  'foundedDate',
  'businessTerm',
  'legalPersonName',
  'legalPersonGender',
  'legalPersonAge',
  'legalPersonTitle',
  'legalPersonIdNo',
] as const satisfies readonly (keyof BidBrief)[]

function ensureCompanyDefaults(target: BidBrief) {
  const defaults = emptyBrief()
  for (const key of COMPANY_DEFAULT_KEYS) {
    const cur = target[key]
    if (typeof cur === 'string' && !cur.trim()) {
      ;(target as Record<string, unknown>)[key] = defaults[key]
    }
  }
}

/** 合并 brief：空字符串不覆盖已有公司默认；其它字段照常写入 */
function mergeBriefIntoForm(brief: Partial<BidBrief>) {
  const defaults = emptyBrief()
  const next: Record<string, unknown> = { ...form }
  for (const [key, value] of Object.entries(brief)) {
    if (value === undefined) continue
    const isCompany = (COMPANY_DEFAULT_KEYS as readonly string[]).includes(key)
    if (isCompany && typeof value === 'string' && !value.trim()) {
      const cur = next[key]
      if (typeof cur === 'string' && cur.trim()) continue
      next[key] = (defaults as Record<string, unknown>)[key]
      continue
    }
    next[key] = value
  }
  Object.assign(form, next)
  ensureCompanyDefaults(form)
}

function isWeakPerfTitle(name: string): boolean {
  const compact = (name || '').replace(/\s+/g, '').toLowerCase()
  if (!compact) return true
  return /snipaste|screenshot|img_|dsc_|wechat|微信图片|屏幕截图|截图/.test(compact)
}

function absorbLibraryPerformance(files: SlotFileInfo[]) {
  form.performanceLines = form.performanceLines.filter((row) => !isWeakPerfTitle(row.projectName))
  const seen = new Set(
    form.performanceLines
      .map((row) => row.projectName.replace(/\s+/g, '').toLowerCase())
      .filter(Boolean),
  )
  for (const file of files) {
    const line = file.performance
    if (!line?.projectName || isWeakPerfTitle(line.projectName)) continue
    const key = line.projectName.replace(/\s+/g, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    form.performanceLines.push({ ...emptyPerformanceLine(), ...line })
  }
}

const router = useRouter()
const route = useRoute()
const loading = ref(true)
const generating = ref(false)
const parsing = ref(false)
const downloading = ref<'docx' | 'pdf' | null>(null)
const uploadingKey = ref<string | null>(null)
const error = ref('')
const qualification = ref<QualificationStatus | null>(null)
const result = ref<GenerateResult | null>(null)
const form = reactive<BidBrief>(emptyBrief())
const inviteFile = ref<File | null>(null)
const quoteFile = ref<File | null>(null)
const kbList = ref<KnowledgeBaseItem[]>([])
const selectedKbIds = ref<string[]>([])
const parseNotes = ref<string[]>([])
const attachmentMatch = ref<AttachmentMatch | null>(null)
const parseOcr = ref<{
  pageCount: number
  ocrPages: number
  ocrCapped: boolean
  ocrMaxPages: number
} | null>(null)
const slotStatuses = ref<SlotStatus[]>([])
const catalogSlots = ref<SlotStatus[]>([])
const techDrawingSlot = ref<SlotStatus>({
  key: 'tech_drawings',
  title: '实施方案图纸',
  hint: '本项目平面图、系统图或施工图。换标请覆盖，不要用其他项目图纸。',
  fileCount: 0,
  files: [],
})
const fileInput = ref<HTMLInputElement | null>(null)
const quoteInput = ref<HTMLInputElement | null>(null)
const slotFileInput = ref<HTMLInputElement | null>(null)
const pendingSlotKey = ref<string | null>(null)
const pendingSlotReplace = ref(true)
/** 识别后是否已跑过「识别并填表」 */
const hasParsed = ref(false)
/** 右侧资料库列表默认折叠为紧凑条 */
const slotsExpanded = ref(true)
/** 向导当前步骤 0=上传 1=填表生成 2=在线改稿 3=下载定稿 */
const currentStepIndex = ref(0)
/** 填写页切换商务标 / 技术标；生成时仍写入同一份 Word */
type BidVolume = 'business' | 'technical'
const activeVolume = ref<BidVolume>('business')
const volumeHint = ref('')
const maxStepReached = ref(0)
const previewFullscreen = ref(false)
/** 识别说明默认展开；每次重新识别后强制再展开 */
const parseNotesEpoch = ref(0)
const previewLayoutTick = ref(0)
const showRecords = ref(false)
const recordsLoading = ref(false)
const records = ref<TenderRecordItem[]>([])
const recordsTotal = ref(0)
const recordsQuery = ref('')
const openingRecordId = ref<string | null>(null)
const regeneratingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const confirmDeleteOpen = ref(false)
const pendingDeleteItem = ref<TenderRecordItem | null>(null)
const previewEditorMode = ref<'edit' | 'view'>('edit')
const loadingFormId = ref<string | null>(null)
const confirmGenerateOpen = ref(false)
const confirmGenerateMode = ref<'form' | 'record'>('form')
const pendingRegenItem = ref<TenderRecordItem | null>(null)

const paySum = computed(
  () => form.prepaidPct + form.arrivalPct + form.settlementPct + form.warrantyPct,
)

const parseRiskNoteCount = computed(
  () =>
    parseNotes.value.filter((n) => /废标|未解析|未找到|缺|失败|警告/.test(n)).length,
)

const parseNotesSummary = computed(() => {
  const total = parseNotes.value.length
  if (!total) return ''
  const risk = parseRiskNoteCount.value
  if (risk) return `共 ${total} 条说明，其中 ${risk} 条需注意`
  return `共 ${total} 条识别说明`
})

function noteTone(note: string) {
  if (/废标/.test(note)) return 'text-sulfur'
  if (/未解析|未找到|缺|失败/.test(note)) return 'text-sulfur/90'
  if (/已回填|已匹配|已就绪/.test(note)) return 'text-emerald-700 dark:text-emerald-400'
  return 'text-muted-foreground'
}

function isRiskNote(note: string) {
  return /废标|未解析|未找到|缺|失败/.test(note)
}

function isBlank(value: unknown) {
  return !String(value ?? '').trim()
}

const agentIdRequired = computed(() => !isBlank(form.agentName))
const hasAgent = computed(() => !isBlank(form.agentName) || !isBlank(form.agentIdNo))

function uniqueSlotKeys(keys: string[] | undefined) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of keys || []) {
    const key = String(raw || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

const effectiveRequiredKeys = computed(() => {
  let keys = uniqueSlotKeys(form.requiredSlotKeys)
  if (!keys.includes('id_legal')) keys = ['id_legal', ...keys]
  if (hasAgent.value) {
    if (!keys.includes('id_agent')) keys = [...keys, 'id_agent']
  } else {
    keys = keys.filter((k) => k !== 'id_agent')
  }
  return keys
})

const effectiveIncludeKeys = computed(() =>
  uniqueSlotKeys([...(form.includeSlotKeys || []), ...effectiveRequiredKeys.value]),
)

const missingMaterialTitles = computed(() => {
  const titles: string[] = []
  for (const slot of placeholderItems.value) {
    if (effectiveRequiredKeys.value.includes(slot.key) && !slot.fileCount) {
      titles.push(slot.title || '扫描件')
    }
  }
  return titles
})

const generateBlockers = computed(() => {
  const issues: string[] = []
  if (isBlank(form.projectName)) issues.push('项目名称')
  if (isBlank(form.tenderer)) issues.push('招标人')
  if (!(Number(form.bidPriceYuan) > 0)) issues.push('投标总价')
  if (isBlank(form.bidderName)) issues.push('投标人全称')
  if (isBlank(form.bidderAddress)) issues.push('地址')
  if (isBlank(form.foundedDate)) issues.push('成立日期')
  if (isBlank(form.bidderPhone)) issues.push('电话')
  if (isBlank(form.legalPersonName)) issues.push('法人姓名')
  if (isBlank(form.legalPersonAge)) issues.push('年龄')
  if (isBlank(form.legalPersonIdNo)) issues.push('法人身份证号')
  if (agentIdRequired.value && isBlank(form.agentIdNo)) issues.push('代理人身份证号')
  if (!form.quoteLines.some((row) => String(row.name || '').trim())) {
    issues.push('报价清单（请在本页上传工程量清单并点「识别清单」）')
  }
  return issues
})

const generateButtonDisabled = computed(
  () => generating.value || generateBlockers.value.length > 0,
)

const generateButtonTooltip = computed(() => {
  if (generating.value) return ''
  if (generateBlockers.value.length) {
    return `请先完善：${generateBlockers.value.join('、')}`
  }
  return ''
})

const HIGH_DISQUALIFY_KEYS = new Set(['id_legal', 'id_agent', 'bond', 'seal', 'finance', 'credit'])
const TECHNICAL_SLOT_KEYS = new Set(['product', 'tech_drawings'])
const TECH_DRAWING_KEY = 'tech_drawings'

function slotVolume(slot: SlotStatus): 'business' | 'technical' {
  if (TECHNICAL_SLOT_KEYS.has(slot.key)) return 'technical'
  if (HIGH_DISQUALIFY_KEYS.has(slot.key)) return 'business'
  if (/方案|布置|配电|运维|图纸|检测|3C|技术规格/.test(slot.title || '')) return 'technical'
  return 'business'
}

const technicalWarnings = computed(() => {
  const issues: string[] = []
  if (!form.deviationLines.some((row) => String(row.requirement || '').trim())) {
    issues.push('技术偏差表为空，不响应技术要求会大量扣分')
  }
  if (!String(form.techPlanNote || '').trim()) issues.push('实施方案文字描述未写')
  if (!techDrawingSlot.value.fileCount) issues.push('尚未上传实施方案图纸')
  if (!form.performanceLines.some((row) => String(row.projectName || '').trim())) {
    issues.push('类似业绩为空，资格评审可能扣分')
  }
  return issues
})

const softGenerateNotes = computed(() => {
  const notes: string[] = []
  if (missingMaterialTitles.value.length) {
    notes.push(`未上传资料将以虚线框占位：${missingMaterialTitles.value.join('、')}`)
  }
  notes.push(...technicalWarnings.value)
  return notes
})

const formStepNextLabel = computed(() => {
  if (generating.value) return '正在生成…'
  return result.value ? '重新生成并预览' : '生成并预览'
})

const confirmGenerateTitle = computed(() =>
  confirmGenerateMode.value === 'record' ? '另存为新记录' : '重新生成将另存新记录',
)

const confirmGenerateDescription = computed(() =>
  confirmGenerateMode.value === 'record'
    ? '将用该记录保存的表单和当前资料库附件再生成一份 Word，不会覆盖原来的文件。'
    : '将另存为一条新的生成记录。上次在预览里改过的 Word 不会自动合并进这次。',
)

const placeholderItems = computed((): SlotStatus[] => {
  const byKey = new Map<string, SlotStatus>()
  for (const slot of catalogSlots.value) {
    if (slot.key) byKey.set(slot.key, slot)
  }
  for (const slot of slotStatuses.value) {
    if (!slot.key) continue
    const prev = byKey.get(slot.key)
    byKey.set(slot.key, prev ? { ...prev, ...slot } : slot)
  }
  for (const extra of form.extraPlaceholders || []) {
    if (!extra.key || byKey.has(extra.key)) continue
    byKey.set(extra.key, {
      key: extra.key,
      title: extra.title,
      hint: extra.hint || '',
      fileCount: 0,
      files: [],
    })
  }
  const items: SlotStatus[] = []
  for (const key of effectiveIncludeKeys.value) {
    if (key === TECH_DRAWING_KEY) continue
    const slot = byKey.get(key)
    if (slot) items.push(slot)
  }
  return items
})

const optionalCatalogSlots = computed(() =>
  catalogSlots.value.filter(
    (slot) =>
      slot.key
      && slot.key !== TECH_DRAWING_KEY
      && !effectiveIncludeKeys.value.includes(slot.key),
  ),
)

const slotFilledCount = computed(
  () => placeholderItems.value.filter((s) => s.fileCount > 0).length,
)

const matchHasRows = computed(() => {
  const m = attachmentMatch.value
  if (!m) return false
  return m.matched.length + m.missingFiles.length + m.createdItems.length > 0
})

const workflowSteps = [
  { key: 'upload', label: '上传邀请书' },
  { key: 'form', label: '填商务/技术标' },
  { key: 'preview', label: '在线改稿' },
  { key: 'generate', label: '下载定稿' },
] as const

const activeWorkflowIndex = computed(() => currentStepIndex.value)

function goToStep(index: number) {
  if (index < 0 || index >= workflowSteps.length) return
  if (index <= maxStepReached.value) {
    if (index !== 2) setPreviewFullscreen(false)
    currentStepIndex.value = index
    error.value = ''
  }
}

function setPreviewFullscreen(on: boolean) {
  previewFullscreen.value = on
  document.body.style.overflow = on ? 'hidden' : ''
}

function togglePreviewFullscreen() {
  setPreviewFullscreen(!previewFullscreen.value)
}

function togglePreviewHints() {
  previewHintsOpen.value = !previewHintsOpen.value
  window.setTimeout(() => {
    previewLayoutTick.value += 1
  }, 0)
}

function onPreviewFullscreenKey(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (previewFullscreen.value) {
    ev.preventDefault()
    setPreviewFullscreen(false)
    return
  }
  if (showRecords.value) {
    ev.preventDefault()
    closeRecords()
  }
}

function advanceStep(index: number) {
  currentStepIndex.value = index
  maxStepReached.value = Math.max(maxStepReached.value, index)
}

async function selectVolume(volume: BidVolume) {
  activeVolume.value = volume
  volumeHint.value = ''
  if (showRecords.value) closeRecords()

  if (currentStepIndex.value === 0) {
    if (hasParsed.value) {
      advanceStep(1)
      await nextTick()
    } else if (volume === 'technical') {
      volumeHint.value =
        '请先上传邀请书并点「识别并继续」。技术标（偏差表、实施方案）在下一步填写；最终会生成一份同时包含商务标与技术标的 Word。'
    }
    return
  }

  if (currentStepIndex.value === 1) {
    await nextTick()
    // 只滚到卷内标题，避免把上方「识别说明」顶出视野
    document
      .getElementById(`tender-volume-${volume}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

const dragOverInvite = ref(false)
const dragOverDrawings = ref(false)

function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (file !== inviteFile.value) {
    hasParsed.value = false
    parseNotes.value = []
    parseOcr.value = null
    attachmentMatch.value = null
  }
  inviteFile.value = file
}

function onInviteDrop(ev: DragEvent) {
  ev.preventDefault()
  dragOverInvite.value = false
  const file = ev.dataTransfer?.files?.[0]
  if (file) {
    if (file !== inviteFile.value) {
      hasParsed.value = false
      parseNotes.value = []
      parseOcr.value = null
      attachmentMatch.value = null
    }
    inviteFile.value = file
  }
}

function mergeSlotStatus(payload: SlotStatus) {
  const next: SlotStatus = {
    key: payload.key,
    title: payload.title || payload.key,
    hint: payload.hint || '',
    fileCount: payload.fileCount ?? payload.files?.length ?? 0,
    files: payload.files || [],
    docId: payload.docId,
    pinned: payload.pinned,
  }
  const idx = slotStatuses.value.findIndex((s) => s.key === payload.key)
  if (idx >= 0) {
    const prev = slotStatuses.value[idx]
    slotStatuses.value.splice(idx, 1, {
      ...next,
      title: next.title || prev.title,
      hint: next.hint || prev.hint,
    })
  } else {
    slotStatuses.value.push(next)
  }
  if (payload.key === TECH_DRAWING_KEY) {
    techDrawingSlot.value = { ...techDrawingSlot.value, ...next }
  }
  const cidx = catalogSlots.value.findIndex((s) => s.key === payload.key)
  if (cidx >= 0) {
    const prev = catalogSlots.value[cidx]
    catalogSlots.value.splice(cidx, 1, {
      ...prev,
      ...next,
      title: next.title || prev.title,
      hint: next.hint || prev.hint,
    })
  }
  refreshAttachmentMatch()
}

function refreshAttachmentMatch() {
  const report = attachmentMatch.value
  if (!report) return
  const counts = new Map<string, number>()
  for (const slot of [...catalogSlots.value, ...slotStatuses.value]) {
    if (slot.key) counts.set(slot.key, slot.fileCount || 0)
  }
  const seen = new Set<string>()
  const matched: AttachmentMatchItem[] = []
  const missingFiles: AttachmentMatchItem[] = []
  const createdItems: AttachmentMatchItem[] = []
  for (const item of [...report.matched, ...report.missingFiles, ...report.createdItems]) {
    if (!item.key || seen.has(item.key)) continue
    seen.add(item.key)
    const fileCount = counts.has(item.key) ? counts.get(item.key)! : item.fileCount
    const next = { ...item, fileCount }
    if (fileCount > 0) matched.push({ ...next, created: false })
    else if (item.created) createdItems.push(next)
    else missingFiles.push(next)
  }
  attachmentMatch.value = { matched, missingFiles, createdItems }
}

function includeOptionalSlot(slot: SlotStatus) {
  if (!slot.key) return
  if (!form.includeSlotKeys.includes(slot.key)) {
    form.includeSlotKeys = [...form.includeSlotKeys, slot.key]
  }
  mergeSlotStatus(slot)
}

function excludeOptionalSlot(slot: SlotStatus) {
  if (!slot.key || effectiveRequiredKeys.value.includes(slot.key)) return
  form.includeSlotKeys = form.includeSlotKeys.filter((k) => k !== slot.key)
}

function isRequiredSlot(key: string) {
  return effectiveRequiredKeys.value.includes(key)
}

async function loadRecords() {
  if (!getAccessToken()) return
  recordsLoading.value = true
  try {
    const data = await fetchTenderRecords({
      q: recordsQuery.value.trim() || undefined,
      limit: 50,
    })
    records.value = data.items || []
    recordsTotal.value = data.total || 0
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '加载生成记录失败'
  } finally {
    recordsLoading.value = false
  }
}

function formatPrice(n: number) {
  const value = Number(n) || 0
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function formatRecordTime(ms: number) {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function closeRecords() {
  showRecords.value = false
}

function toggleRecords() {
  if (showRecords.value) {
    closeRecords()
    return
  }
  showRecords.value = true
  void loadRecords()
}

async function openRecordPreview(item: TenderRecordItem) {
  if (!item.docxAvailable || !item.docxFile) {
    error.value = '该记录的 Word 文件已丢失，无法预览'
    return
  }
  // 列表项已有文件名，不必再拉详情（含 brief），直接进只读预览更快
  openingRecordId.value = item.id
  error.value = ''
  try {
    result.value = {
      id: item.id,
      projectName: item.projectName,
      tenderer: item.tenderer,
      bidPriceYuan: item.bidPriceYuan,
      legalPersonName: item.legalPersonName,
      docxFile: item.docxFile,
      pdfFile: item.pdfFile,
      downloadName: item.downloadName || `${item.projectName || 'bid'}.docx`,
      pdfDownloadName: item.pdfDownloadName,
      warnings: item.warnings || [],
      username: item.username,
      createdAt: item.createdAt,
      docxAvailable: item.docxAvailable,
      pdfAvailable: item.pdfAvailable,
    }
    previewEditorMode.value = 'view'
    closeRecords()
    setPreviewFullscreen(false)
    advanceStep(2)
    return true
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '打开记录失败'
    return false
  } finally {
    openingRecordId.value = null
  }
}

async function openRecordFromQuery() {
  const id = String(route.query.record || '').trim()
  if (!id || !getAccessToken()) return
  openingRecordId.value = id
  error.value = ''
  try {
    // 深链仍需详情（列表可能未加载）
    const detail = await fetchTenderRecord(id)
    if (!detail.docxAvailable || !detail.docxFile) {
      error.value = '该记录的 Word 文件已丢失，无法预览'
      return
    }
    result.value = {
      id: detail.id,
      projectName: detail.projectName,
      tenderer: detail.tenderer,
      bidPriceYuan: detail.bidPriceYuan,
      legalPersonName: detail.legalPersonName,
      docxFile: detail.docxFile,
      pdfFile: detail.pdfFile,
      downloadName: detail.downloadName,
      pdfDownloadName: detail.pdfDownloadName,
      warnings: detail.warnings || [],
      username: detail.username,
      createdAt: detail.createdAt,
      docxAvailable: detail.docxAvailable,
      pdfAvailable: detail.pdfAvailable,
    }
    previewEditorMode.value = 'view'
    closeRecords()
    setPreviewFullscreen(false)
    advanceStep(2)
    if (route.query.record) {
      const nextQuery = { ...route.query }
      delete nextQuery.record
      await router.replace({ path: '/tenders', query: nextQuery })
    }
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '打开记录失败'
  } finally {
    openingRecordId.value = null
  }
}

async function refreshTechDrawings() {
  try {
    const slots = await fetchTenderSlots([
      {
        key: TECH_DRAWING_KEY,
        title: techDrawingSlot.value.title,
        hint: techDrawingSlot.value.hint,
      },
    ])
    const row = slots.find((s) => s.key === TECH_DRAWING_KEY)
    if (row) {
      techDrawingSlot.value = {
        ...techDrawingSlot.value,
        ...row,
        title: row.title || techDrawingSlot.value.title,
        hint: row.hint || techDrawingSlot.value.hint,
      }
    }
  } catch {
    /* 图纸槽位读取失败不打断表单 */
  }
}

async function refreshLibrary() {
  try {
    const library = await fetchTenderLibrary()
    if (library?.slots?.length) {
      catalogSlots.value = library.slots
      slotStatuses.value = library.slots
    }
  } catch {
    /* 资料库刷新失败不打断表单载入 */
  }
}

function hydrateTechPlanNote(brief: BidBrief): string {
  const note = String(brief.techPlanNote || '').trim()
  if (note) return note
  return [
    brief.constructionPlan,
    brief.layoutPlan,
    brief.powerPlan,
    brief.omPlan,
    brief.schedulePlan,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

function applyBriefToForm(brief: BidBrief) {
  Object.assign(form, emptyBrief())
  mergeBriefIntoForm(brief)
  form.techPlanNote = hydrateTechPlanNote(form)
  if (!Array.isArray(form.quoteLines)) form.quoteLines = []
  if (!Array.isArray(form.deviationLines)) form.deviationLines = []
  if (!Array.isArray(form.performanceLines)) form.performanceLines = []
  if (!Array.isArray(form.extraPlaceholders)) form.extraPlaceholders = []
  if (!Array.isArray(form.requiredSlotKeys)) form.requiredSlotKeys = []
  if (!Array.isArray(form.includeSlotKeys)) form.includeSlotKeys = []
}

async function loadRecordForm(item: TenderRecordItem) {
  loadingFormId.value = item.id
  error.value = ''
  try {
    const detail = await fetchTenderRecord(item.id)
    if (!detail.brief) {
      error.value = '该记录没有保存表单，无法载入'
      return
    }
    applyBriefToForm(detail.brief)
    hasParsed.value = true
    closeRecords()
    setPreviewFullscreen(false)
    advanceStep(1)
    await refreshLibrary()
    await refreshTechDrawings()
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '载入表单失败'
  } finally {
    loadingFormId.value = null
  }
}

async function regenerateRecord(item: TenderRecordItem) {
  regeneratingId.value = item.id
  error.value = ''
  generating.value = true
  try {
    result.value = await regenerateTenderRecord(item.id)
    previewEditorMode.value = 'view'
    closeRecords()
    setPreviewFullscreen(false)
    advanceStep(2)
    await loadRecords()
    await refreshLibrary()
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '重新生成失败'
  } finally {
    regeneratingId.value = null
    generating.value = false
  }
}

function askDeleteRecord(item: TenderRecordItem) {
  pendingDeleteItem.value = item
  confirmDeleteOpen.value = true
}

function onConfirmDeleteOpen(open: boolean) {
  confirmDeleteOpen.value = open
  if (!open && !deletingId.value) {
    pendingDeleteItem.value = null
  }
}

async function confirmDeleteRecord() {
  const item = pendingDeleteItem.value
  if (!item) {
    confirmDeleteOpen.value = false
    return
  }
  deletingId.value = item.id
  error.value = ''
  try {
    await deleteTenderRecord(item.id)
    records.value = records.value.filter((r) => r.id !== item.id)
    recordsTotal.value = Math.max(0, recordsTotal.value - 1)
    if (result.value?.id === item.id) {
      result.value = null
      if (currentStepIndex.value >= 2) {
        currentStepIndex.value = 1
      }
    }
    confirmDeleteOpen.value = false
    pendingDeleteItem.value = null
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '删除记录失败'
  } finally {
    deletingId.value = null
  }
}

async function downloadRecord(item: TenderRecordItem, kind: 'docx' | 'pdf') {
  const file = kind === 'docx' ? item.docxFile : item.pdfFile
  const name = kind === 'docx' ? item.downloadName : item.pdfDownloadName
  if (!file || !name) return
  if (kind === 'docx' && !item.docxAvailable) {
    error.value = '该记录的 Word 文件已丢失'
    return
  }
  downloading.value = kind
  error.value = ''
  try {
    await downloadTenderFile(file, name)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = null
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onPreviewFullscreenKey)
  if (!getAccessToken()) {
    error.value = '请先登录'
    loading.value = false
    return
  }
  try {
    const [data, bases, library] = await Promise.all([
      fetchTenderDefaults(),
      listKnowledgeBases({ access: 'use' }).catch(() => [] as KnowledgeBaseItem[]),
      fetchTenderLibrary().catch(() => null),
    ])
    qualification.value = data.qualification
    catalogSlots.value = library?.slots?.length ? library.slots : data.slots || []
    slotStatuses.value = catalogSlots.value
    kbList.value = bases
    const { qualification: _q, slots: _s, ...rest } = data as TenderDefaultsLoose
    mergeBriefIntoForm(rest as Partial<BidBrief>)
    if (!Array.isArray(form.extraPlaceholders)) form.extraPlaceholders = []
    if (!Array.isArray(form.requiredSlotKeys)) form.requiredSlotKeys = []
    if (!Array.isArray(form.includeSlotKeys)) form.includeSlotKeys = []
    if (!Array.isArray(form.quoteLines)) form.quoteLines = []
    if (!Array.isArray(form.deviationLines)) form.deviationLines = []
    if (!Array.isArray(form.performanceLines)) form.performanceLines = []
    if (form.includePlaceholders == null) form.includePlaceholders = true
    if (form.includeCommitment == null) form.includeCommitment = true
    form.techPlanNote = hydrateTechPlanNote(form)
    void loadRecords()
    void refreshTechDrawings()
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '加载默认值失败'
  } finally {
    loading.value = false
  }
  void openRecordFromQuery()
})

watch(
  () => String(route.query.record || ''),
  (id, prev) => {
    if (id && id !== prev && !loading.value) void openRecordFromQuery()
  },
)

watch(previewFullscreen, (on) => {
  if (on) previewHintsOpen.value = false
  window.setTimeout(() => {
    previewLayoutTick.value += 1
  }, 0)
})

watch(
  () => result.value?.docxFile,
  () => {
    previewHintsOpen.value = false
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPreviewFullscreenKey)
  setPreviewFullscreen(false)
})

type TenderDefaultsLoose = BidBrief & {
  qualification?: QualificationStatus
  slots?: SlotStatus[]
}

function onPickQuote(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (file !== quoteFile.value) {
    // 补传/更换清单后必须重新识别，否则「识别并继续」会因 hasParsed 跳过解析
    hasParsed.value = false
  }
  quoteFile.value = file
}

async function reparseQuoteFromForm() {
  if (!inviteFile.value) {
    error.value = '邀请书文件已失效，请返回上一步重新上传邀请书与报价清单'
    return
  }
  if (!quoteFile.value) {
    error.value = '请先选择报价清单 Excel / Word'
    return
  }
  error.value = ''
  await onParseInvitation()
  if (!form.quoteLines.some((row) => String(row.name || '').trim())) {
    error.value =
      error.value ||
      '未能从清单解析出报价行。请确认 Excel 含「设备/名称」与数量或单价列，或返回上一步更换文件后重试'
  }
}

function toggleKb(id: string) {
  selectedKbIds.value = selectedKbIds.value.includes(id)
    ? selectedKbIds.value.filter((x) => x !== id)
    : [...selectedKbIds.value, id]
}

function addDeviationRow() {
  form.deviationLines.push({
    ...emptyDeviationLine(),
    seq: String(form.deviationLines.length + 1),
  })
}

function removeDeviationRow(index: number) {
  form.deviationLines.splice(index, 1)
}

function fillDeviationFromQuote(opts?: { silent?: boolean }) {
  const rows = form.quoteLines
    .map((row, i) => {
      const name = String(row.name || '').trim()
      const spec = String(row.spec || '').trim()
      if (!name && !spec) return null
      const requirement = name && spec ? `${name}\n${spec}` : name || spec
      const response =
        name && spec
          ? `我司所投${name}：\n${spec}\n含供货、安装、调试，安装费已含在综合单价内。`
          : `我司所投${name || '产品'}：${spec || name}，含供货、安装、调试，安装费已含在综合单价内。`
      return {
        seq: String(i + 1),
        requirement,
        response,
        deviation: '无偏差',
      } satisfies DeviationLine
    })
    .filter((row): row is DeviationLine => row != null)
  if (!rows.length) {
    if (!opts?.silent) error.value = '请先识别报价清单，再生成偏差表'
    return
  }
  form.deviationLines = rows
}

const quoteSpecFilledCount = computed(
  () => form.quoteLines.filter((r) => String(r.spec || '').trim()).length,
)

function addPerformanceRow() {
  form.performanceLines.push({ ...emptyPerformanceLine() })
}

function removePerformanceRow(index: number) {
  form.performanceLines.splice(index, 1)
}

const quoteQtySum = computed(() =>
  form.quoteLines.reduce((s, r) => s + (Number(r.qty) || 0), 0),
)
const quoteAmountSum = computed(() =>
  form.quoteLines.reduce((s, r) => s + (Number(r.amount) || 0), 0),
)

async function onParseInvitation() {
  if (!inviteFile.value) {
    error.value = '请先选择投标邀请书或招标文件'
    return
  }
  error.value = ''
  parsing.value = true
  try {
    const data = await parseTenderInvitation(inviteFile.value, {
      kbIds: selectedKbIds.value,
      current: { ...form },
      quoteFile: quoteFile.value,
    })
    mergeBriefIntoForm(data.brief)
    form.techPlanNote = hydrateTechPlanNote(form)
    if (!Array.isArray(form.extraPlaceholders)) form.extraPlaceholders = []
    if (!Array.isArray(form.requiredSlotKeys)) form.requiredSlotKeys = data.requiredSlotKeys || []
    if (!Array.isArray(form.includeSlotKeys)) form.includeSlotKeys = data.includeSlotKeys || []
    if (!Array.isArray(form.quoteLines)) form.quoteLines = []
    if (!Array.isArray(form.deviationLines)) form.deviationLines = []
    if (!Array.isArray(form.performanceLines)) form.performanceLines = []
    parseNotes.value = data.notes || []
    parseNotesEpoch.value += 1
    attachmentMatch.value = data.attachmentMatch || null
    parseOcr.value = {
      pageCount: data.pageCount || 0,
      ocrPages: data.ocrPages || 0,
      ocrCapped: Boolean(data.ocrCapped),
      ocrMaxPages: data.ocrMaxPages || 0,
    }
    if (data.catalogSlots?.length) catalogSlots.value = data.catalogSlots
    if (data.slots?.length) slotStatuses.value = data.slots
    if (!form.deviationLines.length && form.quoteLines.length) {
      fillDeviationFromQuote({ silent: true })
    } else if (form.quoteLines.length && quoteSpecFilledCount.value) {
      // 重新识别带出技术参数后，刷新偏差表明细
      const thin = form.deviationLines.every(
        (d) => !String(d.requirement || '').includes('\n') && String(d.requirement || '').length < 40,
      )
      if (thin) fillDeviationFromQuote({ silent: true })
    }
    hasParsed.value = true
    volumeHint.value = ''
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '识别邀请书失败'
  } finally {
    parsing.value = false
  }
}

function pickSlotFile(slot: SlotStatus, replace: boolean) {
  if (!slot.key) {
    error.value = '该项缺少 key，无法上传'
    return
  }
  pendingSlotKey.value = slot.key
  pendingSlotReplace.value = replace
  slotFileInput.value?.click()
}

async function onSlotFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  const key = pendingSlotKey.value
  const replace = pendingSlotReplace.value
  input.value = ''
  pendingSlotKey.value = null
  if (!files.length || !key) return
  error.value = ''
  uploadingKey.value = key
  try {
    let last: SlotStatus | null = null
    for (let i = 0; i < files.length; i++) {
      const data = await uploadTenderSlot(key, files[i], {
        replace: replace && i === 0,
      })
      last = {
        key,
        title: data.title || slotStatuses.value.find((s) => s.key === key)?.title || key,
        hint: data.hint || slotStatuses.value.find((s) => s.key === key)?.hint || '',
        fileCount: data.fileCount,
        files: data.files || [],
      }
    }
    if (last) mergeSlotStatus(last)
    if (key === TECH_DRAWING_KEY && last) {
      techDrawingSlot.value = { ...techDrawingSlot.value, ...last }
    }
    if (key === 'perf' && last?.files?.length) absorbLibraryPerformance(last.files)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '上传失败'
  } finally {
    uploadingKey.value = null
  }
}

function onDrawingsDrop(ev: DragEvent) {
  ev.preventDefault()
  dragOverDrawings.value = false
  const files = Array.from(ev.dataTransfer?.files || [])
  if (!files.length) return
  void (async () => {
    pendingSlotKey.value = TECH_DRAWING_KEY
    pendingSlotReplace.value = !techDrawingSlot.value.fileCount
    error.value = ''
    uploadingKey.value = TECH_DRAWING_KEY
    try {
      let last: SlotStatus | null = null
      for (let i = 0; i < files.length; i++) {
        const data = await uploadTenderSlot(TECH_DRAWING_KEY, files[i], {
          replace: !techDrawingSlot.value.fileCount && i === 0,
        })
        last = {
          key: TECH_DRAWING_KEY,
          title: data.title || techDrawingSlot.value.title,
          hint: data.hint || techDrawingSlot.value.hint,
          fileCount: data.fileCount,
          files: data.files || [],
        }
      }
      if (last) mergeSlotStatus(last)
    } catch (e) {
      error.value = e instanceof ApiError || e instanceof Error ? e.message : '上传失败'
    } finally {
      uploadingKey.value = null
      pendingSlotKey.value = null
    }
  })()
}

async function onClearSlot(slot: SlotStatus) {
  if (!slot.key || !slot.fileCount) return
  error.value = ''
  uploadingKey.value = slot.key
  try {
    await clearTenderSlot(slot.key)
    mergeSlotStatus({
      key: slot.key,
      title: slot.title,
      hint: slot.hint,
      fileCount: 0,
      files: [],
    })
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '清除失败'
  } finally {
    uploadingKey.value = null
  }
}

function slotFileLabel(slot: SlotStatus): string {
  if (!slot.fileCount) return ''
  const first = slot.files[0]
  const label = first?.performance?.projectName || first?.name || '已上传'
  if (slot.files.length === 1) return label
  return `${label} 等 ${slot.fileCount} 个文件`
}

async function onUploadStepNext() {
  if (!inviteFile.value) {
    error.value = '请先上传投标邀请书或招标文件'
    return
  }
  error.value = ''
  // 已识别过但仍无报价行、或刚换了清单时，必须再跑一遍解析
  const hasQuoteRows = form.quoteLines.some((row) => String(row.name || '').trim())
  const needParse = !hasParsed.value || (Boolean(quoteFile.value) && !hasQuoteRows)
  if (needParse) {
    await onParseInvitation()
    if (!hasParsed.value) return
  }
  advanceStep(1)
  await nextTick()
  document.getElementById('tender-parse-notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function doGenerate() {
  error.value = ''
  generating.value = true
  try {
    result.value = await generateTender({
      ...form,
      includeCommitment: true,
      includePlaceholders: true,
      requiredSlotKeys: effectiveRequiredKeys.value,
      includeSlotKeys: effectiveIncludeKeys.value,
    })
    if (result.value.attachmentMatch) {
      attachmentMatch.value = result.value.attachmentMatch
    }
    void loadRecords()
    previewEditorMode.value = 'view'
    advanceStep(2)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '生成预览失败'
  } finally {
    generating.value = false
  }
}

async function onFormStepNext() {
  if (generateBlockers.value.length) {
    error.value = `请先完善：${generateBlockers.value.join('、')}`
    return
  }
  if (result.value) {
    confirmGenerateMode.value = 'form'
    pendingRegenItem.value = null
    confirmGenerateOpen.value = true
    return
  }
  await doGenerate()
}

function askRegenerateRecord(item: TenderRecordItem) {
  confirmGenerateMode.value = 'record'
  pendingRegenItem.value = item
  confirmGenerateOpen.value = true
}

function onConfirmGenerateOpen(open: boolean) {
  if (!open && !generating.value) {
    confirmGenerateOpen.value = false
    pendingRegenItem.value = null
  }
}

async function confirmGenerateAgain() {
  confirmGenerateOpen.value = false
  if (confirmGenerateMode.value === 'record' && pendingRegenItem.value) {
    const item = pendingRegenItem.value
    pendingRegenItem.value = null
    await regenerateRecord(item)
    return
  }
  await doGenerate()
}

function onPreviewStepNext() {
  setPreviewFullscreen(false)
  advanceStep(3)
}

function onStepBack() {
  if (currentStepIndex.value > 0) {
    if (currentStepIndex.value === 2) setPreviewFullscreen(false)
    currentStepIndex.value -= 1
    error.value = ''
  }
}

async function onDownload(kind: 'docx' | 'pdf') {
  const r = result.value
  if (!r) return
  const file = kind === 'docx' ? r.docxFile : r.pdfFile
  const name = kind === 'docx' ? r.downloadName : r.pdfDownloadName
  if (!file || !name) return
  downloading.value = kind
  error.value = ''
  try {
    await downloadTenderFile(file, name)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <PageHeader
    class="tender-page-header"
    :class="{ 'tender-page-header--preview': currentStepIndex === 2 }"
    title="投标文件"
    :description="currentStepIndex === 2 ? '' : '缺扫描件仍可生成：Word 附件区用虚线框占位，补齐后重新生成即可。公司名称、报价清单等基本信息仍需先填。'"
  >
    <template #badges>
      <div
        class="tender-volume-switch"
        role="tablist"
        aria-label="填写商务标或技术标"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeVolume === 'business'"
          class="tender-volume-btn"
          :class="{ 'tender-volume-btn--active': activeVolume === 'business' }"
          @click="selectVolume('business')"
        >
          商务标
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeVolume === 'technical'"
          class="tender-volume-btn"
          :class="{ 'tender-volume-btn--active': activeVolume === 'technical' }"
          @click="selectVolume('technical')"
        >
          技术标
        </button>
      </div>
    </template>
    <template #actions>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] transition-colors"
        :class="
          showRecords
            ? 'border-iron bg-iron/10 text-foreground'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        @click.stop="toggleRecords"
      >
        <History class="size-3.5" />
        生成记录
        <span v-if="recordsTotal" class="font-mono text-[11px]">{{ recordsTotal }}</span>
      </button>
    </template>
  </PageHeader>

  <p
    v-if="error"
    class="mb-4 text-[12px] text-sulfur border border-sulfur/30 bg-sulfur/10 rounded-md px-3 py-2"
  >
    {{ error }}
  </p>

  <p
    v-if="volumeHint && currentStepIndex === 0 && !showRecords"
    class="mb-4 text-[12px] text-muted-foreground border border-border bg-card rounded-md px-3 py-2"
  >
    {{ volumeHint }}
  </p>

  <div v-if="loading" class="py-16 text-center text-[12px] text-muted-foreground">
    <Loader2 class="inline size-4 animate-spin mr-2" />加载默认信息…
  </div>

  <section v-else-if="showRecords" class="tender-card mx-auto w-full max-w-4xl">
    <div class="tender-card-head">
      <div class="min-w-0">
        <h2 id="tender-records-title" class="text-[14px] font-semibold">生成记录</h2>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          每次生成另存一条；可删除无用记录。预览默认只读，打开更快。
        </p>
      </div>
      <button type="button" class="tender-ghost-btn shrink-0" @click="closeRecords">
        <ChevronLeft class="size-3.5" />
        返回向导
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <input
        v-model="recordsQuery"
        class="kb-input font-sans max-w-xs"
        placeholder="搜索项目 / 招标人 / 创建人"
        @keydown.enter.prevent="loadRecords"
      />
      <button type="button" class="tender-ghost-btn" :disabled="recordsLoading" @click="loadRecords">
        <Loader2 v-if="recordsLoading" class="size-3.5 animate-spin" />
        查询
      </button>
    </div>

    <div
      v-if="recordsLoading && !records.length"
      class="py-8 text-center text-[12px] text-muted-foreground"
    >
      <Loader2 class="inline size-4 animate-spin mr-2" />加载记录…
    </div>
    <p v-else-if="!records.length" class="mt-4 text-[12px] text-muted-foreground text-center py-6">
      暂无生成记录。在「填表生成」点「生成并预览」后会出现在这里；重新生成会另存新记录。
    </p>
    <ul v-else class="mt-3 divide-y divide-border/70">
      <li
        v-for="item in records"
        :key="item.id"
        class="flex flex-col sm:flex-row sm:items-center gap-2 py-3"
      >
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-medium truncate">{{ item.projectName || '未命名项目' }}</div>
          <div class="mt-0.5 text-[11px] text-muted-foreground">
            {{ item.tenderer || '—' }}
            · {{ formatPrice(item.bidPriceYuan) }} 元
            · {{ item.username || '—' }}
            · {{ formatRecordTime(item.createdAt) }}
            <span v-if="!item.docxAvailable" class="text-sulfur ml-1">文件缺失</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1.5 flex-wrap">
          <button
            type="button"
            class="tender-ghost-btn"
            :disabled="loadingFormId === item.id"
            @click="loadRecordForm(item)"
          >
            <Loader2 v-if="loadingFormId === item.id" class="size-3.5 animate-spin" />
            载入表单
          </button>
          <button
            type="button"
            class="tender-ghost-btn"
            :disabled="regeneratingId === item.id"
            @click="askRegenerateRecord(item)"
          >
            <Loader2 v-if="regeneratingId === item.id" class="size-3.5 animate-spin" />
            重新生成
          </button>
          <button
            type="button"
            class="tender-ghost-btn"
            :disabled="!item.docxAvailable || openingRecordId === item.id"
            @click="openRecordPreview(item)"
          >
            <Loader2 v-if="openingRecordId === item.id" class="size-3.5 animate-spin" />
            预览
          </button>
          <button
            type="button"
            class="tender-ghost-btn"
            :disabled="!item.docxAvailable || downloading === 'docx'"
            @click="downloadRecord(item, 'docx')"
          >
            <Download class="size-3.5" />
            Word
          </button>
          <button
            v-if="item.pdfFile"
            type="button"
            class="tender-ghost-btn"
            :disabled="!item.pdfAvailable || downloading === 'pdf'"
            @click="downloadRecord(item, 'pdf')"
          >
            资质
          </button>
          <button
            type="button"
            class="tender-ghost-btn text-sulfur hover:text-sulfur"
            :disabled="deletingId === item.id"
            @click="askDeleteRecord(item)"
          >
            <Loader2 v-if="deletingId === item.id" class="size-3.5 animate-spin" />
            删除
          </button>
        </div>
      </li>
    </ul>
  </section>

  <div
    v-else
    class="tender-page mx-auto"
    :class="currentStepIndex === 2 ? 'tender-page--preview max-w-[1600px]' : 'max-w-3xl'"
  >
    <nav
      class="tender-steps"
      :class="currentStepIndex === 2 ? 'mb-2 shrink-0' : 'mb-6'"
      aria-label="投标生成流程"
    >
      <ol class="flex items-center gap-0">
        <li
          v-for="(step, i) in workflowSteps"
          :key="step.key"
          class="flex items-center min-w-0"
          :class="i < workflowSteps.length - 1 ? 'flex-1' : ''"
        >
          <button
            type="button"
            class="flex items-center gap-2 shrink-0 text-left transition-opacity"
            :class="[
              i <= activeWorkflowIndex ? 'text-foreground' : 'text-muted-foreground',
              i <= maxStepReached ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
            ]"
            :disabled="i > maxStepReached"
            @click="goToStep(i)"
          >
            <span
              class="tender-step-dot"
              :class="{
                'tender-step-dot--done': i < activeWorkflowIndex,
                'tender-step-dot--active': i === activeWorkflowIndex,
              }"
            >
              {{ i < activeWorkflowIndex ? '✓' : i + 1 }}
            </span>
            <span class="text-[12px] font-medium hidden sm:inline">{{ step.label }}</span>
          </button>
          <span
            v-if="i < workflowSteps.length - 1"
            class="tender-step-line mx-2 sm:mx-3"
            :class="i < activeWorkflowIndex ? 'tender-step-line--done' : ''"
          />
        </li>
      </ol>
    </nav>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
      @change="onPickFile"
    />
    <input
      ref="quoteInput"
      type="file"
      class="hidden"
      accept=".xlsx,.xlsm,.docx,.csv,.pdf"
      @change="onPickQuote"
    />
    <input
      ref="slotFileInput"
      type="file"
      class="hidden"
      multiple
      accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,application/pdf,image/*"
      @change="onSlotFileChange"
    />

    <!-- 步骤 1：上传邀请书 -->
    <section v-if="currentStepIndex === 0" class="tender-step-panel">
      <div class="tender-card">
        <div class="tender-card-head">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="tender-card-icon">
              <FileUp class="size-4" />
            </span>
            <div class="min-w-0">
              <h2 class="text-[14px] font-semibold text-foreground">甲方邀请书</h2>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                支持 PDF、Word、图片；请同时上传报价清单 Excel（生成必填）
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="tender-dropzone w-full mt-4"
          :class="{ 'tender-dropzone--active': dragOverInvite, 'tender-dropzone--filled': inviteFile }"
          @click="fileInput?.click()"
          @dragover.prevent="dragOverInvite = true"
          @dragleave.prevent="dragOverInvite = false"
          @drop.prevent="onInviteDrop"
        >
          <Upload class="size-8 text-muted-foreground/70 mb-2" />
          <p class="text-[13px] font-medium text-foreground">
            {{ inviteFile ? inviteFile.name : '点击或拖拽上传投标邀请书' }}
          </p>
          <p class="text-[11px] text-muted-foreground mt-1">
            {{ inviteFile ? '点击可更换文件' : `PDF / DOCX / 图片，单文件最大 ${fmtSize(KB_UPLOAD_MAX_BYTES)}` }}
          </p>
        </button>

        <div v-if="inviteFile" class="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" class="tender-ghost-btn" @click="quoteInput?.click()">
            <Upload class="size-3.5" />
            报价清单（生成必填）
          </button>
          <span class="text-[11px] text-muted-foreground truncate max-w-[240px]">
            {{ quoteFile ? quoteFile.name : 'Excel / Word，点「识别并继续」一并解析' }}
          </span>
        </div>

        <div v-if="kbList.length" class="mt-4 pt-4 border-t border-border/60">
          <p class="text-[11px] text-muted-foreground mb-2">
            可选知识库（默认不选）。只对照资格条款种类，不会套用历史投标书或他司合同。
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="b in kbList"
              :key="b.id"
              type="button"
              class="h-7 px-2.5 rounded-full border text-[11px] transition-colors"
              :class="
                selectedKbIds.includes(b.id)
                  ? 'border-iron bg-iron/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              "
              @click="toggleKb(b.id)"
            >
              {{ b.name }}
            </button>
          </div>
        </div>
      </div>

      <footer class="tender-step-footer">
        <span />
        <button
          type="button"
          class="tender-primary-btn min-w-[160px]"
          :disabled="parsing || !inviteFile"
          @click="onUploadStepNext"
        >
          <Loader2 v-if="parsing" class="size-3.5 animate-spin" />
          <Sparkles v-else class="size-3.5" />
          {{ parsing ? '正在识别…' : '识别并继续' }}
          <ChevronRight v-if="!parsing" class="size-3.5" />
        </button>
      </footer>
    </section>

    <!-- 步骤 2：填表生成 -->
    <section v-else-if="currentStepIndex === 1" class="tender-step-panel space-y-4">
      <div
        v-if="parseOcr?.ocrCapped"
        class="tender-card border-sulfur/40 bg-sulfur/10"
      >
        <p class="text-[12px] text-sulfur leading-relaxed">
          邀请书共 {{ parseOcr.pageCount || '—' }} 页，OCR 已达上限 {{ parseOcr.ocrMaxPages }} 页（实际识别
          {{ parseOcr.ocrPages }} 页）。未识别页未进入抽取，请提高 OCR_MAX_PAGES 后点「识别并继续」重试。
        </p>
      </div>
      <Panel
        v-if="parseNotes.length"
        id="tender-parse-notes"
        :key="'parse-notes-' + parseNotesEpoch"
        title="识别说明"
        subtitle="邀请书识别结果与风险提示，生成前请先过一遍"
        collapsible
        :default-open="true"
        class-name="tender-parse-notes"
      >
        <template #summary>{{ parseNotesSummary }}</template>
        <ul class="space-y-1.5 text-[11px] leading-relaxed">
          <li
            v-for="(n, i) in parseNotes"
            :key="i"
            class="flex gap-1.5"
            :class="noteTone(n)"
          >
            <TriangleAlert
              v-if="isRiskNote(n)"
              class="size-3.5 shrink-0 mt-0.5"
            />
            <span class="min-w-0">{{ n }}</span>
          </li>
        </ul>
      </Panel>
      <div v-if="matchHasRows && attachmentMatch" class="tender-card">
        <p class="text-[12px] font-medium text-foreground mb-2">资料库对照（按本标 key 匹配，不用其他项目文件顶）</p>
        <ul class="space-y-1.5 text-[11px]">
          <li v-if="attachmentMatch.matched.length" class="text-emerald-700 dark:text-emerald-400">
            已匹配扫描件：{{ attachmentMatch.matched.map((x) => x.title).join('、') }}
          </li>
          <li
            v-for="item in attachmentMatch.missingFiles"
            :key="'miss-' + item.key"
            :class="item.required ? 'text-sulfur' : 'text-muted-foreground'"
          >
            {{ item.required ? '未上传，生成时用虚线框占位' : '已纳入未上传' }}：{{ item.title }}
          </li>
          <li
            v-for="item in attachmentMatch.createdItems"
            :key="'new-' + item.key"
            class="text-muted-foreground"
          >
            资料库原先没有，已建空项请上传：{{ item.title }}
          </li>
        </ul>
        <button
          type="button"
          class="mt-2 text-[11px] text-foreground underline underline-offset-2"
          @click="router.push('/tender-library')"
        >
          去资料库上传
        </button>
      </div>
      <div
        v-if="result?.warnings?.length"
        class="tender-card border-sulfur/40 bg-sulfur/10"
      >
        <p class="text-[12px] font-medium text-sulfur mb-2">上次生成提示</p>
        <ul class="space-y-1 text-[11px] text-sulfur">
          <li v-for="(w, i) in result.warnings" :key="i" class="flex gap-1.5">
            <TriangleAlert class="size-3.5 shrink-0 mt-0.5" />
            {{ w }}
          </li>
        </ul>
      </div>

      <div
        v-if="activeVolume === 'business'"
        id="tender-volume-business"
        class="space-y-4"
      >
      <div class="rounded-lg border border-border/70 bg-card px-3 py-2.5">
        <div class="flex flex-wrap items-baseline gap-2">
          <h2 class="text-[13px] font-semibold">商务标</h2>
          <span class="text-[11px] text-muted-foreground">未上传的扫描件会在 Word 里画虚线框，不阻止生成</span>
        </div>
        <p class="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          公司、资质、人员、业绩、报价、各种函件。下面带 * 的项和必填扫描件齐了才能生成。
        </p>
      </div>

      <Panel title="项目与招标人" subtitle="识别结果可再改；投标人侧不会被邀请书覆盖">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="md:col-span-2 text-[12px] space-y-1">
            <span class="text-muted-foreground">项目名称<span class="tender-req" aria-hidden="true">*</span></span>
            <input
              v-model="form.projectName"
              class="kb-input font-sans"
              required
              aria-required="true"
              placeholder="识别邀请书后自动填入，也可手工填写"
            />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">招标人<span class="tender-req" aria-hidden="true">*</span></span>
            <input
              v-model="form.tenderer"
              class="kb-input font-sans"
              required
              aria-required="true"
              placeholder="甲方单位全称"
            />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">投标日期</span>
            <input v-model="form.bidDate" type="date" class="kb-input font-sans" />
          </label>
          <label class="md:col-span-2 text-[12px] space-y-1">
            <span class="text-muted-foreground">投标内容</span>
            <input
              v-model="form.bidContent"
              class="kb-input font-sans"
              placeholder="如：充电桩供货、安装调试及技术服务"
            />
          </label>
        </div>
      </Panel>

      <Panel title="报价与承诺" subtitle="报价单由工程量清单识别生成，写入 Word「分项报价表」；技术参数写入「技术偏差表」">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label class="col-span-2 text-[12px] space-y-1">
            <span class="text-muted-foreground">投标总价（元）<span class="tender-req" aria-hidden="true">*</span></span>
            <input
              v-model.number="form.bidPriceYuan"
              type="number"
              min="0"
              step="0.01"
              class="kb-input font-sans"
              required
              aria-required="true"
            />
            <span class="block text-[11px] text-muted-foreground leading-relaxed">
              <template v-if="form.quoteLines.length">
                已识别报价清单 {{ form.quoteLines.length }} 项
                <span v-if="form.quoteTitle">（{{ form.quoteTitle }}）</span>
                ，不含税合计约 {{ quoteAmountSum.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }} 元。
                若总价与清单含税不同，生成时只折算单价。
              </template>
              <template v-else>
                尚未解析到工程量。请在下方上传报价清单 Excel/Word 并点「识别清单」，没有报价清单不能生成。
              </template>
            </span>
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">供货期（天）</span>
            <input v-model.number="form.deliveryDays" type="number" min="1" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">质保（年）</span>
            <input v-model.number="form.warrantyYears" type="number" min="1" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">质量</span>
            <input v-model="form.quality" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">投标有效期（天）</span>
            <input v-model.number="form.bidValidityDays" type="number" min="1" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">预付款 %</span>
            <input v-model.number="form.prepaidPct" type="number" min="0" max="100" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">到货款 %</span>
            <input v-model.number="form.arrivalPct" type="number" min="0" max="100" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">结算款 %</span>
            <input v-model.number="form.settlementPct" type="number" min="0" max="100" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">质保金 %</span>
            <input v-model.number="form.warrantyPct" type="number" min="0" max="100" class="kb-input font-sans" />
          </label>
        </div>
        <p class="mt-2 text-[11px]" :class="paySum === 100 ? 'text-muted-foreground' : 'text-sulfur'">
          支付比例合计 {{ paySum }}%{{ paySum === 100 ? '' : '（建议为 100%）' }}
        </p>
        <label class="mt-3 block text-[12px] space-y-1">
          <span class="text-muted-foreground">流量费说明</span>
          <input v-model="form.trafficFeeNote" class="kb-input font-sans" />
        </label>
        <label class="mt-3 block text-[12px] space-y-1">
          <span class="text-muted-foreground">原厂承诺角色</span>
          <input
            v-model="form.factoryRole"
            class="kb-input font-sans"
            placeholder="空则按项目内容判断：充电设备生产厂商 / 投标产品生产厂商"
          />
        </label>

        <div
          class="mt-4 rounded-md border border-border/70 px-3 py-2.5 space-y-2"
          :class="form.quoteLines.length ? 'bg-accent/20' : 'bg-sulfur/5 border-sulfur/25'"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[12px] font-medium text-foreground">
                {{ form.quoteLines.length ? '报价清单（只读预览）' : '报价清单（待上传）' }}
              </p>
              <p class="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                <template v-if="form.quoteLines.length">
                  生成 Word 时写入「分项报价表」（含技术参数列）；技术参数同步写入技术标「技术偏差表」。
                  <span v-if="quoteSpecFilledCount">已解析明细 {{ quoteSpecFilledCount }}/{{ form.quoteLines.length }} 项。</span>
                  <span v-else class="text-sulfur">未解析到技术参数列，请确认 Excel 含「技术参数要求」列后重新识别。</span>
                </template>
                <template v-else>
                  选择工程量 Excel/Word 后点「识别清单」。需保留本页会话中的邀请书文件。
                </template>
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 shrink-0">
              <button type="button" class="tender-ghost-btn" @click="quoteInput?.click()">
                <Upload class="size-3.5" />
                {{ quoteFile ? '更换清单' : '上传清单' }}
              </button>
              <button
                type="button"
                class="tender-ghost-btn"
                :disabled="parsing || !quoteFile || !inviteFile"
                :title="!inviteFile ? '请返回上一步重新上传邀请书' : !quoteFile ? '请先选择清单文件' : ''"
                @click="reparseQuoteFromForm"
              >
                <Loader2 v-if="parsing" class="size-3.5 animate-spin" />
                <Sparkles v-else class="size-3.5" />
                {{ parsing ? '识别中…' : '识别清单' }}
              </button>
            </div>
          </div>
          <p v-if="quoteFile" class="text-[11px] text-muted-foreground truncate">
            已选文件：{{ quoteFile.name }}
          </p>
          <p v-else-if="!inviteFile" class="text-[11px] text-sulfur">
            邀请书文件已失效，请点「上一步」重新上传邀请书与清单。
          </p>

          <div v-if="form.quoteLines.length" class="overflow-x-auto border border-border rounded-md bg-background">
            <table class="w-full text-[11px] border-collapse min-w-[720px]">
              <thead>
                <tr class="text-muted-foreground bg-accent/40">
                  <th class="px-2 py-1.5 text-left font-medium w-10">序</th>
                  <th class="px-2 py-1.5 text-left font-medium w-36">设备</th>
                  <th class="px-2 py-1.5 text-left font-medium min-w-[220px]">技术参数 / 明细</th>
                  <th class="px-2 py-1.5 text-left font-medium w-12">单位</th>
                  <th class="px-2 py-1.5 text-left font-medium w-16">数量</th>
                  <th class="px-2 py-1.5 text-left font-medium w-24">不含税单价</th>
                  <th class="px-2 py-1.5 text-left font-medium w-24">合价</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in form.quoteLines"
                  :key="i"
                  class="border-t border-border align-top"
                >
                  <td class="px-2 py-1.5">{{ row.seq || i + 1 }}</td>
                  <td class="px-2 py-1.5 font-medium">{{ row.name || '—' }}</td>
                  <td class="px-2 py-1.5 text-muted-foreground">
                    <pre
                      v-if="String(row.spec || '').trim()"
                      class="m-0 max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed"
                    >{{ row.spec }}</pre>
                    <span v-else class="text-sulfur/80">（无明细）</span>
                  </td>
                  <td class="px-2 py-1.5">{{ row.unit || '—' }}</td>
                  <td class="px-2 py-1.5 font-sans">{{ row.qty || 0 }}</td>
                  <td class="px-2 py-1.5 font-sans">{{ Number(row.unitPrice || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }}</td>
                  <td class="px-2 py-1.5 font-sans">{{ Number(row.amount || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="form.quoteLines.length" class="text-[11px] text-muted-foreground">
            数量合计 {{ quoteQtySum }} · 不含税合计
            {{ quoteAmountSum.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }} 元
          </p>
        </div>
      </Panel>

      <Panel title="类似业绩" subtitle="上传合同/发票后自动识别；生成时合并资料库，并优先填已竣工充电桩项目">
        <div class="flex items-center justify-between mb-2">
          <p class="text-[12px] text-muted-foreground">
            {{ form.performanceLines.length ? `${form.performanceLines.length} 条` : '尚未填写，上传资料库合同或识别邀请书后会抽出项目、买方、金额' }}
          </p>
          <button
            type="button"
            class="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-accent"
            @click="addPerformanceRow"
          >
            增行
          </button>
        </div>
        <div class="overflow-x-auto border border-border rounded-md">
          <table class="w-full text-[11px] border-collapse min-w-[760px]">
            <thead>
              <tr class="text-muted-foreground bg-accent/40">
                <th class="px-2 py-1.5 text-left font-medium min-w-[140px]">项目/合同</th>
                <th class="px-2 py-1.5 text-left font-medium">规格型号</th>
                <th class="px-2 py-1.5 text-left font-medium">买方</th>
                <th class="px-2 py-1.5 text-left font-medium">联系人</th>
                <th class="px-2 py-1.5 text-left font-medium w-24">合同额（元）</th>
                <th class="px-2 py-1.5 text-left font-medium">概况</th>
                <th class="px-2 py-1.5 text-left font-medium w-16">在建</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!form.performanceLines.length">
                <td colspan="8" class="px-2 py-3 text-muted-foreground">
                  资料库上传合同/发票时会识别项目名称、规格型号、买方、联系人、合同额、概况和是否在建。招标优先认可已竣工充电桩；也可在此手工改。
                </td>
              </tr>
              <tr v-for="(row, i) in form.performanceLines" :key="i" class="border-t border-border">
                <td class="px-1 py-1">
                  <input v-model="row.projectName" class="kb-input font-sans !py-1 !px-1" placeholder="工程/合同名称" />
                </td>
                <td class="px-1 py-1 min-w-[100px]">
                  <input v-model="row.spec" class="kb-input font-sans !py-1 !px-1" placeholder="直流功率/群充/箱变" />
                </td>
                <td class="px-1 py-1 min-w-[100px]">
                  <input v-model="row.client" class="kb-input font-sans !py-1 !px-1" placeholder="甲方/买方" />
                </td>
                <td class="px-1 py-1">
                  <input v-model="row.contact" class="kb-input font-sans !py-1 !px-1" placeholder="可空或保密" />
                </td>
                <td class="px-1 py-1">
                  <input v-model.number="row.amountYuan" type="number" min="0" step="0.01" class="kb-input font-sans !py-1 !px-1" />
                </td>
                <td class="px-1 py-1 min-w-[120px]">
                  <input v-model="row.summary" class="kb-input font-sans !py-1 !px-1" placeholder="桩数、场站、EPC/供货" />
                </td>
                <td class="px-1 py-1 text-center">
                  <input v-model="row.ongoing" type="checkbox" title="勾选表示在建未竣工" />
                </td>
                <td class="px-1 py-1 text-center">
                  <button type="button" class="text-muted-foreground hover:text-sulfur" @click="removePerformanceRow(i)">
                    删
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="投标人（伟泰）"
        subtitle="本公司信息：邀请书不会改这些字段，空项用默认值或上次投标回填"
        collapsible
        :default-open="false"
      >
        <template #summary>
          {{ form.bidderName || '—' }} · {{ form.foundedDate || '成立日期未填' }} · {{ form.bidderPhone || '电话未填' }}
        </template>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="md:col-span-2 text-[12px] space-y-1">
            <span class="text-muted-foreground">投标人全称<span class="tender-req" aria-hidden="true">*</span></span>
            <input v-model="form.bidderName" class="kb-input font-sans" required aria-required="true" />
          </label>
          <label class="md:col-span-2 text-[12px] space-y-1">
            <span class="text-muted-foreground">地址<span class="tender-req" aria-hidden="true">*</span></span>
            <input v-model="form.bidderAddress" class="kb-input font-sans" required aria-required="true" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">单位性质</span>
            <input v-model="form.bidderNature" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">成立日期<span class="tender-req" aria-hidden="true">*</span></span>
            <input
              v-model="form.foundedDate"
              class="kb-input font-sans"
              required
              aria-required="true"
              placeholder="如 2017年07月"
            />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">电话<span class="tender-req" aria-hidden="true">*</span></span>
            <input v-model="form.bidderPhone" class="kb-input font-sans" required aria-required="true" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">邮箱</span>
            <input v-model="form.bidderEmail" class="kb-input font-sans" />
          </label>
        </div>
      </Panel>

      <Panel
        title="法定代表人 / 授权"
        subtitle="身份证请装订时另附，本版只填文字"
        collapsible
        :default-open="false"
      >
        <template #summary>
          {{ form.legalPersonName || '法人未填' }} · {{ form.legalPersonAge ? `${form.legalPersonAge}岁` : '年龄未填' }} ·
          {{ form.legalPersonIdNo || '身份证未填' }}
        </template>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">法人姓名<span class="tender-req" aria-hidden="true">*</span></span>
            <input v-model="form.legalPersonName" class="kb-input font-sans" required aria-required="true" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">性别</span>
            <input v-model="form.legalPersonGender" class="kb-input font-sans" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">年龄<span class="tender-req" aria-hidden="true">*</span></span>
            <input v-model="form.legalPersonAge" class="kb-input font-sans" required aria-required="true" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">职务</span>
            <input v-model="form.legalPersonTitle" class="kb-input font-sans" />
          </label>
          <label class="md:col-span-2 text-[12px] space-y-1">
            <span class="text-muted-foreground">法人身份证号<span class="tender-req" aria-hidden="true">*</span></span>
            <input v-model="form.legalPersonIdNo" class="kb-input font-sans" required aria-required="true" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">委托代理人</span>
            <input v-model="form.agentName" class="kb-input font-sans" placeholder="法人自签可留空" />
          </label>
          <label class="text-[12px] space-y-1">
            <span class="text-muted-foreground">
              代理人身份证号
              <span v-if="agentIdRequired" class="tender-req" aria-hidden="true">*</span>
            </span>
            <input
              v-model="form.agentIdNo"
              class="kb-input font-sans"
              :required="agentIdRequired"
              :aria-required="agentIdRequired"
            />
          </label>
        </div>
      </Panel>

      <div class="tender-card">
        <div class="flex items-center gap-3 mb-3">
          <div
            class="relative size-10 shrink-0 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-medium"
            :class="slotFilledCount > 0 ? 'border-patina/50 text-patina' : 'border-border text-muted-foreground'"
          >
            {{ slotFilledCount }}/{{ placeholderItems.length }}
          </div>
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            未上传的商务标 / 技术资料会在 Word 里用虚线框占位，不阻止生成。补齐扫描件后可重新生成。
            <button
              type="button"
              class="text-foreground underline underline-offset-2 ml-0.5"
              @click="router.push('/tender-library')"
            >
              去资料库
            </button>
          </p>
        </div>

        <p
          v-if="!form.quoteLines.length"
          class="text-[12px] p-2.5 rounded-md bg-sulfur/10 border border-sulfur/30 text-sulfur"
        >
          还没有报价清单。请在上方「报价与承诺」上传工程量 Excel 并点「识别清单」，否则不能生成。
        </p>

        <div class="mt-3 rounded-lg border border-border/60 overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[11px] hover:bg-accent/30 transition-colors"
            @click="slotsExpanded = !slotsExpanded"
          >
            <span class="inline-flex items-center gap-1.5 text-muted-foreground">
              <FolderOpen class="size-3.5" />
              本标附件
            </span>
            <span class="inline-flex items-center gap-1 shrink-0 text-foreground/80">
              {{ slotsExpanded ? '收起' : '展开' }}
              <ChevronUp v-if="slotsExpanded" class="size-3.5" />
              <ChevronDown v-else class="size-3.5" />
            </span>
          </button>
          <ul
            v-if="slotsExpanded"
            class="border-t border-border/60 px-2 pb-2 pt-1 space-y-1.5 max-h-[280px] overflow-y-auto text-[11px]"
          >
            <li
              v-for="slot in placeholderItems"
              :key="slot.key || slot.title"
              class="flex items-start gap-2 rounded border border-border/60 px-2 py-1.5"
            >
              <div class="min-w-0 flex-1">
                <div class="text-foreground/90">
                  <span v-if="slot.fileCount" class="text-emerald-700 dark:text-emerald-400">【已补】</span>
                  <span v-else class="text-sulfur">【待补】</span>
                  {{ slot.title }}
                  <span
                    v-if="isRequiredSlot(slot.key)"
                    class="ml-1 text-[10px] text-sulfur"
                  >{{ HIGH_DISQUALIFY_KEYS.has(slot.key) ? '建议补' : '本标附件' }}</span>
                  <span
                    v-else-if="slotVolume(slot) === 'technical'"
                    class="ml-1 text-[10px] text-muted-foreground"
                  >技术标·扣分</span>
                  <span v-else class="ml-1 text-[10px] text-muted-foreground">可选</span>
                </div>
                <div v-if="slotFileLabel(slot)" class="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {{ slotFileLabel(slot) }}
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="h-6 rounded border border-border px-1.5 text-[10px] hover:bg-accent disabled:opacity-50"
                  :disabled="uploadingKey === slot.key || !slot.key"
                  @click="pickSlotFile(slot, true)"
                >
                  {{ uploadingKey === slot.key ? '…' : slot.fileCount ? '覆盖' : '本标补充' }}
                </button>
                <button
                  v-if="slot.fileCount"
                  type="button"
                  class="h-6 rounded border border-border px-1.5 text-[10px] hover:bg-accent disabled:opacity-50"
                  :disabled="uploadingKey === slot.key || !slot.key"
                  @click="pickSlotFile(slot, false)"
                >
                  追加
                </button>
                <button
                  v-if="slot.fileCount"
                  type="button"
                  class="h-6 rounded border border-border px-1.5 text-[10px] hover:bg-accent disabled:opacity-50"
                  :disabled="uploadingKey === slot.key"
                  @click="onClearSlot(slot)"
                >
                  清除
                </button>
                <button
                  v-if="!isRequiredSlot(slot.key)"
                  type="button"
                  class="h-6 rounded border border-border px-1.5 text-[10px] hover:bg-accent"
                  @click="excludeOptionalSlot(slot)"
                >
                  移出
                </button>
              </div>
            </li>
            <li
              v-if="optionalCatalogSlots.length"
              class="pt-1 text-[10px] text-muted-foreground"
            >
              资料库其他项（可选纳入本标）
            </li>
            <li
              v-for="slot in optionalCatalogSlots"
              :key="'opt-' + slot.key"
              class="flex items-start gap-2 rounded border border-dashed border-border/60 px-2 py-1.5"
            >
              <div class="min-w-0 flex-1 text-muted-foreground">
                {{ slot.title }}
                <span v-if="slot.fileCount" class="ml-1 text-emerald-700 dark:text-emerald-400">已有扫描件</span>
              </div>
              <button
                type="button"
                class="h-6 shrink-0 rounded border border-border px-1.5 text-[10px] hover:bg-accent"
                @click="includeOptionalSlot(slot)"
              >
                纳入本标
              </button>
            </li>
          </ul>
        </div>

        <label class="flex items-start gap-2.5 text-[12px] mt-4">
          <input v-model="form.attachQualifications" type="checkbox" class="mt-0.5" />
          <span class="text-muted-foreground leading-relaxed">
            插入企业资质 PDF（较慢，建议装订时另附）
            <span class="block text-[11px] mt-0.5">
              {{
                qualification?.found
                  ? `已就绪（${Math.round((qualification.sizeBytes || 0) / 1024 / 1024)} MB）；勾选后只嵌入前若干页`
                  : '未找到时将提示补附'
              }}
            </span>
          </span>
        </label>
        <p class="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          所有扫描件默认不写入 Word（仅虚线框占位），生成会快很多；装订时从资料库打印原件附上即可。
        </p>
      </div>
      </div>

      <div
        v-if="activeVolume === 'technical'"
        id="tender-volume-technical"
        class="space-y-4"
      >
      <div class="rounded-lg border border-border/70 bg-card px-3 py-2.5">
        <div class="flex flex-wrap items-baseline gap-2">
          <h2 class="text-[13px] font-semibold">技术标</h2>
          <span class="text-[11px] text-muted-foreground">废标风险较低，但不响应技术要求会大量扣分</span>
        </div>
        <p class="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          上传本项目图纸，再写一段文字说明。缺图纸会在 Word 里画虚线框，不阻止生成。
        </p>
      </div>

      <Panel
        title="技术偏差表"
        subtitle="对应招标技术要求与投标响应；可从报价清单生成后微调"
      >
        <div class="flex items-center justify-between mb-2">
          <p class="text-[12px] text-muted-foreground">
            {{ form.deviationLines.length ? `${form.deviationLines.length} 条` : '尚未填写' }}
          </p>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-accent"
              :disabled="!form.quoteLines.length"
              @click="fillDeviationFromQuote()"
            >
              从报价清单生成
            </button>
            <button
              type="button"
              class="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-accent"
              @click="addDeviationRow"
            >
              增行
            </button>
          </div>
        </div>
        <div class="overflow-x-auto border border-border rounded-md">
          <table class="w-full text-[11px] border-collapse min-w-[640px]">
            <thead>
              <tr class="text-muted-foreground bg-accent/40">
                <th class="px-2 py-1.5 text-left font-medium w-10">序</th>
                <th class="px-2 py-1.5 text-left font-medium">招标文件要求</th>
                <th class="px-2 py-1.5 text-left font-medium">投标文件响应</th>
                <th class="px-2 py-1.5 text-left font-medium w-20">偏差</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!form.deviationLines.length">
                <td colspan="5" class="px-2 py-3 text-muted-foreground">
                  识别邀请书/清单后会出现在这里，也可点「从报价清单生成」或手工增行。
                </td>
              </tr>
              <tr v-for="(row, i) in form.deviationLines" :key="i" class="border-t border-border">
                <td class="px-1 py-1">
                  <input v-model="row.seq" class="kb-input font-sans !py-1 !px-1" />
                </td>
                <td class="px-1 py-1 min-w-[160px]">
                  <input v-model="row.requirement" class="kb-input font-sans !py-1 !px-1" />
                </td>
                <td class="px-1 py-1 min-w-[160px]">
                  <input v-model="row.response" class="kb-input font-sans !py-1 !px-1" />
                </td>
                <td class="px-1 py-1">
                  <input v-model="row.deviation" class="kb-input font-sans !py-1 !px-1" />
                </td>
                <td class="px-1 py-1 text-center">
                  <button type="button" class="text-muted-foreground hover:text-sulfur" @click="removeDeviationRow(i)">
                    删
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="充电站实施方案" subtitle="写入技术标：本项目图纸 + 文字说明。不要编造桩数，不要用其他项目图纸">
        <div class="space-y-3">
          <div class="space-y-1.5">
            <span class="text-[12px] text-muted-foreground">上传图纸</span>
            <div
              class="tender-dropzone w-full cursor-pointer"
              :class="{
                'tender-dropzone--active': dragOverDrawings,
                'tender-dropzone--filled': techDrawingSlot.fileCount > 0,
              }"
              @click="pickSlotFile(techDrawingSlot, !techDrawingSlot.fileCount)"
              @dragover.prevent="dragOverDrawings = true"
              @dragleave.prevent="dragOverDrawings = false"
              @drop.prevent="onDrawingsDrop"
            >
              <ImagePlus class="size-7 text-muted-foreground/70 mb-2" />
              <p class="text-[13px] font-medium text-foreground">
                {{
                  uploadingKey === TECH_DRAWING_KEY
                    ? '正在上传…'
                    : techDrawingSlot.fileCount
                      ? `${techDrawingSlot.fileCount} 张图纸`
                      : '点击或拖拽上传平面图 / 系统图'
                }}
              </p>
              <p class="text-[11px] text-muted-foreground mt-1">
                {{
                  techDrawingSlot.fileCount
                    ? slotFileLabel(techDrawingSlot) || '点击可继续追加'
                    : 'PDF / PNG / JPG，换标请覆盖'
                }}
              </p>
            </div>
            <div v-if="techDrawingSlot.fileCount" class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="h-7 rounded-md border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
                :disabled="uploadingKey === TECH_DRAWING_KEY"
                @click.stop="pickSlotFile(techDrawingSlot, true)"
              >
                覆盖
              </button>
              <button
                type="button"
                class="h-7 rounded-md border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
                :disabled="uploadingKey === TECH_DRAWING_KEY"
                @click.stop="pickSlotFile(techDrawingSlot, false)"
              >
                追加
              </button>
              <button
                type="button"
                class="h-7 rounded-md border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
                :disabled="uploadingKey === TECH_DRAWING_KEY"
                @click.stop="onClearSlot(techDrawingSlot)"
              >
                清除
              </button>
            </div>
          </div>
          <label class="block text-[12px] space-y-1">
            <span class="text-muted-foreground">文字描述</span>
            <textarea
              v-model="form.techPlanNote"
              rows="6"
              class="kb-input font-sans min-h-[120px]"
              placeholder="按本邀请书写施工、布置、配电、运维与工期要点。没有原文请手工写，不要编造桩数和图纸。"
            />
          </label>
        </div>
      </Panel>
      </div>

      <div
        v-if="softGenerateNotes.length"
        class="rounded-md border border-border bg-accent/30 px-3 py-2.5"
      >
        <p class="text-[12px] font-medium mb-1">缺项用虚线框占位，不阻止生成</p>
        <ul class="space-y-0.5 text-[11px] text-muted-foreground">
          <li v-for="(w, i) in softGenerateNotes" :key="i">{{ w }}</li>
        </ul>
      </div>

      <footer class="tender-step-footer">
        <button type="button" class="tender-ghost-btn" @click="onStepBack">
          <ChevronLeft class="size-3.5" />
          上一步
        </button>
        <div
          class="tender-generate-wrap"
          :class="{ 'tender-generate-wrap--hint': !!generateButtonTooltip }"
        >
          <button
            type="button"
            class="tender-primary-btn min-w-[180px]"
            :disabled="generateButtonDisabled"
            :aria-describedby="generateButtonTooltip ? 'tender-form-next-tip' : undefined"
            @click="onFormStepNext"
          >
            <Loader2 v-if="generating" class="size-3.5 animate-spin" />
            <ChevronRight v-else class="size-3.5" />
            {{ formStepNextLabel }}
          </button>
          <p
            v-if="generateButtonTooltip"
            id="tender-form-next-tip"
            class="tender-generate-tooltip"
            role="tooltip"
          >
            {{ generateButtonTooltip }}
          </p>
        </div>
      </footer>
      <p class="mt-1 text-center text-[11px] text-muted-foreground">
        生成一份 Word，同时写入商务标与技术标。上方切换只改变当前填写内容。
      </p>
      <p v-if="generating" class="mt-2 text-[11px] text-muted-foreground text-center">
        {{
          form.attachQualifications
            ? '正在写入扫描件与资质页（已限页加速）…'
            : '正在生成 Word（扫描件仅占位，不嵌入大图）…'
        }}
      </p>
    </section>

    <!-- 步骤 3：预览编辑 -->
    <section v-else-if="currentStepIndex === 2 && result" class="tender-step-panel tender-step-panel--preview">
      <div class="tender-preview-shell" :class="{ 'tender-preview-shell--fs': previewFullscreen }">
        <div class="tender-card-head shrink-0 pb-3">
          <div class="min-w-0">
            <h2 class="text-[14px] font-semibold text-foreground">在线预览与编辑</h2>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              {{
                previewEditorMode === 'view'
                  ? '当前为只读预览（更快）。需要改稿时点「切换编辑」。'
                  : '在线修改会自动保存到这一份；回填表再生成会另存新记录。'
              }}
            </p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              class="tender-ghost-btn"
              @click="previewEditorMode = previewEditorMode === 'view' ? 'edit' : 'view'"
            >
              {{ previewEditorMode === 'view' ? '切换编辑' : '切换只读' }}
            </button>
            <button
              type="button"
              class="tender-ghost-btn"
              :title="previewFullscreen ? '还原窗口（Esc）' : '全屏预览'"
              :aria-label="previewFullscreen ? '还原窗口' : '全屏预览'"
              @click="togglePreviewFullscreen"
            >
              <Minimize2 v-if="previewFullscreen" class="size-3.5" />
              <Maximize2 v-else class="size-3.5" />
              {{ previewFullscreen ? '还原' : '全屏' }}
            </button>
          </div>
        </div>

        <div
          v-if="result.warnings.length && !previewFullscreen"
          class="tender-preview-hints shrink-0 rounded-md border border-sulfur/30 bg-sulfur/10"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left"
            :aria-expanded="previewHintsOpen"
            @click="togglePreviewHints"
          >
            <TriangleAlert class="size-3.5 shrink-0 text-sulfur" />
            <span class="min-w-0 flex-1 text-[12px] font-medium text-sulfur">
              生成提示
              <span class="font-normal text-sulfur/80">（{{ result.warnings.length }} 条）</span>
              <span
                v-if="!previewHintsOpen"
                class="ml-1 font-normal text-sulfur/70"
              >已折叠，避免挡住 Word</span>
            </span>
            <ChevronUp v-if="previewHintsOpen" class="size-3.5 shrink-0 text-sulfur" />
            <ChevronDown v-else class="size-3.5 shrink-0 text-sulfur" />
            <span class="shrink-0 text-[11px] text-sulfur/80">{{
              previewHintsOpen ? '收起' : '展开'
            }}</span>
          </button>
          <ul
            v-if="previewHintsOpen"
            class="tender-preview-hints-list space-y-1 border-t border-sulfur/20 px-3 py-2 text-[11px] text-sulfur"
          >
            <li v-for="(w, i) in result.warnings" :key="i" class="flex gap-1.5">
              <TriangleAlert class="size-3.5 shrink-0 mt-0.5" />
              {{ w }}
            </li>
          </ul>
        </div>

        <TenderDocEditor
          :key="`${result.docxFile}-${previewEditorMode}`"
          class="tender-preview-editor"
          :docx-file="result.docxFile"
          :download-name="result.downloadName"
          :fullscreen="previewFullscreen"
          :layout-tick="previewLayoutTick"
          :mode="previewEditorMode"
        />

        <footer class="tender-step-footer shrink-0 pt-2">
          <button type="button" class="tender-ghost-btn" @click="onStepBack">
            <ChevronLeft class="size-3.5" />
            上一步
          </button>
          <button type="button" class="tender-primary-btn min-w-[160px]" @click="onPreviewStepNext">
            去下载定稿
            <ChevronRight class="size-3.5" />
          </button>
        </footer>
      </div>
    </section>

    <!-- 步骤 4：下载定稿 -->
    <section v-else-if="currentStepIndex === 3 && result" class="tender-step-panel space-y-4">
      <section class="tender-card tender-card--success">
        <div class="tender-card-head border-b-0 pb-0">
          <h2 class="text-[14px] font-semibold text-patina">投标文件已就绪</h2>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            一份 Word，内含商务标（资格、报价、业绩、函件）和技术标（偏差表与实施方案）。目录独占一页，页码与正文分页对齐。
          </p>
        </div>
        <ul v-if="result.warnings.length" class="mt-3 space-y-1 text-[11px] text-sulfur">
          <li v-for="(w, i) in result.warnings" :key="i" class="flex gap-1.5">
            <TriangleAlert class="size-3.5 shrink-0 mt-0.5" />
            {{ w }}
          </li>
        </ul>
        <div class="flex flex-col sm:flex-row gap-2 mt-4">
          <button
            type="button"
            class="tender-primary-btn flex-1 h-10"
            :disabled="downloading === 'docx'"
            @click="onDownload('docx')"
          >
            <Loader2 v-if="downloading === 'docx'" class="size-3.5 animate-spin" />
            <Download v-else class="size-3.5" />
            下载 Word
          </button>
          <button
            v-if="result.pdfFile"
            type="button"
            class="tender-ghost-btn flex-1 justify-center h-10"
            :disabled="downloading === 'pdf'"
            @click="onDownload('pdf')"
          >
            <Loader2 v-if="downloading === 'pdf'" class="size-3.5 animate-spin" />
            <Download v-else class="size-3.5" />
            下载资质 PDF
          </button>
        </div>
      </section>

      <Panel title="表单摘要" subtitle="本次生成所用关键字段">
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div class="sm:col-span-2">
            <dt class="text-[11px] text-muted-foreground">项目</dt>
            <dd class="mt-0.5 text-foreground/90">{{ form.projectName || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted-foreground">招标人</dt>
            <dd class="mt-0.5">{{ form.tenderer || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted-foreground">投标总价</dt>
            <dd class="mt-0.5 font-sans">{{ moneyLabel }} 元</dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted-foreground">法人</dt>
            <dd class="mt-0.5">{{ form.legalPersonName || '—' }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-[11px] text-muted-foreground">投标内容</dt>
            <dd class="mt-0.5 line-clamp-2 text-muted-foreground">{{ form.bidContent || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted-foreground">原厂角色</dt>
            <dd class="mt-0.5">{{ form.factoryRole || '（按项目自动）' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted-foreground">商务标 / 技术标</dt>
            <dd class="mt-0.5">
              {{ form.performanceLines.length }} 条业绩 · {{ form.deviationLines.length }} 条偏差
              · {{ form.techPlanNote ? '已写方案说明' : '方案说明未写' }}
              · 图纸 {{ techDrawingSlot.fileCount }} 张
            </dd>
          </div>
        </dl>
      </Panel>

      <div
        v-if="result.attachmentMatch && (result.attachmentMatch.matched.length || result.attachmentMatch.missingFiles.length || result.attachmentMatch.createdItems.length)"
        class="tender-card"
      >
        <p class="text-[12px] font-medium mb-1">本标附件对照</p>
        <p v-if="result.attachmentMatch.matched.length" class="text-[11px] text-emerald-700 dark:text-emerald-400">
          已写入扫描件 {{ result.attachmentMatch.matched.length }} 项
        </p>
        <p v-if="result.attachmentMatch.missingFiles.length" class="text-[11px] text-muted-foreground">
          未上传 {{ result.attachmentMatch.missingFiles.map((x) => x.title).join('、') }}
        </p>
        <p v-if="result.attachmentMatch.createdItems.length" class="text-[11px] text-muted-foreground">
          资料库新建空项 {{ result.attachmentMatch.createdItems.map((x) => x.title).join('、') }}
        </p>
      </div>

      <footer class="tender-step-footer">
        <button type="button" class="tender-ghost-btn" @click="onStepBack">
          <ChevronLeft class="size-3.5" />
          返回预览编辑
        </button>
        <button type="button" class="tender-ghost-btn" @click="goToStep(1)">
          修改表单
        </button>
      </footer>
    </section>
  </div>

  <AppAlertDialog
    :open="confirmGenerateOpen"
    :title="confirmGenerateTitle"
    :description="confirmGenerateDescription"
    confirm-label="确认另存生成"
    :loading="generating"
    @update:open="onConfirmGenerateOpen"
    @confirm="confirmGenerateAgain"
  />
  <AppAlertDialog
    :open="confirmDeleteOpen"
    title="删除生成记录"
    :description="
      pendingDeleteItem
        ? `确定删除「${pendingDeleteItem.projectName || '未命名项目'}」这条记录？对应 Word 文件也会删除，不可恢复。`
        : '确定删除该记录？'
    "
    confirm-label="确认删除"
    destructive
    :loading="!!deletingId"
    @update:open="onConfirmDeleteOpen"
    @confirm="confirmDeleteRecord"
  />
</template>

<style scoped>
.tender-steps {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: color-mix(in srgb, var(--bg-elevated, hsl(var(--card))) 88%, transparent);
}
.tender-steps button {
  border: none;
  background: transparent;
  padding: 0;
}
.tender-step-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 9999px;
  border: 1.5px solid var(--hairline, hsl(var(--border)));
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-base, hsl(var(--background)));
}
.tender-step-dot--active {
  border-color: var(--accent-iron, hsl(var(--primary)));
  background: color-mix(in srgb, var(--accent-iron, hsl(var(--primary))) 12%, transparent);
  color: var(--accent-iron, hsl(var(--primary)));
}
.tender-step-dot--done {
  border-color: var(--accent-patina, #3d8b7a);
  background: color-mix(in srgb, var(--accent-patina, #3d8b7a) 15%, transparent);
  color: var(--accent-patina, #3d8b7a);
}
.tender-step-line {
  flex: 1;
  height: 2px;
  border-radius: 1px;
  background: var(--hairline, hsl(var(--border)));
  min-width: 1rem;
}
.tender-step-line--done {
  background: color-mix(in srgb, var(--accent-patina, #3d8b7a) 55%, var(--hairline, hsl(var(--border))));
}
.tender-step-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.tender-volume-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 0.5rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: var(--bg-elevated, hsl(var(--card)));
}
.tender-volume-btn {
  height: 1.75rem;
  padding: 0 0.75rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--muted-foreground, hsl(var(--muted-foreground)));
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.tender-volume-btn--active {
  background: color-mix(in srgb, var(--accent-iron, hsl(var(--primary))) 88%, black);
  color: #fff;
}
.tender-page--preview {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 6.75rem);
  min-height: 0;
}
.tender-page-header--preview {
  margin-bottom: 0.5rem !important;
}
.tender-step-panel--preview {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tender-preview-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: var(--bg-elevated, hsl(var(--card)));
  padding: 1rem 1.25rem 1.25rem;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 4%, transparent);
}
.tender-preview-shell--fs {
  position: fixed;
  inset: 0;
  z-index: 90;
  width: 100vw;
  height: 100dvh;
  border-radius: 0;
  padding: 0.75rem 1rem 1rem;
  box-shadow: none;
}
.tender-preview-shell--fs :deep(.tender-doc-editor) {
  flex: 1 1 0;
  min-height: 0;
  height: auto;
}
.tender-preview-editor {
  flex: 1 1 0;
  min-height: 0;
  align-self: stretch;
  width: 100%;
}
.tender-preview-hints-list {
  max-height: 7.5rem;
  overflow-y: auto;
}
.tender-step-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.25rem;
}
.tender-card {
  border-radius: 0.75rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: var(--bg-elevated, hsl(var(--card)));
  padding: 1rem 1.25rem;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 4%, transparent);
}
.tender-card--sticky {
  padding-bottom: 1.25rem;
}
.tender-card--success {
  border-color: color-mix(in srgb, var(--accent-patina, #3d8b7a) 35%, var(--hairline, hsl(var(--border))));
  background: color-mix(in srgb, var(--accent-patina, #3d8b7a) 6%, var(--bg-elevated, hsl(var(--card))));
}
.tender-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.25rem;
}
.tender-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--accent-molybdenum, hsl(var(--muted))) 12%, transparent);
  color: var(--accent-molybdenum, hsl(var(--muted-foreground)));
  shrink: 0;
}
.tender-card-icon--accent {
  background: color-mix(in srgb, var(--accent-iron, hsl(var(--primary))) 12%, transparent);
  color: var(--accent-iron, hsl(var(--primary)));
}
.tender-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 9.5rem;
  padding: 1.5rem 1rem;
  border-radius: 0.625rem;
  border: 2px dashed var(--hairline, hsl(var(--border)));
  background: color-mix(in srgb, var(--bg-base, hsl(var(--background))) 60%, transparent);
  transition: border-color 0.15s, background 0.15s;
  cursor: pointer;
  text-align: center;
}
.tender-dropzone:hover,
.tender-dropzone--active {
  border-color: color-mix(in srgb, var(--accent-iron, hsl(var(--primary))) 45%, var(--hairline, hsl(var(--border))));
  background: color-mix(in srgb, var(--accent-iron, hsl(var(--primary))) 5%, transparent);
}
.tender-dropzone--filled {
  border-style: solid;
  border-color: color-mix(in srgb, var(--accent-patina, #3d8b7a) 40%, var(--hairline, hsl(var(--border))));
  background: color-mix(in srgb, var(--accent-patina, #3d8b7a) 5%, transparent);
}
.tender-primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  height: 2.25rem;
  padding: 0 1rem;
  border-radius: 0.5rem;
  font-size: 12px;
  font-weight: 500;
  color: white;
  background: var(--accent-iron, hsl(var(--primary)));
  transition: opacity 0.15s;
}
.tender-primary-btn:hover:not(:disabled) {
  opacity: 0.92;
}
.tender-primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tender-generate-wrap {
  position: relative;
}
.tender-generate-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.5rem);
  transform: translateX(-50%);
  width: max-content;
  max-width: min(18rem, calc(100vw - 2rem));
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;
  font-size: 11px;
  line-height: 1.45;
  color: hsl(var(--foreground));
  background: hsl(var(--popover, var(--card)));
  border: 1px solid var(--hairline, hsl(var(--border)));
  box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 30;
}
.tender-generate-tooltip::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--hairline, hsl(var(--border)));
}
.tender-generate-wrap--hint:hover .tender-generate-tooltip,
.tender-generate-wrap--hint:focus-within .tender-generate-tooltip {
  opacity: 1;
}
.tender-ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.75rem;
  border-radius: 0.5rem;
  font-size: 12px;
  border: 1px solid var(--hairline, hsl(var(--border)));
  color: var(--text-secondary, hsl(var(--muted-foreground)));
  background: transparent;
  transition: background 0.15s;
}
.tender-ghost-btn:hover {
  background: color-mix(in srgb, var(--hairline, hsl(var(--border))) 40%, transparent);
}
.tender-hint-ok {
  font-size: 11px;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--accent-patina, #3d8b7a) 30%, transparent);
  background: color-mix(in srgb, var(--accent-patina, #3d8b7a) 8%, transparent);
  color: var(--accent-patina, #3d8b7a);
}
.tender-hint-muted {
  font-size: 11px;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: color-mix(in srgb, var(--bg-base, hsl(var(--background))) 50%, transparent);
  color: var(--text-muted, hsl(var(--muted-foreground)));
  text-align: center;
}
.tender-hint-warn {
  font-size: 11px;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--accent-sulfur, #c9a227) 35%, transparent);
  background: color-mix(in srgb, var(--accent-sulfur, #c9a227) 10%, transparent);
  color: var(--accent-sulfur, #a8841a);
}
.kb-input {
  background: var(--bg-surface, transparent);
  border: 1px solid var(--hairline, hsl(var(--border)));
  border-radius: 6px;
  color: inherit;
  font-size: 12px;
  padding: 8px 10px;
  width: 100%;
}
.kb-input:focus {
  outline: none;
  border-color: var(--accent-molybdenum, hsl(var(--ring)));
}
.tender-req {
  margin-left: 0.15em;
  font-weight: 700;
  color: var(--destructive, #e03e3e);
}
</style>
