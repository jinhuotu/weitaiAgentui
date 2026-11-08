<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchTenderQa, inspectTenderQa, type BidRequirement, type QaReport, type ScoringReview } from '@/lib/tenders-api'
import { scoringRuleLabel } from '@/lib/scoring-labels'

const props = defineProps<{
  recordId: string
  file: string
  volume: 'business' | 'technical' | 'full'
  scoringReview?: ScoringReview | null
  scorecard?: string
  requirements: BidRequirement[]
}>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const report = ref<QaReport | null>(null)
let epoch = 0
const scoring = computed(() => report.value?.stale ? props.scoringReview : report.value?.scoringReview || props.scoringReview)
const scoringStale = computed(() => Boolean(report.value?.stale || (scoring.value && scoring.value.version !== 'scoring-review/2')))
const pendingUnits = computed(() => (scoring.value?.units || []).filter(u => u.status === 'pending' || u.status === 'reference'))
const scoreRows = computed(() => (scoring.value?.rows || []).filter(r => props.volume === 'full' || r.volume === 'both' || r.volume === props.volume).map(r => busy.value || scoringStale.value ? { ...r, status: 'indeterminate' as const, reason: '当前显示之前识别的条款，尚非本轮核对结果', bidEvidence: '', bidLocation: '' } : r))
const scoreLabel = { conforming: '符合（需人工复核）', nonconforming: '不符合', partial: '部分符合', indeterminate: '待核实' }
const scoreSummary = computed(() => {
  const list = scoreRows.value
  if (busy.value) return `评分核对中 · 已有识别 ${list.length} 项（非本轮最终结果）`
  if (scoringStale.value) return `评分旧结果 ${list.length} 项 · 需重新核对`
  return `评分 ${list.length} 项：符合 ${list.filter(r => r.status === 'conforming').length} / 不符合 ${list.filter(r => r.status === 'nonconforming').length} / 部分符合 ${list.filter(r => r.status === 'partial').length} / 待核实 ${list.filter(r => r.status === 'indeterminate').length}`
})
const rows = computed(() => {
  const checked = report.value?.stale ? [] : report.value?.requirementCoverage?.rows || []
  const source = props.requirements.filter(r => props.volume === 'full' || !r.volume || r.volume === props.volume)
  const merged = source.map(r => ({ ...r, check: checked.find(c => c.id === r.id) }))
  for (const r of checked) if (!merged.some(m => m.id === r.id)) merged.push({ ...r, category: '', targetKind: '', check: r })
  return merged.map(r => {
    const scoring = r.category === 'scoring' || r.scoreWeight != null
    const status = scoring ? undefined : r.check?.matchStatus
    return {
      ...r,
      label: status === 'gap' ? '不符合（存在缺项）' : status === 'matched' ? '符合（资料覆盖）' : '待核实',
      kind: status === 'gap' ? 'gap' : status === 'matched' ? 'matched' : 'unknown',
      reason: r.check?.matchNote || (report.value?.stale ? '稿件已更新，请重新核对' : '尚无当前稿件的核对依据'),
      scoring,
    }
  })
})
const counts = computed(() => ({
  matched: rows.value.filter(r => r.kind === 'matched').length,
  gap: rows.value.filter(r => r.kind === 'gap').length,
  unknown: rows.value.filter(r => r.kind === 'unknown').length,
}))
async function refresh() {
  const request = ++epoch
  busy.value = true
  error.value = ''
  try {
    const value = await inspectTenderQa(props.recordId, { volume: props.volume })
    if (request === epoch) report.value = value
  } catch (e) {
    if (request === epoch) error.value = e instanceof Error ? e.message : '核对失败，请重试'
  } finally { if (request === epoch) busy.value = false }
}
watch(() => [props.recordId, props.file, props.volume], async () => {
  const request = ++epoch
  open.value = false
  report.value = null
  error.value = ''
  busy.value = false
  if (!props.recordId) return
  try {
    const saved = await fetchTenderQa(props.recordId, { volume: props.volume })
    if (request === epoch) report.value = saved.report || null
  } catch { /* An absent saved report remains explicitly unverified. */ }
  if (request === epoch && (!report.value?.scoringReview || report.value.stale || report.value.scoringReview.version !== 'scoring-review/2')) void refresh()
}, { immediate: true })
</script>

<template>
  <section class="shrink-0 rounded-md border border-sky-200 bg-sky-50 text-xs">
    <button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sky-800" :aria-expanded="open" @click="open = !open">
      <span>{{ scoreSummary }} · 招标要求对比（{{ rows.length }} 项 · 符合 {{ counts.matched }} · 不符合 {{ counts.gap }} · 待核实 {{ counts.unknown }}）</span>
      <span>{{ open ? '收起' : '展开' }}</span>
    </button>
    <div v-if="open" class="max-h-72 overflow-auto border-t border-sky-200 px-3 py-2 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <p class="text-muted-foreground">对比当前{{ volume === 'full' ? '综合标' : volume === 'technical' ? '技术标' : '商务标' }}。编辑后请先保存，再重新核对；资料覆盖不代表评分已获分。</p>
        <button type="button" class="shrink-0 rounded border px-2 py-1" :disabled="busy || !recordId" @click="refresh">{{ busy ? '核对中…' : '核对当前标书' }}</button>
      </div>
      <p v-if="busy" class="text-sky-700">正在识别并核对当前稿件；下方如有条款，为之前的识别结果。</p>
      <p v-else-if="scoringStale" class="text-amber-700">评分报告版本或稿件已更新，旧结果不作为当前符合性判断，请重新核对。</p>
      <p v-else-if="!scoring" class="text-amber-700">尚无评分表识别结果，请点击“核对当前标书”；未识别不代表没有评分要求。</p>
      <p v-else-if="!scoring.extractionComplete" class="text-amber-700">部分可读取原文尚未完成评分识别或引用关联，不等于原文件缺页。</p>
      <p v-else-if="!scoring.reviewComplete" class="text-amber-700">评分识别已完成；当前稿件核对或适用范围确认尚未完成。</p>
      <p v-else class="text-muted-foreground">评分识别与核对流程已完成；待核实项目仍需人工判断，不代表已获分。</p>
      <p v-if="scoring?.coverage" class="text-muted-foreground">可读取原文单元：已处理 {{ scoring.coverage.reviewedUnits || 0 }} / {{ scoring.coverage.totalUnits || 0 }}，待处理 {{ scoring.coverage.pendingUnits || 0 }}。覆盖仅限已读取文本，图片和附件是否完整仍需核实。</p>
      <details v-if="pendingUnits.length" class="rounded border bg-background p-2">
        <summary class="cursor-pointer">待识别或待关联的原文单元（{{ pendingUnits.length }}）</summary>
        <p v-for="unit in pendingUnits" :key="unit.id" class="mt-2">{{ unit.section || '未标明章节' }} · {{ unit.sourceLocation }} · {{ unit.reason || '待复核' }}</p>
      </details>
      <p v-for="(warning, index) in scoring?.warnings || []" :key="`warning-${index}`" class="text-amber-700">{{ warning }}</p>
      <article v-for="row in scoreRows" :key="`score-${row.id}`" class="space-y-1 rounded border bg-background p-2">
        <p class="font-medium" :class="row.status === 'nonconforming' ? 'text-red-700' : row.status === 'conforming' ? 'text-green-700' : 'text-amber-700'">{{ row.title }} · {{ scoreLabel[row.status] }}<span v-if="row.maxScore != null"> · 最高 {{ row.maxScore }} 分</span></p>
        <p v-if="row.ruleType" class="text-muted-foreground">规则类型：{{ scoringRuleLabel(row.ruleType) }}</p>
        <p v-if="row.scopeLabels?.length" class="text-muted-foreground">原文适用范围：{{ row.scopeLabels.join('、') }}</p>
        <p v-if="row.applicability === 'unresolved'" class="text-amber-700">适用范围待确认，未与本次标段混合判定。</p>
        <p class="whitespace-pre-wrap">评分要求：{{ row.requirement }}</p>
        <p class="text-muted-foreground">来源：{{ row.sourceLocation }}</p>
        <p class="whitespace-pre-wrap">判断依据：{{ row.reason }}</p>
        <p class="whitespace-pre-wrap">当前标书原文：{{ row.bidEvidence || '尚无可核实的实质证据' }}</p>
        <p v-if="row.bidLocation" class="text-muted-foreground">{{ row.bidLocation }}</p>
      </article>
      <details v-if="scorecard" class="rounded border bg-background p-2">
        <summary class="cursor-pointer font-medium">已有评分点自查记录（供对照，需核实原文与证据）</summary>
        <p class="mt-2 whitespace-pre-wrap">{{ scorecard }}</p>
      </details>
      <p v-if="error" role="alert" class="text-red-700">{{ error }}</p>
      <p v-if="!rows.length">尚未提取到可对比的评分项或要求，请核对招标原文；不代表没有要求或全部符合。</p>
      <article v-for="row in rows" :key="row.id" class="space-y-1 rounded border bg-background p-2">
        <p class="font-medium" :class="row.kind === 'gap' ? 'text-red-700' : row.kind === 'matched' ? 'text-green-700' : 'text-amber-700'">{{ row.scoring ? '评分项' : '招标要求' }} · {{ row.label }}<span v-if="row.scoreWeight != null"> · {{ row.scoreWeight }} 分</span></p>
        <p class="whitespace-pre-wrap">招标原文：{{ row.text }}</p>
        <p class="text-muted-foreground">来源：{{ row.sourceChapter || '未标明章节' }}{{ row.sourcePage ? ` · 第 ${row.sourcePage} 页` : '' }}</p>
        <p class="whitespace-pre-wrap">当前标书核对：{{ row.reason }}</p>
      </article>
      <article v-for="(gap, index) in report?.missing || []" :key="`gap-${index}`" class="rounded border bg-background p-2">
        <p class="font-medium text-amber-700">{{ gap.title }} · {{ gap.severity === 'disqualify' ? '否决风险' : '需核对' }}</p>
        <p class="whitespace-pre-wrap">{{ gap.reason }}</p>
        <p v-if="gap.source" class="text-muted-foreground">依据：{{ gap.source }}</p>
      </article>
    </div>
  </section>
</template>
