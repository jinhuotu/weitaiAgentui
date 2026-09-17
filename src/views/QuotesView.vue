<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Eye,
  FileSpreadsheet,
  History,
  Loader2,
  Maximize2,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-vue-next'
import { PageHeader, Panel, Tag } from '@/components/ui-kit'
import AppAlertDialog from '@/components/ui/AppAlertDialog.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import { ApiError } from '@/lib/api'
import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'
import {
  clearMineQuoteRecords,
  deleteQuoteRecord,
  downloadQuoteFile,
  emptyQuoteLine,
  exportQuoteRecord,
  fetchQuoteRecord,
  fetchQuoteRecords,
  generateQuote,
  lineAmount,
  recognizeQuote,
  type QuoteLine,
  type QuoteRecordItem,
} from '@/lib/quotes-api'

const KB_STORE = 'weitai.quoteKbId'
const MAX_MAPS = 20
const router = useRouter()

const projectName = ref('')
const note = ref('')
type MapPreview = { url: string; name: string; kind: 'image' | 'pdf' }

const files = ref<File[]>([])
const previews = ref<MapPreview[]>([])
const peek = ref<number | null>(null)
const lines = ref<QuoteLine[]>([])
const warnings = ref<string[]>([])
const recognizing = ref(false)
const generating = ref(false)
const err = ref('')
const hint = ref('')
const mapInput = ref<HTMLInputElement | null>(null)
const showRecords = ref(false)
const recordsLoading = ref(false)
const records = ref<QuoteRecordItem[]>([])
const recordsTotal = ref(0)
const recordsQuery = ref('')
const loadingRecordId = ref<string | null>(null)
const downloadingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const confirmDeleteOpen = ref(false)
const pendingDelete = ref<QuoteRecordItem | null>(null)
const confirmClearOpen = ref(false)
const clearingRecords = ref(false)
const previewOpen = ref(false)
const previewingId = ref<string | null>(null)
const previewDetail = ref<QuoteRecordItem | null>(null)

const kbList = ref<KnowledgeBaseItem[]>([])
const kbId = ref('')
const kbLoading = ref(false)

const unmatched = computed(() => lines.value.filter((r) => r.name && !(Number(r.unitPrice) > 0)).length)
const total = computed(() => lines.value.reduce((s, r) => s + lineAmount(r), 0))
const selectedKb = computed(() => kbList.value.find((b) => b.id === kbId.value) || null)

const SOURCE: Record<string, string> = {
  vision: '读图',
  rule: '规则',
  catalog: '价目',
  manual: '人工',
}

function isPdfFile(f: File) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')
}

watch(files, (next) => {
  previews.value.forEach((p) => URL.revokeObjectURL(p.url))
  peek.value = null
  previews.value = next.map((f) => ({
    url: URL.createObjectURL(f),
    name: f.name || '规划图',
    kind: isPdfFile(f) ? 'pdf' : 'image',
  }))
})

watch(kbId, (id) => {
  if (id) localStorage.setItem(KB_STORE, id)
})

const peekItem = computed(() => (peek.value == null ? null : previews.value[peek.value] || null))

watch(peek, (v, _, onCleanup) => {
  document.body.style.overflow = v == null ? '' : 'hidden'
  if (v == null) return
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') peek.value = null
  }
  window.addEventListener('keydown', onKey)
  onCleanup(() => window.removeEventListener('keydown', onKey))
})

onMounted(() => {
  void loadKb()
  void loadRecords(true)
})

onUnmounted(() => {
  document.body.style.overflow = ''
  previews.value.forEach((p) => URL.revokeObjectURL(p.url))
})

async function loadKb() {
  kbLoading.value = true
  try {
    const rows = await listKnowledgeBases({ access: 'use' })
    kbList.value = rows.filter((b) => b.id !== 'tenderlib01' && b.purpose !== 'asset')
    const saved = localStorage.getItem(KB_STORE) || ''
    if (saved && kbList.value.some((b) => b.id === saved)) {
      kbId.value = saved
    } else if (kbList.value.length === 1) {
      kbId.value = kbList.value[0]!.id
    }
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '加载知识库失败'
  } finally {
    kbLoading.value = false
  }
}

function onPickMaps(ev: Event) {
  const el = ev.target as HTMLInputElement
  const picked = Array.from(el.files || [])
  el.value = ''
  if (picked.length > MAX_MAPS) {
    err.value = `规划图一次最多 ${MAX_MAPS} 张`
    files.value = picked.slice(0, MAX_MAPS)
    return
  }
  files.value = picked
}

function onQtyPrice(row: QuoteLine) {
  row.amount = lineAmount(row)
}

async function onRecognize() {
  err.value = ''
  hint.value = ''
  if (!kbId.value) {
    err.value = '请先选择知识库（价目 Excel 从该库读取）'
    return
  }
  if (!files.value.length) {
    err.value = '请先上传场地规划图（图片或 PDF）'
    return
  }
  recognizing.value = true
  try {
    const data = await recognizeQuote({
      files: files.value,
      baseId: kbId.value,
      note: note.value,
      projectName: projectName.value,
    })
    if (data.projectName && !projectName.value) projectName.value = data.projectName
    lines.value = (data.lines || []).map((r) => ({ ...emptyQuoteLine(), ...r, amount: lineAmount(r) }))
    warnings.value = data.warnings || []
    hint.value = data.unmatched
      ? `已识别 ${data.lines.length} 项，其中 ${data.unmatched} 项未匹配到价目。请改单价，或到知识库上传含「名称/单价」的 Excel。`
      : `已识别 ${data.lines.length} 项`
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '识别失败'
  } finally {
    recognizing.value = false
  }
}

function addLine() {
  const row = emptyQuoteLine()
  row.seq = String(lines.value.length + 1)
  lines.value.push(row)
}

function removeLine(idx: number) {
  lines.value.splice(idx, 1)
  lines.value.forEach((r, i) => {
    r.seq = String(i + 1)
  })
}

async function onGenerate() {
  err.value = ''
  hint.value = ''
  const rows = lines.value.filter((r) => r.name.trim())
  if (!rows.length) {
    err.value = '请先识别规划图，或手工补一行报价'
    return
  }
  generating.value = true
  try {
    const data = await generateQuote({
      projectName: projectName.value,
      note: note.value,
      taxRate: 0.13,
      baseId: kbId.value,
      baseName: selectedKb.value?.name || '',
      lines: rows.map((r) => ({ ...r, amount: lineAmount(r) })),
    })
    await downloadQuoteFile(data.xlsxFile, data.downloadName)
    hint.value = `已下载 ${data.downloadName}，不含税合计 ${data.totalExTax.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元`
    void loadRecords()
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '生成失败'
  } finally {
    generating.value = false
  }
}

function formatRecordTime(ms: number) {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function money(n: number) {
  return (Number(n) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function applyDetail(detail: QuoteRecordItem) {
  projectName.value = detail.projectName || ''
  note.value = detail.note || ''
  if (detail.baseId && kbList.value.some((b) => b.id === detail.baseId)) {
    kbId.value = detail.baseId
  }
  lines.value = (detail.lines || []).map((r) => ({ ...emptyQuoteLine(), ...r, amount: lineAmount(r) }))
  warnings.value = []
  showRecords.value = false
  previewOpen.value = false
  hint.value = `已载入「${detail.projectName || '未命名项目'}」共 ${lines.value.length} 行，可改完再生成`
}

async function loadRecords(silent = false) {
  recordsLoading.value = true
  try {
    const data = await fetchQuoteRecords({
      q: recordsQuery.value.trim() || undefined,
      limit: 50,
    })
    records.value = data.items || []
    recordsTotal.value = data.total || 0
  } catch (e) {
    if (!silent) {
      err.value = e instanceof ApiError || e instanceof Error ? e.message : '加载报价记录失败'
    }
  } finally {
    recordsLoading.value = false
  }
}

function toggleRecords() {
  showRecords.value = !showRecords.value
  if (showRecords.value) void loadRecords()
}

async function loadRecordLines(item: QuoteRecordItem) {
  if (previewDetail.value?.id === item.id && previewDetail.value.lines) {
    applyDetail(previewDetail.value)
    return
  }
  loadingRecordId.value = item.id
  err.value = ''
  try {
    applyDetail(await fetchQuoteRecord(item.id))
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '载入记录失败'
  } finally {
    loadingRecordId.value = null
  }
}

async function previewRecord(item: QuoteRecordItem) {
  previewingId.value = item.id
  err.value = ''
  try {
    previewDetail.value = await fetchQuoteRecord(item.id)
    previewOpen.value = true
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '打开预览失败'
  } finally {
    previewingId.value = null
  }
}

function loadFromPreview() {
  if (!previewDetail.value) return
  applyDetail(previewDetail.value)
}

async function downloadRecord(item: QuoteRecordItem) {
  downloadingId.value = item.id
  err.value = ''
  try {
    let file = item.xlsxFile
    let name = item.downloadName
    if (!item.xlsxAvailable) {
      const again = await exportQuoteRecord(item.id)
      file = again.xlsxFile
      name = again.downloadName
      const idx = records.value.findIndex((r) => r.id === item.id)
      if (idx >= 0) records.value.splice(idx, 1, { ...records.value[idx], ...again })
      if (previewDetail.value?.id === item.id) {
        previewDetail.value = { ...previewDetail.value, ...again }
      }
    }
    await downloadQuoteFile(file, name)
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '下载失败'
  } finally {
    downloadingId.value = null
  }
}

function askDelete(item: QuoteRecordItem) {
  pendingDelete.value = item
  confirmDeleteOpen.value = true
}

async function confirmDelete() {
  const item = pendingDelete.value
  if (!item) return
  deletingId.value = item.id
  try {
    await deleteQuoteRecord(item.id)
    confirmDeleteOpen.value = false
    pendingDelete.value = null
    await loadRecords()
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '删除失败'
  } finally {
    deletingId.value = null
  }
}

async function confirmClear() {
  clearingRecords.value = true
  try {
    await clearMineQuoteRecords()
    confirmClearOpen.value = false
    await loadRecords()
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '清空失败'
  } finally {
    clearingRecords.value = false
  }
}
</script>

<template>
  <div class="px-5 lg:px-8 py-6 max-w-6xl mx-auto">
    <PageHeader
      title="AI报价生成"
      description="选一个已有知识库读取价目，再上传场地规划图识别工程量，核对后导出 Excel。单价只从库里的价目表匹配，不会由模型编造。"
    >
      <template #actions>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] transition-colors"
          :class="
            showRecords
              ? 'border-iron bg-iron/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          "
          @click="toggleRecords"
        >
          <History class="size-3.5" />
          我的报价记录
          <span v-if="recordsTotal" class="font-mono text-[11px]">{{ recordsTotal }}</span>
        </button>
      </template>
    </PageHeader>

    <p v-if="err" class="mb-3 flex items-start gap-1.5 text-[12px] text-sulfur">
      <TriangleAlert class="size-3.5 shrink-0 mt-0.5" />
      {{ err }}
    </p>
    <p v-else-if="hint" class="mb-3 text-[12px] text-muted-foreground">{{ hint }}</p>

    <section v-if="showRecords" class="rounded-xl border border-border bg-card px-4 py-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-[14px] font-semibold">我的报价记录</h2>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            点项目名或「预览」看当时的报价单，不会改当前表单。要改再「载入明细」。
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] text-sulfur hover:bg-accent disabled:opacity-50"
            :disabled="!recordsTotal || clearingRecords"
            @click="confirmClearOpen = true"
          >
            <Loader2 v-if="clearingRecords" class="size-3.5 animate-spin" />
            <Trash2 v-else class="size-3.5" />
            清空
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[12px] hover:bg-accent"
            @click="showRecords = false"
          >
            返回报价
          </button>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input
          v-model="recordsQuery"
          class="h-8 min-w-[220px] rounded-md border border-border bg-background px-2 text-[12px]"
          placeholder="搜索项目 / 价目库"
          @keydown.enter.prevent="loadRecords"
        />
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] hover:bg-accent disabled:opacity-50"
          :disabled="recordsLoading"
          @click="loadRecords"
        >
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
        暂无记录。核对明细后点「生成并下载 Excel」会出现在这里。
      </p>
      <ul v-else class="mt-3 divide-y divide-border/70">
        <li
          v-for="item in records"
          :key="item.id"
          class="flex flex-col sm:flex-row sm:items-center gap-2 py-3"
        >
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="text-[13px] font-medium truncate text-left hover:underline disabled:opacity-50"
              :disabled="previewingId === item.id"
              :title="`预览 ${item.projectName || '未命名项目'}`"
              @click="previewRecord(item)"
            >
              {{ item.projectName || '未命名项目' }}
            </button>
            <div class="mt-0.5 text-[11px] text-muted-foreground">
              {{ item.lineCount }} 项
              · {{ money(item.totalExTax) }} 元
              <span v-if="item.baseName"> · {{ item.baseName }}</span>
              · {{ formatRecordTime(item.createdAt) }}
              <span v-if="!item.xlsxAvailable" class="text-sulfur ml-1">文件缺失</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1.5 flex-wrap">
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] hover:bg-accent disabled:opacity-50"
              :disabled="previewingId === item.id"
              @click="previewRecord(item)"
            >
              <Loader2 v-if="previewingId === item.id" class="size-3.5 animate-spin" />
              <Eye v-else class="size-3.5" />
              预览
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[12px] hover:bg-accent disabled:opacity-50"
              :disabled="loadingRecordId === item.id"
              @click="loadRecordLines(item)"
            >
              <Loader2 v-if="loadingRecordId === item.id" class="size-3.5 animate-spin" />
              载入明细
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[12px] hover:bg-accent disabled:opacity-50"
              :disabled="downloadingId === item.id"
              @click="downloadRecord(item)"
            >
              <Loader2 v-if="downloadingId === item.id" class="size-3.5 animate-spin" />
              <FileSpreadsheet v-else class="size-3.5" />
              下载 Excel
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[12px] text-sulfur hover:bg-accent disabled:opacity-50"
              :disabled="deletingId === item.id"
              @click="askDelete(item)"
            >
              <Loader2 v-if="deletingId === item.id" class="size-3.5 animate-spin" />
              删除
            </button>
          </div>
        </li>
      </ul>
    </section>

    <div v-else class="space-y-4">
      <Panel title="知识库" subtitle="对价只读所选库中的 Excel（需有名称、单价列）。资料请到「知识库」里维护。">
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="kbId"
            class="h-8 min-w-[220px] rounded-md border border-border bg-background px-2 text-[12px]"
            :disabled="kbLoading"
          >
            <option value="">{{ kbLoading ? '正在加载…' : '请选择知识库' }}</option>
            <option v-for="b in kbList" :key="b.id" :value="b.id">
              {{ b.name }}（{{ b.docCount }} 份）
            </option>
          </select>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] hover:bg-accent disabled:opacity-50"
            :disabled="!kbId"
            @click="router.push(`/knowledge/${kbId}`)"
          >
            去维护资料
          </button>
          <span v-if="selectedKb" class="text-[11px] text-muted-foreground">
            已选「{{ selectedKb.name }}」
          </span>
        </div>
        <p v-if="!kbLoading && !kbList.length" class="mt-2 text-[11px] text-sulfur">
          没有可用知识库。请先到「知识库」新建并上传价目 Excel，且账号要有该库的使用权限。
        </p>
      </Panel>

      <Panel title="场地规划图" subtitle="支持图片 / PDF，可一次选多张。可写一句桩型或规模说明。">
        <div class="space-y-3">
          <div class="grid gap-3 md:grid-cols-2">
            <label class="block text-[12px]">
              <span class="text-muted-foreground">项目名称</span>
              <input
                v-model="projectName"
                class="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                placeholder="可选，读图也可带回"
              />
            </label>
            <label class="block text-[12px]">
              <span class="text-muted-foreground">补充说明</span>
              <input
                v-model="note"
                class="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                placeholder="例如：直流 160kW，要雨棚"
              />
            </label>
          </div>
          <input
            ref="mapInput"
            type="file"
            class="hidden"
            accept="image/*,.pdf"
            multiple
            @change="onPickMaps"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] hover:bg-accent"
              @click="mapInput?.click()"
            >
              <Upload class="size-3.5" />
              选择规划图
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-[12px] disabled:opacity-50"
              :disabled="recognizing || !files.length || !kbId"
              @click="onRecognize"
            >
              <Loader2 v-if="recognizing" class="size-3.5 animate-spin" />
              {{ recognizing ? '正在读图并对价…' : '识别工程量' }}
            </button>
            <span class="text-[11px] text-muted-foreground">
              {{ files.length ? `已选 ${files.length} 个文件` : '未选择文件' }}
            </span>
          </div>
          <div v-if="previews.length" class="flex flex-wrap gap-2">
            <button
              v-for="(p, i) in previews"
              :key="p.url"
              type="button"
              class="group relative rounded-md border border-border overflow-hidden bg-muted/30 text-left"
              :title="`点击预览 ${p.name}`"
              @click="peek = i"
            >
              <img
                v-if="p.kind === 'image'"
                :src="p.url"
                :alt="p.name"
                class="max-h-44 max-w-[260px] object-contain bg-white block"
              />
              <div
                v-else
                class="h-44 w-40 px-2 flex flex-col items-center justify-center gap-1 text-[12px] text-muted-foreground"
              >
                <span class="rounded border border-border px-1.5 py-0.5 text-[10px]">PDF</span>
                <span class="truncate max-w-[9rem]" :title="p.name">{{ p.name }}</span>
              </div>
              <span
                class="absolute right-1 top-1 size-7 rounded-md bg-black/55 text-white inline-flex items-center justify-center opacity-0 group-hover:opacity-100"
              >
                <Maximize2 class="size-3.5" />
              </span>
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="报价明细" subtitle="核对数量和单价后再导出。未匹配到价目的行单价为空。">
        <template #action>
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-accent"
            @click="addLine"
          >
            <Plus class="size-3" />
            增行
          </button>
        </template>
        <div v-if="warnings.length" class="mb-3 space-y-1">
          <p v-for="(w, i) in warnings" :key="i" class="text-[11px] text-sulfur flex gap-1">
            <TriangleAlert class="size-3.5 shrink-0 mt-0.5" />
            {{ w }}
          </p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px] border-collapse">
            <thead>
              <tr class="text-left text-muted-foreground border-b border-border">
                <th class="py-1.5 pr-2 font-medium w-8">#</th>
                <th class="py-1.5 pr-2 font-medium min-w-[140px]">名称</th>
                <th class="py-1.5 pr-2 font-medium min-w-[140px]">规格</th>
                <th class="py-1.5 pr-2 font-medium w-14">单位</th>
                <th class="py-1.5 pr-2 font-medium w-16">数量</th>
                <th class="py-1.5 pr-2 font-medium w-28">不含税单价</th>
                <th class="py-1.5 pr-2 font-medium w-24">合价</th>
                <th class="py-1.5 pr-2 font-medium w-14">来源</th>
                <th class="py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in lines" :key="i" class="border-b border-border/70">
                <td class="py-1 pr-2 text-muted-foreground">{{ row.seq || i + 1 }}</td>
                <td class="py-1 pr-2">
                  <input v-model="row.name" class="w-full h-7 rounded border border-border px-1.5 bg-background" />
                </td>
                <td class="py-1 pr-2 align-top">
                  <textarea
                    v-model="row.spec"
                    rows="3"
                    class="w-full min-h-[4.5rem] rounded border border-border px-1.5 py-1 bg-background text-[11px] leading-snug"
                  />
                </td>
                <td class="py-1 pr-2">
                  <input v-model="row.unit" class="w-full h-7 rounded border border-border px-1.5 bg-background" />
                </td>
                <td class="py-1 pr-2">
                  <input
                    v-model.number="row.qty"
                    type="number"
                    min="0"
                    class="w-full h-7 rounded border border-border px-1.5 bg-background"
                    @input="onQtyPrice(row)"
                  />
                </td>
                <td class="py-1 pr-2">
                  <input
                    v-model.number="row.unitPrice"
                    type="number"
                    min="0"
                    class="w-full h-7 rounded border border-border px-1.5 bg-background"
                    :class="row.name && !(row.unitPrice > 0) ? 'border-sulfur/50' : ''"
                    @input="onQtyPrice(row)"
                  />
                </td>
                <td class="py-1 pr-2 tabular-nums">
                  {{ lineAmount(row).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }}
                </td>
                <td class="py-1 pr-2">
                  <Tag :tone="row.source === 'catalog' ? 'patina' : row.unitPrice > 0 ? 'default' : 'sulfur'">
                    {{ SOURCE[row.source] || row.source || '人工' }}
                  </Tag>
                </td>
                <td class="py-1">
                  <button type="button" class="text-muted-foreground hover:text-sulfur" @click="removeLine(i)">
                    <Trash2 class="size-3.5" />
                  </button>
                </td>
              </tr>
              <tr v-if="!lines.length">
                <td colspan="9" class="py-8 text-center text-muted-foreground">
                  识别后会出现明细。也可点「增行」手工填写。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-[12px] text-muted-foreground">
            {{ lines.length }} 项
            <span v-if="unmatched"> · {{ unmatched }} 项待核价</span>
            · 不含税合计
            <span class="text-foreground font-medium">
              {{ total.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }}
            </span>
            元
          </p>
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-[12px] disabled:opacity-50"
            :disabled="generating || !lines.length"
            @click="onGenerate"
          >
            <Loader2 v-if="generating" class="size-3.5 animate-spin" />
            <FileSpreadsheet v-else class="size-3.5" />
            生成并下载 Excel
          </button>
        </footer>
      </Panel>
    </div>
  </div>

  <AppDialog
    :open="previewOpen"
    size="xl"
    :title="previewDetail ? (previewDetail.projectName || '未命名项目') : '报价预览'"
    description="只读查看生成时的明细，关闭后仍停在记录列表。"
    @update:open="(open) => { previewOpen = open }"
  >
    <div v-if="previewDetail" class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] md:grid-cols-4">
        <div class="truncate">
          <span class="text-muted-foreground">价目库：</span>
          {{ previewDetail.baseName || '—' }}
        </div>
        <div>
          <span class="text-muted-foreground">不含税：</span>
          {{ money(previewDetail.totalExTax) }} 元
        </div>
        <div>
          <span class="text-muted-foreground">含税：</span>
          {{ money(previewDetail.totalIncTax) }} 元
        </div>
        <div>
          <span class="text-muted-foreground">时间：</span>
          {{ formatRecordTime(previewDetail.createdAt) }}
        </div>
      </div>
      <p v-if="previewDetail.note" class="shrink-0 text-[12px] text-muted-foreground">
        {{ previewDetail.note }}
      </p>
      <div class="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table class="w-full text-[12px] border-collapse">
          <thead class="sticky top-0 bg-card">
            <tr class="text-left text-muted-foreground border-b border-border">
              <th class="py-1.5 px-2 font-medium w-8">#</th>
              <th class="py-1.5 px-2 font-medium">名称</th>
              <th class="py-1.5 px-2 font-medium">规格</th>
              <th class="py-1.5 px-2 font-medium w-12">单位</th>
              <th class="py-1.5 px-2 font-medium w-16 text-right">数量</th>
              <th class="py-1.5 px-2 font-medium w-28 text-right">不含税单价</th>
              <th class="py-1.5 px-2 font-medium w-24 text-right">合价</th>
              <th class="py-1.5 px-2 font-medium w-14">来源</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in previewDetail.lines || []"
              :key="i"
              class="border-b border-border/70"
            >
              <td class="py-1.5 px-2 text-muted-foreground">{{ row.seq || i + 1 }}</td>
              <td class="py-1.5 px-2">{{ row.name }}</td>
              <td class="py-1.5 px-2 text-muted-foreground whitespace-pre-wrap">{{ row.spec }}</td>
              <td class="py-1.5 px-2">{{ row.unit || '项' }}</td>
              <td class="py-1.5 px-2 text-right tabular-nums">{{ row.qty }}</td>
              <td class="py-1.5 px-2 text-right tabular-nums">
                {{ Number(row.unitPrice) > 0 ? money(row.unitPrice) : '—' }}
              </td>
              <td class="py-1.5 px-2 text-right tabular-nums">
                {{ Number(row.unitPrice) > 0 ? money(lineAmount(row)) : '—' }}
              </td>
              <td class="py-1.5 px-2">
                <Tag :tone="row.source === 'catalog' ? 'patina' : Number(row.unitPrice) > 0 ? 'default' : 'sulfur'">
                  {{ SOURCE[row.source] || row.source || '人工' }}
                </Tag>
              </td>
            </tr>
            <tr v-if="!(previewDetail.lines || []).length">
              <td colspan="8" class="py-8 text-center text-muted-foreground">该记录没有保存明细</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="shrink-0 flex flex-wrap justify-end gap-x-4 gap-y-1 text-[12px]">
        <span>不含税合计 {{ money(previewDetail.totalExTax) }} 元</span>
        <span>增值税 {{ Math.round((previewDetail.taxRate || 0) * 100) }}% {{ money(previewDetail.totalIncTax - previewDetail.totalExTax) }} 元</span>
        <span class="font-medium">含税合计 {{ money(previewDetail.totalIncTax) }} 元</span>
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] hover:bg-accent"
        @click="previewOpen = false"
      >
        关闭
      </button>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-[12px] hover:bg-accent disabled:opacity-50"
        :disabled="!previewDetail || downloadingId === previewDetail.id"
        @click="previewDetail && downloadRecord(previewDetail)"
      >
        <Loader2 v-if="previewDetail && downloadingId === previewDetail.id" class="size-3.5 animate-spin" />
        <FileSpreadsheet v-else class="size-3.5" />
        下载 Excel
      </button>
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-md bg-primary text-primary-foreground px-3 text-[12px] disabled:opacity-50"
        :disabled="!previewDetail"
        @click="loadFromPreview"
      >
        载入明细
      </button>
    </template>
  </AppDialog>

  <AppAlertDialog
    :open="confirmDeleteOpen"
    title="删除报价记录"
    :description="
      pendingDelete
        ? `确定删除「${pendingDelete.projectName || '未命名项目'}」这条报价记录？对应 Excel 也会删除。`
        : '确定删除该记录？'
    "
    confirm-label="确认删除"
    destructive
    :loading="!!deletingId"
    @update:open="(open) => { confirmDeleteOpen = open; if (!open && !deletingId) pendingDelete = null }"
    @confirm="confirmDelete"
  />
  <AppAlertDialog
    :open="confirmClearOpen"
    title="清空我的报价记录"
    description="将删除你名下的全部报价记录及对应 Excel，不可恢复。"
    confirm-label="确认清空"
    destructive
    :loading="clearingRecords"
    @update:open="(open) => { confirmClearOpen = open }"
    @confirm="confirmClear"
  />

  <Teleport to="body">
    <div
      v-if="peekItem"
      class="fixed inset-0 z-[70] bg-bg-base/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="规划图预览"
      @click.self="peek = null"
    >
      <div
        class="bg-bg-elevated border border-hairline rounded-lg shadow-2xl w-full max-w-6xl flex flex-col max-h-[92vh]"
      >
        <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-hairline">
          <div class="min-w-0 text-[13px] text-text-primary font-medium truncate">
            {{ peekItem.name }}
          </div>
          <button
            type="button"
            class="size-8 rounded-md hover:bg-hairline/60 inline-flex items-center justify-center text-text-secondary hover:text-text-primary"
            aria-label="关闭"
            @click="peek = null"
          >
            <X class="size-4" />
          </button>
        </div>
        <div class="relative flex-1 min-h-0 flex items-center justify-center bg-bg-base/40 p-3 overflow-auto">
          <img
            v-if="peekItem.kind === 'image'"
            :src="peekItem.url"
            :alt="peekItem.name"
            class="max-w-full max-h-[78vh] object-contain rounded-md border border-hairline bg-white"
          />
          <iframe
            v-else
            :src="peekItem.url"
            class="w-full h-[78vh] rounded-md border border-hairline bg-white"
            title="PDF 预览"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
