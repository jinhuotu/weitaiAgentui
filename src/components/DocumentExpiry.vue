<script setup lang="ts">
import { computed, ref } from 'vue'
import { updateDocumentExpiry, type ExpiryInfo } from '@/lib/knowledge-api'
const props = defineProps<{ doc: ExpiryInfo; baseId: string; docId: string; editable?: boolean }>()
const saved = ref<ExpiryInfo | null>(null)
const info = computed(() => saved.value || props.doc)
const editing = ref(false)
const date = ref('')
const perpetual = ref(false)
const busy = ref(false)
const error = ref('')
function open() { date.value = info.value.expire_at || ''; perpetual.value = !!info.value.is_perpetual; error.value = ''; editing.value = true }
async function save() {
  busy.value = true
  try { saved.value = (await updateDocumentExpiry(props.baseId, props.docId, date.value || null, perpetual.value)).item; editing.value = false }
  catch (e) { error.value = e instanceof Error ? e.message : '保存失败' }
  finally { busy.value = false }
}
const label = computed(() => info.value.is_perpetual ? '长期' : !info.value.expire_at ? '到期：未维护' : `到期：${info.value.expire_at}${info.value.expire_status === 'expired' ? '（已过期）' : info.value.expire_status === 'expiring' ? '（临期）' : ''}`)
</script>
<template>
  <span class="inline-flex flex-wrap items-center gap-2 text-[11px]" @click.stop>
    <span :class="info.expire_level === 'danger' ? 'text-red-600 font-semibold' : info.expire_level === 'warning' ? 'text-orange-500 font-semibold' : 'text-text-muted'">{{ label }}</span>
    <button v-if="editable" type="button" class="underline text-text-secondary" @click="open">维护有效期</button>
    <span v-if="editing" class="inline-flex flex-wrap items-center gap-2 rounded border p-2">
      <input v-model="date" aria-label="到期日期" type="date" :disabled="perpetual || busy" class="bg-transparent border rounded" />
      <label><input v-model="perpetual" type="checkbox" :disabled="busy" /> 长期</label>
      <button type="button" :disabled="busy" @click="save">{{ busy ? '保存中' : '保存' }}</button>
      <button type="button" :disabled="busy" @click="editing = false">取消</button>
      <span v-if="error" class="text-red-600">{{ error }}</span>
    </span>
  </span>
</template>
