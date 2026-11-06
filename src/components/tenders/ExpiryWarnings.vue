<script setup lang="ts">
import type { MaterialExpiryWarning } from '@/lib/tenders-api'
defineProps<{ warnings: MaterialExpiryWarning[] }>()
</script>
<template>
  <div v-if="warnings.length" class="my-3 space-y-2 text-[12px]">
    <details v-for="(w, i) in warnings" :key="i" class="rounded border p-2" :class="w.level === 'danger' ? 'text-red-600 border-red-500/40' : w.level === 'warning' ? 'text-orange-500 border-orange-500/40' : 'text-muted-foreground'">
      <summary class="cursor-pointer">{{ w.material_name }} · {{ w.document_name }}：{{ w.expire_status === 'expired' ? '已过期' : w.expire_status === 'unknown' ? '到期信息未维护' : w.expire_status === 'project_expiry' ? '项目期内到期建议' : '临近到期' }}</summary>
      <p class="mt-2">到期日期：{{ w.expire_at || '未维护' }}<template v-if="w.remaining_days !== null"> · {{ w.remaining_days < 0 ? `已过期 ${-w.remaining_days} 天` : `剩余 ${w.remaining_days} 天` }}</template></p>
      <p>{{ w.advice }}；提示不阻断生成，可更换资料后重新生成。</p>
    </details>
  </div>
</template>
