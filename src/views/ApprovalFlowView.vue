<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PageHeader, Panel } from '@/components/ui-kit'
import AppDialog from '@/components/ui/AppDialog.vue'
import ApprovalSteps from '@/components/tenders/ApprovalSteps.vue'
import TenderDocPreviewDialog from '@/components/tenders/TenderDocPreviewDialog.vue'
import {
  APPROVAL_STEPS,
  formatBudget,
  stepIndex,
  useTenderTasks,
  type TenderTask,
} from '@/lib/tender-tasks'
import { cn } from '@/lib/utils'

type TabKey = 'pending' | 'done' | 'mine'

const router = useRouter()
const {
  pendingApprovals,
  doneApprovals,
  myApprovals,
  loading,
  error,
  load,
  decideApproval,
} = useTenderTasks()

const tab = ref<TabKey>('pending')
const preview = ref<TenderTask | null>(null)
const current = ref<TenderTask | null>(null)
const comment = ref('')
const toast = ref('')

const exampleTask = computed(
  () =>
    pendingApprovals.value[0] ||
    doneApprovals.value[0] ||
    myApprovals.value[0] ||
    null,
)

const exampleIndex = computed(() => {
  const t = exampleTask.value
  if (!t) return 2
  if (t.status === 'approved' || t.status === 'submitted' || t.status === 'won') {
    return APPROVAL_STEPS.length - 1
  }
  return stepIndex(t.currentStep || '总经理审批')
})

const rows = computed(() => {
  if (tab.value === 'pending') return pendingApprovals.value
  if (tab.value === 'done') return doneApprovals.value
  return myApprovals.value
})

const tabTitle = computed(() =>
  tab.value === 'pending' ? '待我审批' : tab.value === 'done' ? '我已审批' : '我发起的',
)

onMounted(() => {
  void load('approval')
})

function openView(task: TenderTask) {
  preview.value = task
}

function openEdit(task: TenderTask) {
  void router.push({ path: '/tenders', query: { record: task.recordId } })
}

function openApprove(task: TenderTask) {
  current.value = task
  comment.value = ''
}

async function decide(passed: boolean) {
  if (!current.value) return
  const task = current.value
  try {
    await decideApproval(task, passed, comment.value)
    toast.value = passed ? `已通过：${task.projectName}` : `已驳回：${task.projectName}`
    current.value = null
  } catch (e) {
    toast.value = e instanceof Error ? e.message : '审批失败'
  }
  window.setTimeout(() => {
    toast.value = ''
  }, 2400)
}

const TASK_STATUS_FALLBACK: Record<string, string> = {
  draft: '草稿',
  processing: '编制中',
  pending: '待审批',
  approved: '审批通过',
  submitted: '已提交',
  won: '已中标',
  lost: '已失败',
}

function resultLabel(task: TenderTask) {
  if (task.approvalResult === 'passed') return { text: '已通过', cls: 'text-patina' }
  if (task.approvalResult === 'rejected') return { text: '已驳回', cls: 'text-iron' }
  return { text: task.currentStep || TASK_STATUS_FALLBACK[task.status] || '—', cls: '' }
}
</script>

<template>
  <PageHeader
    title="审批流程"
    description="处理待审批的投标任务，查看已审批记录与本人发起的申请。"
  />

  <p v-if="error" class="mb-4 text-xs text-iron">{{ error }}</p>
  <p v-if="toast" class="mb-4 text-xs text-patina">{{ toast }}</p>

  <div class="mb-4 flex items-center gap-1 text-xs flex-wrap">
    <button
      type="button"
      class="h-8 px-3 rounded-md border inline-flex items-center gap-1.5"
      :class="
        tab === 'pending'
          ? 'bg-iron/15 border-iron/30 text-iron'
          : 'border-border text-muted-foreground'
      "
      @click="tab = 'pending'"
    >
      待我审批
      <span
        class="inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full text-[10px] bg-sulfur/15 text-sulfur"
      >
        {{ pendingApprovals.length }}
      </span>
    </button>
    <button
      type="button"
      class="h-8 px-3 rounded-md border"
      :class="
        tab === 'done'
          ? 'bg-iron/15 border-iron/30 text-iron'
          : 'border-border text-muted-foreground'
      "
      @click="tab = 'done'"
    >
      我已审批
    </button>
    <button
      type="button"
      class="h-8 px-3 rounded-md border"
      :class="
        tab === 'mine'
          ? 'bg-iron/15 border-iron/30 text-iron'
          : 'border-border text-muted-foreground'
      "
      @click="tab = 'mine'"
    >
      我发起的
    </button>
  </div>

  <Panel
    class="mb-5"
    :title="exampleTask ? `审批流程示例 · ${exampleTask.projectName}` : '审批流程示例'"
  >
    <ApprovalSteps :steps="APPROVAL_STEPS" :current="exampleIndex" />
  </Panel>

  <Panel :title="tabTitle" :subtitle="`共 ${rows.length} 条`" flush>
    <div
      v-if="loading && !rows.length"
      class="py-16 text-center text-xs text-muted-foreground"
    >
      加载审批记录…
    </div>
    <div
      v-else-if="!rows.length"
      class="py-16 text-center text-xs text-muted-foreground"
    >
      当前没有{{ tabTitle }}的记录。
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-xs min-w-[760px]">
        <thead class="text-muted-foreground bg-background/40">
          <tr class="border-b border-border">
            <th class="text-left font-medium px-4 py-2.5 w-14">序号</th>
            <th class="text-left font-medium px-4 py-2.5">项目名称</th>
            <th class="text-left font-medium px-4 py-2.5">招标方</th>
            <th class="text-left font-medium px-4 py-2.5">发起人</th>
            <th class="text-left font-medium px-4 py-2.5">发起时间</th>
            <th class="text-left font-medium px-4 py-2.5">预算金额</th>
            <th class="text-left font-medium px-4 py-2.5">当前环节</th>
            <th class="text-left font-medium px-4 py-2.5">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="(row, idx) in rows" :key="row.id" class="hover:bg-background/40">
            <td class="px-4 py-3 data-num text-muted-foreground">{{ idx + 1 }}</td>
            <td class="px-4 py-3 font-medium max-w-[240px]">
              <div class="truncate" :title="row.projectName">{{ row.projectName }}</div>
            </td>
            <td class="px-4 py-3 text-foreground/80">{{ row.tenderer }}</td>
            <td class="px-4 py-3">{{ row.initiator || row.owner }}</td>
            <td class="px-4 py-3 data-num text-muted-foreground">
              {{ row.initiatedAt || '—' }}
            </td>
            <td class="px-4 py-3 data-num text-molybdenum">
              {{ formatBudget(row.budgetYuan) }}
            </td>
            <td class="px-4 py-3">
              <span :class="cn(resultLabel(row).cls)">{{ resultLabel(row).text }}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <button
                v-if="tab === 'pending'"
                type="button"
                class="text-iron hover:underline"
                @click="openApprove(row)"
              >
                审批
              </button>
              <button
                v-else
                type="button"
                class="text-iron hover:underline"
                @click="tab === 'mine' && row.status === 'processing' ? openEdit(row) : openView(row)"
              >
                {{ tab === 'mine' && row.status === 'processing' ? '编辑' : '查看' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </Panel>

  <TenderDocPreviewDialog :open="Boolean(preview)" :task="preview" @update:open="(v) => !v && (preview = null)" />

  <AppDialog
    :open="Boolean(current)"
    :title="current ? `审批详情 · ${current.projectName}` : '审批详情'"
    wide
    @update:open="(v) => !v && (current = null)"
  >
    <div v-if="current" class="space-y-4">
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <span class="text-muted-foreground">项目名称：</span>
          <span>{{ current.projectName }}</span>
        </div>
        <div>
          <span class="text-muted-foreground">招标方：</span>
          <span>{{ current.tenderer }}</span>
        </div>
        <div>
          <span class="text-muted-foreground">预算金额：</span>
          <span class="data-num text-molybdenum font-semibold">{{
            formatBudget(current.budgetYuan)
          }}</span>
        </div>
        <div>
          <span class="text-muted-foreground">发起人：</span>
          <span>{{ current.initiator || current.owner }}</span>
        </div>
        <div>
          <span class="text-muted-foreground">投标截止：</span>
          <span class="text-sulfur">{{ current.deadline || '—' }}</span>
        </div>
        <div>
          <span class="text-muted-foreground">当前环节：</span>
          <span class="text-iron">{{ current.currentStep || '待审批' }}</span>
        </div>
      </div>
      <div>
        <div class="text-[11px] text-muted-foreground mb-1">审批流程</div>
        <ApprovalSteps
          compact
          :steps="APPROVAL_STEPS"
          :current="stepIndex(current.currentStep || '部门经理审批')"
        />
      </div>
      <label class="block">
        <div class="text-[11px] text-muted-foreground mb-1">审批意见</div>
        <textarea
          v-model="comment"
          rows="3"
          class="w-full px-3 py-2 text-xs rounded-md border border-border bg-background resize-y"
          placeholder="请输入审批意见…"
        />
      </label>
    </div>
    <template #footer>
      <button
        type="button"
        class="h-8 px-3 text-xs rounded-md border border-iron/40 text-iron hover:bg-iron/10"
        @click="decide(false)"
      >
        驳回
      </button>
      <button
        type="button"
        class="kb-btn-primary h-8 px-3 text-xs"
        @click="decide(true)"
      >
        通过
      </button>
    </template>
  </AppDialog>
</template>
