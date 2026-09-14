<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bot, Check, ChevronDown, Ellipsis, Plus, X } from 'lucide-vue-next'
import { NAV_ITEM_DESC, type NavItem } from '@/config/nav'
import { useNavDragReorder } from '@/composables/useNavDragReorder'
import { useOrderedPrimaryNav } from '@/composables/useOrderedPrimaryNav'
import { cn } from '@/lib/utils'
import { useMobileMenuStore } from '@/stores/mobile-menu'

const route = useRoute()
const mobileMenu = useMobileMenuStore()
const { items: primaryItems, moreItems, groups: navGroups, commitOrder } = useOrderedPrimaryNav()
const navDrag = useNavDragReorder(primaryItems, commitOrder)

const overviewItem = computed(() =>
  navGroups.value
    .flatMap((g) => g.items || [])
    .find((it) => it.href === '/'),
)

const moreOpen = ref(false)

const navRef = ref<HTMLElement | null>(null)
const savedScroll = ref(0)

function isItemActive(item: NavItem, pathname: string) {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
}

function itemDesc(item: NavItem) {
  return NAV_ITEM_DESC[item.href] || ''
}

const moreActive = computed(() =>
  moreItems.value.some((it) => isItemActive(it, route.path)),
)

function handleScroll() {
  if (navRef.value) savedScroll.value = navRef.value.scrollTop
}

function toggleMore() {
  moreOpen.value = !moreOpen.value
}

function onDocClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null
  if (!target?.closest?.('[data-sidebar-more]')) {
    moreOpen.value = false
  }
}

watch(
  () => route.path,
  async (path) => {
    if (moreItems.value.some((it) => isItemActive(it, path))) {
      moreOpen.value = true
    }
    await nextTick()
    if (navRef.value) navRef.value.scrollTop = savedScroll.value
    mobileMenu.close()
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <!-- Desktop sidebar -->
  <aside class="shell-sidebar hidden lg:flex">
    <div class="shell-sidebar__brand">
      <div
        class="inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-iron to-coolant text-white shadow-sm"
      >
        <Bot class="size-4" />
      </div>
      <div class="leading-tight">
        <div class="text-[14px] font-semibold tracking-wide text-slate-900">伟泰光电</div>
        <div class="font-mono text-[10px] tracking-[0.16em] text-slate-500">WEITAI · v0.1</div>
      </div>
    </div>

    <nav ref="navRef" class="shell-sidebar__nav" @scroll="handleScroll">
      <section v-if="overviewItem" class="shell-nav-group">
        <h2 class="shell-nav-group__title">工作台</h2>
        <div class="space-y-2">
          <RouterLink
            :to="overviewItem.href"
            :class="
              cn(
                'shell-nav-card',
                isItemActive(overviewItem, route.path) && 'shell-nav-card--active',
              )
            "
          >
            <span class="shell-nav-card__icon">
              <component :is="overviewItem.icon" class="size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-semibold text-slate-900">
                {{ overviewItem.label }}
              </span>
              <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                {{ itemDesc(overviewItem) }}
              </span>
            </span>
            <span class="shell-nav-card__action">
              <Check v-if="isItemActive(overviewItem, route.path)" class="size-3.5" />
              <Plus v-else class="size-3.5" />
            </span>
          </RouterLink>
        </div>
      </section>

      <section class="shell-nav-group">
        <h2 class="shell-nav-group__title">AI 智控</h2>
        <div class="space-y-2">
          <div
            v-for="(item, index) in primaryItems"
            :key="item.href"
            class="shell-nav-sort"
            :class="navDrag.itemClass(index)"
            draggable="true"
            title="拖拽调整顺序"
            @dragstart="navDrag.onDragStart(index, $event)"
            @dragover="navDrag.onDragOver(index, $event)"
            @dragenter="navDrag.onDragOver(index, $event)"
            @drop="navDrag.onDrop(index, $event)"
            @dragend="navDrag.onDragEnd"
          >
            <RouterLink
              :to="item.href"
              draggable="false"
              :class="
                cn(
                  'shell-nav-card',
                  isItemActive(item, route.path) && 'shell-nav-card--active',
                )
              "
              @click.capture="navDrag.onClickCapture"
            >
              <span class="shell-nav-card__icon">
                <component :is="item.icon" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-semibold text-slate-900">
                  {{ item.label }}
                </span>
                <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                  {{ itemDesc(item) }}
                </span>
              </span>
              <span class="shell-nav-card__action">
                <Check v-if="isItemActive(item, route.path)" class="size-3.5" />
                <Plus v-else class="size-3.5" />
              </span>
            </RouterLink>
          </div>

          <div v-if="moreItems.length" data-sidebar-more class="shell-nav-more">
            <button
              type="button"
              :class="
                cn(
                  'shell-nav-card w-full text-left',
                  (moreOpen || moreActive) && 'shell-nav-card--active',
                )
              "
              @click.stop="toggleMore"
            >
              <span class="shell-nav-card__icon shell-nav-card__icon--muted">
                <Ellipsis class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-semibold text-slate-900">更多</span>
                <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                  管理、配置与其他入口
                </span>
              </span>
              <span class="shell-nav-card__action">
                <ChevronDown
                  class="size-3.5 transition-transform duration-200"
                  :class="moreOpen ? 'rotate-180' : ''"
                />
              </span>
            </button>

            <div v-show="moreOpen" class="shell-nav-more__list">
              <RouterLink
                v-for="item in moreItems"
                :key="item.href"
                :to="item.href"
                :class="
                  cn(
                    'shell-nav-card shell-nav-card--sub',
                    isItemActive(item, route.path) && 'shell-nav-card--active',
                  )
                "
              >
                <span class="shell-nav-card__icon">
                  <component :is="item.icon" class="size-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] font-semibold text-slate-900">
                    {{ item.label }}
                  </span>
                  <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                    {{ itemDesc(item) }}
                  </span>
                </span>
                <span class="shell-nav-card__action">
                  <Check v-if="isItemActive(item, route.path)" class="size-3.5" />
                </span>
              </RouterLink>
            </div>
          </div>
        </div>
      </section>
    </nav>
  </aside>

  <!-- Mobile overlay -->
  <div
    :class="
      cn(
        'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
        mobileMenu.open
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0',
      )
    "
    aria-hidden="true"
    @click="mobileMenu.close()"
  />

  <!-- Mobile drawer -->
  <aside
    :class="
      cn(
        'fixed top-0 left-0 z-50 flex h-full w-[300px] max-w-[86vw] flex-col bg-[#e8f2ff]/95 shadow-2xl backdrop-blur-md transition-transform duration-200 ease-out lg:hidden',
        mobileMenu.open ? 'translate-x-0' : '-translate-x-full',
      )
    "
  >
    <div class="flex h-14 items-center gap-2 border-b border-white/50 px-4">
      <div
        class="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-iron to-coolant text-white"
      >
        <Bot class="size-4" />
      </div>
      <div class="flex-1 leading-tight">
        <div class="text-[14px] font-semibold">伟泰光电</div>
        <div class="font-mono text-[10px] tracking-[0.14em] text-slate-500">WEITAI</div>
      </div>
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/60"
        @click="mobileMenu.close()"
      >
        <X class="size-4" />
      </button>
    </div>

    <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <section v-if="overviewItem">
        <h2 class="mb-2 px-1 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
          工作台
        </h2>
        <div class="space-y-2">
          <RouterLink
            :to="overviewItem.href"
            :class="
              cn(
                'shell-nav-card',
                isItemActive(overviewItem, route.path) && 'shell-nav-card--active',
              )
            "
            @click="mobileMenu.close()"
          >
            <span class="shell-nav-card__icon">
              <component :is="overviewItem.icon" class="size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-semibold text-slate-900">
                {{ overviewItem.label }}
              </span>
              <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                {{ itemDesc(overviewItem) }}
              </span>
            </span>
          </RouterLink>
        </div>
      </section>

      <section>
        <h2 class="mb-2 px-1 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
          AI 智控
        </h2>
        <div class="space-y-2">
          <div
            v-for="(item, index) in primaryItems"
            :key="`m-${item.href}`"
            class="shell-nav-sort"
            :class="navDrag.itemClass(index)"
            draggable="true"
            title="拖拽调整顺序"
            @dragstart="navDrag.onDragStart(index, $event)"
            @dragover="navDrag.onDragOver(index, $event)"
            @dragenter="navDrag.onDragOver(index, $event)"
            @drop="navDrag.onDrop(index, $event)"
            @dragend="navDrag.onDragEnd"
          >
            <RouterLink
              :to="item.href"
              draggable="false"
              :class="
                cn(
                  'shell-nav-card',
                  isItemActive(item, route.path) && 'shell-nav-card--active',
                )
              "
              @click.capture="navDrag.onClickCapture"
              @click="mobileMenu.close()"
            >
              <span class="shell-nav-card__icon">
                <component :is="item.icon" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-semibold text-slate-900">
                  {{ item.label }}
                </span>
                <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                  {{ itemDesc(item) }}
                </span>
              </span>
            </RouterLink>
          </div>

          <div v-if="moreItems.length" data-sidebar-more>
            <button
              type="button"
              :class="
                cn(
                  'shell-nav-card w-full text-left',
                  (moreOpen || moreActive) && 'shell-nav-card--active',
                )
              "
              @click.stop="toggleMore"
            >
              <span class="shell-nav-card__icon shell-nav-card__icon--muted">
                <Ellipsis class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-semibold text-slate-900">更多</span>
                <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                  管理、配置与其他入口
                </span>
              </span>
              <ChevronDown
                class="size-4 shrink-0 text-slate-500 transition-transform duration-200"
                :class="moreOpen ? 'rotate-180' : ''"
              />
            </button>

            <div v-show="moreOpen" class="shell-nav-more__list">
              <RouterLink
                v-for="item in moreItems"
                :key="`m-more-${item.href}`"
                :to="item.href"
                :class="
                  cn(
                    'shell-nav-card shell-nav-card--sub',
                    isItemActive(item, route.path) && 'shell-nav-card--active',
                  )
                "
                @click="mobileMenu.close()"
              >
                <span class="shell-nav-card__icon">
                  <component :is="item.icon" class="size-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] font-semibold text-slate-900">
                    {{ item.label }}
                  </span>
                  <span class="mt-0.5 block truncate text-[11px] text-slate-500">
                    {{ itemDesc(item) }}
                  </span>
                </span>
              </RouterLink>
            </div>
          </div>
        </div>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
.shell-sidebar {
  width: 18.5rem;
  flex-shrink: 0;
  flex-direction: column;
  padding: 0.85rem 0.75rem 0.85rem 0.85rem;
}

.shell-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem 1rem;
}

.shell-sidebar__nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.15rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.shell-nav-group__title {
  margin: 0 0 0.55rem 0.35rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(30, 58, 138, 0.62);
}

.shell-nav-sort {
  cursor: grab;
  user-select: none;
}

.shell-nav-sort .shell-nav-card {
  cursor: inherit;
}

.shell-nav-sort.is-dragging {
  opacity: 0.42;
  cursor: grabbing;
}

.shell-nav-sort.is-over {
  outline: 2px dashed rgba(37, 99, 235, 0.45);
  outline-offset: 2px;
  border-radius: 1rem;
}

.shell-nav-card {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.75rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.42);
  box-shadow: 0 1px 2px rgba(30, 64, 175, 0.04);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
  text-decoration: none;
  color: inherit;
}

.shell-nav-card:hover {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

.shell-nav-card--active {
  background: #fff;
  border-color: rgba(255, 255, 255, 0.95);
  box-shadow:
    0 8px 22px rgba(37, 99, 235, 0.12),
    0 1px 3px rgba(15, 23, 42, 0.05);
}

.shell-nav-card--sub {
  margin-top: 0.35rem;
  padding: 0.6rem 0.7rem;
  background: rgba(255, 255, 255, 0.28);
}

.shell-nav-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 0.7rem;
  background: linear-gradient(145deg, rgba(37, 99, 235, 0.14), rgba(14, 165, 233, 0.12));
  color: #2563eb;
  flex-shrink: 0;
}

.shell-nav-card__icon--muted {
  background: rgba(148, 163, 184, 0.16);
  color: #64748b;
}

.shell-nav-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #64748b;
  background: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
}

.shell-nav-card--active .shell-nav-card__action {
  border-color: transparent;
  background: #2563eb;
  color: #fff;
}

.shell-nav-more__list {
  margin-top: 0.35rem;
  padding-left: 0.35rem;
  border-left: 2px solid rgba(37, 99, 235, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
</style>
