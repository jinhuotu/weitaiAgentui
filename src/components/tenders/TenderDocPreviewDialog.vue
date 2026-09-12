<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Download, Loader2 } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import TenderDocEditor from '@/components/tenders/TenderDocEditor.vue'
import { ApiError } from '@/lib/api'
import {
  downloadTenderFile,
  fetchTenderRecord,
  type TenderRecordItem,
} from '@/lib/tenders-api'
import type { TenderTask } from '@/lib/tender-tasks'

const props = defineProps<{
  open: boolean
  task: TenderTask | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const loading = ref(false)
const error = ref('')
const record = ref<TenderRecordItem | null>(null)
const downloading = ref(false)
const layoutTick = ref(0)

watch(
  () => [props.open, props.task?.recordId] as const,
  async ([open, id]) => {
    if (!open || !id) {
      record.value = null
      error.value = ''
      loading.value = false
      return
    }
    loading.value = true
    error.value = ''
    record.value = null
    try {
      const detail = await fetchTenderRecord(id)
      if (!detail.docxAvailable || !detail.docxFile) {
        error.value = '该记录的 Word 文件已丢失，无法预览'
        return
      }
      record.value = detail
      await nextTick()
      layoutTick.value += 1
      window.setTimeout(() => {
        layoutTick.value += 1
      }, 120)
    } catch (e) {
      error.value = e instanceof ApiError || e instanceof Error ? e.message : '加载投标文件失败'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function onDownload() {
  const row = record.value
  if (!row?.docxFile) return
  downloading.value = true
  error.value = ''
  try {
    await downloadTenderFile(row.docxFile, row.downloadName || `${row.projectName || 'bid'}.docx`)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    size="xl"
    :title="task ? `预览投标文件 · ${task.projectName}` : '预览投标文件'"
    description="在当前页查看 Word，关闭后仍停留在任务列表。"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        v-if="loading"
        class="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <Loader2 class="size-4 animate-spin" />
        正在打开投标文件…
      </div>
      <p v-else-if="error && !record" class="text-xs text-iron">{{ error }}</p>
      <TenderDocEditor
        v-else-if="record?.docxFile"
        :key="record.docxFile"
        class="min-h-0 flex-1"
        :docx-file="record.docxFile"
        :download-name="record.downloadName || `${record.projectName || 'bid'}.docx`"
        mode="view"
        engine="browser"
        :layout-tick="layoutTick"
      />
    </div>
    <template #footer>
      <p v-if="error && record" class="mr-auto text-[11px] text-iron">{{ error }}</p>
      <button
        type="button"
        class="h-8 px-3 text-xs rounded-md border border-border hover:bg-accent"
        @click="emit('update:open', false)"
      >
        关闭
      </button>
      <button
        type="button"
        class="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md bg-iron text-background hover:bg-iron/90 disabled:opacity-40"
        :disabled="!record?.docxFile || downloading"
        @click="onDownload"
      >
        <Loader2 v-if="downloading" class="size-3.5 animate-spin" />
        <Download v-else class="size-3.5" />
        下载 Word
      </button>
    </template>
  </AppDialog>
</template>
