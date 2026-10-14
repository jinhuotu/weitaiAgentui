import pathlib
q = pathlib.Path("E:/code/python/weitaiAgentui/src/views/QuotesView.vue")
u = q.read_text(encoding="utf-8")
old = """const _unmatched = computed(() =>
  lines.value.filter((r) => r.name && !(Number(r.unitPrice) > 0 || Number(r.costPrice) > 0)).length,
)
"""
assert old in u
u = u.replace(old, "", 1)
q.write_text(u, encoding="utf-8")
print("removed dead computed")
