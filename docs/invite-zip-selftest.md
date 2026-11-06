# 邀请书 ZIP 选择器自测（2026-11-04）

实现：InviteZipPicker.vue 负责弹窗、选择与事件；invite-zip.ts 负责目录检查与分块读取；jszip-browser.d.ts 提供浏览器专用类型。TendersView.vue 相对本轮开始仅增加 import、一个标签、一个处理函数。未修改后端、解析接口或生成链路。

依赖：新增并固定 JSZip 3.10.1，一个直接依赖。官方 minified 浏览器包 97,630 字节，gzip 28,535 字节；这是依赖文件的测量值，不是最终站点净增量。选择原因是支持懒读取、GBK 文件名解码回调与可暂停的分块解压。不加载 CRC 全包校验；仅对按需读出的文件进行增量 CRC 校验。浏览器 TextDecoder 负责 GBK，无额外编码依赖。

复跑命令：
- node tests/invite-zip.test.cjs（18 项断言）
- node tests/invite-zip-component.test.cjs（真实 Vue setup 逻辑）
- npm run build（当前阻断）
- npx vue-tsc --noEmit -p tsconfig.app.json --noUnusedLocals false --noUnusedParameters false（通过，未修改配置）
- npx vite build（通过）

## 逐条验收

1. 单层两份 Word：目录与按需取出通过；组件输出正确名称、大小和内容。浏览器点击添加后实际识别未验证。
2. 嵌套 ZIP：实际展开读取及完整路径通过。第 3 层禁止展开由代码守卫及模板条件验证；未做浏览器点击验收。
3. 中文：UTF-8 中文路径通过；移除 Unicode extra field 后，GBK 原始文件名回退测试通过。
4. 混合类型：实际组件 reason/toggle 逻辑验证仅允许 doc/docx；其他类型给出原因。未做视觉验收。
5. 加密 ZIP、损坏目录、损坏内容（CRC）、非 ZIP：均有异常或页面错误回调验证，不生成 File。RAR 明确提示通过。
6. 100MB 单包、500 条目、500MB 声明解压量、实际解压量限制均通过。超限立即停止；跨已展开压缩包累计。
7. 剩余份数：勾选时限制及添加前动态复验通过，超出时不发出事件。
8. 重复文件：主视图逐个调用原 addUpload(file, false)，未增加第二套去重规则。复用原规则的集成代码已核对；未做浏览器重复文件交互验收。
9. 勾选顺序：真实组件验证输出文件按勾选顺序排列，只抛一个 selected 事件。原上传数组/解析接口均未改；未对运行中的后端发送识别请求，端到端识别成功未验收。
10. ZIP 新代码无类型错误，补充类型检查和 Vite 生产打包通过。标准 npm run build 仍因 TendersView.vue 原有 10 个 TS6133 未使用声明失败（OUTLINE_KIND_OPTIONS、setOutlineKind、outlinePolicyHint、onOutlineDragStart、onOutlineDragOver、onOutlineDrop、onOutlineDragEnd、loadOutlinePreview、setItemPolicy、onDrawingsDrop）。遵守此前“保持范围”的选择，未清理这些声明，不能标记标准构建通过。

## 限制与基线

仅 ZIP；单包 100MB；累计声明及实际解压量各限 500MB；累计目录条目最多 500；外层算第 1 层，最多 3 层；不支持加密包、分卷包和 ZIP64。隐藏条目不展示，但仍计入安全额度。为展开内层 ZIP，必须先按需读取该子压缩包本身；尚未展开的内层内容不读取。原始 ZIP 仅存在于浏览器内存，关闭弹窗会释放组件引用，不上传或写入磁盘。输出 File 的修改时间使用本轮选择时间，沿用原有文件名+大小+修改时间去重。

错误复用页面 error 状态，通过 reportError 回调更新；弹窗只展示同一状态，唯一事件为 selected。允许参数化目标文案和后缀。

本轮开始保护基线已因上一轮授权的多文件改造有 4 项差异。已确认本轮后端受保护文件哈希未变，主视图增量严格限 3 处。根据此前“全部验收通过后再刷新”的条件，标准构建未通过，因此尚未刷新保护基线、未正式提交。提交说明草稿位于后端工作区 tmp/invite-zip-evidence/commit-message-draft.txt。

JSZip API 依据：https://stuk.github.io/jszip/documentation/api_jszip/load_async.html 与 https://stuk.github.io/jszip/documentation/api_zipobject/internal_stream.html 。
