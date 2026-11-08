export const SCORING_RULE_LABELS: Record<string, string> = {
  fixed: '固定得分', tiered: '阶梯得分', range: '区间评价', deduction: '扣分',
  subjective: '主观评价', relative_price: '相对价格公式', weight: '权重', unknown: '类型待确认',
}

export function scoringRuleLabel(ruleType?: string | null): string {
  if (!ruleType) return ''
  return SCORING_RULE_LABELS[ruleType] || ruleType
}
