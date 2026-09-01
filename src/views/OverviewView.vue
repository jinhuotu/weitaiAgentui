<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  CheckCircle2,
  Ellipsis,
  Loader2,
  X,
} from 'lucide-vue-next'
import { Tag } from '@/components/ui-kit'
import { ApiError } from '@/lib/api'
import { fetchModelRuntime, type ModelConfigItem } from '@/lib/models-api'
import { listChatSessions } from '@/lib/ai-chat-api'
import { listKnowledgeBases } from '@/lib/knowledge-api'
import { useAuthStore } from '@/stores/auth'
import { NAV_GROUPS, NAV_ITEM_DESC, filterNavGroups, getMoreNavItems, getPrimaryNavItems } from '@/config/nav'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const error = ref('')
const status = ref<Awaited<ReturnType<typeof fetchModelRuntime>> | null>(null)
const sessionCount = ref(0)
const kbCount = ref(0)
const moreOpen = ref(false)

const visiblePrimary = computed(() =>
  getPrimaryNavItems(filterNavGroups(NAV_GROUPS, auth.isAdmin, auth.menus)).map((it) => ({
    ...it,
    desc: NAV_ITEM_DESC[it.href] || '',
  })),
)

const moreItems = computed(() =>
  getMoreNavItems(filterNavGroups(NAV_GROUPS, auth.isAdmin, auth.menus)).map((it) => ({
    ...it,
    desc: NAV_ITEM_DESC[it.href] || '',
  })),
)

function modelName(item: ModelConfigItem | null | undefined) {
  if (!item) return '未绑定'
  return item.name || item.modelName || '已配置'
}

function openModule(href: string, _label: string) {
  moreOpen.value = false
  void router.push(href)
}

function onDocClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null
  if (!target?.closest?.('[data-more-menu]')) {
    moreOpen.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [st, sessions, bases] = await Promise.all([
      fetchModelRuntime(),
      listChatSessions().catch(() => []),
      listKnowledgeBases().catch(() => []),
    ])
    status.value = st
    sessionCount.value = sessions.length
    kbCount.value = bases.length
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载总览失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div class="portal mx-auto w-full max-w-5xl">
    <section class="portal-hero">
      <div class="portal-hero__glow" aria-hidden="true" />
      <div class="portal-hero__body">
        <div class="min-w-0 flex-1">
          <p class="portal-hero__eyebrow">河南伟泰光电 · 智能体交互系统</p>
          <h1 class="portal-hero__title">工作台</h1>
          <p class="portal-hero__desc">
            常用业务从下方四个入口进入；管理与配置请点「更多」。
          </p>

          <div class="portal-stats">
            <div class="portal-stat">
              <span class="portal-stat__value">{{ loading ? '—' : sessionCount }}</span>
              <span class="portal-stat__label">会话</span>
            </div>
            <div class="portal-stat">
              <span class="portal-stat__value">{{ loading ? '—' : kbCount }}</span>
              <span class="portal-stat__label">知识库</span>
            </div>
            <div class="portal-stat">
              <span class="portal-stat__value">{{ status?.llm_configured ? '就绪' : '待配' }}</span>
              <span class="portal-stat__label">LLM</span>
            </div>
            <div class="portal-stat">
              <span class="portal-stat__value">{{ status?.embedding_configured ? '就绪' : '待配' }}</span>
              <span class="portal-stat__label">Embedding</span>
            </div>
          </div>
        </div>

        <div class="portal-runtime">
          <div class="portal-runtime__head">
            <span class="text-[12px] font-medium">模型运行时</span>
            <div class="flex gap-1.5">
              <Tag v-if="status?.llm_configured" tone="patina">LLM</Tag>
              <Tag v-else tone="sulfur">LLM</Tag>
              <Tag v-if="status?.embedding_configured" tone="patina">Emb</Tag>
              <Tag v-else tone="sulfur">Emb</Tag>
            </div>
          </div>

          <div v-if="loading" class="flex items-center gap-2 py-6 text-[12px] text-muted-foreground">
            <Loader2 class="size-3.5 animate-spin" />
            加载中…
          </div>
          <div
            v-else-if="error"
            class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
          >
            {{ error }}
          </div>
          <ul v-else class="portal-runtime__list">
            <li>
              <span>快速模式</span>
              <span class="portal-runtime__name">{{ modelName(status?.llm_fast) }}</span>
              <CheckCircle2 v-if="status?.llm_fast" class="size-3.5 text-patina" />
              <AlertTriangle v-else class="size-3.5 text-sulfur" />
            </li>
            <li>
              <span>深度模式</span>
              <span class="portal-runtime__name">{{ modelName(status?.llm_deep) }}</span>
              <CheckCircle2 v-if="status?.llm_deep" class="size-3.5 text-patina" />
              <AlertTriangle v-else class="size-3.5 text-sulfur" />
            </li>
            <li>
              <span>Embedding</span>
              <span class="portal-runtime__name">{{ modelName(status?.embedding) }}</span>
              <CheckCircle2 v-if="status?.embedding" class="size-3.5 text-patina" />
              <AlertTriangle v-else class="size-3.5 text-sulfur" />
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="mt-8">
      <div class="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 class="text-[15px] font-semibold tracking-wide">常用功能</h2>
          <p class="mt-0.5 text-[12px] text-muted-foreground">点击图标进入对应模块</p>
        </div>
      </div>

      <div class="primary-grid">
        <button
          v-for="item in visiblePrimary"
          :key="item.href"
          type="button"
          class="primary-tile"
          @click="openModule(item.href, item.label)"
        >
          <span class="primary-tile__icon">
            <component :is="item.icon" class="size-8" />
          </span>
          <span class="primary-tile__label">{{ item.label }}</span>
          <span class="primary-tile__desc">{{ item.desc }}</span>
        </button>

        <div v-if="moreItems.length" data-more-menu class="primary-more">
          <button
            type="button"
            class="primary-tile primary-tile--more"
            :class="{ 'primary-tile--active': moreOpen }"
            @click.stop="moreOpen = !moreOpen"
          >
            <span class="primary-tile__icon primary-tile__icon--muted">
              <Ellipsis class="size-8" />
            </span>
            <span class="primary-tile__label">更多</span>
            <span class="primary-tile__desc">管理、配置与其他入口</span>
          </button>

          <div v-if="moreOpen" class="more-panel" role="menu">
            <div class="more-panel__head">
              <span class="text-[12px] font-medium">更多功能</span>
              <button
                type="button"
                class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                aria-label="关闭"
                @click="moreOpen = false"
              >
                <X class="size-3.5" />
              </button>
            </div>
            <button
              v-for="item in moreItems"
              :key="item.href"
              type="button"
              class="more-item"
              role="menuitem"
              @click="openModule(item.href, item.label)"
            >
              <span class="more-item__icon">
                <component :is="item.icon" class="size-4" />
              </span>
              <span class="min-w-0 flex-1 text-left">
                <span class="block text-[13px] font-medium">{{ item.label }}</span>
                <span v-if="item.desc" class="block text-[11px] text-muted-foreground mt-0.5">
                  {{ item.desc }}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.portal-hero {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent-iron, #2563eb) 8%, hsl(var(--card))) 0%,
      hsl(var(--card)) 48%,
      color-mix(in srgb, var(--accent-coolant, #0ea5e9) 6%, hsl(var(--card))) 100%
    );
  box-shadow: 0 1px 2px color-mix(in srgb, #000 4%, transparent);
}

.portal-hero__glow {
  position: absolute;
  right: -10%;
  top: -40%;
  width: 55%;
  height: 140%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent-iron, #2563eb) 18%, transparent),
    transparent 70%
  );
  pointer-events: none;
}

.portal-hero__body {
  position: relative;
  display: grid;
  gap: 1.25rem;
  padding: clamp(1.25rem, 3vw, 2rem);
}

@media (min-width: 900px) {
  .portal-hero__body {
    grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.85fr);
    align-items: stretch;
  }
}

.portal-hero__eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent-iron, #2563eb);
}

.portal-hero__title {
  margin: 0.4rem 0 0;
  font-size: clamp(1.6rem, 3vw, 2rem);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.portal-hero__desc {
  margin: 0.5rem 0 0;
  max-width: 36rem;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: hsl(var(--muted-foreground));
}

.portal-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.portal-stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.7rem 0.8rem;
  border-radius: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--hairline, hsl(var(--border))) 80%, transparent);
  background: color-mix(in srgb, hsl(var(--background)) 55%, transparent);
}

.portal-stat__value {
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.portal-stat__label {
  font-size: 0.6875rem;
  color: hsl(var(--muted-foreground));
}

.portal-runtime {
  display: flex;
  flex-direction: column;
  border-radius: 0.75rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: color-mix(in srgb, hsl(var(--background)) 70%, transparent);
  padding: 0.9rem 1rem;
}

.portal-runtime__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.portal-runtime__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.portal-runtime__list li {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0;
  font-size: 0.75rem;
  border-top: 1px solid color-mix(in srgb, hsl(var(--border)) 70%, transparent);
}

.portal-runtime__list li:first-child {
  border-top: none;
}

.portal-runtime__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  color: hsl(var(--muted-foreground));
}

.primary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

@media (min-width: 768px) {
  .primary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .primary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.primary-more {
  position: relative;
}

.primary-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  width: 100%;
  min-height: 10.5rem;
  padding: 1.25rem 1rem;
  text-align: center;
  border-radius: 1rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: hsl(var(--card));
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.primary-tile:hover,
.primary-tile--active {
  border-color: color-mix(in srgb, var(--accent-iron, #2563eb) 45%, hsl(var(--border)));
  background: color-mix(in srgb, var(--accent-iron, #2563eb) 6%, hsl(var(--card)));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--accent-iron, #2563eb) 12%, transparent);
  transform: translateY(-2px);
}

.primary-tile__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.75rem;
  height: 3.75rem;
  border-radius: 1rem;
  background: color-mix(in srgb, var(--accent-iron, #2563eb) 14%, transparent);
  color: var(--accent-iron, #2563eb);
}

.primary-tile__icon--muted {
  background: color-mix(in srgb, hsl(var(--muted-foreground)) 12%, transparent);
  color: hsl(var(--muted-foreground));
}

.primary-tile__label {
  font-size: 0.9375rem;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.primary-tile__desc {
  font-size: 0.6875rem;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
  max-width: 11rem;
}

.more-panel {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 0.5rem);
  min-width: min(20rem, 85vw);
  max-height: min(22rem, 50vh);
  overflow: auto;
  border-radius: 0.85rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: hsl(var(--card));
  box-shadow: 0 16px 40px color-mix(in srgb, #000 14%, transparent);
  padding: 0.4rem;
}

@media (min-width: 1024px) {
  .more-panel {
    left: auto;
    right: 0;
    width: 20rem;
  }
}

.more-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.55rem 0.55rem;
  border-bottom: 1px solid color-mix(in srgb, hsl(var(--border)) 80%, transparent);
  margin-bottom: 0.25rem;
}

.more-item {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  width: 100%;
  padding: 0.65rem 0.55rem;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.12s ease;
}

.more-item:hover {
  background: color-mix(in srgb, var(--accent-iron, #2563eb) 8%, transparent);
}

.more-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--accent-iron, #2563eb) 10%, transparent);
  color: var(--accent-iron, #2563eb);
  flex-shrink: 0;
}

@media (max-width: 520px) {
  .portal-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
