<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-vue-next'
import { PageHeader, Panel, Tag } from '@/components/ui-kit'
import { ApiError } from '@/lib/api'
import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'
import {
  downloadQuoteFile,
  emptyQuoteLine,
  generateQuote,
  lineAmount,
  recognizeQuote,
  type QuoteLine,
} from '@/lib/quotes-api'

const KB_STORE = 'weitai.quoteKbId'
const router = useRouter()

const projectName = ref('')
const note = ref('')
const files = ref<File[]>([])
const previews = ref<string[]>([])
const lines = ref<QuoteLine[]>([])
const warnings = ref<string[]>([])
const recognizing = ref(false)
const generating = ref(false)
const err = ref('')
const hint = ref('')
const mapInput = ref<HTMLInputElement | null>(null)

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

watch(files, (next) => {
  previews.value.forEach((u) => URL.revokeObjectURL(u))
  previews.value = next.map((f) => URL.createObjectURL(f))
})

watch(kbId, (id) => {
  if (id) localStorage.setItem(KB_STORE, id)
})

onMounted(() => {
  void loadKb()
})

onUnmounted(() => {
  previews.value.forEach((u) => URL.revokeObjectURL(u))
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
  files.value = Array.from(el.files || []).slice(0, 4)
  el.value = ''
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
      lines: rows.map((r) => ({ ...r, amount: lineAmount(r) })),
    })
    await downloadQuoteFile(data.xlsxFile, data.downloadName)
    hint.value = `已下载 ${data.downloadName}，不含税合计 ${data.totalExTax.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元`
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '生成失败'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="px-5 lg:px-8 py-6 max-w-6xl mx-auto">
    <PageHeader
      title="AI报价"
      description="选一个已有知识库读取价目，再上传场地规划图识别工程量，核对后导出 Excel。单价只从库里的价目表匹配，不会由模型编造。"
    />

    <p v-if="err" class="mb-3 flex items-start gap-1.5 text-[12px] text-sulfur">
      <TriangleAlert class="size-3.5 shrink-0 mt-0.5" />
      {{ err }}
    </p>
    <p v-else-if="hint" class="mb-3 text-[12px] text-muted-foreground">{{ hint }}</p>

    <div class="space-y-4">
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

      <Panel title="场地规划图" subtitle="支持图片 / PDF，最多 4 张。可写一句桩型或规模说明。">
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
            <img
              v-for="(src, i) in previews"
              :key="src"
              :src="src"
              :alt="files[i]?.name || '规划图'"
              class="h-24 w-auto rounded-md border border-border object-contain bg-muted/30"
            />
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
                <th class="py-1.5 pr-2 font-medium w-24">单价</th>
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
                <td class="py-1 pr-2">
                  <input v-model="row.spec" class="w-full h-7 rounded border border-border px-1.5 bg-background" />
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
</template>
