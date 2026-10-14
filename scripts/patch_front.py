import pathlib, re
p = pathlib.Path("E:/code/python/weitaiAgentui/src/views/TendersView.vue")
t = p.read_text(encoding="utf-8")

# 1. import prompt options API
if "listPromptOptions" not in t:
    t = t.replace(
        "import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'",
        "import { listKnowledgeBases, type KnowledgeBaseItem } from '@/lib/knowledge-api'\nimport { listPromptOptions, type PromptOption } from '@/lib/prompts-api'",
        1,
    )

# 2. state: prompt template + material toggle
if "promptOptions" not in t:
    t = t.replace(
        "const selectedKbIds = ref<string[]>([])",
        "const selectedKbIds = ref<string[]>([])\nconst promptOptions = ref<PromptOption[]>([])\nconst selectedPromptId = ref<string>('')\nconst useLatestMaterials = ref(true)",
        1,
    )

# 3. load prompt options on mount: find kb load block
m = re.search(r"(kbList\.value\s*=\s*await listKnowledgeBases[^\n]*\n)", t)
if m and "listPromptOptions()" not in t:
    t = t.replace(m.group(1), m.group(1) + "  try { promptOptions.value = await listPromptOptions() } catch { promptOptions.value = [] }\n", 1)

# 4. draft call: include promptId
if "{ kbIds: selectedKbIds.value, itemId }" in t:
    t = t.replace(
        "{ kbIds: selectedKbIds.value, itemId }",
        "{ kbIds: selectedKbIds.value, itemId, promptId: selectedPromptId.value || undefined }",
    )

# 5. UI: prompt dropdown above kb block
anchor = "可选知识库（默认不选）"
if anchor in t and "投标模板" not in t:
    dropdown = '''<div class="mb-3 flex flex-wrap items-center gap-2">
            <label class="text-[11px] text-muted-foreground">投标模板</label>
            <select v-model="selectedPromptId" class="h-7 rounded-md border border-border bg-background px-2 text-[11px]">
              <option value="">通用（不指定）</option>
              <option v-for="o in promptOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
            <label class="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <input v-model="useLatestMaterials" type="checkbox" class="size-3.5" /> 自动带入资料库最新件
            </label>
            <span class="text-[11px] text-muted-foreground">优先级：邀请书 &gt; 本次输入 &gt; 资料库最新 &gt; 模板 &gt; 历史写法</span>
          </div>
          <p class="text-[11px] text-muted-foreground mb-2">'''
    t = t.replace('<p class="text-[11px] text-muted-foreground mb-2">\n            可选知识库', dropdown + "\n            历史标书参考（只学写法，不抄数据）。" , 1)
    # fix leftover original sentence continuation
    t = t.replace("历史标书参考（只学写法，不抄数据）。（默认不选）。识别时对照资格材料种类；本标缺格式章时可用库里的目录/表头作建议，不套用历史报价和函件正文。",
                  "历史标书参考（只学写法，不抄数据，默认推荐同行业1-2份）。", 1)

p.write_text(t, encoding="utf-8")
print("TendersView patched")
