<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { apiRequest } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
type Row = { key: string; kind: string; code: string; values: string[]; source: string }
type Preview = { id: string; invitationId: string; confirmed: boolean; identity?: Record<string, string>; columns?: Record<string, string[]>; choices?: Record<string, string>; singleSided?: Row[]; rows: Row[]; counts: Record<string, number>; warnings: string[]; checks: string[]; testData: boolean; conflicts: Array<{ key: string; kind: string; fields: string[]; left: Row; right: Row }> }
const props = defineProps<{ invitationId: string; modelValue?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; pending: [value: boolean]; adoptPrice: [value: number] }>()
const labels: Record<string, string> = { quote: '货物报价', analysis: '单价分析', technical: '技术参数', component: '组件配置', techDeviation: '技术偏差', bizDeviation: '商务偏差' }
const files = ref<File[]>([])
const preview = ref<Preview | null>(null)
const choices = ref<Record<string, string>>({})
const acknowledged = ref(false)
const busy = ref(false)
const error = ref('')
const kind = ref('')
const search = ref('')
const page = ref(0)
let epoch = 0
const filtered = computed(() => (preview.value?.rows || []).filter(r => (!kind.value || r.kind === kind.value) && `${r.code} ${r.values.join(' ')}`.includes(search.value)))
const shown = computed(() => filtered.value.slice(page.value * 20, page.value * 20 + 20))
const unresolved = computed(() => preview.value?.conflicts.some(c => !choices.value[c.key]))
watch([kind, search], () => { page.value = 0 })
function suffix(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return '.xlsx'
  if (name.endsWith('.docx')) return '.docx'
  return ''
}
function resetPick() {
  epoch++
  preview.value = null
  choices.value = {}
  acknowledged.value = false
  busy.value = false
  emit('update:modelValue', '')
  emit('pending', files.value.length > 0)
}
function select(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  input.value = ''
  if (!picked.length) return
  const next = files.value.slice()
  const notes: string[] = []
  for (const file of picked) {
    const ext = suffix(file)
    if (!ext) { notes.push(`《${file.name}》仅支持 Excel（.xlsx）或 Word（.docx）`); continue }
    if (next.length >= 2) { notes.push('已选满 2 个文件，请先删除再更换'); break }
    if (next.some(f => suffix(f) === ext)) {
      notes.push(ext === '.xlsx' ? 'Excel 已选择，不能再追加一份' : 'Word 已选择，不能再追加一份')
      continue
    }
    next.push(file)
  }
  const changed = next.length !== files.value.length
  files.value = next
  error.value = notes.join('；')
  if (changed) resetPick()
}
function remove(index: number) {
  files.value.splice(index, 1)
  error.value = ''
  resetPick()
}
function clear() {
  epoch++
  files.value = []
  preview.value = null
  error.value = ''
  busy.value = false
  emit('update:modelValue', '')
  emit('pending', false)
}
async function inspect() {
  const request = ++epoch
  busy.value = true
  error.value = ''
  try {
    const form = new FormData()
    files.value.forEach(f => form.append('files', f))
    form.append('invitationId', props.invitationId)
    const result = await apiRequest<Preview>('/api/v1/tenders/table-imports/preview', { method: 'POST', body: form, token: getAccessToken() })
    if (request === epoch) { preview.value = result; page.value = 0 }
  } catch (e) { if (request === epoch) error.value = e instanceof Error ? e.message : '识别失败' }
  finally { if (request === epoch) busy.value = false }
}
async function confirm() {
  if (!preview.value) return
  const request = ++epoch
  busy.value = true
  error.value = ''
  try {
    const result = await apiRequest<{ id: string; bidPriceYuan: string | null }>(`/api/v1/tenders/table-imports/${preview.value.id}/confirm`, { method: 'POST', token: getAccessToken(), body: { invitationId: props.invitationId, choices: choices.value, acknowledged: acknowledged.value } })
    if (request === epoch) { emit('update:modelValue', result.id); emit('pending', false); if (result.bidPriceYuan != null) emit('adoptPrice', Number(result.bidPriceYuan)) }
  } catch (e) { if (request === epoch) error.value = e instanceof Error ? e.message : '确认失败' }
  finally { if (request === epoch) busy.value = false }
}
watch(() => props.invitationId, () => { if (!props.modelValue) clear() })
watch(() => [props.modelValue, props.invitationId] as const, async ([id]) => {
  if (!id) return
  const request = ++epoch
  try {
    const saved = await apiRequest<Preview>(`/api/v1/tenders/table-imports/${id}`, { token: getAccessToken() })
    if (request === epoch) {
      if (saved.invitationId !== props.invitationId) { clear(); return }
      preview.value = saved; acknowledged.value = true; choices.value = saved.choices || {}
    }
  } catch (e) { if (request === epoch) error.value = e instanceof Error ? e.message : '读取失败' }
}, { immediate: true })
</script>

<template>
  <section class="rounded-lg border border-border bg-background p-4 space-y-3 text-xs">
    <h3 class="text-sm font-semibold">本次投标填报数据</h3>
    <p class="text-muted-foreground">支持一份 Excel、一份 Word，可分两次追加，最多两份。先识别招标文件，再预览、核对差异并确认；确认后仅填入对应格式表。不会替换方案正文。</p>
    <div class="flex flex-wrap items-center gap-2">
      <label class="rounded border px-3 py-1.5" :class="busy || disabled || !invitationId ? 'pointer-events-none opacity-50' : 'cursor-pointer'">
        选择文件
        <input type="file" class="sr-only" multiple accept=".xlsx,.docx" :disabled="busy || disabled || !invitationId" @change="select" />
      </label>
      <span v-if="!files.length" class="text-muted-foreground">未选择文件</span>
      <span v-for="(file, index) in files" :key="file.name + file.size + file.lastModified" class="inline-flex items-center gap-1 rounded border px-2 py-1">
        {{ file.name }}
        <button type="button" class="underline disabled:opacity-50" :disabled="busy || disabled" @click="remove(index)">删除</button>
      </span>
    </div>
    <p v-if="!invitationId" class="text-amber-700">请先完成上方招标文件识别。</p>
    <div class="flex gap-2">
      <button type="button" class="rounded border px-3 py-1.5 disabled:opacity-50" :disabled="busy || disabled || !files.length || !invitationId" @click="inspect">{{ busy ? '处理中…' : '识别并预览' }}</button>
      <button type="button" class="rounded border px-3 py-1.5" :disabled="busy || disabled" @click="clear">清除本次导入</button>
    </div>
    <p v-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <template v-if="preview">
      <p v-if="preview.identity" class="text-muted-foreground">{{ Object.entries(preview.identity).map(([key, value]) => `${key}：${value}`).join(" · ") }}</p>
      <p class="font-medium">{{ Object.entries(preview.counts).map(([key, count]) => `${labels[key] || key} ${count} 条`).join(' · ') }}</p>
      <p v-if="preview.testData" class="text-amber-700">来源含测试／模拟数据，确认采用不代表数据真实或具备可投标证据。</p>
      <p v-for="(w, i) in preview.warnings" :key="`w-${i}`" class="text-amber-700">{{ w }}</p>
      <p v-for="(w, i) in preview.checks" :key="`c-${i}`" class="text-red-700">{{ w }}</p>
      <p v-if="!preview.checks.length">已识别数据的基础检查通过；不代表技术参数实质合规。</p>
      <details v-if="preview.singleSided?.length" open>
        <summary class="cursor-pointer font-medium">仅一份文件存在的记录（{{ preview.singleSided.length }} 条，确认后全部保留）</summary>
        <p v-for="row in preview.singleSided" :key="row.key" class="my-2 whitespace-pre-wrap">{{ labels[row.kind] }} · {{ row.values.join(' | ') }} · {{ row.source }}</p>
      </details>
      <details v-if="preview.conflicts.length" open>
        <summary class="cursor-pointer font-medium">双文件字段差异（{{ preview.conflicts.length }} 项）</summary>
        <article v-for="conflict in preview.conflicts" :key="conflict.key" class="my-2 rounded border p-2 space-y-2">
          <p>{{ labels[conflict.kind] }} · {{ conflict.key }} · 差异字段：{{ conflict.fields.join('、') }}</p>
          <label v-for="side in (['left', 'right'] as const)" :key="side" class="block whitespace-pre-wrap">
            <input v-model="choices[conflict.key]" type="radio" :name="conflict.key" :value="side" :disabled="Boolean(modelValue) || disabled" />
            采用 {{ conflict[side].source }}<br />{{ conflict[side].values.join(' | ') }}
          </label>
        </article>
      </details>
      <details>
        <summary class="cursor-pointer font-medium">查看导入明细及来源（{{ preview.rows.length }} 条）</summary>
        <div class="my-2 flex gap-2"><select v-model="kind" class="rounded border"><option value="">全部表格</option><option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option></select><input v-model="search" class="rounded border px-2" placeholder="搜索物资ID或参数" /></div>
        <div class="max-h-72 overflow-auto space-y-2">
          <article v-for="row in shown" :key="row.key" class="rounded border p-2"><p class="font-medium">{{ labels[row.kind] }} · {{ row.code }}</p><p class="whitespace-pre-wrap">{{ row.values.map((value, index) => `${preview?.columns?.[row.kind]?.[index] || index + 1}：${value || '（空）'}`).join(' | ') }}</p><p class="text-muted-foreground">{{ row.source }}</p></article>
        </div>
        <div class="mt-2 flex gap-3"><button type="button" :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ Math.max(1, Math.ceil(filtered.length / 20)) }}</span><button type="button" :disabled="(page + 1) * 20 >= filtered.length" @click="page++">下一页</button></div>
      </details>
      <p v-if="modelValue" class="font-medium text-green-700">已确认采用，生成时将填入对应表格。更换数据请重新导入确认。</p>
      <template v-else>
        <label class="block"><input v-model="acknowledged" type="checkbox" :disabled="disabled" /> 我已核对导入明细、单边记录、差异及测试数据提示，确认采用。</label>
        <button type="button" class="rounded border px-3 py-1.5 disabled:opacity-50" :disabled="busy || disabled || !acknowledged || unresolved || Boolean(preview.checks.length)" @click="confirm">确认采用本次填报数据</button>
      </template>
    </template>
  </section>
</template>
