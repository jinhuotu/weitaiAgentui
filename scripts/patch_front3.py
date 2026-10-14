import pathlib, re
p = pathlib.Path("E:/code/python/weitaiAgentui/src/views/TendersView.vue")
t = p.read_text(encoding="utf-8")
t = t.replace(
    "const [data, bases, library] = await Promise.all([",
    "const [data, bases, prompts, library] = await Promise.all([",
    1,
)
t = t.replace(
    "    kbList.value = bases as KnowledgeBaseItem[]\n    promptOptions.value = (loaded[1] as unknown as import('@/lib/prompts-api').PromptOption[]) || []",
    "    kbList.value = bases as KnowledgeBaseItem[]\n    promptOptions.value = (prompts as import('@/lib/prompts-api').PromptOption[]) || []",
    1,
)
p.write_text(t, encoding="utf-8")

q = pathlib.Path("E:/code/python/weitaiAgentui/src/views/QuotesView.vue")
u = q.read_text(encoding="utf-8")
u2, n = re.subn(r"const unmatched = computed\(", "const _unmatched = computed(", u, count=1)
if n:
    q.write_text(u2, encoding="utf-8")
    print("QuotesView unused fixed, TendersView fixed")
else:
    print("no QuotesView change")
