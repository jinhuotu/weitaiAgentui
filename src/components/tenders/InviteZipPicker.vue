<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import { fmtSize } from '@/lib/read-file-smart'
import { ZIP_LIMITS, listZip, newZipBudget, readZipEntry, type ZipRow } from '@/lib/invite-zip'

const props = withDefaults(defineProps<{
  remaining: number
  error?: string
  disabled?: boolean
  allowedExtensions?: string[]
  targetLabel?: string
  reportError: (message: string) => void
}>(), { disabled: false, allowedExtensions: () => ['.doc', '.docx'], targetLabel: '邀请书' })
const emit = defineEmits<{ selected: [files: File[]] }>()
const open = ref(false)
const input = ref<HTMLInputElement | null>(null)
const rows = shallowRef<ZipRow[]>([])
const selected = ref<string[]>([])
const busy = ref(false)
const progress = ref(0)
let budget = newZipBudget()
let generation = 0
let modified = Date.now()
const remaining = computed(() => Math.max(0, props.remaining))
function reason(row: ZipRow) {
  if (row.zip) return row.depth >= ZIP_LIMITS.depth ? '已达 3 层上限，不能展开' : '压缩包，请展开后选择文档'
  return props.allowedExtensions.some(ext => row.name.toLowerCase().endsWith(ext.toLowerCase())) ? '' : `不支持此类型，仅 ${props.allowedExtensions.join(' / ')}`
}
function reset() { generation++; rows.value = []; selected.value = []; budget = newZipBudget(); progress.value = 0 }
watch(open, value => { if (!value) reset() })
function report(error: unknown) { props.reportError(error instanceof Error ? error.message : '压缩包读取失败，请先解压后上传') }
async function load(file?: File) {
  if (!file || busy.value) return
  reset()
  props.reportError('')
  if (!/\.zip$/i.test(file.name)) { props.reportError('仅支持 .zip；.rar / .7z 不支持，请先解压后上传'); return }
  if (file.size > ZIP_LIMITS.archive) { props.reportError('压缩包不能超过 100MB'); return }
  busy.value = true
  const token = generation
  const activeBudget = budget
  modified = Date.now()
  try {
    const result = await listZip(new Uint8Array(await file.arrayBuffer()), file.name, 1, activeBudget)
    if (token === generation) rows.value = result
  } catch (error) { if (token === generation) { reset(); report(error) } }
  finally { busy.value = false }
}
function pick(event: Event) {
  const element = event.target as HTMLInputElement
  void load(element.files?.[0])
  element.value = ''
}
function toggle(row: ZipRow) {
  if (busy.value || reason(row)) return
  if (selected.value.includes(row.id)) selected.value = selected.value.filter(id => id !== row.id)
  else if (selected.value.length >= remaining.value) props.reportError(`最多还可添加 ${remaining.value} 份${props.targetLabel}`)
  else selected.value.push(row.id)
}
async function expand(row: ZipRow) {
  if (busy.value || row.expanded || row.depth >= ZIP_LIMITS.depth) return
  busy.value = true
  const token = generation
  const activeBudget = budget
  try {
    const bytes = await readZipEntry(row, activeBudget, n => { progress.value = n }, () => token !== generation)
    const children = await listZip(bytes, row.path, row.depth + 1, activeBudget)
    if (token !== generation) return
    row.expanded = true
    const next = [...rows.value]
    next.splice(next.indexOf(row) + 1, 0, ...children)
    rows.value = next
  } catch (error) { if (token === generation) { reset(); report(error) } }
  finally { busy.value = false; progress.value = 0 }
}
async function add() {
  if (busy.value || !selected.value.length) return
  if (selected.value.length > remaining.value) { props.reportError(`最多还可添加 ${remaining.value} 份${props.targetLabel}`); return }
  busy.value = true
  const token = generation
  const activeBudget = budget
  try {
    const files: File[] = []
    for (const id of selected.value) {
      const row = rows.value.find(item => item.id === id)!
      const bytes = await readZipEntry(row, activeBudget, n => { progress.value = n }, () => token !== generation)
      if (token !== generation) return
      files.push(new File([bytes as Uint8Array<ArrayBuffer>], row.name, { lastModified: modified }))
    }
    if (files.length > remaining.value) throw new Error('可添加份数已变化，请重新选择')
    emit('selected', files)
    open.value = false
  } catch (error) { if (token === generation) { reset(); report(error) } }
  finally { busy.value = false; progress.value = 0 }
}
</script>

<template>
  <div class="mt-2 flex justify-end">
    <button type="button" class="tender-ghost-btn" :disabled="disabled || busy" @click="open = true">从压缩包选择</button>
  </div>
  <AppDialog v-model:open="open" title="从压缩包选择" :description="`选择文档后添加到${targetLabel}，压缩包原件不会上传或保存。`" wide>
    <div class="space-y-3 p-5">
      <p v-if="error" role="alert" class="text-[12px] text-sulfur border border-sulfur/30 bg-sulfur/10 rounded-md px-3 py-2">{{ error }}</p>
      <input ref="input" class="hidden" type="file" accept=".zip" :disabled="busy" @change="pick" />
      <button type="button" class="w-full rounded-md border border-dashed border-border p-5 text-sm" :disabled="busy" @click="input?.click()" @dragover.prevent @drop.prevent="load($event.dataTransfer?.files[0])">
        选择或拖入 .zip（单包 100MB）
        <span class="mt-1 block text-xs text-muted-foreground">最多 500 个条目 / 解压总量 500MB / 最多 3 层；不支持加密、RAR、7z</span>
      </button>
      <p v-if="busy" role="status" class="text-sm">正在读取压缩包… {{ Math.round(progress) }}%</p>
      <div class="max-h-[45vh] overflow-auto rounded-md border border-border">
        <p v-if="!rows.length && !busy" class="p-4 text-xs text-muted-foreground">尚无可展示文件（隐藏文件与目录已忽略）</p>
        <div v-for="row in rows" :key="row.id" class="flex items-start gap-2 border-b border-border p-3 text-xs" :class="{ 'text-muted-foreground': reason(row) }">
          <input v-if="!reason(row)" type="checkbox" :aria-label="row.path" :checked="selected.includes(row.id)" :disabled="busy" @change="toggle(row)" />
          <div class="min-w-0 flex-1 break-all">
            <p>{{ row.path }}</p>
            <p class="mt-1">{{ fmtSize(row.size) }} · {{ row.name.split('.').pop()?.toUpperCase() }} · 第 {{ row.depth }} 层</p>
            <p v-if="reason(row)" class="mt-1">{{ reason(row) }}</p>
          </div>
          <button v-if="row.zip && row.depth < ZIP_LIMITS.depth" type="button" class="shrink-0 underline" :disabled="busy || row.expanded" @click="expand(row)">{{ row.expanded ? '已展开' : '展开' }}</button>
        </div>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs">已选 {{ selected.length }} 份 / 还可添加 {{ Math.max(0, remaining - selected.length) }} 份</span>
        <button type="button" class="tender-primary-btn" :disabled="busy || !selected.length || selected.length > remaining" @click="add">添加到{{ targetLabel }}</button>
      </div>
    </div>
  </AppDialog>
</template>
