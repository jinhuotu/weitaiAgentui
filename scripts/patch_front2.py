import pathlib
p = pathlib.Path("E:/code/python/weitaiAgentui/src/views/TendersView.vue")
t = p.read_text(encoding="utf-8")
old = "      listKnowledgeBases({ access: 'use' }).catch(() => [] as KnowledgeBaseItem[]),"
if old in t and "listPromptOptions().catch" not in t:
    t = t.replace(old, old + "\n      listPromptOptions().catch(() => []),", 1)
old2 = "    kbList.value = bases"
if old2 in t and "promptOptions.value" not in t.split(old2)[1][:400]:
    t = t.replace(old2, "    kbList.value = bases as KnowledgeBaseItem[]\n    promptOptions.value = (loaded[1] as unknown as import('@/lib/prompts-api').PromptOption[]) || []", 1)
p.write_text(t, encoding="utf-8")
print("load wired")

q = pathlib.Path("E:/code/python/weitaiAgentui/src/views/QuotesView.vue")
u = q.read_text(encoding="utf-8")
import re
if re.search(r"\bunmatched\b", u):
    # find declaration line
    m = re.search(r"^.*\bunmatched\b.*$", u, re.M)
    print("QuotesView unmatched line:", (m.group(0)[:160] if m else "?"))
