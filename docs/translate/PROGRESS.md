# Perk Desk：进度日志

Codex 为每个任务追加一个章节（AGENTS.md §3）。不得删除之前的记录。所有时间均为 UTC+8。

## 概览

| 任务 | 状态 | 提交 | 备注 |
|---|---|---|---|
| T1 项目脚手架 | PARTIAL | `5f58676` | 使用原生 UI 作为替代；shadcn 组件仓库不可用 |
| T2 类型 + 数据 | DONE | `c0a37b6` | 共享 schema 和经过验证的手写数据 |
| T3 Qloo 层 + 缓存 | DONE | `dade1da` | 请求节奏控制、安全错误、精简缓存 |
| T4 过滤 / 评分 | DONE | `ca588fd` | 过滤、证据评分、网点均衡 |
| T5 工具 + 防护层 1–2 | DONE | `85e0537` | 真实类别和品牌标签证据检查 |
| T6 /api/plan | DONE | `579e7f4` | 带防护的规划及兜底逻辑 |
| T7 /api/run | DONE | `c361601` | 流式调研、合作话术、限额、回放 |
| T8 UI 资料 | DONE | `c4d0ffc` | 预设、本地资料、网点编辑器/地图 |
| T9 确认 + 跟踪 | DONE | `b0df1a5` | 显式确认和六步执行跟踪 |
| T10 卡片、地图、CSV、状态 | PARTIAL | `75c7388` | 已实现；尚未验证在原生电子表格应用中打开文件 |
| T11 评估 | DONE | `2766908` | 一轮提示词优化后命中 15/15 |
| T12 冒烟测试 + 总结 | DONE | `2b10196` | 已验证 agent/兜底冒烟测试，以及缺少密钥时的退出行为 |

可选扩展：X1 列表上传已在 `29ddfe8` 中完成；X2 企业会员匹配和徽标已在最终的 `X2:` 提交中达到 DONE 状态。

本地流程已跑通：从保存的资料开始，经过规划、显式确认类别、流式调研、证据卡片、地图选择、CSV 下载，以及保存后续跟进中的排除项。实际浏览器检查返回了 10 家商户。最终类别评估命中 15/15，宏平均精确率为 0.536；这个小规模开发数据集不足以证明整体推荐质量。

最终自动化验证：X2 完成后，40 个文件中的 404 项离线测试、lint、生产构建和仓库规则检查全部通过。真实 agent/兜底冒烟测试的证据记录在 T12 下；类别评估记录在 T11 下。浏览器检查后已停止本地开发服务器；可用 `npm run dev` 重新启动。

已知限制：无法获取 shadcn 生成组件，因此使用原生封装组件替代；截图失败后，电子表格打开操作仍未验证；对于存在歧义的品牌，兜底逻辑会选择热度最高的候选项（强制兜底冒烟测试中，REI 被匹配为 Real Madrid CF，需要用户纠正）；不使用 Upstash 时，缓存/限流状态仅在各自进程内有效；地点和实时类别覆盖范围可能变化。未执行任何部署或远程仓库操作。原有的 `.env.example` 删除仍未纳入任何任务提交。

评审后修复验证（2026-10-24）：报告的七项问题均已在本地修复；44 个文件中的 467 项离线测试、lint、生产构建、仓库规则检查（142 个文件）和 typecheck 全部通过。重新执行的 agent/兜底冒烟测试，以及 Confirm/地图浏览器检查均通过。具体证据和缓存恢复说明见最后的评审修复记录。T1 和 T10 仍为 PARTIAL。

## 等待 Devin 处理

Codex 不得执行的事项（远程操作、账户、密钥），或未能完成的事项。出现新事项时继续添加。

- [ ] 将仓库推送到 GitHub（目前有意未配置远程仓库）。
- [ ] 创建 Vercel 项目，设置环境变量（QLOO_API_KEY、DEEPSEEK_API_KEY、可选的 UPSTASH_*、JUDGE_BYPASS_CODE），部署并检查 `maxDuration`。
- [ ] 为评审设置私密的 `JUDGE_BYPASS_CODE`，并在部署环境中验证限额/重试流程。
- [ ] 在真实浏览器中检查 UI，包括移动端布局、键盘操作和无障碍支持；确认前检查识别出的品牌选项，尤其是在兜底模式下（见 T12）。
- [ ] 可选：创建 Upstash Redis 数据库，并添加其 REST URL/token。
- [ ] 检查原有的 `.env.example` 删除；Codex 不对其进行处理，也不将其纳入任务提交。
- [ ] shadcn 组件仓库恢复可访问后重试安装；初始化和直接下载均失败后，T1 使用了小型原生 UI 封装组件。
- [ ] 在电子表格应用中打开下载的 CSV：T10 中原生 Numbers 截图失败；浏览器下载和 CSV 解析器检查已通过。
- [ ] 检查 npm 安装审计输出（固定版本依赖树中有 5 项高危问题）；未强制升级依赖。

## 我做出的决定

（说明对规范中不明确之处的解释及理由。每项一条。）

- T1：保留原有的 `.env.example` 删除状态。使用 `git add -A -- . ":!.env.example"` 暂存任务文件，不纳入这项无关删除。
- T1：使用系统字体，避免构建时请求 Google 字体。保留生成的 Next 配置，包括缓存组件和部分预取。
- T1：shadcn 4.22.1 初始化和直接下载组件均报错 `other side closed`，通过代理重试也失败。使用易读的原生封装组件和本地 `components.json`；不宣称已安装由 shadcn 生成的组件。
- T1：修复现有规则检查器，使其仅比较实际密钥赋值，忽略注释和公开的 URL/模型配置；否则文档中的公开默认值会被误判为密钥。将假 UUID 的校验收紧到严格符合要求的格式。未移除任何保护措施。
- T1：Turbopack 需要本地工作进程端口，但沙箱阻止了该端口。使用获批的本地执行权限运行验证。后续构建命令通过 `NEXT_TELEMETRY_DISABLED=1` 关闭 Next 遥测。

- T3：仅允许将 Qloo URL 覆盖为获准的 HTTPS 黑客松源地址，并拒绝重定向，防止凭据被发送到其他主机。同步预留请求时间槽，确保并发调用之间仍保持间隔。
- T3：缓存失败时只发出一条固定警告，绝不包含服务提供方的错误详情。本地缓存会克隆值，以保持与 Redis 序列化相同的数据隔离效果。

- T4：在现有共享类型文件中添加内部 MerchantCandidate schema；它负责携带排名所需的输入，直到生成合作话术。先评分后过滤，使偏好契合度归一化使用原始的带种子信号网点/类别列表。
- T4：先交错选取各网点配额中的候选项，再裁剪总数，以满足文档中的三个网点最低配额要求（4/3/3，而非 4/4/2）。仅因半径超限而剔除的项不新增排除字段。

- T5：已安装的 ai 7.0.150 提供带 `instructions` 的 `generateText`、`tool`（从 provider-utils 重新导出）、`isStepCount`、`StopCondition`、`LanguageModel`（支持 v2/v3/v4），以及来自 `ai/test` 的 `MockLanguageModelV4`。无需替换 API 名称。T7 可使用 `Output.object`。
- T5：工具结果中最多提供 25 个允许使用的标签名称及其精确 ID；否则模型无法提交所需的真实 brandTagId 证据。不提供任何被禁止的标签。
- T5：除了抛出致命 Qloo 错误，还将其保存在每个请求的上下文中，因为 SDK 的工具执行机制可能捕获异常。编排器必须在进入兜底或返回成功前检查此状态。qlooCalls 统计未命中缓存的逻辑 Qloo 查询；执行跟踪还会记录缓存命中。

- T6：当 ARCHITECTURE §5 的至少两个类别要求与 T6 测试示例中的一个有效类别冲突时，遵循前者。两个有效类别加一个无效类别时可以保留 agent 模式；只有一个有效类别时则保留该类别，并由兜底逻辑补全规划。
- T6：兜底时保留有效部分规划证据所引用的歧义品牌选择。通用类别和来自已保存偏好的类别会明确提示需要确认；每个类别仍必须通过已观测类别和允许标签的防护检查。没有允许标签的品牌不能为兜底类别提供依据。
- T6：一旦上下文中保存了致命 Qloo 错误，立即停止模型生成，然后传递安全错误，不进入兜底。

- T7：运行编排器返回 RunResult；只有路由负责发送 result，只有流辅助函数负责发送 done。这可避免重复的终止事件。回放时将 Qloo 事件标记为已缓存，并重置已用时间戳。
- T7：在检查合作话术中的数字/句子前，先屏蔽与卡片身份完全匹配的标签，以允许“Cafe 42”这样的真实名称，同时不放过缺少依据的数字陈述。不安全的机构名称改用“our credit union”；商户名称过长、无法满足限制时，合作话术留空并附带警告。
- T7：预设运行的限额豁免还要求已解析实体 ID 匹配，且网点/品牌身份唯一。如果自定义后的预设没有对应的规范默认规划缓存，则使用普通限额。IP 拒绝不消耗全局预算；全局拒绝可能消耗一次 IP 尝试。Redis 故障期间，已耗尽的额度状态仍会保留，直到其重置时间。

- T8：hydration 完成后，在排队的微任务中加载浏览器存储，保证服务端/客户端的初始标记一致。持久化每次有效的资料修改；必填字段暂时无效时，保留上一次完整保存的资料。
- T8：修改地址会清除之前的坐标。构建运行请求时，只有网点 ID 相同且地址未改变，才借用规划中的坐标。企业会员名称在可选任务 X2 之前保持为空。
- T8：原生组件替代方案统一使用浅石板灰/青绿色界面。会员品牌文本和预设选择保留为会话状态；仅持久化文档规定的资料和评审码存储键。

- T9：更改品牌候选项后，禁用确认，直到重新规划并刷新证据。编辑类别会清除之前的调研结果和执行跟踪；编辑资料/品牌还会使规划失效。
- T9：修复 T8 的请求构建逻辑，只调研成功完成位置解析的网点，同时继续显示未解析的网点以供修正。保留已解析网点的当前编辑内容，并显示易读的校验错误，而非原始 schema 输出。
- T9：流客户端要求恰好一个终止结果，后跟 done；它处理 UTF-8/数据块边界，并以固定警告跳过格式错误的行。流被截断会视为错误，避免 UI 无限运行。

- T10：导出当前可见的商户列表，与地图和 Independents only 筛选器保持一致。将排除总数标记为候选匹配数，因为重复的网点/类别候选项并不代表不同商户。评分显示一位小数，避免展示服务提供方的浮点数误差。

- T11：强制使用普通 Vitest 评估报告器，因为其自动 agent 报告器会隐藏成功测试的指标。同时报告宏平均和微平均精确率；错误计零分，且绝不暴露原始服务提供方详情。仅进行一轮提示词调整，让模型优先选择核心/常见商户类别，而非狭窄的同义类别；未修改用例数据或防护检查。

- T12：npm 冒烟命令使用 POSIX 文件存在性条件判断，使缺少 `.env.local` 时能按要求以缺少密钥的退出码 2 结束。这样无需新增依赖，并保持兼容 Node 20.9；需要 macOS/Linux 或 WSL。空规划或空商户列表会使冒烟检查失败，避免误报成功。
- T12：对于歧义品牌，保留规定的首个候选项兜底规则；记录观测到的 REI 歧义，不添加未要求的别名启发式逻辑。UI 在调研前提供候选项纠正入口。

- X1：CSV 和文本上传都会按列解析；包含逗号的名称必须加引号。导入会替换当前可见、可编辑的列表，跳过首行的 name/merchant/brand 表头，并沿用现有去重/列表数量限制。将单元格内的换行规范化为空格。拒绝格式错误、空文件或过大文件，且不清空现有文本；上传上限为 1 MiB。

- 最终评审对 T12 表述的纠正：`fallback-plan.ts` 已经按热度对歧义候选项排序，并选择最高者；并非直接采用 Qloo 响应中的顺序。观测到的 REI 错配及用户需要纠正的事实没有变化。早先的 T12 表述作为历史记录保留。

- X2：在过滤/评分之后执行企业会员名称匹配，使其只影响徽标字段。已签约商户列表和企业会员列表复用本地列表编辑器/上传控件。现有 CSV 导出会自动包含会员标记。

- 评审修复：区分失败和成功返回的空数据。基线不可用时，在评分前将排名提升设为 null；不完整的类别使用新增的 `incomplete` 报告状态，防止 UI 宣称本地供给稀少。为了如实呈现部分结果，需要对 ARCHITECTURE §3 做这项小幅扩展；未重命名任何端点或现有字段。
- 评审修复：保留固定缓存键和 TTL，但运行回放要求 `{ complete: true, events }`，密度提示要求 `{ count, complete: true }`，精简 Qloo 值要求 `{ validated: true, value }`。旧值视为未命中，并通过正常请求按需恢复。运行结果是否可缓存通过内部的 `RunOptions.onCacheable` 传递；RunResult 无需新增缓存元数据字段。
- 评审修复：ARCHITECTURE §3 的 RunRequest 示例用裸 `z.number()` 替换了有边界约束的 Branch 坐标，导致边界限制丢失。改为复用 Branch 内部必填的 schema。按要求不修改架构文档；在此记录这项差异。
- 评审修复：使用请求代次 ref 和立即生效的忙碌状态 ref，忽略迟到的事件/错误/阶段变化，并在 React 重新渲染之前阻止已捕获的地图处理函数执行。这些 ref 不替代前端 useState。

## 评审指南

1. `src/lib/types.ts`：了解经过校验的资料、规划、运行和执行跟踪数据结构。
2. `src/lib/config.ts`：检查限额、超时、评分权重和显示常量。
3. `src/lib/qloo/client.ts`：检查获准主机限制、密钥请求头、请求节奏控制、错误处理和精简缓存边界。
4. `src/lib/merchants/scoring.ts` 和 `shortlist.ts`：检查排名提升、品牌占比、去重和网点均衡。
5. `src/lib/agent/guards.ts`：检查类别来源、允许标签的证据和合作话术检查。
6. `src/lib/agent/plan-agent.ts` 和 `run-agent.ts`：了解模型/工具编排和确定性的兜底逻辑。
7. `src/app/api/run/route.ts` 和 `src/lib/stream.ts`：检查校验、缓存回放、限流和终止事件职责归属。
8. `src/lib/request-builders.ts` 和 `run-client.ts`：了解资料转换、按状态排除，以及能安全处理数据块边界的 NDJSON 读取。
9. `src/app/page.tsx`：了解基于 useState 的 UI 协调和编辑后的失效处理。
10. `src/components/{CategoryConfirm,AgentTrace,MerchantCard,MerchantMap}.tsx`：检查证据、进度、状态控件和联动选择。
11. `src/lib/csv.ts`、`tests/eval/category-eval.test.ts` 和 `scripts/smoke.ts`：检查导出和可重复执行的验证。
12. `tests/unit/`：检查离线假数据测试对所修改行为的覆盖情况。

---

## 任务记录

<!-- 为每个任务复制此模板：

### T<n>: <标题> — <DONE | PARTIAL | FAILED>
- 日期/时间（UTC+8）：
- 已完成内容：
  -
- 涉及文件：
  -
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- 实际检查（如有；仅记录数量/名称，绝不记录响应正文或密钥）：
- 未解决问题 / 决定：
- 新增依赖（名称、原因）：
- 需要 Devin 处理：

-->

### T1：项目脚手架、lint 规则、测试运行器 — PARTIAL
- 日期/时间（UTC+8）：2026-10-23 21:52
- 已完成内容：
  - 搭建启用缓存组件的 Next 16.4.2 / React 19.3 脚手架；安装固定版本的应用/测试依赖系列。
  - 添加指定的 npm 脚本、严格的可读性/导入边界 ESLint 规则，以及单元测试/评估配置。
  - 添加惰性环境变量解析、共享常量，以及七项已通过的环境/配置测试。
  - 添加元数据、合规页脚、系统字体，并因 shadcn 组件仓库不可用而添加小型原生 UI 封装组件。
  - 修复检查器对公开环境设置的误报，并收紧测试数据 UUID 校验。
- 涉及文件：`package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`, `vitest.config.ts`, `vitest.eval.config.ts`, `src/app/{layout.tsx,page.tsx,globals.css,favicon.ico}`, `public/*.svg`, `src/lib/{env.ts,config.ts,utils.ts}`, `src/components/ui/*.tsx`, `tests/unit/{env,config}.test.ts`, `scripts/check-rules.mjs`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run typecheck
  npx eslint --print-config src/lib/config.ts | rg -c max-lines-per-function
  ```
- 验证结果：PASS（7 项测试、生产构建、规则检查、typecheck）；输出的 lint 规则计数为 1。首次标准验证仅因沙箱阻止 Turbopack 本地工作进程端口而失败；获批执行后通过。添加封装组件后的最终检查也通过。
- 实际检查：未调用 Qloo 或 DeepSeek。没有被 Git 跟踪的密钥、依赖目录或构建产物。
- 未解决问题 / 决定：shadcn 初始化和直接请求组件仓库均报错 `other side closed`；原生封装组件使后续任务得以继续。生成的脚手架使用 Tailwind 的 Turbopack 加载器，未创建 PostCSS 配置。原始 README、LICENSE 和规范文档未改动。原有的 `.env.example` 删除未纳入提交。
- 新增依赖：仅包含 Architecture §9 中的运行时/开发依赖系列，以及 create-next-app 生成的 Tailwind/ESLint/TypeScript 支持。未添加额外 UI 库。
- 需要 Devin 处理：重试安装 shadcn；检查原有模板删除和 npm 审计问题（见上文）。

### T2：类型和数据加载 — DONE
- 日期/时间（UTC+8）：2026-10-23 21:55
- 已完成内容：
  - 按依赖顺序添加全部共享 schema 和推导类型，没有循环导入或惰性 schema。
  - 为类别、黑名单、全国连锁、预设和地图城市添加经过校验的静态 JSON 加载器。
  - 添加规范化 JSON、SHA-256 缓存键和城市 slug。
  - 添加假测试数据及测试，覆盖每个 schema 的有效输入/两个无效输入、每种执行跟踪事件、数据引用和缓存键稳定性。
- 涉及文件：`src/lib/{types.ts,data.ts,hash.ts}`, `tests/fixtures/fake-plan.ts`, `tests/unit/{types,data,hash}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- 验证结果：首次标准验证即 PASS；5 个文件中的 60 项测试、生产构建和规则检查器均通过。
- 实际检查：无。
- 未解决问题 / 决定：全部 schema 可以放在一个文件中（总计 143 行），因此未拆分执行跟踪类型。为文档规定的标签/显示名称对添加了可复用的 CategoryTag schema。落实了文档规定的执行跟踪摘要 200 字符上限。JSON 数据和标签 ID 未改动。
- 新增依赖：无。
- 需要 Devin 处理：除现有等待事项外，无新增事项。

### T3：Qloo 层和缓存 — DONE
- 日期/时间（UTC+8）：2026-10-23 21:59
- 已完成内容：
  - 添加按需初始化的可选 Redis 和带过期时间的内存缓存，并安全处理失败。
  - 添加带请求节奏控制的 Qloo 传输层、类型化且经过脱敏的错误、一次短时 429 重试、配额检测，以及经过校验的精简缓存。
  - 添加品牌/类别搜索，在缓存前过滤，并严格使用规定的查询参数名。
  - 添加带种子信号/基线地点查询、地区解析、可选字段映射和分组营业时间。
  - 添加手写的模拟原始测试数据及传输/缓存/解析器测试；未存储真实 API 数据。
- 涉及文件：`src/lib/store/cache.ts`, `src/lib/qloo/{client,search,tags,insights}.ts`, `tests/fixtures/qloo-fake.ts`, `tests/unit/{cache,qloo-client,qloo-search,qloo-insights}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- 验证结果：首次标准验证即 PASS；9 个文件中共有 109 项测试。之前一次针对 insights 的类型检查发现可选营业时间/默认 null 的类型问题；已在标准验证前修复。
- 实际检查：获准的 T3 REI 搜索成功，返回 3 个候选名称；未写入响应文件。观测到的歧义与 QLOO_API.md 一致。
- 未解决问题 / 决定：丢弃没有可用类型的标签；拦截格式错误的类别 ID；searchBrandExact 返回首个结果，交由连锁检查的调用方判断名称是否相等。可选字段无效时将其省略，不因此废弃其他信息仍可用的地点。
- 新增依赖：无。
- 需要 Devin 处理：无新增阻塞事项。

### T4：商户过滤和评分 — DONE
- 日期/时间（UTC+8）：2026-10-23 22:04
- 已完成内容：
  - 添加纯函数形式的名称规范化/匹配、基于单词边界的全国连锁检查，以及多门店标记。
  - 添加 haversine 距离计算，以及带半径容差的确定性排除原因。
  - 添加种子/基线结果并集、排名提升、归一化加权评分、按最大余数法计算的品牌占比，以及按最近网点/类别去重。
  - 添加均衡轮询候选短名单和模拟商户测试数据，六个任务测试文件合计包含 100 多项断言。
- 涉及文件：`src/lib/merchants/{name-match,distance,chains,filter,scoring,shortlist}.ts`, `src/lib/{types,config}.ts`, `tests/fixtures/fake-places.ts`, `tests/unit/{name-match,distance,chains,filter,scoring,shortlist,types}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/scoring.test.ts tests/unit/shortlist.test.ts
  ```
- 验证结果：首次标准验证即 PASS；15 个文件中共有 149 项测试；要求的专项检查中 20 项测试通过。
- 实际检查：无；所有商户函数和测试均为纯函数/离线执行。
- 未解决问题 / 决定：T4 需要共享候选 schema 和调节常量，因此扩展了之前 T1/T2 的文件。先选择最近网点，再选择该网点中评分更高的类别；平分情况按确定规则处理。企业会员标记在 X2 之前保持 false。
- 新增依赖：无。
- 需要 Devin 处理：无新增阻塞事项。

### T5：Agent 工具和防护层 1–2 — DONE
- 日期/时间（UTC+8）：2026-10-23 22:10
- 已完成内容：
  - 添加相互隔离的规划/运行上下文、安全的执行跟踪辅助函数、致命错误状态，以及确定性的 DeepSeek 设置。
  - 添加品牌解析和类别搜索工具，使用真实证据 ID 和已缓存的密度提示。
  - 添加商户调研工具，支持种子/基线调用、部分失败处理、每个原始类别最多一次替换，以及全局重复项/数量刷新。
  - 添加提交/类别/证据防护检查，验证证据确实属于选定品牌，并防御性地过滤标签。
  - 验证已安装 SDK 的 API，并添加使用 mock 的工具/上下文/防护测试。
- 涉及文件：`src/lib/agent/{context,model,guards}.ts`, `src/lib/agent/tools/{resolve-brands,search-categories,find-merchants}.ts`, `src/lib/config.ts`, `tests/unit/{context,guards,resolve-brands,search-categories,find-merchants}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/guards.test.ts
  ```
- 验证结果：首次标准验证即 PASS；20 个文件中共有 202 项测试；防护专项检查中 10 项测试通过。
- 实际检查：无；所有服务均使用 mock。
- 未解决问题 / 决定：模型选择品牌后保留原始歧义状态，使后续那一次纠正机会仍可改变该选择。提交次数和接受判断留给 T6 处理，防护代码不负责这些逻辑。后续结果发现重复名称时，类别密度刷新会包含之前找到的类别。SDK 的 Tool<Input,Output> 注解属于库类型，并非自定义泛型抽象。
- 新增依赖：无。
- 需要 Devin 处理：无新增阻塞事项。

### T6：带 agent 防护和兜底逻辑的规划 API — DONE
- 日期/时间（UTC+8）：2026-10-23 22:21
- 已完成内容：
  - 添加精简的规划、调研和合作话术提示词，仅包含相关的公开商户信息和汇总偏好字段。
  - 添加预设展开、地区解析、规划工具循环、一次纠正、确定性的遗漏品牌补全，以及致命错误传递。
  - 添加文档规定的全部兜底关键词规则、如实表述的默认依据、已保存偏好，以及保留有效 agent 类别的受防护补全逻辑。
  - 添加带校验的 `/api/plan`、规范化的非空结果缓存，以及安全 JSON 错误。
  - 添加模型驱动、兜底、路由和提示词边界测试。
- 涉及文件：`src/lib/config.ts`, `src/lib/agent/{prompts,plan-agent}.ts`, `src/lib/fallback/{category-map,fallback-plan}.ts`, `src/app/api/plan/route.ts`, `tests/unit/{category-map,fallback-plan,plan-agent,plan-route,prompts}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/plan-agent.test.ts tests/unit/plan-route.test.ts tests/unit/category-map.test.ts tests/unit/fallback-plan.test.ts
  ```
- 验证结果：PASS（256 项测试、生产构建、lint、规则检查）。根据评审修复致命错误停止条件后，重新执行了标准检查。
- 实际检查：文档规定的 Denver 预设调用返回 agent 模式、6 个类别（Outdoor clothing and equipment shop、Coffee shop、Brewery、Yoga studio、Health food store、Pet supply store），以及 0 个未解析名称。响应时间约 16 秒。仅输出模式/数量/名称，未保存响应文件，并已停止本地服务器。
- 未解决问题 / 决定：架构文档的至少两个类别要求优先于与之不一致的任务测试示例；兜底逻辑会如实标注缺少支持证据的通用/默认推断。近似位置需要用户之后在地图上确认。见上文的决定。
- 新增依赖：无。
- 需要 Devin 处理：除现有列表外，无新增事项。

### T7：流式调研、有依据的合作话术、缓存回放和限额 — DONE
- 日期/时间（UTC+8）：2026-10-23 22:28
- 已完成内容：
  - 添加 NDJSON 分帧、已用时间戳、安全错误、取消处理，以及恰好一个终止结果后跟 done 的保证。
  - 添加调研编排，支持确定性补全、每个商户稀少类别一次相邻类别兜底、均衡短名单、品牌检查、类别报告和六组步骤开始/结束事件。
  - 添加批量结构化合作话术、指标/身份防护检查、如实表述的基线模板，以及无法满足话术长度限制时的安全处理。
  - 添加运行缓存/回放和两个路由的每日限额，支持评审/预设豁免以及 Redis 故障行为。
  - 添加使用假 Qloo 数据且关闭模型的离线路由集成测试，以及边界、话术、流、限额和模型测试。
- 涉及文件：`src/lib/{stream,config}.ts`, `src/lib/agent/{run-agent,pitch-writer,guards,prompts}.ts`, `src/lib/fallback/{fallback-run,pitch-template}.ts`, `src/lib/store/rate-limit.ts`, `src/app/api/{plan,run}/route.ts`, `tests/unit/{stream,pitch,rate-limit,run-agent,run-route,run-route-integration,plan-route}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/run-route-integration.test.ts tests/unit/run-agent.test.ts tests/unit/pitch.test.ts tests/unit/rate-limit.test.ts
  ```
- 验证结果：PASS（329 项测试、生产构建、lint、规则检查）。首次标准验证通过了 lint/测试，但构建发现 AI SDK Tool 返回类型的字面量不匹配；为 execute 显式声明返回类型后修复，typecheck 通过。下一轮标准验证通过。另一个可选实际检查命令在发出请求前发现缺少闭合分隔符；修正后重跑成功。
- 实际检查：Denver 规划返回 agent 模式、5 个类别和 0 个未解析名称。调研返回 agent 模式、10 家商户；事件流包含 12 个步骤事件、6 次工具调用、40 个 Qloo 事件、6 个工具结果、3 条 agent 说明，以及恰好 1 个 result 和 1 个 done。仅输出数量/名称，未写入响应文件；已停止本地服务器。
- 未解决问题 / 决定：按设计，本地兜底预算仅在各自进程内有效；生产环境需要可选的 Upstash 才能共享限额执行状态。自定义预设规划可能受到普通限额约束。合作话术防护检查允许的数字、长度和身份，但并非通用事实核查器。上文的决定解释了身份处理和终止事件职责归属。
- 新增依赖：无。
- 需要 Devin 处理：可选的 Upstash 和评审码设置仍在等待列表中。

### T8：资料保存、预设、偏好输入和网点地图 — DONE
- 日期/时间（UTC+8）：2026-10-23 22:35
- 已完成内容：
  - 添加浏览器资料/评审码存储、安全的逐行列表解析、带校验的规划/运行请求构建器，以及规划 HTTP 处理。
  - 添加两个预设按钮、机构/城市字段、已签约商户粘贴框、支持半径和地图选点的 1–5 个网点编辑器，以及六个偏好分组。
  - 添加仅在客户端运行的 Leaflet 地图，包含网点标记、商圈圆形范围、城市平移和 OpenStreetMap 署名。
  - 连接页面状态、表单失效处理、已保存资料、规划等待中/错误反馈，以及临时类别标签。
- 涉及文件：`src/app/{page.tsx,globals.css}`, `src/components/{PresetPicker,ProfileForm,BranchEditor,TasteInput,MerchantMap}.tsx`, `src/lib/{config,profile-storage,request-builders,run-client}.ts`, `tests/unit/{profile-storage,request-builders,post-plan}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  打开 http://localhost:3000，选择 Try Denver demo，检查三个商圈圆形范围，然后重新加载。
- 验证结果：PASS（351 项测试、生产构建且未出现 Leaflet SSR/window 错误、lint、规则检查）。
- 实际检查：应用内浏览器显示了 Denver 虚构机构、3 个网点和 3 个地图圆形范围。重新加载后保留了资料、网点位置和已签约商户列表。品牌输入属于会话状态，重新加载后重置。本次浏览器检查未触发真实 API 调研。已停止本地服务器。
- 未解决问题 / 决定：浏览器存储不可用时，会话仍可使用，但无法持久化。资料暂时无效时保留最近一次有效的已保存版本。T9 将添加类别确认和调研控件；当前规划输出有意保持为临时展示。
- 新增依赖：无。
- 需要 Devin 处理：最终验收仍需更全面的真实浏览器和无障碍检查。

### T9：类别确认、偏好记忆和实时执行跟踪 — DONE
- 日期/时间（UTC+8）：2026-10-23 22:48
- 已完成内容：
  - 添加已识别品牌的选择项、带防护的重新规划、证据行、类别增删控件，以及最多五个类别的显式确认。
  - 添加无冲突的偏好合并，并在确认调研时保存偏好。
  - 添加稳健的 NDJSON 读取，支持评审请求头、安全错误、数据块处理和完成状态校验。
  - 添加六行进度、受限的详情行数、Qloo/缓存计数、兜底/错误/限额面板，以及掩码显示评审码的重试控件。
  - 修复部分网点解析问题，并在类别变化时清除过期结果。
- 涉及文件：`src/app/page.tsx`, `src/components/{CategoryConfirm,AgentTrace}.tsx`, `src/lib/{config,request-builders,run-client}.ts`, `tests/unit/{run-client,preferences,request-builders}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  在浏览器中：Denver demo → Plan → 编辑类别 → Confirm & find merchants → 检查进度和结果预览。
- 验证结果：PASS（370 项测试、生产构建、lint、规则检查）。独立集成评审修复后，重新执行了完整检查。
- 实际检查：Denver 规划约 16 秒完成。六个建议类别初始选中五个；移除一个，再选中第六个。点击 Confirm 前，服务器日志仅显示 `/api/plan`。点击 Confirm 后，真实调研约 23 秒完成，返回 10 家商户，六个步骤均为完成。之后编辑类别会清除之前的结果。一次浏览器权限审查超时在唯一一次重试后成功；服务器重启后过期的标签页已替换为新的本地测试标签页。
- 未解决问题 / 决定：证据卡片将在 T10 添加；本任务显示商户名称结果预览。无效/截断流行为已通过离线测试覆盖。现有本地开发服务器继续运行，供下一次浏览器检查使用。
- 新增依赖：无。
- 需要 Devin 处理：无新增仅限负责人执行的操作。

### T10：证据卡片、地图选择、CSV 和跟进状态 — PARTIAL
- 日期/时间（UTC+8）：2026-10-24 10:32
- 已完成内容：
  - 添加按网点分组的卡片，显示可用证据、评分、链接、合作话术、复制反馈，以及保存的跟进状态。
  - 添加结果/类别/排除摘要、独立商户筛选，以及 agent/兜底标签。
  - 添加可选择的商户标记、键盘激活、双向选择、卡片滚动定位，以及适配结果范围的地图视野。
  - 添加 CSV 导出，严格遵循列顺序，支持 RFC 4180 转义、文本公式注入防护和状态查询。
- 涉及文件：`src/app/page.tsx`, `src/components/{MerchantCard,MerchantMap,ExportButton}.tsx`, `src/lib/{config,csv}.ts`, `tests/unit/csv.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  Denver demo → Plan → Confirm → 复制合作话术、选择卡片/标记、导出 CSV、将一家商户标记为 Not a fit，然后再次 Confirm。
- 验证结果：PASS（380 项测试、生产构建、lint、规则检查）。独立评审修复了后续剪贴板操作失败后仍显示 Copied 的过期反馈；浏览器检查促成了评分显示一位小数的调整。两项修改后的最终标准检查均通过。
- 实际检查：Denver 生成了 10 张卡片和 10 个商户标记。复制后显示 Copied；选择卡片会改变对应标记的显示；点击标记会高亮并滚动到对应卡片。等待一夜浏览器权限后，CSV 下载完成；离线解析器验证了 10 行数据和 16 列。将 Denver ChopHouse & Brewery 标记为 Not a fit；下一次完成的 10 商户运行结果不再包含它，并显示一项按状态排除。截图保存在仓库外。
- 未解决问题 / 决定：实现已完成，但尚未验证在原生电子表格应用中打开 CSV。尝试使用 Numbers 时，在打开文件前即出现 ScreenCaptureKit 截图错误 -3811。未尝试绕过审批或改用其他 UI 自动化方式。由于这项手动验收缺口，本任务为 PARTIAL；按照无人值守规则继续推进独立工作。
- 新增依赖：无。
- 需要 Devin 处理：在电子表格应用中打开下载的 CSV（也已列入“等待 Devin 处理”）。

### T11：真实类别评估 — DONE
- 日期/时间（UTC+8）：2026-10-24 10:43
- 已完成内容：
  - 精确添加规定的 15 个手写用例定义，并对照默认数据校验全部预期类别 ID。
  - 添加顺序执行的真实规划、安全的逐用例进度和汇总指标，缺少密钥时跳过。
  - 添加明确的评估计时/指标常量和普通报告器，使成功运行也能显示指标。
  - 仅对规划提示词调整一次，让模型优先选择有真实证据支持的核心产品/服务和常见的较宽泛商户类别。
- 涉及文件：`tests/eval/{cases.json,category-eval.test.ts}`, `vitest.eval.config.ts`, `src/lib/config.ts`, `src/lib/agent/prompts.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run eval
  env QLOO_API_KEY= DEEPSEEK_API_KEY= npm run eval
  ```
- 验证结果：PASS（380 项离线测试、生产构建、lint、规则检查）。密钥为空时，静态用例校验通过，真实测试跳过。离线测试在密钥为空时也通过。提示词调整后的最终标准检查通过。
- 实际检查：首次成功运行耗时 147.96 秒，但自动报告器隐藏了指标，因此改为显式报告后重跑。测得基线：命中 10/15（66.7%），宏平均精确率 0.300，微平均精确率 0.288，0 次兜底，0 个错误，耗时 125.697 秒。第 1 轮提示词调整：命中 15/15（100%），宏平均精确率 0.536，微平均精确率 0.540，0 次兜底，0 个错误，耗时 138.256 秒。无需第二轮调整。仅输出名称和指标；未写入响应文件。
- 未解决问题 / 决定：这只是小规模开发评估，不能证明普遍相关性；精确率尚未达到完美，实际结果也可能变化。基线未命中通常是因为选择了更窄但合理的类别，而非品牌解析失败。报告器配置是本任务所需的 T1 后续调整。
- 新增依赖：无。
- 需要 Devin 处理：无新增仅限负责人执行的操作。

### T12：冒烟脚本和最终评审总结 — DONE
- 日期/时间（UTC+8）：2026-10-24 10:48
- 已完成内容：
  - 添加兼容 CJS 的 Denver 全流程冒烟命令，支持安全报告、缺少密钥处理、事件计数和重复规划缓存计时。
  - 使用真实密钥验证 agent 调研，以及显式关闭 agent 后的兜底调研。
  - 仅更新 README 的状态和本地运行章节，保留合规文字。
  - 补全任务/提交概览、端到端状态、已知限制、负责人待处理列表和文件评审指南。
- 涉及文件：`scripts/smoke.ts`, `package.json`, `README.md`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run smoke
  PD_AGENT_DISABLED=1 npm run smoke
  env QLOO_API_KEY= DEEPSEEK_API_KEY= npm run smoke
  ```
  最后一条命令必须输出缺少密钥的消息，并以退出码 2 结束；密钥有效时，其他命令都应以退出码 0 结束。
- 验证结果：PASS（380 项测试、生产构建、lint、规则检查）。一次仅限沙箱内执行的冒烟尝试在脚本运行前失败，因为 tsx 无法打开本地 IPC socket；获批的本地执行解决了此问题。无密钥运行以退出码 2 结束，并输出完全符合要求的消息。未执行远程操作。
- 实际检查：agent 规划解析出 8 个品牌，0 个未解析，在 14,177 ms 内提出 6 个类别；调研使用前 5 个类别，调用 Qloo 40 次，在 16,268 ms 内返回 10 家商户和 10 条 agent 合作话术。重复规划：10,081 ms，faster=true，12 次 Qloo 缓存命中。强制兜底：8 个已解析/0 个未解析，3,671 ms 内得到 4 个类别；调用 Qloo 34 次，在 14,163 ms 内得到 10 家商户和 10 条模板话术。重复规划：14 ms，faster=true，12 次缓存命中。两条真实调用命令都以退出码 0 结束，且未写入响应文件。agent 运行期间，AI SDK 输出了其固定的 JSON-schema 兼容性警告。
- 未解决问题 / 决定：强制兜底按照文档规定的首个候选项规则，将歧义输入 REI 选择为 Real Madrid CF；agent 模式则正确选择了 Recreational Equipment Inc。用户必须在确认前检查并纠正已识别品牌。这暴露了兜底相关性的限制，并非流程失败。在电子表格应用中打开 CSV，以及安装 shadcn 组件仓库，仍是之前的 PARTIAL 项。计时比较仅为观测结果，不是性能保证。
- 新增依赖：无。
- 需要 Devin 处理：推送/部署/资源/评审码和更全面的浏览器检查均已列于上文；仍全部由负责人执行。

### X1：可编辑列表的 CSV/文本上传 — DONE
- 日期/时间（UTC+8）：2026-10-24 10:53
- 已完成内容：
  - 在已签约商户和会员品牌粘贴框旁添加支持无障碍操作的 CSV/文本输入控件。
  - 添加首列解析，支持带引号/转义/多行的 CSV、跳过表头、去除首尾空白、去重和列表数量限制。
  - 添加易读错误、文件大小防护、同文件重试，以及防止过期读取覆盖新输入的保护。
  - 导入后的文本仍可见、可编辑，并保留现有的超过 10 个品牌校验。
- 涉及文件：`src/components/{ProfileForm,TasteInput}.tsx`, `src/lib/{config,request-builders}.ts`, `tests/unit/uploaded-list.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  向每个列表导入一个小型 CSV/文本文件；检查并编辑导入的首列名称。
- 验证结果：PASS（397 项测试、生产构建、lint、规则检查）。解析器测试覆盖混合换行符、引号内的逗号/引号、多行单元格、表头、空数据、错误引号、去重和数量上限行为。
- 实际检查：浏览器将一份手写的假 CSV 导入两个字段；两者都显示三个预期名称，保留了引号内逗号和转义引号，品牌计数显示 3/10。本次检查未请求 API 调研。
- 未解决问题 / 决定：即使文件扩展名为 .txt，上传也使用 CSV 语法；普通粘贴文本仍为每行一个名称，并保留未加引号的逗号。企业会员上传将在 X2 的新字段中提供。
- 新增依赖：无。
- 需要 Devin 处理：无新增仅限负责人执行的操作。

### X2：企业会员匹配和徽标 — DONE
- 日期/时间（UTC+8）：2026-10-24 10:57
- 已完成内容：
  - 添加可选且可保存的企业会员粘贴框，并提供相同的 CSV/文本导入控件。
  - 在调研请求中包含解析/去重后的企业会员名称。
  - 在评分/过滤后匹配规范化商户名称，并显示 Already a business member 徽标。
  - 验证评分、顺序、排除结果和独立商户数量均不变，并可与多门店徽标共存。
- 涉及文件：`src/components/{ProfileForm,MerchantCard}.tsx`, `src/lib/request-builders.ts`, `src/lib/agent/tools/find-merchants.ts`, `tests/unit/{request-builders,business-members,merchant-card}.test.ts`, `docs/PROGRESS.md`。
- 验证方法：
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  在规划前添加企业会员名称；匹配的卡片会显示徽标，但不会提升排名。
- 验证结果：PASS（404 项测试、生产构建、lint、规则检查）。一项专项测试最初依赖偶然出现的字母顺序；已修正为按名称比较会员身份，同时用单独的测试比较匹配前后的完整排名/顺序。最终标准检查通过。
- 实际检查：将手写的假名称导入企业会员字段，重新加载并验证持久化。之后恢复 Denver 预设。本次 UI 检查未调用 API；匹配和徽标渲染行为通过离线假测试数据验证。检查后已停止本地开发服务器。
- 未解决问题 / 决定：企业会员身份仅用于徽标，不会排除商户、改变排名或成为合作话术中的陈述。最终评审纠正了 T12 对歧义兜底选择的解释（选择热度最高者，现有代码已如此实现）；早先的历史表述予以保留，并已在上文明示纠正。此前记录的 T1/T10 缺口仍是负责人待检查事项。
- 新增依赖：无。
- 需要 Devin 处理：所有仅限负责人执行的操作和剩余手动检查，均列于“等待 Devin 处理”。

### 评审修复：报告的七项问题 — DONE
- 日期/时间（UTC+8）：2026-10-24 11:38
- 已完成内容：
  - 保留地点查询成功但为空、失败和部分成功的区别；全面故障时发送 error/done，部分商户结果仍可使用，且绝不将不完整调研存储为完整运行结果或完整密度。
  - 点击 Confirm 和 Retry 时清除地图选点状态，忙碌时禁用选点；编辑、较新的请求和组件卸载时，使过期的规划/调研成功、失败、执行跟踪事件及阶段写入失效。
  - 基线失败时，在评分前移除缺少依据的排名提升证据，同时保留偏好证据，以及文档规定的成功但为空基线所使用的公式。
  - 对格式错误或明确表示失败的 Qloo HTTP-200 响应封装返回安全的上游错误；保留有效空数组、可选/未知字段，以及地区缺失/为空时的行为。
  - 将话术服务提供方/结构化输出失败转化为脱敏警告、兜底执行跟踪和兜底模式，同时保留调研结果；将单条防护拒绝单独处理。在 HTTP 和直接调研入口处均保留必需的坐标边界约束。
  - 在 README 的 Run locally 章节中说明每进程内存缓存/限流的限制和共享 Redis 配置；添加回归测试，以及在不更改缓存键的情况下按需恢复旧缓存值的机制。
- 涉及文件：`README.md`, `docs/PROGRESS.md`; `src/app/{page.tsx,api/run/route.ts}`; `src/components/MerchantCard.tsx`; `src/lib/types.ts`; `src/lib/agent/{context,run-agent,pitch-writer}.ts`; `src/lib/agent/tools/{find-merchants,search-categories}.ts`; `src/lib/fallback/fallback-run.ts`; `src/lib/merchants/scoring.ts`; `src/lib/qloo/{client,insights,search,tags}.ts`; `tests/fixtures/page-harness.ts`; `tests/unit/{find-merchants,pitch,qloo-client,qloo-search,run-agent,run-route,search-categories,types,page-races,pitch-fallback-integration,qloo-envelopes,run-recovery}.test.ts`。
- 问题验证证据：
  1. 运行故障缓存：`run-recovery.test.ts` 验证了 error/done、保留之前的密度、不清空缓存即可用相同请求恢复、健康结果回放时不新增限额检查/查询、部分网点/偏好/基线失败、类别缺失、连锁检查失败、真正成功的空结果，以及旧封装替换。
  2. 地图/请求竞态：`page-races.test.ts` 验证了选点已启用时的 Confirm 和 Retry、捕获的旧地图回调、迟到的规划成功/失败、迟到的运行结果/错误/拒绝、较新的请求和组件卸载。真实浏览器中的 Confirm 用例也通过。
  3. 基线失败：`find-merchants.test.ts` 断言生成短名单/话术之前，基线排名/排名提升为 null、评分为 0.32，同时保留偏好信号、不生成密度，也不因误判商户稀少而替换类别；`run-recovery.test.ts` 覆盖了两个方向的部分失败。
  4. Qloo 响应封装：`qloo-envelopes.test.ts` 验证品牌、类别、地点和地区从格式错误恢复为正常结果的过程及缓存；覆盖有效空响应、可选元数据和旧值。现有规范化测试仍然通过。
  5. 话术失败：`pitch-fallback-integration.test.ts` 使用真实话术生成器，按脚本模拟服务提供方和结构化输出失败；断言保留有依据的模板、返回脱敏的兜底模式/事件/警告、不缓存运行结果，并保留独立的普通防护拒绝路径。
  6. 坐标：`types.test.ts` 覆盖可接受的极限边界，以及拒绝缺失/越界字段；`run-route.test.ts` 验证在缓存/限额/调研之前拒绝；`run-agent.test.ts` 验证直接调用在查询或执行跟踪之前被拒绝。
  7. README：Run locally 现已说明重启后内存状态丢失、serverless 实例之间不共享状态，以及用于共享缓存/限流的两个 Upstash 环境变量名称。
- 验证方法：
  ```bash
  npm run lint && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run typecheck
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' npm run smoke
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1
  ```
  浏览器：Denver demo → Plan → Pick on map → Confirm → 在调研运行期间点击地图。选点关闭，资料控件保持禁用，坐标保持不变，结果正常返回。
- 验证结果：PASS：44 个文件中的 467 项离线测试、lint、生产构建、覆盖 142 个文件的 check:rules、typecheck，以及 `git diff --check` 均通过。最初的 lint 发现自定义 hook 的一个 ref 名称无法被 React 识别；已重命名为 `versionRef`。下一轮完整验证在构建时发现一处测试表格元组类型错误；已将表格改为命名用例。第三轮完整验证中所有要求的命令均通过。未更改 lint/检查器保护措施或依赖。
- 实际检查：在当前进程禁用 Redis 的情况下，两条冒烟命令均以退出码 0 结束。Agent 规划：8 个已解析/0 个未解析，6 个类别，22 次 Qloo 调用，16,090 ms；调研前 5 个类别，10 家商户/10 条 agent 话术，40 次 Qloo 调用，16,844 ms；重复规划耗时 11,850 ms，13 次缓存命中。强制兜底：8 个已解析/0 个未解析，4 个类别，12 次 Qloo 调用，4,154 ms；10 家商户/10 条模板话术，34 次 Qloo 调用，15,189 ms；重复规划耗时 16 ms，12 次缓存命中。SDK 固定的 JSON-schema 兼容性警告仍存在。未写入响应数据文件。
- 浏览器检查：使用新的本地 Denver 规划，启用 LoDo 地图选点，点击 Confirm，并在运行期间点击地图。选点状态变为关闭，资料保持锁定，三个原始演示坐标均未改变，出现 10 条 Agent 模式结果。截图位于仓库外的 `/Users/dengziyi/.codex/visualizations/2026/10/23/01a168ff-e98b-77b1-823d-994829e56b2a/perk-desk-repair-check.png`。Retry 和过期请求失败竞态通过离线验证，未人为制造真实服务提供方故障。之后已停止开发服务器。
- 缓存恢复：未重命名键、访问 Redis、清空缓存或配置资源。旧运行封装、裸密度数值（零或正数），以及未标记的 Qloo 精简值，均被拒绝并视为缓存未命中。正常查询会以带验证元数据的新值覆盖相同键；失败时保留现有条目，且不缓存失败，因此下一次请求可以恢复。这也会有意刷新原先健康的旧条目，代价是第一次需要真实请求并进行正常限额检查。现有规划缓存值和限流键不变；旧规划内的历史密度提示正常过期，新调研不会将其作为完整性证据。共享存储迁移通过相同缓存 API、仅使用内存进行测试，未使用真实 Redis 服务。
- 未解决问题 / 决定：七项问题均有本地回归验证证据。稳定提交后仍待协调者独立复查。T1 的 shadcn 组件仓库缺口和 T10 的原生电子表格打开缺口仍为 PARTIAL。未修改或重跑提示词调整；T11 仍只使用了一轮调整。兜底对歧义 REI 选择最高热度候选项，仍是已记录的既有相关性限制。架构/缓存结构差异已记录在上文“我做出的决定”中。
- 新增依赖：无。未执行远程仓库/部署/资源操作。原有的 `.env.example` 删除仍被排除。只读辅助评审已完成；所有修复编辑均由主 agent 执行。
- 需要 Devin 处理：现有“等待 Devin 处理”列表仍适用；恢复旧缓存无需新增基础设施操作。
