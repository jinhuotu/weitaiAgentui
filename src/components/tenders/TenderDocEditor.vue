<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import { ApiError } from '@/lib/api'
import { fetchTenderEditorConfig } from '@/lib/tenders-api'

const props = defineProps<{
  docxFile: string
  downloadName: string
  fullscreen?: boolean
  layoutTick?: number
  /** view=只读预览（更快）；edit=可改稿 */
  mode?: 'edit' | 'view'
}>()

const loading = ref(true)
const error = ref('')
const editorHost = ref<HTMLElement | null>(null)
const editorRoot = ref<HTMLElement | null>(null)
let docEditor: { destroyEditor?: () => void } | null = null
let resizeObserver: ResizeObserver | null = null
let lastBootHeight = 0
let notifyingResize = false

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: (
        id: string,
        config: Record<string, unknown>,
      ) => { destroyEditor?: () => void }
    }
  }
}

/** 读取容器实际高度（flex 布局后由 CSS 决定，非固定像素） */
function measureHostHeight(): number {
  const box = editorRoot.value || editorHost.value
  if (!box) return 520
  const h = Math.floor(box.getBoundingClientRect().height)
  if (h >= 400) return h
  const top = box.getBoundingClientRect().top
  return Math.max(Math.floor(window.innerHeight - top - 64), 480)
}

function fillEditorFrame() {
  const host = editorHost.value
  if (!host) return
  const h = measureHostHeight()
  const box = editorRoot.value || host
  const w = Math.max(Math.floor(box.getBoundingClientRect().width), 320)
  const apply = (el: HTMLElement) => {
    el.style.setProperty('width', '100%', 'important')
    el.style.setProperty('height', `${h}px`, 'important')
    el.style.setProperty('min-height', `${h}px`, 'important')
  }
  apply(host)
  host.querySelectorAll<HTMLElement>(':scope > div, iframe').forEach(apply)
  const iframe = host.querySelector('iframe')
  if (iframe) {
    iframe.setAttribute('height', String(h))
    iframe.setAttribute('width', String(w))
  }
  lastBootHeight = h
}

function notifyEditorResize() {
  if (notifyingResize) return
  notifyingResize = true
  window.dispatchEvent(new Event('resize'))
  window.setTimeout(() => {
    notifyingResize = false
  }, 0)
}

function destroyEditor() {
  resizeObserver?.disconnect()
  resizeObserver = null
  try {
    docEditor?.destroyEditor?.()
  } catch {
    /* ignore */
  }
  docEditor = null
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[data-onlyoffice="1"]`) as HTMLScriptElement | null
  if (existing?.src === src) {
    return Promise.resolve()
  }
  if (existing) {
    existing.remove()
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.onlyoffice = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('OnlyOffice 脚本加载失败，请确认 Document Server 已启动'))
    document.head.appendChild(script)
  })
}

function watchHostResize(onHeightChange: (height: number) => void) {
  const box = editorRoot.value || editorHost.value
  if (!box || typeof ResizeObserver === 'undefined') return
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    fillEditorFrame()
    const h = measureHostHeight()
    onHeightChange(h)
  })
  resizeObserver.observe(box)
}

async function boot() {
  if (!props.docxFile) return
  loading.value = true
  error.value = ''
  destroyEditor()

  await nextTick()
  await nextTick()

  try {
    const heightPx = measureHostHeight()
    if (heightPx < 400) {
      throw new Error('编辑器区域高度不足，请放大窗口后重试')
    }

    const data = await fetchTenderEditorConfig(
      props.docxFile,
      props.downloadName,
      heightPx,
      props.mode === 'view' ? 'view' : 'edit',
    )
    const scriptUrl = `${data.documentServerUrl}/web-apps/apps/api/documents/api.js`
    await loadScript(scriptUrl)
    if (!window.DocsAPI) {
      throw new Error('OnlyOffice API 未就绪')
    }

    const host = editorHost.value
    if (!host) return

    fillEditorFrame()
    await nextTick()

    const editorId = `tender-doc-editor-${props.docxFile.replace(/\W/g, '')}-${props.mode || 'edit'}`
    host.id = editorId
    host.innerHTML = ''

    docEditor = window.DocsAPI.DocEditor(editorId, data.config)
    lastBootHeight = heightPx

    watchHostResize((h) => {
      if (loading.value || error.value) return
      lastBootHeight = h
      fillEditorFrame()
      notifyEditorResize()
    })

    window.setTimeout(() => {
      fillEditorFrame()
      notifyEditorResize()
    }, 150)
    window.setTimeout(() => {
      fillEditorFrame()
      notifyEditorResize()
    }, 800)
  } catch (e) {
    error.value =
      e instanceof ApiError || e instanceof Error ? e.message : '在线 Word 编辑器加载失败'
  } finally {
    loading.value = false
    await nextTick()
    fillEditorFrame()
    notifyEditorResize()
  }
}

onMounted(() => {
  void boot()
})

watch(
  () => [props.docxFile, props.downloadName, props.mode] as const,
  () => {
    void boot()
  },
)

watch(
  () => props.layoutTick,
  async () => {
    await nextTick()
    fillEditorFrame()
    notifyEditorResize()
    window.setTimeout(() => {
      fillEditorFrame()
      notifyEditorResize()
    }, 80)
  },
)

watch(
  () => props.fullscreen,
  async () => {
    await nextTick()
    fillEditorFrame()
    notifyEditorResize()
    window.setTimeout(() => {
      fillEditorFrame()
      notifyEditorResize()
    }, 80)
    window.setTimeout(() => {
      fillEditorFrame()
      notifyEditorResize()
    }, 400)
  },
)

onBeforeUnmount(() => {
  destroyEditor()
})
</script>

<template>
  <div ref="editorRoot" class="tender-doc-editor">
    <div ref="editorHost" class="tender-doc-editor__host" />

    <div v-if="loading" class="tender-doc-editor__overlay">
      <Loader2 class="size-5 animate-spin text-muted-foreground" />
      <span class="text-[12px] text-muted-foreground">
        {{ mode === 'view' ? '正在打开只读预览…' : '正在打开在线 Word…' }}
      </span>
    </div>

    <div
      v-else-if="error"
      class="tender-doc-editor__overlay tender-doc-editor__overlay--error"
    >
      <TriangleAlert class="size-5 shrink-0 text-sulfur" />
      <div class="min-w-0">
        <p class="text-[12px] text-foreground">{{ error }}</p>
        <p class="text-[11px] text-muted-foreground mt-1">
          请确认已执行
          <code class="text-[10px]">docker compose up -d onlyoffice</code>
          ，且后端 .env 中 ONLYOFFICE_* 与 compose 里 JWT_SECRET 一致。
        </p>
        <button type="button" class="tender-doc-editor__retry mt-3" @click="boot">
          <RefreshCw class="size-3.5" />
          重试
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tender-doc-editor {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--hairline, hsl(var(--border)));
  border-radius: 0.75rem;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-elevated, hsl(var(--card))) 92%, transparent);
}

.tender-doc-editor__host {
  position: absolute;
  inset: 0;
  flex: none;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.tender-doc-editor__host :deep(iframe),
.tender-doc-editor__host :deep(> div) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  max-height: 100% !important;
  border: 0;
}

.tender-doc-editor__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  background: color-mix(in srgb, var(--bg-elevated, hsl(var(--card))) 94%, transparent);
}

.tender-doc-editor__overlay--error {
  align-items: flex-start;
  justify-content: flex-start;
  text-align: left;
}

.tender-doc-editor__retry {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 2rem;
  padding: 0 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  font-size: 11px;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
}

.tender-doc-editor__retry:hover {
  background: hsl(var(--accent));
}
</style>
