# 伟泰智能体系统 · 操作手册（前后端）

> 后端 `weitaiAgent`（FastAPI `:8100`）+ 前端 `weitaiAgentui`（Vue3+Vite `:5173`）
> 接口统一 `{code,msg,data}`，成功 `code===0`；JSON 字段 camelCase；除登录/刷新/健康外需 `Authorization: Bearer <access>`。

---

## 1. 系统概览与角色分工

| 端 | 技术 | 端口 | 职责 |
|---|---|---|---|
| 后端 | FastAPI + MySQL(13306) + Redis(26379) + Qdrant(16333/16334) + Whisper(19000) + OnlyOffice(8082可选) | 8100 | 登录/JWT、模型/提示词/MCP/智能体/工作流、知识库RAG、投标/报价/布局、审计 |
| 前端 | Vue3 + Vite + Pinia + VueRouter + Tailwind | 5173 | 登录、总览、AI问答、工作任务、投标、报价中心、知识库、资料库、系统管理 |

前端路由（`src/router/index.ts` + `src/config/nav.ts`）：`/`总览、`/ai-chat`、`/work-tasks`本人任务、`/tender-tasks`全部任务、`/approval`审批、`/knowledge`+`/knowledge/:baseId`、`/tenders`标书生成、`/tender-qa`标书评分、`/quotes|/quotes-cost|/quotes-budget`报价中心（同一 `QuotesView.vue` 三 Tab）、`/tender-library`资料库、`/scene-agents|/workflows|/model-manage|/prompt-manage|/mcp-manage`（adminOnly）、`/users|/logs`（adminOnly）、`/settings`。

后端路由（`apps/api/app.py`，前缀 `/api/v1`）：`health`、auth、users、roles、audit、models、prompts、mcp-servers、agents、knowledge、layouts、tenders、quotes、workflows、ai。

权限：admin 全量；普通用户按角色菜单白名单过滤（`canAccessPath/filterNavGroups`），无菜单仅见 `/`。

## 2. 环境准备与启动

需 Python3.12 + Poetry + Docker + Node18+。

```powershell
# 后端
copy .env.example .env   # 按本机改 CORS/JWT/DB/Redis/Qdrant/ASR/OCR
docker compose -f infra/docker-compose.yml up -d mysql redis qdrant whisper
poetry install
poetry run python -m alembic upgrade head  # 当前 head 0013_quote_records
poetry run python scripts/seed_admin.py     # admin / Admin@123456
poetry run python scripts/seed_mcp_utility.py  # 可选
poetry run python scripts/seed_agents.py       # 可选
poetry run weitai-dev                    # API :8100，Windows无--reload，改代码需重启
poetry run weitai-chat-worker            # 对话Stream归档，按需另开终端

# 前端
cd ../weitaiAgentui
npm install
# .env.development: VITE_API_BASE=http://127.0.0.1:8100/api/v1
npm run dev      # :5173，经代理访问API
npm run build    # vue-tsc -b && vite build
```

OpenAPI: `http://127.0.0.1:8100/docs`。健康检查 `GET /health`（免鉴权）。

## 3. 首次使用（管理员必做）

1. 用 `admin/Admin@123456` 登录 → 修改密码（设置）。
2. `模型管理`：启用 LLM（快速对话；要看图再配 `multimodal_vision`）+ 启用 Embedding 并勾选用于知识库。
3. `提示词管理`：确认基座提示词已 seed（`ensure_seed_prompt`）。
4. `工具管理(MCP)`：接入 stdio/SSE/HTTP，点健康探测。
5. `场景智能体`：绑定提示词+知识库+MCP。
6. `用户与权限`：建用户→建角色→勾选可访问菜单（`assignableNavGroups`，adminOnly不可分配）→给用户绑角色。
7. `系统设置`：主题、Qdrant量化应用、日志保留（`LOG_RETENTION_DAYS/AUDIT_LOG_RETENTION_DAYS`）。

## 4. 日常操作分册

### 4.1 登录/总览/设置
- `/login` 支持 `?next=` 回跳；401 自动回登录；adminOnly 路由非admin进会被踢回 `/`。
- 总览：工作台运行状态快捷入口（`PRIMARY_NAV_HREFS` 顺序可拖拽，存 `nav-order`）。
- 设置：主题/Accent、环境与系统信息。

### 4.2 AI智能问答（`/ai-chat`）
操作：新建会话→选模型(`modelId`)+提示词(`promptId`)+智能体(`agentId`可选)+勾选知识库(`knowledgeBaseIds`，仅在所选库内检索不跨库)→发消息（支持图片）→SSE接收 `delta/tool/refs`→查看引用/工具调用/原件缩略图。
链路：`RPUSH chat:session:{id}` + `XADD agent:chat:stream` → worker幂写入MySQL → 历史=MySQL全量+Redis尾部去重 → Redis miss从MySQL冷启动近15轮；`lock:chat:session:{id}` 防并发，停止强制删锁。限流30次/60s，超25轮裁剪留10轮。

### 4.3 知识库（`/knowledge`）
- 建库→`POST /knowledge/documents/upload` multipart上传（PDF/Word/Excel/PPT/文本本地抽取；扫描件/图片按 `OCR_PROVIDER=aliyun|rapidocr|none`）→状态 `parsing`→后台切块600/重叠150→Embedding(batch8)→Qdrant(`weitai_knowledge`)→可检索。正文旁路 `storage/knowledge/{baseId}/{docId}.txt`，失败点 `reparse`；同库哈希去重；启动回收卡住任务。
- 检索：TopK5、候选×4、关键词权重0.4，最低分0。
- 视频一期仅ASR：mp4/webm→ffmpeg抽音轨→`ASR_API_BASE(19000)/v1/audio/transcriptions`→切块向量化；无有效语音则失败（“未识别到有效语音”）不入库；问答必须勾选该视频所在库。
- 审核/ACL：审核队列通过后入库；资料库按ACL控制。

### 4.4 AI标书生成（`/tenders`）
流程：上传邀请书→识别（分类/槽位/金额/表格/业绩要求）→生成大纲→QA校验→组装商务·技术分卷→预览（默认 `TENDER_DOC_PREVIEW=browser` 用 docx-preview；`onlyoffice/yozo` 需配服务）→导出Word/PDF→提交审批→归档资料库。
要点：`TENDER_PREVIEW_CONVERTER=auto/wps/word/soffice/off`；技术标走 `tech_draft`；表格走 `tables`；占位符/承诺函/报价联动模块自动填充。

### 4.5 AI标书评分（`/tender-qa`）
对照邀请书给生成稿/终稿打分：选任务+文档→运行评分→看扣分项→回标书页整改→重评。

### 4.6 AI报价中心（`/quotes` 家族）
`/quotes`报价、`/quotes-cost`造价、`/quotes-budget`预算共用 `QuotesView`，侧栏只挂 `/quotes`，子路径深链保留。流程：上传规划图→视觉识别→匹配价目知识库→成本测算→组装Excel→锁定（`0015_quote_lock`）→写 `quote_records`→导出/送审。

### 4.7 投标资料库（`/tender-library`）/ 工作任务 / 审批
- 资料库：企业常备资料+扫描件，按角色ACL展示，可附原件缩略图给多模态模型。
- 工作任务：本人投标任务跟进；全部投标任务：全量筛选导出（`AllTenderTasksView`）。
- 审批：待审/已审/我发起；通过后标书/报价可归档。

### 4.8 管理端（adminOnly）
场景智能体/工作流（含knowledge/llm/agent/mcp/vision/layout节点，VueFlow编辑 `workflows/:id`）/模型/提示词/工具/用户角色/日志。操作日志中间件顺序 CORS→OperationLog→JWT，保证401也带CORS头并记审计；启动滚动清理过期日志。

## 5. 常见问题

| 现象 | 原因/处理 |
|---|---|
| 改后端代码新接口404 | Windows关了reload，重启 `weitai-dev` |
| `from api.xxx` 报未解析 | 配 `apps,packages` 为Sources/pyright extraPaths，选`.venv`解释器 |
| 对话无检索 | 未勾选对应知识库；视频问答只勾资料库搜不到别库 |
| 上传一直parsing | 看Qdrant/Embedding/Whisper/OCR是否启动；超 `KB_PARSE_TIMEOUT_SECONDS(7200)` 重试 |
| 视频“未识别到有效语音” | 静音/无音轨/无人声，属正常失败；换更大Whisper模型或改稿重入库（改稿入口未做） |
| 仍要求API Key | 运行时不读`.env` LLM Key，去模型管理填；局域网可填 `sk-local` 后重启 |
| 前端chunk加载失败白屏 | 路由已自动reload一次；仍失败清缓存重 `npm run dev` |
| 422 Validation | 看`msg`定位字段；多为必填/长度问题 |

## 6. 配置速查（`.env`）

`APP_NAME/DEBUG/API_PREFIX/API_HOST/PORT(8100)`；`DATABASE_URL(13306)/REDIS_URL(26379)/QDRANT_URL(16333)`；`JWT_*`生产必换；`STORAGE_ROOT/KB_*`；`ASR_*(19000)/OCR_PROVIDER(none|aliyun|rapidocr)`；`KB_CHUNK(600/150)/KB_SEARCH_*`；`EMBEDDING_*`；`TENDER_DOC_PREVIEW(browser|onlyoffice|yozo)/TENDER_PREVIEW_CONVERTER`；`CORS_ORIGINS`生产收紧；`LOG_RETENTION_DAYS`。

## 7. 测试与运维

```powershell
poetry run pytest -q
docker compose -f infra/docker-compose.yml ps
poetry run python -m alembic upgrade head
```
日志：`logs/`按天；审计保留天数到系统设置改；密钥/上传原件勿提交。
