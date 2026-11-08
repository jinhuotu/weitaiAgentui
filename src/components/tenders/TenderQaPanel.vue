<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
import { Tag } from '@/components/ui-kit'
import type { QaGap, QaReport, RequirementCoverage } from '@/lib/tenders-api'
import { scoringRuleLabel } from '@/lib/scoring-labels'

const props = withDefaults(
  defineProps<{
    report: QaReport | null
    loading?: boolean
    error?: string
    compact?: boolean
    page?: boolean
    title?: string
    runLabel?: string
    showRun?: boolean
    recordId?: string
    volume?: string
    reviewingItem?: string
  }>(),
  {
    loading: false,
    error: '',
    compact: false,
    page: false,
    title: 'AI 自检',
    runLabel: '',
    showRun: true,
    recordId: '',
    volume: 'business',
    reviewingItem: '',
  },
)

const emit = defineEmits<{
  run: []
  review: [itemId: string, status: 'confirmed' | 'rectified']
}>()

const COVERAGE_LABEL: Record<string, string> = {
  outline: '组卷目录',
  qualification: '资格材料',
  quote: '报价清单',
  commercial: '商务条款',
  technical: '技术响应',
  format: '排版要求',
}

function severityTone(severity: string): 'sulfur' | 'iron' | 'molybdenum' {
  if (severity === 'disqualify') return 'sulfur'
  if (severity === 'deduct') return 'iron'
  return 'molybdenum'
}

function categoryLabel(category: string) {
  return COVERAGE_LABEL[category] || '其他'
}

const score = computed(() => Math.max(0, Math.min(100, Number(props.report?.similarityScore) || 0)))

const scoreTone = computed(() => {
  const grade = props.report?.grade
  if (grade === 'good') return 'patina'
  if (grade === 'risk') return 'sulfur'
  return 'iron'
})

const coverageRows = computed(() => {
  const coverage = props.report?.coverage || {}
  return Object.entries(COVERAGE_LABEL)
    .map(([key, label]) => {
      const bucket = coverage[key]
      if (!bucket || !bucket.total) return null
      return { key, label, ...bucket }
    })
    .filter((row): row is { key: string; label: string; found: number; total: number; score: number } => Boolean(row))
})

const groupedMissing = computed(() => {
  const groups: { severity: string; label: string; items: QaGap[] }[] = [
    { severity: 'disqualify', label: '🔴 否决投标风险（致命）', items: [] },
    { severity: 'deduct', label: '🟠 中等风险', items: [] },
  ]
  for (const item of props.report?.missing || []) {
    const group = groups.find((g) => g.severity === item.severity)
    if (group) group.items.push(item)
  }
  return groups.filter((g) => g.items.length)
})

const attentionMissing = computed(() =>
  (props.report?.missing || []).filter((item) => item.severity === 'suggest'),
)

const structuredAttention = computed(() => props.report?.attentionItems || [])

const vetoCoverage = computed<RequirementCoverage | null>(() => props.report?.requirementCoverage || null)

const vetoGaps = computed(() =>
  (vetoCoverage.value?.rows || []).filter((row) => row.matchStatus === 'gap'),
)

const attentionRows = computed(() =>
  (vetoCoverage.value?.rows || []).filter((row) => row.matchStatus === 'unbound' || row.matchStatus === 'format'),
)

const scoreRows = computed(() =>
  props.report?.scoringReview?.rows || [],
)

const applicableScoreRows = computed(() => scoreRows.value.filter((row) => row.applicability !== 'unresolved'))

const scoreSummary = computed(() => {
  const rows = applicableScoreRows.value
  return {
    total: rows.length,
    conforming: rows.filter((row) => row.status === 'conforming').length,
    pending: rows.filter((row) => row.status === 'partial' || row.status === 'indeterminate').length,
    risk: rows.filter((row) => row.status === 'nonconforming').length,
    estimated: rows.filter((row) => row.status === 'conforming').reduce((sum, row) => sum + (Number(row.maxScore) || 0), 0),
    maximum: rows.reduce((sum, row) => sum + (Number(row.maxScore) || 0), 0),
  }
})

const userSummary = computed(() => ({
  veto: vetoGaps.value.length,
  score: scoreSummary.value.total,
  scoreRisk: scoreSummary.value.risk,
  attention: attentionRows.value.length + attentionMissing.value.length,
}))

function vetoStatusLabel(status?: string) {
  if (status === 'gap') return '尚未覆盖'
  return '待核实'
}

function scoreStatusLabel(status?: string) {
  if (status === 'conforming') return '已响应'
  if (status === 'partial') return '部分响应'
  if (status === 'nonconforming') return '未满足'
  return '待核实'
}

function scoreStatusTone(status?: string): 'patina' | 'sulfur' | 'iron' {
  if (status === 'conforming') return 'patina'
  if (status === 'nonconforming') return 'sulfur'
  return 'iron'
}

function verificationLabel(status?: string) {
  return {
    found: '已找到',
    not_found: '未找到',
    passed: '已通过',
    failed: '不通过',
    not_verifiable_from_text: '不可自动判定',
    manual_review: '需人工确认',
  }[status || ''] || '需人工确认'
}

const emptyHint = computed(() => {
  if (props.loading) return '正在对照邀请书分析投标文件…'
  if (props.error) return props.error
  return '生成后可对照上传的邀请书做 AI 自检，给出符合度并列出缺失项。'
})

const runText = computed(() => {
  if (props.loading) return '自检中…'
  if (props.runLabel) return props.runLabel
  return props.report ? '重新自检' : '开始自检'
})
</script>

<template>
  <section class="tender-qa" :class="{ 'tender-qa--compact': compact, 'tender-qa--page': page }">
    <div class="tender-qa-head">
      <div class="min-w-0">
        <h3 class="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck class="size-3.5 shrink-0 text-molybdenum" />
          {{ title }}
        </h3>
        <p class="text-[11px] text-muted-foreground mt-0.5">
          {{ report ? report.summary : emptyHint }}
        </p>
      </div>
      <button
        v-if="showRun"
        type="button"
        class="tender-ghost-btn shrink-0"
        :disabled="loading"
        @click="emit('run')"
      >
        <Loader2 v-if="loading" class="size-3.5 animate-spin" />
        {{ runText }}
      </button>
    </div>

    <p v-if="report?.source === 'upload'" class="mt-2 text-[11px] text-muted-foreground">
      上次按上传终稿评分{{ report.uploadName ? `：${report.uploadName}` : '' }}
    </p>
    <p v-else-if="report?.stale" class="mt-2 text-[11px] text-sulfur">
      文档已重新生成，以下为上次自检结果，请再跑一遍。
    </p>

    <div v-if="report" class="mt-3 flex flex-col sm:flex-row gap-3">
      <div class="tender-qa-score shrink-0" :class="`tender-qa-score--${scoreTone}`">
        <div
          class="tender-qa-ring"
          :style="{ background: `conic-gradient(currentColor ${score * 3.6}deg, color-mix(in srgb, currentColor 16%, transparent) 0)` }"
        >
          <span class="tender-qa-ring-inner">
            <span class="tender-qa-ring-value">
              <span class="tender-qa-ring-num">{{ score }}</span>
              <span class="tender-qa-ring-unit">%</span>
            </span>
          </span>
        </div>
        <div class="min-w-0">
          <div class="text-[12px] font-medium">与邀请书符合度</div>
          <div class="text-[11px] text-muted-foreground mt-0.5">{{ report.gradeLabel }}</div>
          <div class="text-[10px] text-muted-foreground mt-0.5">
            {{ report.hasInvitation ? '已对照邀请书原文' : '未保存邀请书原文，仅按大纲/表单核对' }}
            <span v-if="report.llmUsed"> · 含模型分析</span>
          </div>
        </div>
      </div>

      <ul v-if="coverageRows.length && !compact" class="flex-1 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] content-start">
        <li v-for="row in coverageRows" :key="row.key" class="flex items-center justify-between gap-2">
          <span class="text-muted-foreground">{{ row.label }}</span>
          <span class="font-sans">{{ row.found }}/{{ row.total }}</span>
        </li>
      </ul>
    </div>

    <div v-if="vetoCoverage" class="mt-3 text-[11px] leading-relaxed">
      <div class="font-medium text-foreground">
        否决项覆盖 {{ vetoCoverage.mandatoryCovered }}/{{ vetoCoverage.mandatoryTotal }}
      </div>
      <p class="text-muted-foreground mt-0.5">
          只统计当前这一卷。商务偏离不看技术偏离表，技术偏离不看商务偏离表。只认资料文件、已勾选业绩、本卷偏离表里已填的行。稿里出现招标原句不算覆盖。红线未开启，不拦下载和提交。
      </p>
    </div>

    <div v-if="report" class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
      <div class="rounded border border-red-500/25 bg-red-500/5 px-2.5 py-2">
        <div class="text-muted-foreground">否决风险</div>
        <div class="mt-0.5 text-[15px] font-semibold text-red-600">{{ userSummary.veto }}</div>
      </div>
      <div class="rounded border border-border px-2.5 py-2">
        <div class="text-muted-foreground">评分项</div>
        <div class="mt-0.5 text-[15px] font-semibold">{{ userSummary.score }}</div>
      </div>
      <div class="rounded border border-orange-500/25 bg-orange-500/5 px-2.5 py-2">
        <div class="text-muted-foreground">评分待处理</div>
        <div class="mt-0.5 text-[15px] font-semibold text-orange-600">{{ userSummary.scoreRisk + scoreSummary.pending }}</div>
      </div>
      <div class="rounded border border-border px-2.5 py-2">
        <div class="text-muted-foreground">预计得分</div>
        <div class="mt-0.5 text-[15px] font-semibold">
          {{ scoreSummary.estimated }}<span class="text-[11px] font-normal text-muted-foreground"> / {{ scoreSummary.maximum }}</span>
        </div>
      </div>
    </div>

    <div v-if="vetoGaps.length" class="mt-2 space-y-1.5 text-[11px] leading-snug">
      <div class="mb-1 font-medium text-foreground">需要优先处理的否决风险（{{ vetoGaps.length }}）</div>
      <ul class="space-y-1.5">
      <li v-for="row in vetoGaps" :key="'veto-' + row.id">
        <span class="font-medium text-foreground">{{ vetoStatusLabel(row.matchStatus) }}</span>
        <span class="text-muted-foreground"> {{ row.text }}</span>
        <span v-if="row.matchNote" class="block text-muted-foreground">{{ row.matchNote }}</span>
      </li>
      </ul>
    </div>

    <div v-if="scoreRows.length" class="mt-3 text-[11px] leading-snug">
      <div class="mb-1 flex items-center justify-between gap-2">
        <span class="font-medium text-foreground">招标文件评分项（{{ scoreRows.length }}）</span>
        <span v-if="report?.scoringReview?.coverage?.scoringUnits" class="text-muted-foreground">
          已识别 {{ report.scoringReview.coverage.scoringUnits }} 项
        </span>
      </div>
      <ul class="space-y-1.5">
        <li v-for="row in scoreRows" :key="'score-' + row.id" class="rounded border border-border/70 px-2 py-1.5">
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium text-foreground">{{ row.title || row.requirement }}</span>
            <Tag :tone="scoreStatusTone(row.status)">
              {{ scoreStatusLabel(row.status) }}<template v-if="row.maxScore != null"> · {{ row.maxScore }}分</template>
            </Tag>
          </div>
          <div v-if="row.ruleType" class="mt-0.5 text-muted-foreground">规则类型：{{ scoringRuleLabel(row.ruleType) }}</div>
          <div v-if="row.scopeLabels?.length" class="mt-0.5 text-muted-foreground">原文适用范围：{{ row.scopeLabels.join('、') }}</div>
          <div v-if="row.applicability === 'unresolved'" class="mt-0.5 text-amber-700">适用范围待确认，未与本次标段混合判定。</div>
          <div class="mt-0.5 text-muted-foreground">{{ row.requirement }}</div>
          <div v-if="row.reason" class="mt-0.5 text-muted-foreground">{{ row.reason }}</div>
          <div class="mt-0.5 text-muted-foreground">当前标书原文：{{ row.bidEvidence || '尚无可核实的实质证据' }}</div>
          <div v-if="row.sourceLocation || row.bidLocation" class="mt-0.5 text-muted-foreground">
            招标文件位置：{{ row.sourceLocation || '未标注' }}<template v-if="row.bidLocation"> · 响应位置：{{ row.bidLocation }}</template>
          </div>
        </li>
      </ul>
    </div>

    <details v-if="structuredAttention.length || attentionRows.length" class="mt-3 text-[11px] leading-snug">
      <summary class="cursor-pointer font-medium text-muted-foreground">
        容易忽略的规则（{{ structuredAttention.length + attentionRows.length }}）
      </summary>
      <ul class="mt-1.5 space-y-1.5">
        <li v-for="item in structuredAttention" :key="item.id">
          <span class="font-medium text-foreground">{{ item.title }}</span>
          <Tag class="ml-1 align-middle" :tone="item.severity === 'high' ? 'sulfur' : 'iron'">{{ verificationLabel(item.verificationStatus) }}</Tag>
          <span class="block text-muted-foreground">{{ item.requirement }}</span>
          <span class="block text-muted-foreground">
            {{ item.sourceFile || '招标文件原文' }}
            <template v-if="item.sourceChapter"> · {{ item.sourceChapter }}</template>
            <template v-if="item.sourcePage"> · 第 {{ item.sourcePage }} 页</template>
            <template v-else> · 原文第 {{ item.sourceLine }} 行</template>
            · 请核对投标文件及提交介质
          </span>
          <span v-if="item.verificationNote" class="block text-muted-foreground">
            自动核验：{{ item.verificationNote }}
          </span>
          <div v-if="recordId" class="mt-1 flex gap-1">
            <button type="button" class="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50" :disabled="reviewingItem === item.id" @click="emit('review', item.id, 'confirmed')">确认</button>
            <button type="button" class="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50" :disabled="reviewingItem === item.id" @click="emit('review', item.id, 'rectified')">整改完成</button>
            <span v-if="item.review?.status" class="self-center text-[10px] text-muted-foreground">{{ item.review.status }}</span>
          </div>
        </li>
        <li v-for="row in attentionRows" :key="'attention-' + row.id">
          <span class="font-medium text-foreground">待人工确认</span>
          <span class="text-muted-foreground"> {{ row.text }}</span>
          <span v-if="row.matchNote" class="block text-muted-foreground">{{ row.matchNote }}</span>
        </li>
      </ul>
    </details>

    <details v-if="attentionMissing.length" class="mt-3 text-[11px] leading-snug">
      <summary class="cursor-pointer font-medium text-muted-foreground">
        其他格式与提交提醒（{{ attentionMissing.length }}）
      </summary>
      <ul class="mt-1.5 space-y-1.5">
        <li v-for="(item, i) in attentionMissing" :key="`attention-missing-${i}`" class="text-muted-foreground">
          <span class="font-medium text-foreground">{{ item.title }}</span>
          <span v-if="item.reason">：{{ item.reason }}</span>
        </li>
      </ul>
    </details>

    <div
      v-if="groupedMissing.length"
      class="mt-3 space-y-2"
      :class="{ 'tender-qa-missing': page }"
    >
      <div v-for="group in groupedMissing" :key="group.severity">
        <div class="text-[11px] font-medium text-foreground/80 mb-1">{{ group.label }}（{{ group.items.length }}）</div>
        <ul class="space-y-1">
          <li
            v-for="(item, i) in group.items"
            :key="`${item.title}-${i}`"
            class="flex gap-2 text-[11px] leading-snug"
          >
            <TriangleAlert class="size-3.5 shrink-0 mt-0.5 text-sulfur" />
            <span class="min-w-0">
              <span class="font-medium text-foreground">{{ item.title }}</span>
              <Tag class="ml-1 align-middle" :tone="severityTone(item.severity)">
                {{ categoryLabel(item.category) }}
              </Tag>
              <span class="block text-muted-foreground mt-0.5">{{ item.reason }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
    <div v-if="report?.letterChecklist?.length" class="mt-3">
      <div class="text-[11px] font-medium text-foreground/80 mb-1">自检核对清单</div>
      <ul class="space-y-1 text-[11px] leading-snug text-muted-foreground">
        <li v-for="(line, i) in report.letterChecklist" :key="'ck-' + i">{{ line }}</li>
      </ul>
    </div>
    <p v-else-if="report && !loading" class="mt-3 text-[11px] text-patina">
      未列出缺失项。下载前仍建议人工核对签章、保证金和原件扫描件。
    </p>
  </section>
</template>

<style scoped>
.tender-qa {
  border-radius: 0.75rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: var(--bg-elevated, hsl(var(--card)));
  padding: 0.85rem 1rem;
}
.tender-qa--page {
  padding: 1rem 1.15rem 1.1rem;
}
.tender-qa-missing {
  max-height: min(52vh, 28rem);
  overflow-y: auto;
  padding-right: 0.35rem;
}
.tender-qa-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.tender-qa-score {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--accent-iron, hsl(var(--primary)));
}
.tender-qa-score--patina {
  color: var(--accent-patina, #3d8b7a);
}
.tender-qa-score--sulfur {
  color: var(--accent-sulfur, #d97706);
}
.tender-qa-ring {
  width: 3.75rem;
  height: 3.75rem;
  border-radius: 9999px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.tender-qa-ring-inner {
  width: 2.85rem;
  height: 2.85rem;
  border-radius: 9999px;
  background: var(--bg-elevated, hsl(var(--card)));
  display: grid;
  place-items: center;
}
.tender-qa-ring-value {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  color: inherit;
}
.tender-qa-ring-num {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1;
}
.tender-qa-ring-unit {
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  margin-left: 1px;
  opacity: 0.72;
}
.tender-ghost-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: 2rem;
  padding: 0 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid var(--hairline, hsl(var(--border)));
  background: transparent;
  font-size: 12px;
  color: var(--foreground, hsl(var(--foreground)));
}
.tender-ghost-btn:disabled {
  opacity: 0.6;
}
</style>
