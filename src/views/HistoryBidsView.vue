<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { PageHeader, Panel, Tag } from '@/components/ui-kit'
import { ApiError } from '@/lib/api'
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from '@/lib/tender-tasks'
import {
  fetchHistoryChapters,
  fetchTenderRecords,
  saveHistoryMark,
  type HistoryChapter,
  type TenderRecordItem,
} from '@/lib/tenders-api'
import { useAuthStore } from '@/stores/auth'

const PROBLEM_TAGS = ['报价', '业绩', '工期', '资质', '签章', '格式', '法人', '付款', '否决', '其他']
const VOL_LABEL: Record<string, string> = { business: '商务标', technical: '技术标' }

const route = useRoute()
const auth = useAuthStore()

const items = ref<TenderRecordItem[]>([])
const loading = ref(false)
const err = ref('')
const selectedId = ref('')
const chapters = ref<HistoryChapter[]>([])
const chapErr = ref('')
const chapLoading = ref(false)
const openKey = ref('')
const draftTags = ref<string[]>([])
const draftNote = ref('')
const savingKey = ref('')

const canSeeAll = computed(() => auth.isAdmin || (auth.menus || []).includes('/tender-tasks'))
const selected = computed(() => items.value.find((it) => it.id === selectedId.value) || null)

function statusLabel(status: string) {
  return TASK_STATUS_LABEL[status as TaskStatus] || status
}

function statusTone(status: string) {
  return TASK_STATUS_TONE[status as TaskStatus] || 'default'
}

function keyOf(ch: HistoryChapter) {
  return `${ch.volume}:${ch.chapterTitle}`
}

function verdictLabel(v: string) {
  if (v === 'good') return '可参考'
  if (v === 'bad') return '需规避'
  return '未标记'
}

function msgOf(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback
}

async function loadList() {
  loading.value = true
  err.value = ''
  const scope = canSeeAll.value ? 'all' : 'mine'
  try {
    const [won, lost] = await Promise.all([
      fetchTenderRecords({ status: 'won', scope, limit: 100 }),
      fetchTenderRecords({ status: 'lost', scope, limit: 100 }),
    ])
    items.value = [...won.items, ...lost.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  } catch (e) {
    err.value = msgOf(e, '加载失败')
    items.value = []
  } finally {
    loading.value = false
  }
}

async function loadChapters(id: string) {
  chapLoading.value = true
  chapErr.value = ''
  chapters.value = []
  openKey.value = ''
  try {
    const data = await fetchHistoryChapters(id)
    chapters.value = data.chapters || []
  } catch (e) {
    chapErr.value = msgOf(e, '章节加载失败')
  } finally {
    chapLoading.value = false
  }
}

function selectRecord(id: string) {
  selectedId.value = id
}

function openBad(ch: HistoryChapter) {
  openKey.value = keyOf(ch)
  draftTags.value = [...(ch.problemTags || [])]
  draftNote.value = ch.note || ''
}

function toggleTag(tag: string) {
  if (draftTags.value.includes(tag)) {
    draftTags.value = draftTags.value.filter((t) => t !== tag)
  } else {
    draftTags.value = [...draftTags.value, tag]
  }
}

async function save(ch: HistoryChapter, verdict: 'good' | 'bad' | 'none', tags: string[], note: string) {
  if (!selectedId.value) return
  const key = keyOf(ch)
  savingKey.value = key
  chapErr.value = ''
  try {
    const saved = await saveHistoryMark({
      recordId: selectedId.value,
      docId: ch.docId || '',
      volume: ch.volume,
      chapterTitle: ch.chapterTitle,
      verdict,
      problemTags: tags,
      note,
    })
    const idx = chapters.value.findIndex((it) => keyOf(it) === key)
    if (idx >= 0) chapters.value[idx] = { ...chapters.value[idx], ...saved }
    if (verdict !== 'bad') openKey.value = ''
  } catch (e) {
    chapErr.value = msgOf(e, '保存失败')
  } finally {
    savingKey.value = ''
  }
}

watch(selectedId, (id) => {
  if (!id) {
    chapters.value = []
    return
  }
  void loadChapters(id)
})

onMounted(async () => {
  await loadList()
  const q = String(route.query.recordId || '')
  if (q && items.value.some((it) => it.id === q)) selectedId.value = q
  else if (!selectedId.value && items.value.length === 1) selectedId.value = items.value[0].id
})
</script>

<template>
  <PageHeader title="历史标书" description="已中标标成可参考，未中标标成需规避。人手改过的章节不会被自动初标盖掉。" />

  <p v-if="err" class="mb-3 text-xs text-iron">{{ err }}</p>

  <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
    <Panel :title="canSeeAll ? '中标与失败' : '我的中标与失败'" :subtitle="`共 ${items.length} 条`" flush>
      <div v-if="loading && !items.length" class="py-16 text-center text-xs text-muted-foreground">加载任务…</div>
      <div v-else-if="!items.length" class="py-16 text-center text-xs text-muted-foreground">还没有已中标或已失败的标书。</div>
      <ul v-else class="max-h-[min(70vh,40rem)] overflow-y-auto">
        <li v-for="it in items" :key="it.id">
          <button
            type="button"
            class="w-full border-b border-border px-3 py-2.5 text-left hover:bg-accent/40"
            :class="it.id === selectedId ? 'bg-iron/10' : ''"
            @click="selectRecord(it.id)"
          >
            <div class="truncate text-[12px] font-medium">{{ it.projectName || '未命名项目' }}</div>
            <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span class="truncate">{{ it.tenderer || '—' }}</span>
              <Tag :tone="statusTone(it.status)">{{ statusLabel(it.status) }}</Tag>
            </div>
          </button>
        </li>
      </ul>
    </Panel>

    <Panel v-if="!selected" title="章节标记">
      <p class="text-[12px] leading-relaxed text-muted-foreground">
        左侧选一条已中标或已失败的标书。可参考的章节以后生成时优先借鉴，需规避的记下问题，避免再踩。
      </p>
    </Panel>

    <Panel v-else :title="selected.projectName || '未命名项目'" :subtitle="selected.tenderer || '—'">
      <p v-if="chapErr" class="mb-3 text-xs text-iron">{{ chapErr }}</p>
      <div v-if="chapLoading" class="py-10 text-center text-xs text-muted-foreground">加载章节…</div>
      <div v-else-if="!chapters.length" class="py-10 text-center text-xs text-muted-foreground">
        还没有可标记的章节。标书入库后会出现在这里。
      </div>
      <ul v-else class="divide-y divide-border">
        <li v-for="ch in chapters" :key="keyOf(ch)" class="py-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[12px] font-medium">
                <span class="mr-2 text-[11px] text-muted-foreground">{{ VOL_LABEL[ch.volume] || ch.volume }}</span>
                {{ ch.chapterTitle }}
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <Tag :tone="ch.verdict === 'good' ? 'patina' : ch.verdict === 'bad' ? 'iron' : 'default'">
                  {{ verdictLabel(ch.verdict) }}
                </Tag>
                <span v-for="tag in ch.problemTags" :key="tag" class="text-[11px] text-muted-foreground">{{ tag }}</span>
              </div>
              <p v-if="ch.note" class="mt-1 text-[11px] leading-relaxed text-muted-foreground">{{ ch.note }}</p>
            </div>
            <div class="flex shrink-0 gap-1.5">
              <button
                type="button"
                class="h-7 rounded-md border border-border px-2 text-[11px] hover:bg-accent/40"
                :disabled="savingKey === keyOf(ch)"
                @click="save(ch, 'good', [], '')"
              >
                可参考
              </button>
              <button
                type="button"
                class="h-7 rounded-md border border-border px-2 text-[11px] hover:bg-accent/40"
                :disabled="savingKey === keyOf(ch)"
                @click="openBad(ch)"
              >
                需规避
              </button>
              <button
                v-if="ch.verdict !== 'none'"
                type="button"
                class="h-7 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent/40"
                :disabled="savingKey === keyOf(ch)"
                @click="save(ch, 'none', [], '')"
              >
                取消
              </button>
            </div>
          </div>
          <div v-if="openKey === keyOf(ch)" class="mt-2 rounded-md border border-border p-2">
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tag in PROBLEM_TAGS"
                :key="tag"
                type="button"
                class="h-6 rounded-md border px-2 text-[11px]"
                :class="draftTags.includes(tag) ? 'border-iron bg-iron/10' : 'border-border'"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </button>
            </div>
            <textarea
              v-model="draftNote"
              rows="2"
              maxlength="500"
              class="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-[12px]"
              placeholder="补充说明，可不填"
            />
            <button
              type="button"
              class="mt-2 h-7 rounded-md bg-iron px-3 text-[11px] text-white disabled:opacity-50"
              :disabled="savingKey === keyOf(ch)"
              @click="save(ch, 'bad', draftTags, draftNote)"
            >
              保存
            </button>
          </div>
        </li>
      </ul>
    </Panel>
  </div>
</template>
