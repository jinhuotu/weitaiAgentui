# 优祺智能（weitaiAgentui）· 界面操作手册

> 适用：前端 `E:/code/python/weitaiAgentui`（Vue3+Vite），配套后端 `:8100`。
> 登录后进入 `AppShell`：左侧侧栏 + 顶部标签页 + 主内容区。标题格式 `xxx · 优祺智能`。

---

## 0. 通用操作（所有页面适用）

- 登录：`/login`，支持 `?next=` 回跳。未登录访问业务页自动跳登录；已登录访问 `/login` 自动回 `/`。
- 侧栏：分 `工作台 / AI智控 / 运营` 三组；业务入口默认顺序 `AI问答→工作任务→全部投标任务→审批→标书生成→标书评分→报价中心→知识库→资料库`，可在总览拖拽排序（存 `nav-order`）。
- 普通用户只看到角色菜单白名单内的入口；`场景智能体/工作流/模型/提示词/工具/用户与权限/日志` 为 adminOnly，普通账号看不到、直接访问会被踢回 `/`。
- 顶部标签页：切换页面自动 `ensureTab`；报价三子路径统一显示 `AI报价中心`。
- 弹窗/提示：删除、清空等危险操作均有二次确认；右下 Toast 显示成功/失败原因（含 401、422、限流）。
- 附件上限、时间显示（`fmtAgo`）、分页、筛选、导出按钮位置各页一致。

---

## 1. 总览 `/`（OverviewView）

看到：运行状态卡片 + 业务快捷入口 + 更多入口。
操作：
1. 查看平台/模型/知识库状态，异常点快捷跳转。
2. 点快捷卡进入对应模块；拖拽调整 `PRIMARY_NAV_HREFS` 顺序。

## 2. AI智能问答 `/ai-chat`（AiChatView）

布局：左=会话列表（新建/重命名/删除/搜索），中=消息流（Markdown+图片画廊+引用+工具调用），上=模型/提示词/智能体/知识库/模式选择，右（可选）=关联问题/原件缩略图/视频跳转。
操作：
1. 点 `+` 新建会话（自动 `createChatSession`）。
2. 顶部选模型（LLM快速/深度，含 `modelTypeLabel`）、提示词（`promptId`）、智能体（可覆盖mode/知识库/工具）、勾选知识库（**只在所选库内检索**，视频提问必须勾其所在库）。
3. 输入框发消息，可 `ImagePlus` 上传图片（多模态需启用 `multimodal_vision`），回车发送，`停止` 可中断并强制删锁。
4. 看流式 `delta`、工具 `tool`、引用 `refs`、资料库原件图 `ChatKbOriginals`、视频片段 `ChatKbVideos`（点时间跳转）。
5. 会话管理：重命名（或 AI 总结标题）、删除、清空；限流 30次/60s，超25轮自动裁剪留10轮。

## 3. 工作任务 `/work-tasks` + 全部投标任务 `/tender-tasks`

- 本人任务：看分派给我的投标任务、状态跟进、点入标书页继续。
- 全部任务（`AllTenderTasksView`）：全量筛选（状态/时间/关键字）+ 导出。

## 4. 审批流程 `/approval`（ApprovalFlowView）

三 Tab：待审 / 已审 / 我发起。点行看标书/报价快照 → 通过/驳回（填意见）→ 通过后可归档。

## 5. 知识库 `/knowledge` + `/knowledge/:baseId`

列表（`KnowledgeListView`）：卡片按名称配色+图标，筛选 `view` 权限，`+` 新建（需 `canCreate`）、改名、删库、ACL 授权（`KbAclDialog`）。
详情（`KnowledgeDetailView`）：
1. `上传文档`：PDF/Word/Excel/PPT/文本直接传；扫描件走 OCR（aliyun/rapidocr）。传完显示 `parsing`，后台切块600/重叠150 → Embedding → Qdrant，成功后可检索。
2. 传视频：仅 mp4/webm，依赖 Whisper `:19000`；无有效语音会失败（“未识别到有效语音”），不入库。
3. 文档行操作：预览、看旁路正文（`storage/knowledge/{baseId}/{docId}.txt`）、`reparse` 重解析、删除；同库哈希去重。
4. 检索测试：输入问句看 TopK5命中，调 TopK/权重（默认 TopK5、候选×4、关键词0.4）。

## 6. AI标书生成 `/tenders`（TendersView）

布局：上=步骤条（上传→识别→大纲→QA→组装→预览→送审），左=槽位附件（邀请书/业绩/资质/报价表等 `uploadTenderSlot/clearTenderSlot`），中=大纲/章节编辑（`TenderDocEditor`，支持 `volumeDocx` 分卷），右=QA 报告（`TenderQaPanel`）+ 记录历史。
操作：
1. `上传邀请书` → `parseTenderInvitation` 自动识别分类/槽位/金额/表格/业绩要求。
2. 检查 `BidBrief` 简报 + `fetchTenderSlots` 槽位，按缺失补传附件；业绩行可用 `matchPerformanceLine` 联想。
3. `生成大纲` 后可增删改 `OutlineItem`；`draftTenderTech` 起草技术标。
4. `generateTender` 组装商务·技术分卷；`inspectTenderQa/fetchTenderQa` 看扣分并整改。
5. 预览：默认浏览器只读（`docx-preview`）；切 OnlyOffice/Yozo 需管理员配服务。
6. `下载Word/PDF`（`downloadTenderFile`）、`regenerateTenderRecord` 重生成、`恢复模板/上传模板`（第五章模板）、`送审` 进审批、`归档` 进资料库。`isTenderWorkflowLocked` 锁定时不可改。

## 7. AI标书评分 `/tender-qa`（TenderQaView）

操作：选任务+文档（生成稿/终稿）→ 运行评分 → 看总分+扣分明细 → 回标书页整改 → 重评。

## 8. AI报价中心 `/quotes|/quotes-cost|/quotes-budget`（QuotesView）

顶部三 Tab：造价 / 报价 / 预算（路由不同，组件同一，`purposeFromPath/PURPOSE_META`）。普通用户在 `quote` 下隐藏成本明细（仅admin见 `seeCost`）。
操作：
1. 填项目名/地点/工期/限价/竞争策略/目标利润/费率（`defaultRates`）。
2. 选价目知识库（`KB_STORE` 记住选择）→ 上传规划图（最多20张，`recognizeQuote` 视觉识别）。
3. 点 `生成/成本测算`：`fetchCatalogCandidates` 匹配价目 → `costQuote` 测算 → `generateQuote` 组装行（`QuoteLine/lineAmount`）。
4. `verifyQuote` 校验看 `QuoteVerifyReport`；`parseBoqQuote` 解析清单；`exportQuoteRecord/downloadQuoteFile` 导出 Excel。
5. `lockQuoteRecord` 锁定 → 送审；历史在 `fetchQuoteRecords/fetchQuoteRecord`，可删除/清空（二次确认）。

## 9. 投标资料库 `/tender-library`（TenderLibraryView）

企业常备资料：证照/业绩/资质/扫描件，按角色 ACL 展示。操作：上传→分类→预览→在标书页 `fetchTenderLibrary` 引用；原件缩略图可供多模态模型看图。

## 10. 场景智能体 `/scene-agents`（admin）

列表+新建/编辑：填名称/描述 → 绑提示词 → 勾知识库 → 勾 MCP 工具 → 保存；问答页可选中试用。

## 11. 工作流 `/workflows` + `/workflows/:id`（admin）

列表：新建/改名/删除/试运行（`runWorkflowTrial`）。编辑器（VueFlow）：拖 knowledge/llm/agent/mcp/vision/layout 节点 → 连线 → 配参 → 保存 → 试运行看输出。

## 12. 模型管理 `/model-manage`（admin）

三类：LLM（快速对话）/ 深度 / Embedding + `multimodal_vision`。操作：新增（OpenAI兼容 baseUrl/key/模型名）→ 启用/禁用 → 勾“用于知识库” → 问答页即时可选（`listModelOptions`）。局域网可填 `sk-local`。

## 13. 提示词管理 `/prompt-manage`（admin）

基座人设与作答规则（含未命中话术）。操作：新增/编辑/启用 → 问答页 `promptId` 下拉即用（`listPromptOptions`）。

## 14. 工具管理 `/mcp-manage`（admin）

接入 stdio/SSE/HTTP 的 MCP 服务：填名/地址/参数 → 保存 → 点健康探测 → 智能体/工作流中勾选使用。

## 15. 用户与权限 `/users`（admin，UsersView）

用户 Tab：新建账号/重置密码/禁用；角色 Tab：新建角色 → 在可分配菜单（`assignableNavGroups`，已剔除 adminOnly）中勾选 → 给用户绑角色 → 普通用户刷新即生效。

## 16. 操作与登录日志 `/logs`（admin，AuditLogsView）

筛选时间/用户/模块/结果 → 查看明细 → 导出；保留天数在设置中改，启动滚动清理。

## 17. 系统设置 `/settings`（SettingsView）

主题/Accent、环境与系统信息、Qdrant量化应用、日志保留。改完即时生效。

---

## 附：新手 10 分钟走通

1. admin登录 → 模型管理启用 LLM+Embedding → 提示词确认 → 建知识库并传1份Word等解析完成。
2. AI问答勾该库提问，验证引用。
3. 标书页传一份邀请书走完全流程；报价页传一张图走完全流程。
4. 建普通用户+角色（只勾问答/知识库），开无痕验证权限。
