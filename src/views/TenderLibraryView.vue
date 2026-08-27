<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { FileText, FolderOpen, Loader2, Trash2, Upload } from 'lucide-vue-next'
import { PageHeader, Panel, Tag } from '@/components/ui-kit'
import { ApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import {
  clearTenderSlot,
  fetchTenderLibrary,
  uploadTenderSlot,
  type SlotStatus,
} from '@/lib/tenders-api'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const hint = ref('')
const slots = ref<SlotStatus[]>([])
const uploadingKey = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingKey = ref<string | null>(null)
const pendingReplace = ref(true)

const filledCount = computed(() => slots.value.filter((s) => s.fileCount > 0).length)

onMounted(async () => {
  if (!getAccessToken()) {
    error.value = '请先登录'
    loading.value = false
    return
  }
  await reload()
})

async function reload() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchTenderLibrary()
    slots.value = data.slots || []
    hint.value = data.hint || ''
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '加载资料库失败'
  } finally {
    loading.value = false
  }
}

function pickFiles(slot: SlotStatus, replace: boolean) {
  if (!slot.key) return
  pendingKey.value = slot.key
  pendingReplace.value = replace
  fileInput.value?.click()
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  const key = pendingKey.value
  const replace = pendingReplace.value
  input.value = ''
  pendingKey.value = null
  if (!files.length || !key) return
  error.value = ''
  uploadingKey.value = key
  try {
    let last: SlotStatus | null = null
    for (let i = 0; i < files.length; i++) {
      const data = await uploadTenderSlot(key, files[i], { replace: replace && i === 0 })
      last = {
        key,
        title: data.title || slots.value.find((s) => s.key === key)?.title || key,
        hint: data.hint || slots.value.find((s) => s.key === key)?.hint || '',
        fileCount: data.fileCount,
        files: data.files || [],
      }
    }
    if (last) {
      const idx = slots.value.findIndex((s) => s.key === key)
      if (idx >= 0) slots.value.splice(idx, 1, last)
    }
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '上传失败'
  } finally {
    uploadingKey.value = null
  }
}

async function onClear(slot: SlotStatus) {
  if (!slot.key || !slot.fileCount) return
  error.value = ''
  uploadingKey.value = slot.key
  try {
    await clearTenderSlot(slot.key)
    const idx = slots.value.findIndex((s) => s.key === slot.key)
    if (idx >= 0) {
      slots.value.splice(idx, 1, {
        ...slots.value[idx],
        fileCount: 0,
        files: [],
      })
    }
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : '清除失败'
  } finally {
    uploadingKey.value = null
  }
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <PageHeader
    title="投标资料库"
    description="维护公司常备扫描件（8 大类）。生成投标文件时自动引用，无需每次重新上传。"
  >
    <template #badges>
      <Tag tone="molybdenum">常备附件</Tag>
      <Tag>生成时自动引用</Tag>
    </template>
    <template #actions>
      <button
        type="button"
        class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] hover:bg-accent"
        @click="router.push('/tenders')"
      >
        <FileText class="size-3.5" />
        去生成投标文件
      </button>
    </template>
  </PageHeader>

  <p
    v-if="error"
    class="mb-4 text-[12px] text-sulfur border border-sulfur/30 bg-sulfur/10 rounded-md px-3 py-2"
  >
    {{ error }}
  </p>

  <div v-if="loading" class="py-16 text-center text-[12px] text-muted-foreground">
    <Loader2 class="inline size-4 animate-spin mr-2" />加载资料库…
  </div>

  <div v-else class="space-y-5 max-w-4xl">
    <Panel title="公司常备扫描件" :subtitle="hint || 'PDF / 图片，可多选；替换会覆盖该项全部文件'">
      <p class="mb-4 text-[12px] text-muted-foreground">
        已维护
        <span class="text-foreground font-medium">{{ filledCount }}</span>
        /
        {{ slots.length }} 类
      </p>

      <ul class="space-y-3">
        <li
          v-for="(slot, i) in slots"
          :key="slot.key"
          class="rounded-md border border-border px-3 py-3"
        >
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 text-[13px]">
                <span class="text-muted-foreground font-sans text-[11px]">（{{ '一二三四五六七八九十'[i] || i + 1 }}）</span>
                <span class="text-foreground/90">{{ slot.title }}</span>
                <span
                  v-if="slot.fileCount"
                  class="text-[11px] text-emerald-700 dark:text-emerald-400"
                >【已维护 {{ slot.fileCount }} 个】</span>
                <span v-else class="text-[11px] text-sulfur">【待上传】</span>
              </div>
              <p v-if="slot.hint" class="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                {{ slot.hint }}
              </p>
              <ul v-if="slot.files.length" class="mt-2 space-y-0.5">
                <li
                  v-for="f in slot.files"
                  :key="f.name"
                  class="flex items-center gap-1.5 text-[11px] text-muted-foreground font-sans"
                >
                  <FolderOpen class="size-3 shrink-0 opacity-70" />
                  <span class="truncate">{{ f.name }}</span>
                  <span class="shrink-0 opacity-70">{{ formatSize(f.sizeBytes) }}</span>
                </li>
              </ul>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-border text-[11px] hover:bg-accent disabled:opacity-50"
                :disabled="uploadingKey === slot.key"
                @click="pickFiles(slot, true)"
              >
                <Loader2 v-if="uploadingKey === slot.key" class="size-3 animate-spin" />
                <Upload v-else class="size-3" />
                {{ slot.fileCount ? '替换' : '上传' }}
              </button>
              <button
                v-if="slot.fileCount"
                type="button"
                class="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-accent disabled:opacity-50"
                :disabled="uploadingKey === slot.key"
                @click="pickFiles(slot, false)"
              >
                追加
              </button>
              <button
                v-if="slot.fileCount"
                type="button"
                class="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-border text-[11px] hover:bg-accent disabled:opacity-50"
                :disabled="uploadingKey === slot.key"
                @click="onClear(slot)"
              >
                <Trash2 class="size-3" />
                清除
              </button>
            </div>
          </div>
        </li>
      </ul>

      <input
        ref="fileInput"
        type="file"
        class="hidden"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,application/pdf,image/*"
        @change="onFileChange"
      />
    </Panel>
  </div>
</template>
