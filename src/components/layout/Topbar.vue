<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sun, Moon, CircleDot, LogOut, Menu, Bot } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useMobileMenuStore } from '@/stores/mobile-menu'

const auth = useAuthStore()
const theme = useThemeStore()
const mobileMenu = useMobileMenuStore()
const router = useRouter()

const now = ref('--:--:--')
let timer: number | undefined

function updateClock() {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  now.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
  updateClock()
  timer = window.setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})

const displayName = computed(
  () => auth.user?.display_name || auth.user?.username || '未登录',
)

const roleLabel = computed(() => {
  if (auth.user?.is_superuser) return '系统管理员'
  if (auth.user?.roles?.[0]) return `角色 · ${auth.user.roles[0]}`
  return '已登录'
})

async function onLogout() {
  auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-2 px-3 sm:px-5">
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-black/5 lg:hidden"
      aria-label="打开菜单"
      @click="mobileMenu.toggle()"
    >
      <Menu class="size-5" />
    </button>

    <div class="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
      <CircleDot class="size-3 text-patina pulse-alert" />
      <span>系统在线</span>
      <span class="mx-1 text-border">|</span>
      <span class="data-num text-foreground/80">{{ now }}</span>
    </div>

    <div class="ml-auto flex items-center gap-1">
      <button
        type="button"
        class="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition hover:bg-black/5 hover:text-foreground md:flex"
        :title="theme.isDark ? '切换浅色主题' : '切换深色主题'"
        @click="theme.toggle()"
      >
        <Sun v-if="theme.isDark" class="size-3.5" />
        <Moon v-else class="size-3.5" />
        <span>主题</span>
      </button>
      <div class="ml-1 flex items-center gap-2 border-l border-border/70 pl-2">
        <div
          class="inline-flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-iron to-coolant text-white"
        >
          <Bot class="size-3.5" />
        </div>
        <div class="hidden leading-tight md:block">
          <div class="text-xs font-medium">{{ displayName }}</div>
          <div class="text-[10px] text-muted-foreground">伟泰光电 · {{ roleLabel }}</div>
        </div>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-black/5 hover:text-foreground"
          title="退出登录"
          @click="onLogout"
        >
          <LogOut class="size-3.5" />
        </button>
      </div>
    </div>
  </header>
</template>
