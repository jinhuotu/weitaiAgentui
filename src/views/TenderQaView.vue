<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, Loader2, Search, Upload } from 'lucide-vue-next'
import { PageHeader, Panel, Tag } from '@/components/ui-kit'
import TenderQaPanel from '@/components/tenders/TenderQaPanel.vue'
import { ApiError } from '@/lib/api'
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  formatBudget,
  type TaskStatus,
} from '@/lib/tender-tasks'
import {
  fetchTenderQa,
  fetchTenderRecord,
  fetchTenderRecords,
  inspectTenderQa,
  inspectTenderQaUpload,
  reviewTenderQaItem,
  fetchTenderSlots,
  type BidVolume,
  type QaReport,
  type SlotStatus,
  type TenderRecordItem,
} from '@/lib/tenders-api'
import { fmtAgo } from '@/lib/time'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const keyword = ref('')
const items = ref<TenderRecordItem[]>([])
const total = ref(0)
const loading = ref(false)
const err = ref('')
const selectedId = ref('')
const qaReport = ref<QaReport | null>(null)
const qaLoading = ref(false)
const qaError = ref('')
const materialSlots = ref<SlotStatus[]>([])
const materialLoading = ref(false)
const reviewingItem = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const pickFile = ref<File | null>(null)
const volume = ref<BidVolume>('business')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const canSeeAll = computed(
  () => auth.isAdmin || (auth.menus || []).includes('/tender-tasks'),
)

const selected = computed(
  () => items.value.find((it) => it.id === selectedId.value) || null,
)

const hasBiz = computed(() => Boolean(selected.value?.docxAvailable && selected.value?.docxFile))
const hasTech = computed(
  () => Boolean(selected.value?.techDocxAvailable && selected.value?.techDocxFile),
)

function statusLabel(status?: string) {
  const key = (status || 'processing') as TaskStatus
  return TASK_STATUS_LABEL[key] || status || '编制中'
}

function statusTone(status?: string) {
  const key = (status || 'processing') as TaskStatus
  return TASK_STATUS_TONE[key] || 'default'
}

function scoreTone(grade?: string | null) {
  if (grade === 'good') return 'patina'
  if (grade === 'risk') return 'sulfur'
  return 'iron'
}

async function loadList() {
  loading.value = true
  err.value = ''
  try {
    const data = await fetchTenderRecords({
      q: keyword.value.trim() || undefined,
      limit: 80,
      scope: canSeeAll.value ? 'all' : 'mine',
    })
    items.value = data.items
    total.value = data.total
  } catch (e) {
    err.value = e instanceof ApiError || e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadSaved(id: string) {
  try {
    const data = await fetchTenderQa(id, { volume: volume.value })
    qaReport.value = data.report || null
  } catch {
    qaReport.value = null
  }
}

async function loadMaterialSlots(invitationId: string) {
  materialLoading.value = true
  try {
    materialSlots.value = invitationId
      ? await fetchTenderSlots(undefined, invitationId)
      : []
  } catch {
    materialSlots.value = []
  } finally {
    materialLoading.value = false
  }
}

async function selectRecord(id: string, syncQuery = true) {
  selectedId.value = id
  pickFile.value = null
  qaError.value = ''
  const row = items.value.find((it) => it.id === id)
  void loadMaterialSlots(row?.brief?.invitationId || '')
  if (row?.techDocxAvailable && !row.docxAvailable) volume.value = 'technical'
  else volume.value = 'business'
  if (syncQuery && String(route.query.record || '') !== id) {
    void router.replace({ path: '/tender-qa', query: { record: id } })
  }
}

async function ensureRecord(id: string) {
  if (items.value.some((it) => it.id === id)) {
    await selectRecord(id)
    return
  }
  try {
    const one = await fetchTenderRecord(id)
    items.value = [one, ...items.value.filter((it) => it.id !== one.id)]
    await selectRecord(one.id)
  } catch (e) {
    qaError.value = e instanceof ApiError || e instanceof Error ? e.message : '任务不存在'
  }
}

async function runGenerated() {
  const id = selectedId.value
  if (!id) return
  qaLoading.value = true
  qaError.value = ''
  try {
    qaReport.value = await inspectTenderQa(id, { volume: volume.value })
    await loadList()
  } catch (e) {
    qaError.value = e instanceof ApiError || e instanceof Error ? e.message : '评分失败'
  } finally {
    qaLoading.value = false
  }
}

async function runUpload() {
  const id = selectedId.value
  const file = pickFile.value
  if (!id || !file) {
    qaError.value = '请先选择终稿 Word'
    return
  }
  uploading.value = true
  qaLoading.value = true
  qaError.value = ''
  try {
    qaReport.value = await inspectTenderQaUpload(id, file, { volume: volume.value })
    await loadList()
  } catch (e) {
    qaError.value = e instanceof ApiError || e instanceof Error ? e.message : '评分失败'
  } finally {
    uploading.value = false
    qaLoading.value = false
  }
}

async function reviewItem(itemId: string, status: 'confirmed' | 'rectified') {
  if (!selectedId.value) return
  reviewingItem.value = itemId
  try {
    await reviewTenderQaItem(selectedId.value, volume.value, itemId, { status })
    await loadSaved(selectedId.value)
  } catch (e) {
    qaError.value = e instanceof ApiError || e instanceof Error ? e.message : '保存核验状态失败'
  } finally {
    reviewingItem.value = ''
  }
}

function onPickFile(ev: Event) {
  const el = ev.target as HTMLInputElement
  const file = el.files?.[0] || null
  el.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.docx')) {
    qaError.value = '请上传 Word（.docx）'
    return
  }
  if (file.size > 40 * 1024 * 1024) {
    qaError.value = 'Word 超过 40MB，请压缩后再传'
    return
  }
  pickFile.value = file
  qaError.value = ''
}

onMounted(async () => {
  await loadList()
  const rid = String(route.query.record || '').trim()
  if (rid) await ensureRecord(rid)
})

watch(keyword, () => {
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    void loadList()
  }, 320)
})

watch(
  () => String(route.query.record || ''),
  (rid) => {
    if (rid && rid !== selectedId.value) void ensureRecord(rid)
  },
)

watch([selectedId, volume], ([id]) => {
  if (!id) {
    qaReport.value = null
    materialSlots.value = []
    return
  }
  void loadSaved(id)
})

const expiringMaterials = computed(() => materialSlots.value.flatMap((slot) =>
  (slot.files || [])
    .filter((file) => file.expire_status === 'expired' || file.expire_status === 'expiring')
    .map((file) => ({
      slotTitle: slot.title,
      name: file.name || file.fileName || '未命名资料',
      status: file.expire_status,
      expireAt: file.expire_at || '',
      days: file.expire_days,
    })),
))
</script>

<template>
  <PageHeader
    title="AI标书评分"
    description="选一条投标任务，对照邀请书给系统生成稿打分；也可上传本地下载改过的终稿再评一遍。"
  />

  <p v-if="err" class="mb-3 text-xs text-iron">{{ err }}</p>

  <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
    <Panel :title="canSeeAll ? '全部任务' : '我的任务'" :subtitle="`共 ${total} 条`" flush>
      <div class="border-b border-border px-3 py-2">
        <label class="relative block">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="keyword"
            class="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[12px]"
            placeholder="项目 / 招标人 / 创建人"
          />
        </label>
      </div>
      <div v-if="loading && !items.length" class="py-16 text-center text-xs text-muted-foreground">
        加载任务…
      </div>
      <div v-else-if="!items.length" class="py-16 text-center text-xs text-muted-foreground">
        还没有可评分的投标任务。
      </div>
      <ul v-else class="max-h-[min(70vh,40rem)] overflow-y-auto">
        <li v-for="it in items" :key="it.id">
          <button
            type="button"
            class="w-full border-b border-border px-3 py-2.5 text-left hover:bg-accent/40"
            :class="it.id === selectedId ? 'bg-iron/10' : ''"
            @click="selectRecord(it.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 truncate text-[12px] font-medium">{{ it.projectName || '未命名项目' }}</div>
              <Tag v-if="it.qaScore != null" :tone="scoreTone(it.qaGrade)">{{ it.qaScore }}%</Tag>
              <span v-else class="shrink-0 text-[10px] text-muted-foreground">未检</span>
            </div>
            <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span class="truncate">{{ it.tenderer || '—' }}</span>
              <Tag :tone="statusTone(it.status)">{{ statusLabel(it.status) }}</Tag>
            </div>
            <div v-if="it.qaSummary" class="mt-1 flex flex-wrap gap-1">
              <Tag v-if="it.qaSummary.vetoRiskCount" tone="sulfur">否决 {{ it.qaSummary.vetoRiskCount }}</Tag>
              <Tag v-if="it.qaSummary.scoreRiskCount || it.qaSummary.scorePendingCount" tone="iron">
                评分待处理 {{ it.qaSummary.scoreRiskCount + it.qaSummary.scorePendingCount }}
              </Tag>
              <Tag v-if="it.qaSummary.attentionCount" tone="molybdenum">易漏 {{ it.qaSummary.attentionCount }}</Tag>
            </div>
          </button>
        </li>
      </ul>
    </Panel>

    <div class="min-w-0 space-y-4">
      <Panel v-if="!selected" title="评分说明">
        <p class="text-[12px] leading-relaxed text-muted-foreground">
          左侧选任务后，默认给服务器上的生成稿打分。若已用 WPS / Word 改过，把终稿 .docx 传上来，会用同一套规则和模型对照邀请书评分。
        </p>
      </Panel>

      <template v-else>
        <Panel :title="selected.projectName || '未命名项目'" :subtitle="selected.tenderer || '—'">
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-4">
            <div>
              <dt class="text-[11px] text-muted-foreground">状态</dt>
              <dd class="mt-0.5">
                <Tag :tone="statusTone(selected.status)">{{ statusLabel(selected.status) }}</Tag>
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground">编制人</dt>
              <dd class="mt-0.5">{{ selected.username || '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground">投标总价</dt>
              <dd class="mt-0.5 font-sans">{{ formatBudget(selected.bidPriceYuan) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted-foreground">生成时间</dt>
              <dd class="mt-0.5">{{ selected.createdAt ? fmtAgo(selected.createdAt, true) : '—' }}</dd>
            </div>
          </dl>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <div v-if="hasBiz || hasTech" class="inline-flex rounded-md border border-border p-0.5">
              <button
                v-if="hasBiz"
                type="button"
                class="h-7 rounded px-2.5 text-[11px]"
                :class="volume === 'business' ? 'bg-iron text-background' : 'hover:bg-accent'"
                @click="volume = 'business'"
              >
                商务标
              </button>
              <button
                v-if="hasTech"
                type="button"
                class="h-7 rounded px-2.5 text-[11px]"
                :class="volume === 'technical' ? 'bg-iron text-background' : 'hover:bg-accent'"
                @click="volume = 'technical'"
              >
                技术标
              </button>
            </div>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md bg-iron px-3 text-[12px] text-background disabled:opacity-50"
              :disabled="qaLoading || (!hasBiz && !hasTech)"
              @click="runGenerated"
            >
              <Loader2 v-if="qaLoading && !uploading" class="size-3.5 animate-spin" />
              评分生成稿
            </button>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              @change="onPickFile"
            />
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] hover:bg-accent"
              @click="fileInput?.click()"
            >
              <Upload class="size-3.5" />
              {{ pickFile ? pickFile.name : '选择终稿 Word' }}
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] hover:bg-accent disabled:opacity-50"
              :disabled="!pickFile || qaLoading"
              @click="runUpload"
            >
              <Loader2 v-if="uploading" class="size-3.5 animate-spin" />
              按终稿评分
            </button>
          </div>
          <p v-if="qaError" class="mt-2 text-[11px] text-iron">{{ qaError }}</p>
        </Panel>

        <Panel title="投标资料有效期提醒" subtitle="当前任务资料槽位中的已过期或临近到期资料">
          <div v-if="materialLoading" class="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
            <Loader2 class="size-3.5 animate-spin" />正在检查资料有效期…
          </div>
          <div v-else-if="!expiringMaterials.length" class="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
            <span class="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">✓</span>
            暂未发现已过期或临近到期的已选资料
          </div>
          <ul v-else class="space-y-2">
            <li
              v-for="item in expiringMaterials"
              :key="`${item.slotTitle}-${item.name}`"
              class="flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]"
              :class="item.status === 'expired' ? 'border-red-500/40 bg-red-500/5' : 'border-orange-500/40 bg-orange-500/5'"
            >
              <AlertTriangle class="mt-0.5 size-3.5 shrink-0" :class="item.status === 'expired' ? 'text-red-600' : 'text-orange-500'" />
              <div class="min-w-0 flex-1">
                <div class="font-medium">{{ item.slotTitle }} · {{ item.name }}</div>
                <div class="mt-0.5 text-muted-foreground">
                  {{ item.status === 'expired' ? '已过期' : '临近到期' }} · 到期日 {{ item.expireAt || '未维护' }}
                  <template v-if="item.days !== null && item.days !== undefined">
                    · {{ item.days < 0 ? `已过期 ${-item.days} 天` : `剩余 ${item.days} 天` }}
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </Panel>

        <TenderQaPanel
          page
          :title="volume === 'technical' ? 'AI评分 · 技术标' : 'AI评分 · 商务标'"
          :show-run="false"
          :report="qaReport"
          :loading="qaLoading"
          :error="qaError"
          :record-id="selectedId"
          :volume="volume"
          :reviewing-item="reviewingItem"
          @review="reviewItem"
        />
      </template>
    </div>
  </div>
</template>
