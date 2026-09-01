<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
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
} from 'lucide-vue-next'
import { PageHeader, Panel, Tag } from '@/components/ui-kit'
import { fmtSize, KB_UPLOAD_MAX_BYTES } from '@/lib/read-file-smart'
import { ApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'
import {
  clearTenderSlot,
  downloadTenderFile,
  fetchTenderDefaults,
  fetchTenderLibrary,
  fetchTenderRecord,
  fetchTenderRecords,
  generateTender,
  parseTenderInvitation,
  uploadTenderSlot,
  type BidBrief,
  type GenerateResult,
  type PlaceholderItem,
  type QualificationStatus,
  type QuoteLineIn,
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
    bidderName: '',
    bidderNature: '有限责任公司',
    bidderAddress: '',
    bidderWebsite: '',
    bidderPhone: '',
    bidderFax: '',
    bidderPostcode: '',
    bidderEmail: '',
    foundedDate: '',
    businessTerm: '长期',
    legalPersonName: '',
    legalPersonGender: '男',
    legalPersonAge: '',
    legalPersonTitle: '执行董事',
    legalPersonIdNo: '',
    agentName: '',
    agentIdNo: '',
    agentAuthUntil: '',
    trafficFeeNote: '',
    extraNote: '',
    attachQualifications: true,
    includePlaceholders: true,
    includeCommitment: true,
    extraPlaceholders: [],
    quoteTitle: '',
    quoteTaxRate: 0.13,
    quoteSourceIncTax: 0,
    quoteSource: '',
    quoteLines: [],
  }
}

function emptyQuoteLine(): QuoteLineIn {
  return { seq: '', name: '', spec: '', unit: '', qty: 0, unitPrice: 0, amount: 0 }
}

const router = useRouter()
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
const parsePlaceholders = ref<PlaceholderItem[]>([])
const slotStatuses = ref<SlotStatus[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const quoteInput = ref<HTMLInputElement | null>(null)
const slotFileInput = ref<HTMLInputElement | null>(null)
const pendingSlotKey = ref<string | null>(null)
const pendingSlotReplace = ref(true)
/** 识别后是否已跑过「识别并填表」 */
const hasParsed = ref(false)
/** 右侧资料库列表默认折叠为紧凑条 */
const slotsExpanded = ref(false)
const allowBuiltinQuote = ref(false)
/** 向导当前步骤 0=上传 1=填表 2=预览编辑 3=生成下载 */
const currentStepIndex = ref(0)
const maxStepReached = ref(0)
const previewFullscreen = ref(false)
const showRecords = ref(false)
const recordsLoading = ref(false)
const records = ref<TenderRecordItem[]>([])
const recordsTotal = ref(0)
const recordsQuery = ref('')
const openingRecordId = ref<string | null>(null)

const paySum = computed(
  () => form.prepaidPct + form.arrivalPct + form.settlementPct + form.warrantyPct,
)

const moneyLabel = computed(() => {
  const n = Number(form.bidPriceYuan) || 0
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
})

function isBlank(value: unknown) {
  return !String(value ?? '').trim()
}

const agentIdRequired = computed(() => !isBlank(form.agentName))

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
  if (!form.quoteLines.length && !allowBuiltinQuote.value) {
    issues.push('工程量分项（上传清单或勾选内置模板）')
  }
  return issues
})

const generateButtonDisabled = computed(
  () => generating.value || generateBlockers.value.length > 0,
)

const generateButtonTooltip = computed(() => {
  if (generating.value) return ''
  if (generateBlockers.value.length) {
    return `请先填写 ${generateBlockers.value.join('、')} 等关键信息`
  }
  return ''
})

const formStepNextLabel = computed(() =>
  generating.value ? '正在生成预览…' : '下一步：预览编辑',
)

const placeholderItems = computed((): SlotStatus[] => {
  if (slotStatuses.value.length) return slotStatuses.value
  const items = parsePlaceholders.value.length
    ? parsePlaceholders.value
    : form.extraPlaceholders
  if (items.length) {
    return items.map((x) => ({
      key: x.key,
      title: x.title,
      hint: x.hint || '',
      fileCount: 0,
      files: [],
    }))
  }
  return [
    { key: 'id_legal', title: '法定代表人身份证正反面', hint: '', fileCount: 0, files: [] },
    { key: 'id_agent', title: '授权代理人身份证及社保', hint: '', fileCount: 0, files: [] },
    { key: 'perf', title: '类似项目合同及发票（≥20万元）', hint: '', fileCount: 0, files: [] },
    { key: 'finance', title: '近三年财务 / 完税 / 社保', hint: '', fileCount: 0, files: [] },
    { key: 'credit', title: '信用中国及企信公示查询页', hint: '', fileCount: 0, files: [] },
    { key: 'product', title: '产品检测 / 3C / 对应功率证明', hint: '', fileCount: 0, files: [] },
    { key: 'bond', title: '投标保证金回单', hint: '', fileCount: 0, files: [] },
    { key: 'seal', title: '签章', hint: '', fileCount: 0, files: [] },
  ]
})

const slotFilledCount = computed(
  () => placeholderItems.value.filter((s) => s.fileCount > 0).length,
)

const workflowSteps = [
  { key: 'upload', label: '上传邀请书' },
  { key: 'form', label: '识别填表' },
  { key: 'preview', label: '预览编辑' },
  { key: 'generate', label: '生成文档' },
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

function onPreviewFullscreenKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && previewFullscreen.value) {
    ev.preventDefault()
    setPreviewFullscreen(false)
  }
}

function advanceStep(index: number) {
  currentStepIndex.value = index
  maxStepReached.value = Math.max(maxStepReached.value, index)
}

const dragOverInvite = ref(false)

function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (file !== inviteFile.value) {
    hasParsed.value = false
    parseNotes.value = []
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
    }
    inviteFile.value = file
  }
}

function mergeSlotStatus(payload: SlotStatus) {
  const idx = slotStatuses.value.findIndex((s) => s.key === payload.key)
  const next: SlotStatus = {
    key: payload.key,
    title: payload.title || slotStatuses.value[idx]?.title || payload.key,
    hint: payload.hint || slotStatuses.value[idx]?.hint || '',
    fileCount: payload.fileCount ?? payload.files?.length ?? 0,
    files: payload.files || [],
  }
  if (idx >= 0) slotStatuses.value.splice(idx, 1, next)
  else slotStatuses.value.push(next)
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

function formatRecordTime(ms: number) {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toggleRecords() {
  showRecords.value = !showRecords.value
  if (showRecords.value) void loadRecords()
}

async function openRecordPreview(item: TenderRecordItem) {
  if (!item.docxAvailable) {
    error.value = '该记录的 Word 文件已丢失，无法预览'
    return
  }
  openingRecordId.value = item.id
  error.value = ''
  try {
    const detail = await fetchTenderRecord(item.id)
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
    showRecords.value = false
    setPreviewFullscreen(false)
    advanceStep(2)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '打开记录失败'
  } finally {
    openingRecordId.value = null
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
    slotStatuses.value = library?.slots?.length ? library.slots : data.slots || []
    kbList.value = bases
    const { qualification: _q, slots: _s, ...rest } = data as TenderDefaultsLoose
    Object.assign(form, rest)
    if (!Array.isArray(form.extraPlaceholders)) form.extraPlaceholders = []
    if (!Array.isArray(form.quoteLines)) form.quoteLines = []
    if (form.includePlaceholders == null) form.includePlaceholders = true
    if (form.includeCommitment == null) form.includeCommitment = true
    void loadRecords()
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '加载默认值失败'
  } finally {
    loading.value = false
  }
})

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
  quoteFile.value = input.files?.[0] ?? null
}

function toggleKb(id: string) {
  selectedKbIds.value = selectedKbIds.value.includes(id)
    ? selectedKbIds.value.filter((x) => x !== id)
    : [...selectedKbIds.value, id]
}

function addQuoteRow() {
  form.quoteLines.push({
    ...emptyQuoteLine(),
    seq: String(form.quoteLines.length + 1),
  })
}

function removeQuoteRow(index: number) {
  form.quoteLines.splice(index, 1)
}

function touchQuoteRow(row: QuoteLineIn) {
  const qty = Number(row.qty) || 0
  const price = Number(row.unitPrice) || 0
  row.amount = Math.round(qty * price * 100) / 100
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
    Object.assign(form, data.brief)
    if (!Array.isArray(form.extraPlaceholders)) form.extraPlaceholders = []
    if (!Array.isArray(form.quoteLines)) form.quoteLines = []
    parseNotes.value = data.notes || []
    parsePlaceholders.value = data.placeholders || []
    if (data.slots?.length) slotStatuses.value = data.slots
    if (form.quoteLines.length) allowBuiltinQuote.value = false
    else allowBuiltinQuote.value = true
    hasParsed.value = true
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
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '上传失败'
  } finally {
    uploadingKey.value = null
  }
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
  if (slot.files.length === 1) return slot.files[0].name
  return `${slot.files[0]?.name || '已上传'} 等 ${slot.fileCount} 个文件`
}

async function onUploadStepNext() {
  if (!inviteFile.value) {
    error.value = '请先上传投标邀请书或招标文件'
    return
  }
  error.value = ''
  if (!hasParsed.value) {
    await onParseInvitation()
    if (!hasParsed.value) return
  }
  advanceStep(1)
}

async function onFormStepNext() {
  if (generateBlockers.value.length) {
    error.value = `请先完善：${generateBlockers.value.join('、')}`
    return
  }
  error.value = ''
  generating.value = true
  try {
    result.value = await generateTender({
      ...form,
      includeCommitment: true,
      includePlaceholders: true,
    })
    void loadRecords()
    advanceStep(2)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '生成预览失败'
  } finally {
    generating.value = false
  }
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
    title="投标文件"
    description="四步向导：上传 → 填表 → 在线预览编辑 → 下载定稿"
  >
    <template #badges>
      <Tag tone="molybdenum">邀请书抽字段</Tag>
      <Tag>程序填模</Tag>
      <button
        type="button"
        class="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] hover:bg-accent transition-colors"
        :class="showRecords ? 'border-iron bg-iron/10 text-foreground' : 'text-muted-foreground'"
        @click="toggleRecords"
      >
        <History class="size-3.5" />
        生成记录
        <span v-if="recordsTotal" class="font-mono">{{ recordsTotal }}</span>
      </button>
    </template>
  </PageHeader>

  <p
    v-if="error"
    class="mb-4 text-[12px] text-sulfur border border-sulfur/30 bg-sulfur/10 rounded-md px-3 py-2"
  >
    {{ error }}
  </p>

  <section v-if="showRecords" class="tender-card mb-5 max-w-5xl mx-auto">
    <div class="tender-card-head">
      <div class="min-w-0">
        <h2 class="text-[14px] font-semibold">生成记录</h2>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          每次生成都会入库；可在线预览或重新下载 Word
        </p>
      </div>
      <button type="button" class="tender-ghost-btn shrink-0" @click="showRecords = false">
        收起
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

    <div v-if="recordsLoading && !records.length" class="py-8 text-center text-[12px] text-muted-foreground">
      <Loader2 class="inline size-4 animate-spin mr-2" />加载记录…
    </div>
    <p v-else-if="!records.length" class="mt-4 text-[12px] text-muted-foreground text-center py-6">
      暂无生成记录。完成「识别填表 → 下一步：预览编辑」后会出现在这里。
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
        <div class="flex shrink-0 items-center gap-1.5">
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
        </div>
      </li>
    </ul>
  </section>

  <div v-if="loading" class="py-16 text-center text-[12px] text-muted-foreground">
    <Loader2 class="inline size-4 animate-spin mr-2" />加载默认信息…
  </div>

  <div
    v-else
    class="tender-page mx-auto"
    :class="currentStepIndex === 2 ? 'tender-page--preview max-w-[1600px]' : 'max-w-3xl'"
  >
    <nav class="tender-steps mb-6" aria-label="投标生成流程">
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
                支持 PDF、Word、图片；可选上传工程量清单 Excel
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
            工程量清单（可选）
          </button>
          <span class="text-[11px] text-muted-foreground truncate max-w-[240px]">
            {{ quoteFile ? quoteFile.name : 'Excel / Word' }}
          </span>
        </div>

        <div v-if="kbList.length" class="mt-4 pt-4 border-t border-border/60">
          <p class="text-[11px] text-muted-foreground mb-2">可选知识库（对照资格条款）</p>
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

    <!-- 步骤 2：识别填表 -->
    <section v-else-if="currentStepIndex === 1" class="tender-step-panel space-y-4">
      <div v-if="parseNotes.length" class="tender-card">
        <p class="text-[12px] font-medium text-foreground mb-2">识别说明</p>
        <ul class="space-y-1 text-[11px] text-muted-foreground">
          <li v-for="(n, i) in parseNotes" :key="i">{{ n }}</li>
        </ul>
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

      <Panel title="报价与承诺" subtitle="分项来自工程量清单；数量不随总价变，单价可按投标总价折算">
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
                当前清单 {{ form.quoteLines.length }} 项
                <span v-if="form.quoteTitle">（{{ form.quoteTitle }}）</span>
                ，不含税合计约 {{ quoteAmountSum.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }} 元。
                若总价与清单含税不同，生成时只折算单价。
              </template>
              <template v-else>
                尚未解析到本次工程量。生成时会暂用内置高途智成港清单（7kW×133、30kW×56 等）。请上传工程量 Excel/Word 后点「识别并填表」。
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

        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-[12px] text-muted-foreground">
              分项明细
              <span v-if="form.quoteLines.length"> · 数量合计 {{ quoteQtySum }}</span>
            </p>
            <button
              type="button"
              class="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-accent"
              @click="addQuoteRow"
            >
              增行
            </button>
          </div>
          <div class="overflow-x-auto border border-border rounded-md">
            <table class="w-full text-[11px] border-collapse min-w-[640px]">
              <thead>
                <tr class="text-muted-foreground bg-accent/40">
                  <th class="px-2 py-1.5 text-left font-medium w-10">序</th>
                  <th class="px-2 py-1.5 text-left font-medium">名称</th>
                  <th class="px-2 py-1.5 text-left font-medium">规格/参数</th>
                  <th class="px-2 py-1.5 text-left font-medium w-12">单位</th>
                  <th class="px-2 py-1.5 text-left font-medium w-16">数量</th>
                  <th class="px-2 py-1.5 text-left font-medium w-24">不含税单价</th>
                  <th class="px-2 py-1.5 text-left font-medium w-24">合价</th>
                  <th class="w-10"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!form.quoteLines.length">
                  <td colspan="8" class="px-2 py-3 text-muted-foreground">
                    识别邀请书或上传工程量清单后出现在这里，也可先手工增行。
                  </td>
                </tr>
                <tr v-for="(row, i) in form.quoteLines" :key="i" class="border-t border-border">
                  <td class="px-1 py-1">
                    <input v-model="row.seq" class="kb-input font-sans !py-1 !px-1" />
                  </td>
                  <td class="px-1 py-1 min-w-[120px]">
                    <input v-model="row.name" class="kb-input font-sans !py-1 !px-1" />
                  </td>
                  <td class="px-1 py-1 min-w-[160px]">
                    <input v-model="row.spec" class="kb-input font-sans !py-1 !px-1" />
                  </td>
                  <td class="px-1 py-1">
                    <input v-model="row.unit" class="kb-input font-sans !py-1 !px-1" />
                  </td>
                  <td class="px-1 py-1">
                    <input
                      v-model.number="row.qty"
                      type="number"
                      min="0"
                      step="any"
                      class="kb-input font-sans !py-1 !px-1"
                      @change="touchQuoteRow(row)"
                    />
                  </td>
                  <td class="px-1 py-1">
                    <input
                      v-model.number="row.unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      class="kb-input font-sans !py-1 !px-1"
                      @change="touchQuoteRow(row)"
                    />
                  </td>
                  <td class="px-1 py-1">
                    <input v-model.number="row.amount" type="number" step="0.01" class="kb-input font-sans !py-1 !px-1" />
                  </td>
                  <td class="px-1 py-1 text-center">
                    <button type="button" class="text-muted-foreground hover:text-sulfur" @click="removeQuoteRow(i)">
                      删
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <Panel title="投标人（伟泰）" subtitle="默认河南伟泰光电科技有限公司">
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
              placeholder="如 2016年3月"
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

      <Panel title="法定代表人 / 授权" subtitle="身份证请装订时另附，本版只填文字">
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
            资料库已维护项直接写入 Word，未维护的画虚线框。
            <button
              type="button"
              class="text-foreground underline underline-offset-2 ml-0.5"
              @click="router.push('/tender-library')"
            >
              去资料库
            </button>
          </p>
        </div>

        <label
          v-if="!form.quoteLines.length"
          class="flex items-start gap-2.5 text-[12px] p-2.5 rounded-md bg-accent/30 border border-border/50"
        >
          <input v-model="allowBuiltinQuote" type="checkbox" class="mt-0.5" />
          <span>
            使用内置工程量模板
            <span class="block text-[11px] text-muted-foreground mt-0.5 font-normal">
              未解析到清单时已默认勾选；有 Excel 清单请返回上一步上传后重新识别
            </span>
          </span>
        </label>

        <div class="mt-3 rounded-lg border border-border/60 overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[11px] hover:bg-accent/30 transition-colors"
            @click="slotsExpanded = !slotsExpanded"
          >
            <span class="inline-flex items-center gap-1.5 text-muted-foreground">
              <FolderOpen class="size-3.5" />
              本标补充资料
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
              </div>
            </li>
          </ul>
        </div>

        <label class="flex items-start gap-2.5 text-[12px] mt-4">
          <input v-model="form.attachQualifications" type="checkbox" class="mt-0.5" />
          <span class="text-muted-foreground leading-relaxed">
            插入企业资质 PDF
            <span class="block text-[11px] mt-0.5">
              {{
                qualification?.found
                  ? `已就绪（${Math.round((qualification.sizeBytes || 0) / 1024 / 1024)} MB）`
                  : '未找到时将提示补附'
              }}
            </span>
          </span>
        </label>
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
      <p v-if="generating && form.attachQualifications" class="mt-2 text-[11px] text-muted-foreground text-center">
        插入资质扫描件可能需要十几秒
      </p>
    </section>

    <!-- 步骤 3：预览编辑 -->
    <section v-else-if="currentStepIndex === 2 && result" class="tender-step-panel tender-step-panel--preview">
      <div class="tender-preview-shell" :class="{ 'tender-preview-shell--fs': previewFullscreen }">
        <div class="tender-card-head shrink-0 pb-3">
          <div class="min-w-0">
            <h2 class="text-[14px] font-semibold text-foreground">在线预览与编辑</h2>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              与桌面 Word 一致；修改会自动保存。可用全屏查看完整表格。
            </p>
          </div>
          <button
            type="button"
            class="tender-ghost-btn shrink-0"
            :title="previewFullscreen ? '还原窗口（Esc）' : '全屏预览'"
            :aria-label="previewFullscreen ? '还原窗口' : '全屏预览'"
            @click="togglePreviewFullscreen"
          >
            <Minimize2 v-if="previewFullscreen" class="size-3.5" />
            <Maximize2 v-else class="size-3.5" />
            {{ previewFullscreen ? '还原' : '全屏' }}
          </button>
        </div>

        <TenderDocEditor
          :key="result.docxFile"
          class="tender-preview-editor"
          :docx-file="result.docxFile"
          :download-name="result.downloadName"
          :fullscreen="previewFullscreen"
        />

        <footer class="tender-step-footer shrink-0 pt-2">
          <button type="button" class="tender-ghost-btn" @click="onStepBack">
            <ChevronLeft class="size-3.5" />
            上一步
          </button>
          <button type="button" class="tender-primary-btn min-w-[160px]" @click="onPreviewStepNext">
            下一步：下载定稿
            <ChevronRight class="size-3.5" />
          </button>
        </footer>
      </div>
    </section>

    <!-- 步骤 4：生成文档 / 下载 -->
    <section v-else-if="currentStepIndex === 3 && result" class="tender-step-panel space-y-4">
      <section class="tender-card tender-card--success">
        <div class="tender-card-head border-b-0 pb-0">
          <h2 class="text-[14px] font-semibold text-patina">投标文件已就绪</h2>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            下载 Word 后请更新目录页码并盖章；在线编辑的内容已保存。
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
        </dl>
      </Panel>

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
.tender-step-panel--preview {
  width: 100%;
  flex: 1;
  min-height: calc(100dvh - 11rem);
  display: flex;
  flex-direction: column;
}
.tender-page--preview {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 8rem);
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
