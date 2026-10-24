# Perk Desk：任务 T1–T12（及可选扩展）

遵循 `AGENTS.md` §2 中的执行流程，**按顺序**完成这些任务。每个任务都列出了：目标、先读内容、文件、步骤、验收标准和验证方式。“标准检查”始终指：

```bash
npm run lint && npm test && npm run build && npm run check:rules
```

网络：T1 需要运行 `npm install`。仅在任务明确写出“真实 API 检查（可选）”的地方调用真实 Qloo/DeepSeek API；这些调用需要 `.env.local`。如果缺少 `.env.local` 或调用失败，将情况写入 PROGRESS，然后继续。单元测试绝不访问网络（用 vitest 模拟 `fetch` / 模块）。

时间预算参考（全部运行约需 8–10 小时）：T1 40 分钟 · T2 30 · T3 60 · T4 50 · T5 60 · T6 60 · T7 70 · T8 50 · T9 40 · T10 60 · T11 30 · T12 30。

---

## T1：项目脚手架、lint 规则、测试运行器

**目标：**在此仓库中配置一个 Next.js 16 应用，强制执行可读性规则，并提供 `env.ts`、`config.ts` 以及测试/检查脚本。不包含产品逻辑。

**先读：**AGENTS.md（全文）、ARCHITECTURE §2、§9、§10、§13。

**文件：**create-next-app 的输出（`package.json`、`tsconfig.json`、`next.config.ts`、`eslint.config.mjs`、`postcss.config.mjs`、`src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css`、`public/*`）；shadcn（`components.json`、`src/components/ui/*`、`src/lib/utils.ts`）；`vitest.config.ts`；`vitest.eval.config.ts`；`src/lib/env.ts`；`src/lib/config.ts`；`tests/unit/env.test.ts`；`tests/unit/config.test.ts`。`scripts/check-rules.mjs` **已经存在**（在文档提交中加入）：不得放宽它的检查；应修复代码，而不是检查器（允许修复检查器的 bug，但须在 PROGRESS 中说明）。

**步骤：**
1. 在临时目录中生成脚手架（create-next-app 不接受非空目录），再复制到仓库中，不覆盖已有文件：
   ```bash
   TMP=$(mktemp -d)
   npx create-next-app@16.4.2 "$TMP/app" --ts --tailwind --eslint --app --src-dir \
     --import-alias "@/*" --use-npm --no-agents-md --no-agent-feedback --disable-git --yes --skip-install
   rm -f "$TMP/app/README.md" "$TMP/app/.gitignore" "$TMP/app/AGENTS.md" "$TMP/app/CLAUDE.md" "$TMP/app/LICENSE"
   cp -R "$TMP/app/." . && rm -rf "$TMP"
   npm install
   ```
   如果 CLI 不接受某个参数，只移除该参数，并记录下来。
2. 依赖（先检查 `npm view react-leaflet@5 peerDependencies`；参见 ARCHITECTURE §9）：
   ```bash
   npm install ai@^7 @ai-sdk/deepseek@^3 zod@^4 @upstash/redis@^1 @upstash/ratelimit@^2 leaflet@^1.9 react-leaflet@^5
   npm install -D tsx@^4 vitest@^4 @types/leaflet@^1.9
   ```
3. shadcn（非交互模式）：
   ```bash
   npx shadcn@4.22.1 init -d -y
   npx shadcn@4.22.1 add button card input label textarea badge separator select switch skeleton -y
   ```
   为生成的 `src/lib/utils.ts` 添加两行文件头注释（该文件不在豁免范围内）。
4. `package.json`：添加 `"engines": { "node": ">=20.9" }`；将 `"scripts"` 严格设置为：
   ```json
   {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint",
     "test": "vitest run",
     "typecheck": "next typegen && tsc --noEmit",
     "check:rules": "node scripts/check-rules.mjs",
     "eval": "vitest run --config vitest.eval.config.ts",
     "smoke": "tsx --env-file=.env.local scripts/smoke.ts"
   }
   ```
5. `vitest.config.ts`：
   ```ts
   // Vitest config for unit tests (no network, no keys).
   // Called by: npm test
   import path from "node:path";
   import { defineConfig } from "vitest/config";
   export default defineConfig({
     resolve: { alias: { "@": path.resolve(__dirname, "src") } },
     test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
   });
   ```
   `vitest.eval.config.ts`：使用相同的别名；设置 `include: ["tests/eval/**/*.test.ts"]`、`testTimeout: 180000`、`fileParallelism: false`；在 `defineConfig` 之前加载密钥，**但不得打印密钥**：
   ```ts
   import { existsSync } from "node:fs";
   // WHY: eval needs real keys from .env.local; Node ≥ 20.12 has process.loadEnvFile.
   if (existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");
   ```
6. `eslint.config.mjs`：保留生成的配置；在导出的数组中追加以下配置块（放在 Next 预设之后），并将 `"src/components/ui/**"` 加入全局忽略项：
   ```js
   {
     files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
     rules: {
       "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
       "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true }],
       "max-depth": ["error", 3],
       "@typescript-eslint/no-explicit-any": "error",
       "@typescript-eslint/explicit-module-boundary-types": "error",
       "no-restricted-syntax": ["error",
         { selector: "ClassDeclaration", message: "No classes (AGENTS.md §5.7). Use plain functions." },
         { selector: "TSConditionalType", message: "No conditional types (AGENTS.md §5.5)." }],
     },
   },
   {
     files: ["src/components/**/*.tsx", "src/app/page.tsx"],
     rules: { "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }] },
   },
   {
     files: ["tests/**/*.ts"],
     rules: { "max-lines-per-function": "off" },
   },
   {
     files: ["src/components/**/*.tsx", "src/app/page.tsx", "src/lib/profile-storage.ts", "src/lib/run-client.ts",
             "src/lib/request-builders.ts", "src/lib/csv.ts"],
     rules: { "no-restricted-imports": ["error", { patterns: [{
       group: ["@/lib/env", "@/lib/qloo/*", "@/lib/agent/*", "@/lib/store/*", "@/lib/fallback/*", "@/lib/merchants/*"],
       message: "Client code must not import server code (ARCHITECTURE §2)." }] }] },
   },
   ```
   （`tests/**` 关闭函数长度限制，因为 `describe` 块较长；文件最多 200 行的限制仍然适用。）如果 Next 预设未注册 `@typescript-eslint` 规则，则导入 `typescript-eslint`（预设已安装此依赖）并注册它；记录所做的操作。
7. `next.config.ts`：保留生成时的内容（`cacheComponents: true`）。不要添加路由段配置（AGENTS.md §6）。
8. `src/lib/env.ts`：`getEnv(): AppEnv` 使用 zod 解析 `process.env`，只解析一次并缓存，**绝不在导入时抛出异常**；所有值都是可选字符串；导出 `getEnv`、`hasQlooKey()`、`hasDeepSeekKey()`、`hasUpstash()`、`isAgentDisabled()`（判断 `PD_AGENT_DISABLED === "1"`）。变量：`QLOO_API_KEY`、`QLOO_BASE_URL`（默认 `QLOO_BASE_URL_DEFAULT`）、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`（默认 `"deepseek-flash"`）、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`JUDGE_BYPASS_CODE`、`PD_AGENT_DISABLED`。导出用于清除缓存的 `resetEnvForTests()`。
9. `src/lib/config.ts`：包含 ARCHITECTURE §10 中的所有常量（名称和值必须完全一致），允许使用 `as const` 对象。
10. `src/app/layout.tsx`：标题为 "Perk Desk"，描述使用一句话介绍（PRD §1），页脚文字来自 ARCHITECTURE §12。`src/app/page.tsx`：占位标题 "Perk Desk" + 一句话介绍（在 T8 中替换）。添加两行文件头注释（如有指令，则先写指令）。
11. 测试：`env.test.ts`（使用 `vi.stubEnv` / `vi.unstubAllEnvs`，然后调用 `resetEnvForTests()`）：缺少密钥 → `hasQlooKey() === false`，默认值生效，能识别 `PD_AGENT_DISABLED=1`。`config.test.ts`：评分权重之和为 1；`PLAN_MIN_CATEGORIES <= PLAN_MAX_CATEGORIES`。

**验收标准：**标准检查通过；`npm run typecheck` 通过；`git status --porcelain` 中不出现 `.env.local`、`.next/`、`node_modules/`；`README.md`、`.env.example`、`LICENSE`、`docs/*`（PROGRESS 除外）保持不变。

**验证：**标准检查；`npm run typecheck`；`npx eslint --print-config src/lib/config.ts | grep -c max-lines-per-function` 的结果 ≥ 1。

---

## T2：类型与数据加载

**目标：**在 `src/lib/types.ts` 中定义全部 zod schema，对 `src/data/*.json` 的访问进行校验，并提供规范化哈希计算。

**先读：**ARCHITECTURE §3、§7（缓存键）、§14；`src/data/` 中的 JSON 文件。

**文件：**`src/lib/types.ts`、`src/lib/data.ts`、`src/lib/hash.ts`、`tests/unit/types.test.ts`、`tests/unit/data.test.ts`、`tests/unit/hash.test.ts`、`tests/fixtures/fake-plan.ts`（手写的虚构对象，供后续复用）。

**步骤：**
1. 按照 ARCHITECTURE §3 编写所有 schema，名称必须完全一致，并添加 `PresetSchema` 和 `CityListSchema`（§3 末尾）。为每个 schema 导出 `type X = z.infer<typeof XSchema>`。如果 `types.ts` 将超过 200 行，则将共享/plan/run schema 保留在该文件中，仅将 `TraceEventSchema` + `ErrorCodeSchema` + `StepIdSchema` 移至 `src/lib/trace-types.ts`（这是唯一允许的拆分方式；从 `types.ts` 重新导出）。
2. `data.ts`：导入 JSON 文件（`import categoryDefaults from "@/data/category-defaults.json"`），使用在 `data.ts` 中定义的 zod schema（`CategoryDefaultsSchema`、`BlacklistSchema`、`NationalChainsSchema`；忽略 `_comment`）分别校验一次，并导出：`getCategoryDefaults()`、`getCategoryLabel(tagId): string`（找不到时将 slug 转为各单词首字母大写的文本）、`getBlacklist()`、`getNationalChainNames(): string[]`、`getPresets(): Preset[]`、`findPreset(id): Preset | null`、`getCities()`。显式导入预设（`denver-demo.json`、`austin-demo.json`）；不读取文件系统（以便在 Vercel 上运行）。
3. `hash.ts`：`canonicalJson(value: unknown): string`（递归排序对象键，保留数组顺序）、`sha256Hex(text): string`（使用 `node:crypto`）、`cacheKey(kind, value): string` → `pd:v1:<kind>:<sha256(canonicalJson(value))>`；`citySlug(city)`（ARCHITECTURE §7）。`hash.ts` 仅用于服务端；允许导入 `node:crypto`。
4. 测试：每个 schema 接受一个有效的虚构对象，并拒绝至少 2 个无效对象（错误的标签 ID、6 个网点、0 个品牌、半径 500）；`TraceEventSchema` 能解析每种事件类型；数据文件能通过解析；每个 `quickSegments[].categories` ID 和每个 `adjacent` ID 都存在于 `categories` 中；每个预设能通过解析，并包含 1–5 个带坐标的网点；`canonicalJson({b:1,a:{d:1,c:2}}) === canonicalJson({a:{c:2,d:1},b:1})`。

**验收标准：**标准检查通过。不修改 `src/data/*.json` 中的标签 ID。

**验证：**标准检查。

---

## T3：Qloo 层与缓存

**目标：**提供有类型、带缓存、控制调用间隔的 Qloo 函数，返回精简的数据结构。

**先读：**QLOO_API.md（全文）、ARCHITECTURE §5.5、§7、§11、§14。

**文件：**`src/lib/store/cache.ts`、`src/lib/qloo/client.ts`、`src/lib/qloo/search.ts`、`src/lib/qloo/tags.ts`、`src/lib/qloo/insights.ts`、`tests/fixtures/qloo-fake.ts`、`tests/unit/cache.test.ts`、`tests/unit/qloo-client.test.ts`、`tests/unit/qloo-search.test.ts`、`tests/unit/qloo-insights.test.ts`。

**步骤：**
1. 按 ARCHITECTURE §7 实现 `cache.ts`（`getJson`、`setJson`、`clearMemoryCacheForTests()`）。仅在两个环境变量都已设置时，延迟创建 Upstash 客户端。缓存失败（Upstash 不可用）时，只记录一次日志（不包含密钥），并按缓存未命中处理；绝不能因此导致请求失败。
2. `client.ts`：`qlooGet(path, params, options): Promise<unknown>` 使用 `URLSearchParams` 构造 URL（按键排序），发送 `X-Api-Key`，应用 `QLOO_TIMEOUT_MS`（`AbortSignal.timeout`），保证调用开始时间之间至少间隔 `QLOO_MIN_GAP_MS`（模块级时间戳；简单的 `await sleep`），收到 429 时重试一次，但当月剩余额度为 `0` 时不重试，并将错误映射为 `QlooError`（ARCHITECTURE §11，使用工厂函数 + 类型守卫，不使用 class）。`cachedQlooCall<T>(path, params, slim: (raw: unknown) => T, schema, options): Promise<T>` = 使用 `cacheKey("qloo", { path, params })` 查询缓存 → `qlooGet` → `slim` → `setJson(…, QLOO_CACHE_TTL_S)`；无论是否命中缓存，都调用 `options.onCall?.({ endpoint, summary, ms, cached })`。Agent 通过 `options.onCall` 发出 `qloo_call` 跟踪事件。缺少密钥 → 抛出代码为 `config` 的 `QlooError`。
3. `search.ts`：`searchBrands(name, options): Promise<BrandCandidate[]>`（使用 `BRAND_SEARCH_TAKE` 作为 take 值；将 `tag_id` 统一为 `TagRef.id`；应用 `filterAllowedBrandTags`）。`filterAllowedBrandTags(tags): TagRef[]`（先应用 QLOO_API §2 的合规规则，再按 ARCHITECTURE §5.5 排序并限制数量）。`searchBrandExact(name, options): Promise<BrandCandidate | null>`（take 为 1；用于连锁品牌检查）。
4. `tags.ts`：`searchPlaceCategories(query, options): Promise<CategoryTag[]>`；剔除不符合模式的 ID 和被列入黑名单的 slug（在此导出 `isBlacklistedCategory(tagId)`；第 1 层防护复用它）。
5. `insights.ts`：`findPlaces({ lat, lon, radiusMeters, tagId, brandIds }, options): Promise<Place[]>`（当 `brandIds.length > 0` 时执行带品牌种子的查询，并设置 `feature.explainability=true`；否则执行基线查询）；`resolveLocality(query, options): Promise<{ name: string; lat: number; lon: number } | null>`；`slimPlace(raw): Place | null`（跳过缺少名称/ID/位置的实体）；`formatHours(hours): string | undefined`。
6. 测试夹具：手写虚构的原始响应（每份 2–4 个实体，使用虚构名称，ID 为 `00000000-0000-4000-8000-0000000000NN`），结构与 QLOO_API §2–§5 一致，包含一种人口统计标签类型、一个没有 tripadvisor 信息的地点、一个已关闭的地点。
7. 测试（用 `vi.stubGlobal` 模拟 `fetch`）：URL 包含 `filter.location=POINT(-104.99 39.75)`（经度在前）和 `filter.location.radius=6000`；带品牌种子的查询与基线查询参数；密钥只放在请求头中（断言 URL 字符串不包含假密钥）；人口统计标签被移除；401 → `auth`；429 后返回 200 → 只重试一次；429 且当月剩余额度为 0 → `quota`，不重试；第二次相同调用命中缓存（fetch 仅调用一次），并报告 `cached: true`；`slimPlace` 映射 QLOO_API §4.2 中的每个字段；`formatHours` 按星期几对营业时间进行分组。

**验收标准：**标准检查通过；测试中不调用真实 API。

**验证：**标准检查。真实 API 检查（可选，已提供密钥时）：`npx tsx --env-file=.env.local -e "import('./src/lib/qloo/search.ts').then(async m=>{const r=await m.searchBrands('REI',{});console.log(r.map(b=>b.name))})"` 最多打印 3 个名称（仅名称）。

---

## T4：商户过滤与评分（纯函数）

**目标：**实现确定性的步骤 ④ 和候选商户短名单，并用单元测试完整验证。

**先读：**ARCHITECTURE §6.2、§6.3（仅短名单部分）、PRD §4。

**文件：**`src/lib/merchants/name-match.ts`、`distance.ts`、`chains.ts`、`filter.ts`、`scoring.ts`、`shortlist.ts`；`tests/fixtures/fake-places.ts`；`tests/unit/name-match.test.ts`、`distance.test.ts`、`chains.test.ts`、`filter.test.ts`、`scoring.test.ts`、`shortlist.test.ts`。

**步骤：**
1. 严格按照 ARCHITECTURE §6.2 第 1–7 项和 §6.3 的短名单规则实现纯函数（输入 → 输出，无 I/O，不调用 `Date.now()`）。建议的 API（ARCHITECTURE §14）：`normalizeName`、`nameMatches`、`haversineMeters`、`isNationalChain`、`markDuplicateNames`、`filterPlaces`（返回 `{ kept, excludedCounts }`）、`mergeSeededAndBaseline`、`scoreCandidates`、`computeBrandShares`、`assignNearestBranch`、`countIndependents`、`buildShortlist`。
2. 使用虚构数据进行测试，至少涵盖：`normalizeName("The Bike & Run Co.") === "bike and run"`；"Sweet Fake Ice Cream" 能匹配 "sweet fake ice cream llc"；"Cafe" **不能**匹配 "Cafe Fake Corner"（较短的名称少于 5 个字符）；用 haversine 计算 Denver↔Austin 的距离约为 1240 km ± 15；"Starbucks Reserve" 属于全国连锁，"Starbuck Lane Books" 不属于（单词边界）；缺少基线时，rankLift 使用 `baselineLength + 1`；仅出现在基线中的地点具有 `tasteSignal: false`，并排在有偏好信号的地点之后；品牌占比之和为 100；同分时按名称排序；有 3 个网点 × 2 个类别时，短名单共 10 个，在数量足够时每个网点至少分配 3 个，其中一个网点为空时从其他网点补足；丢弃距离超过半径 × 1.1 的地点；丢弃噪声类型并计数。

**验收标准：**标准检查通过；六个测试文件中合计至少 25 个断言。

**验证：**标准检查；`npx vitest run tests/unit/scoring.test.ts tests/unit/shortlist.test.ts`。

---

## T5：Agent 工具与第 1–2 层防护

**目标：**实现三个工具、Agent 上下文类型、模型工厂和第 1–2 层防护，全部可在不联网的情况下测试。

**先读：**ARCHITECTURE §5.3、§5.4、§5.5、§6.1、§6.2、§14；AGENTS.md §6（AI SDK 注意事项）。

**文件：**`src/lib/agent/context.ts`、`src/lib/agent/model.ts`、`src/lib/agent/guards.ts`、`src/lib/agent/tools/resolve-brands.ts`、`src/lib/agent/tools/search-categories.ts`、`src/lib/agent/tools/find-merchants.ts`、`tests/unit/guards.test.ts`、`tests/unit/resolve-brands.test.ts`、`tests/unit/find-merchants.test.ts`。

**步骤：**
1. 先阅读已安装的 AI SDK 类型定义（`node_modules/ai/dist/index.d.ts`：`tool`、`generateText`、`isStepCount`、`StopCondition`、`LanguageModel`；`node_modules/ai/dist/test/index.d.ts`：`MockLanguageModelV4`）。将发现的内容（名称、与 AGENTS.md §6 的任何差异）写入 PROGRESS。
2. `context.ts`：`PlanContext`、`RunContext`、`CategoryOutcome`、`BrandResolution` 类型，以及 `createPlanContext(...)`、`createRunContext(...)`。
3. `model.ts`：`agentModel(): LanguageModel` 使用 `createDeepSeek({ apiKey })` 和 `getEnv().DEEPSEEK_MODEL`；`AGENT_CALL_SETTINGS` = `{ temperature: 0, maxRetries: 1, providerOptions: { deepseek: { thinking: { type: "disabled" } } } }`。
4. 工具：每个文件导出一个执行实际工作的普通函数（供回退逻辑和测试使用），**以及**用 `tool({ description, inputSchema, execute })` 包装该函数的 `buildXTool(context)`。工具的 `execute` 绝不向模型抛出异常：它捕获错误并返回 `{ error: string }`（但 `QlooError` 的 `auth`/`quota`/`config` 错误除外，这些错误会被重新抛出以结束请求）。每个工具都会发出带简短摘要的 `tool_call` 和 `tool_result` 跟踪事件。
   - `resolve-brands.ts`：`matchBrand(inputName, candidates): { status, chosen?, matchKind? }`（纯函数）+ `resolveBrandNames(names, context)`。
   - `search-categories.ts`：`searchCategoriesForContext(query, context)`；将结果添加到 `context.candidateCategories`；附加密度缓存中的 `knownIndependents` 和 `usableInDemoCities`。
   - `find-merchants.ts`：`findMerchantsForCategory({ tagId, replacesTagId }, context)`：每个网点调用 2 次（带品牌种子的查询 + 基线查询），使用 T4 函数，存储 `CategoryOutcome`，写入密度缓存，并执行仅允许替换一次的规则（ARCHITECTURE §6.1）。某个网点的一次调用失败 → 发出警告，继续执行。
5. `guards.ts`：`checkCategoryCandidate`、`checkEvidence`、`applyPlanGuards(submission, context): { kept: PlannedCategory[]; errors: string[] }`（第 1–2 层、去重、数量上限、品牌选择规则）。`checkPitch` 在 T7 中添加。
6. 测试（用 `vi.mock` 模拟 `@/lib/qloo/*`）：`matchBrand("REI", [Recreational Equipment Inc, Real Madrid CF, Reiss])` → ambiguous；`matchBrand("Ulta Beauty", [Ulta])` → prefix；`matchBrand("Sierra Nevada", [Sierra Nevada Brewing Co.])` → prefix；第 1 层拒绝未由 `searchCategories` 返回的 ID、格式错误的 ID 和黑名单中的 slug（`..._school`）；第 2 层拒绝不在该品牌允许标签中的 `brandTagId` 和人口统计标签；只有无效依据的类别被丢弃；允许替换一次，第二次替换被拒绝；`findMerchantsForCategory` 发出 2 × 网点数次调用，并返回独立商户数量。

**验收标准：**标准检查通过。

**验证：**标准检查；`npx vitest run tests/unit/guards.test.ts`。

---

## T6：带 Agent 和回退逻辑的 `/api/plan`

**目标：**端到端完成步骤 ① ②：位置解析、带防护的规划 Agent 循环、回退规划、规划缓存、JSON 路由。

**先读：**ARCHITECTURE §4.1、§5（全部）、§7（仅缓存）、§8（fallback-plan、category-map）、§11；PRD §5。

**文件：**`src/lib/agent/prompts.ts`、`src/lib/agent/plan-agent.ts`、`src/lib/fallback/category-map.ts`、`src/lib/fallback/fallback-plan.ts`、`src/app/api/plan/route.ts`、`tests/unit/category-map.test.ts`、`tests/unit/plan-agent.test.ts`、`tests/unit/plan-route.test.ts`。

**步骤：**
1. `prompts.ts`：`PLAN_SYSTEM_PROMPT`、`buildPlanUserPrompt(context)`、`RUN_SYSTEM_PROMPT`、`buildRunUserPrompt(context)`、`PITCH_SYSTEM_PROMPT`、`buildPitchPrompt(input)`（ARCHITECTURE §5.6、§6.1、§6.3）。使用普通模板字符串；不包含人口统计信息。
2. `plan-agent.ts`：`runPlan(request, options): Promise<PlanResponse>`：展开预设（如果有 `presetId`）、解析位置（§5.1），然后执行 Agent 循环（§5.2），但 `!hasDeepSeekKey() || isAgentDisabled()` 时跳过；完成防护处理；Agent 发生任何失败时使用回退逻辑（§8 中的触发条件）；收集跟踪事件（`options.emit` 可选；事件也在 `trace` 中返回）。`options.model` 可覆盖模型（用于测试）。
3. 按 ARCHITECTURE §8 实现 `category-map.ts` + `fallback-plan.ts`。
4. `route.ts`：校验 →（限流在 T7 中添加；保留一行 `// T7: rate limit here` 注释）→ 规划缓存（`cacheKey("plan", request)`、`RESULT_TTL_S`；仅缓存至少包含 1 个类别的响应）→ `runPlan` → JSON。按 §4.1/§11 映射错误。导出 `export const maxDuration = 300;`，除此之外只导出 `POST`。
5. 测试：将 `MockLanguageModelV4` 设置为按脚本依次调用 `resolveBrands` → `searchCategories` → `submitPlan`（提交一个有效类别 + 一个无效类别），并模拟 Qloo → 规划包含有效类别、一个 `guard` 事件和 `mode: "agent"`；模型抛出异常 → `mode: "fallback"`，并带有规则依据（`reason` 以 `"Rule:"` 开头）；`category-map.ts` 中的每个目标都存在于 `category-defaults.json` 中；路由：无效请求体 → 400；缺少 Qloo 密钥 → 503 `config`；预设 ID 会加载预设品牌。

**验收标准：**标准检查通过；测试中的规划路由返回符合 `PlanResponse` 的 JSON。

**验证：**标准检查。真实 API 检查（可选）：在后台运行 `npm run dev`，然后执行
`curl -s -X POST localhost:3000/api/plan -H 'content-type: application/json' -d '{"presetId":"denver-demo","institutionName":"x","city":"Denver, CO","branches":[{"id":"a","name":"a","address":"","radiusMeters":6000}],"brandNames":["x"]}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.mode,j.categories.map(c=>c.label),j.unresolved)})"`；完成后停止服务器。

---

## T7：`/api/run` 流式输出、合作推荐语、回退逻辑与限流

**目标：**将步骤 ③–⑥ 以 NDJSON 流式输出，包含推荐语防护、回退运行、结果缓存 + 重放，以及两个路由的限流。

**先读：**ARCHITECTURE §4.2、§4.3、§6（全部）、§7、§8（fallback-run、pitch-template）、§11。

**文件：**`src/lib/stream.ts`、`src/lib/agent/run-agent.ts`、`src/lib/agent/pitch-writer.ts`、`src/lib/agent/guards.ts`（添加 `checkPitch`）、`src/lib/fallback/pitch-template.ts`、`src/lib/fallback/fallback-run.ts`、`src/lib/store/rate-limit.ts`、`src/app/api/run/route.ts`、`src/app/api/plan/route.ts`（添加限流）、`tests/unit/stream.test.ts`、`pitch.test.ts`、`rate-limit.test.ts`、`run-agent.test.ts`、`run-route.test.ts`。

**步骤：**
1. 按 §4.2 实现 `stream.ts`（始终以 `done` 结束；由 `emit` 填写 `at`）。
2. `run-agent.ts`：`runResearch(request, emit, options): Promise<RunResult>`：执行 Agent 循环（§6.1）或回退逻辑、确定性补全、短名单 + 品牌检查 + 合作推荐语（§6.3），并为全部六个步骤发出 `step` 事件。
3. `pitch-writer.ts` + `checkPitch` + `pitch-template.ts`（§6.3、§8）。模板输出本身必须通过 `checkPitch`（需要测试）。
4. `rate-limit.ts`（§7），包含 `getClientIp(request)`（AGENTS.md §6）和 `hasJudgeBypass(request)`。
5. 路由：限流 + 缓存顺序严格遵循 §7；`/api/run` 缓存保存已发出的事件（不包括 `done`），并重放这些事件。
6. 测试：NDJSON 的每一行都能解析，并以 `done` 结束；抛出异常 → `error` + `done`；`checkPitch` 拒绝编造的数字（"20% off"）、含 4 句话的推荐语，以及不包含商户名称的推荐语；接受模板生成的推荐语；限流允许前 20 次，然后阻止后续请求（内存实现），预设跳过按 IP 的限制，评委请求头跳过所有限制，缓存命中不计数；运行路由在模拟 Qloo + `PD_AGENT_DISABLED=1` 时流式输出 `step`… `result`，商户数量 ≤ 10；超出限制 → `limited` + `done`（HTTP 200）。

**验收标准：**标准检查通过。

**验证：**标准检查。真实 API 检查（可选）：运行 `npm run dev`，将 denver 预设 POST 到 `/api/plan`，然后使用 `curl -N` 将返回的品牌/类别（最多 5 个）和预设网点发送到 `/api/run`，并按 `type` 统计行数（只打印数量和商户名称）。

---

## T8：界面第 1 部分：资料、预设、偏好输入、基础地图

**目标：**实现页面的前半部分：预设选择器、项目资料（持久化）、支持地图选点的网点编辑器、带快捷分组的偏好输入，以及调用 `/api/plan` 的 Plan 按钮。

**先读：**PRD §2（步骤 1–2）、ARCHITECTURE §4.3、§12；AGENTS.md §5 规则 8 和 §6（Leaflet）。

**文件：**`src/app/page.tsx`、`src/components/PresetPicker.tsx`、`ProfileForm.tsx`、`BranchEditor.tsx`、`TasteInput.tsx`、`MerchantMap.tsx`（基础版本）、`src/lib/profile-storage.ts`、`src/lib/request-builders.ts`、`src/lib/run-client.ts`（本任务实现 `postPlan`；T9 实现 `streamRun`）、`tests/unit/profile-storage.test.ts`、`tests/unit/request-builders.test.ts`。

**步骤：**
1. `profile-storage.ts`：`loadProfile(): Profile | null`、`saveProfile(profile)`、`loadJudgeCode()`、`saveJudgeCode()`；键为 `perkdesk:v1:profile`、`perkdesk:v1:judge`；在 `window` 未定义时也能安全运行；无效 JSON → null。
2. `request-builders.ts`：`parseListText(text): string[]`（仅按换行拆分，不按逗号拆分，因为商店名称可能包含逗号；去除首尾空白；丢弃空项；忽略大小写去重并保留首次出现的拼写；最多 500 项）、`buildPlanRequest(profile, brandsText, presetId?)`、`buildRunRequest(profile, plan, confirmedCategories, brandOverrides, presetId?)`（`excludeEntityIds` 来自 `merchantStatus` 中状态为 signed/not_a_fit 的商户）。
3. 组件（使用 shadcn `Card`、`Input`、`Textarea`、`Button`、`Select`、`Badge`）：
   - `PresetPicker`：两个按钮（"Try Denver demo"、"Try Austin demo"）；填充资料 + 品牌文本；保留 `presetId`，直到用户编辑任意字段（此时将 `presetId` 设为 undefined）。
   - `ProfileForm`：机构名称；城市选择（cities.json）+ 自由输入 "Other city (City, ST)"；已签约商户粘贴框；渲染 `BranchEditor`（1–5 个网点：名称、地址、半径 km 滑块/输入框 1–20，"Pick on map" 切换地图选点模式；显示坐标及来源）。
   - `TasteInput`：品牌粘贴框（每行一个，1–10 个），六个快捷分组按钮，用分组的 `seedBrands` 替换输入框内容（内容可见且可编辑），提示文字 "Aggregated brand names only"。
   - `MerchantMap`（基础版本）：props 遵循 ARCHITECTURE §12；OSM 瓦片；城市中心；网点 `CircleMarker` + 半径 `Circle`；点击时调用 `onPickLocation`。在 `page.tsx` 中通过 `dynamic(() => import("@/components/MerchantMap"), { ssr: false })` 加载。
4. `page.tsx`：状态遵循 ARCHITECTURE §12；在填写名称、城市、至少 1 个网点和至少 1 个品牌之前，禁用 Plan 按钮；显示加载状态 "Planning…"，随后（临时）以 JSON 显示类别标签，直到 T9 替换。
5. 测试：`parseListText`（空行、重复项、CRLF）、`buildRunRequest` 的排除逻辑、`loadProfile` 处理损坏的数据（用一个小型内存对象模拟 `localStorage`）。

**验收标准：**标准检查通过；`npm run build` 不出现 SSR `window is not defined` 错误。

**验证：**标准检查；运行 `npm run dev`，打开 http://localhost:3000，点击 "Try Denver demo"：出现 3 个网点及圆形范围；刷新后保留资料。

---

## T9：类别确认（第 3–4 层防护）与 Agent 跟踪

**目标：**实现确认步骤，包括依据标签、品牌候选切换、偏好记忆，以及运行过程的实时跟踪。

**先读：**PRD §2 步骤 3–4、§5；ARCHITECTURE §4.3、§12。

**文件：**`src/components/CategoryConfirm.tsx`、`src/components/AgentTrace.tsx`、`src/lib/run-client.ts`（添加 `streamRun`）、`src/app/page.tsx`、`tests/unit/run-client.test.ts`、`tests/unit/preferences.test.ts`（测试从 `request-builders.ts` 导出的纯函数 `mergePreferences`）。

**步骤：**
1. `CategoryConfirm`：已识别品牌列表（名称、匹配类型；有歧义/回退匹配的品牌显示候选项 `Select`；更改候选项后显示 "Re-plan with this brand" → 携带 `brandOverrides` 再次调用 `/api/plan`）；用弱化文字显示未解析的名称；类别标签包含依据行 `Brand → tag name → category: reason`（回退产生的依据标为 "Rule"）；用 × 移除；"Add category" `Select`（规划候选项 ∪ 快选默认项，排除已选项）；最多确认 5 个类别（达到 5 个时禁用添加；如果规划返回 6 个，第 6 个初始为未选中）；显示警告；**Confirm & find merchants** 按钮。
2. 确认时：`mergePreferences(profile.categoryPreferences, planned, confirmed)`（ARCHITECTURE §12）→ 保存资料 → `streamRun`。
3. `AgentTrace`：按到达顺序显示事件列表：六个步骤行及状态图标（pending/running/done），并在运行中的步骤下显示最新的 `tool_call`/`qloo_call`/`guard`/`agent_note` 内容（最多显示 30 条，"N Qloo calls · cached M"）；`fallback` 显示黄色横幅 "Fallback mode: <reason>"；`limited` 显示限流消息 + 评委代码输入框；`error` 显示映射后的错误消息 + Retry。
4. 按 §4.3 实现 `streamRun`；用假的 `ReadableStream` 测试 JSON 行被拆分到多个数据块的情况。

**验收标准：**标准检查通过；在 Confirm 之前不启动商户搜索。

**验证：**标准检查；手动检查（已提供密钥时）：Denver demo → Plan → 编辑类别标签 → Confirm → 跟踪动态更新 → 收到结果 JSON（卡片在 T10 中实现）。

---

## T10：依据卡片、地图高亮、CSV 导出、跟进状态

**目标：**按 PRD §4 实现结果视图。

**先读：**PRD §2 步骤 4–5、§4；ARCHITECTURE §6.3（地图 URL）、§12。

**文件：**`src/components/MerchantCard.tsx`、`src/components/MerchantMap.tsx`（商户标记 + 高亮）、`src/components/ExportButton.tsx`、`src/lib/csv.ts`、`src/app/page.tsx`、`tests/unit/csv.test.ts`。

**步骤：**
1. 按网点对结果分组（网点名称 + 数量），显示每个类别的报告行（`ok` / `thin`："Few independent shops in this category near your branches" / `replaced`："Not enough local shops in X; tried Y"）、排除数量摘要、"Independents only" `Switch`（隐藏 `multiLocation`）、模式徽标（Agent / Fallback）。
2. `MerchantCard`：包含 PRD §4 的所有字段；缺失字段直接省略（绝不显示 "undefined"）；距离格式为 `x.x km from <branch>`；品牌占比；排名提升文字（`+N places vs. baseline`，负数时显示 `N places below baseline`，或显示 "category match (no taste signal)"）；评分；徽标；合作推荐语及 Copy 按钮（`navigator.clipboard.writeText`，显示 "Copied"）；状态 `Select` 写入 `profile.merchantStatus`；卡片 `id="merchant-<entityId>"`；悬停/点击 → `selectedMerchantId`。
3. `MerchantMap`：商户 `CircleMarker`（选中时更大 + 使用不同颜色），点击 → `onSelectMerchant` → 页面将卡片滚动到可见位置（`scrollIntoView({ behavior: "smooth", block: "center" })`）；获得结果后，根据网点 + 商户调整地图显示范围。
4. `csv.ts`：`toCsv(merchants, merchantStatus): string`，列及其顺序遵循 PRD §4（`status` 来自 `merchantStatus[entityId]`，默认 `to_contact`；布尔值使用 `yes`/`no`；`distance_km` 保留 1 位小数）；按 RFC 4180 规则加引号（包含 `"`、`,`、CR 或 LF 的字段用双引号包裹；字段内的双引号写成两个双引号）；以 `=`、`+`、`-`、`@` 开头的文本单元格在前面添加 `'`（防止电子表格公式注入），但排名提升值 `-3` 这样的数字单元格仍保留为数字。`ExportButton`：`Blob` + `URL.createObjectURL` → `perk-desk-<yyyy-mm-dd>.csv`。
5. 下次运行排除 `signed`/`not_a_fit`（`buildRunRequest` 中已实现）；在摘要中显示 "N merchants excluded by your follow-up status"。

**验收标准：**标准检查通过；CSV 测试覆盖引号处理、防注入前缀和列顺序。

**验证：**标准检查；手动检查：运行 Denver demo → 10 张卡片、地图标记、双向高亮、CSV 可在电子表格中打开，将一个商户标为 "Not a fit" 后重新运行，该商户被排除。

---

## T11：类别评估集

**目标：**使用真实密钥，以可重复的方式衡量类别选择质量。

**先读：**PRD §5（最后一行）、ARCHITECTURE §5。

**文件：**`tests/eval/cases.json`、`tests/eval/category-eval.test.ts`。

**步骤：**
1. `cases.json`：`{ "cases": [ { "id", "city", "brands": [...], "expectedAnyOf": [tag ids] } ] }`，必须包含以下 15 个案例（预期 slug → `urn:tag:category:place:<slug>`）：
   | id | city | brands | expectedAnyOf |
   |---|---|---|---|
   | coffee | Denver, CO | Starbucks, Blue Bottle Coffee | coffee_shop, cafe |
   | dessert | Austin, TX | Krispy Kreme, Starbucks | donut_shop, bakery, dessert_shop, coffee_shop |
   | craft-beer | Denver, CO | Sierra Nevada, New Belgium Brewing | brewery, beer_garden, bar |
   | aperitif | Austin, TX | Aperol | cocktail_bar, wine_bar, bar |
   | pets | Denver, CO | Chewy, BarkBox, Petco | pet_supply_store, pet_store, pet_groomer |
   | fitness | Austin, TX | Lululemon, Peloton, Nike | gym, sporting_goods_store |
   | outdoor | Denver, CO | REI, Patagonia, YETI | sporting_goods_store, bicycle_shop |
   | beauty | Austin, TX | Sephora, Ulta Beauty | nail_salon, day_spa, facial_spa, spa |
   | hair | Denver, CO | Aveda | hair_salon, barber_shop, day_spa |
   | healthy-dining | Austin, TX | Sweetgreen, Whole Foods Market | health_food_restaurant, juice_shop, cafe |
   | burgers | Denver, CO | Shake Shack | hamburger_restaurant, american_restaurant |
   | mexican | Austin, TX | Chipotle | mexican_restaurant, taco_restaurant |
   | western-wear | Austin, TX | Tecovas | clothing_store, mens_clothing_store, womens_clothing_store |
   | sneakers | Denver, CO | Allbirds, Nike | clothing_store, sporting_goods_store |
   | mixed-denver | Denver, CO | REI, Lululemon, Starbucks, New Belgium Brewing | sporting_goods_store, gym, coffee_shop, brewery |
   所有预期 ID 都存在于 `category-defaults.json`；在评估测试中添加一个断言来确认这一点，无需另加单元测试。
2. `category-eval.test.ts`：`describe.skipIf(!hasQlooKey() || !hasDeepSeekKey())`；对每个案例调用 `runPlan`（在预设城市中心设置一个网点，半径为 6000）；**命中（hit）** = 任意一个选中的类别属于 `expectedAnyOf`；**精确率（precision）** = 选中类别与预期类别的交集数量 / 选中类别数量；打印表格（`id, mode, picked labels, hit`）和汇总；`expect(hitRate).toBeGreaterThanOrEqual(0.5)`（参考目标为 0.8）。案例按顺序运行。
3. 如果已提供密钥，运行一次 `npm run eval`；在 PROGRESS 中记录命中率、精确率、回退次数和运行时长。如果低于 0.8，**仅允许**调整 `prompts.ts`（最多调整 2 轮），重新运行，并记录调整前后的结果。

**验收标准：**`npm test` 在没有密钥时仍能通过（评估测试不属于其中）；没有密钥时，`npm run eval` 报告跳过，而不是失败。

**验证：**标准检查；`npm run eval`。

---

## T12：冒烟测试脚本与最终 PROGRESS 总结

**目标：**用一条命令结合真实密钥验证整个流程，并准备好供次日早晨查看的总结。

**先读：**AGENTS.md §3、§4；ARCHITECTURE §14。

**文件：**`scripts/smoke.ts`、`docs/PROGRESS.md`、`README.md`（仅修改 "Status" 行，并添加 "Run locally" 部分）。

**步骤：**
1. `scripts/smoke.ts`（兼容 CJS：使用 `async function main()`；不使用顶层 await）：如果缺少 `QLOO_API_KEY` → 打印 "Missing QLOO_API_KEY in .env.local" 并执行 `process.exit(2)`（使用 `hasQlooKey()`；绝不打印变量值）。对 Denver 预设运行 `runPlan`，取前 ≤ 5 个类别，然后运行 `runResearch`，并用 `emit` 按类型统计事件。只打印：规划模式、已解析的品牌名称、未解析的名称、类别标签 + 依据中的品牌名称、每个类别的独立商户数量/状态、短名单商户的名称及所属网点和距离 km、推荐语来源数量、Qloo 调用次数、耗时。然后再次运行规划，打印是否变快（缓存）。成功时退出码为 0，失败时为 1（只打印错误代码 + 消息）。如果缺少 `DEEPSEEK_API_KEY`，仍然运行（使用回退逻辑），并说明这一情况。
2. 运行 `npm run smoke`；在 PROGRESS 中记录结果（数量和耗时；不包含响应体）。另运行 `PD_AGENT_DISABLED=1 npm run smoke`，并记录回退逻辑是否正常工作。
3. README：更新状态行，并添加 "Run locally"（Node ≥ 20.9、`npm install`、`cp .env.example .env.local`、填写密钥、`npm run dev`、`npm test`、`npm run smoke`）。保留合规说明行。
4. 在 PROGRESS 顶部添加最终总结：T1–T12 整体状态表、已能端到端工作的功能、已知问题、**Waiting for Devin** 列表（至少包括：推送到 GitHub、Vercel 项目 + 环境变量 + `maxDuration` 检查、可选的 Upstash 数据库、评委代码、在真实浏览器中检查界面），以及一份 **Review guide**：建议 Devin 阅读文件的顺序（例如 `types.ts` → `qloo/client.ts` → `merchants/scoring.ts` → `agent/guards.ts` → `agent/plan-agent.ts` → `api/run/route.ts` → `page.tsx`），每个文件用一行说明需要关注什么。

**验收标准：**标准检查通过；有密钥时冒烟测试以退出码 0 结束，缺少密钥时记录退出码 2。

**验证：**标准检查；`npm run smoke`。

---

## 可选扩展（仅在 T12 已提交后执行；遵循 PRD §9 的功能裁剪顺序；提交前缀为 `X<n>:`）

- **X1：通过 CSV/文本上传列表。**在 `ProfileForm` 和 `TasteInput` 中，为每个粘贴框添加一个 `<input type="file" accept=".csv,.txt">`；使用 `file.text()` 读取；取每一行的第一列（去除引号，跳过名称为 `name`/`merchant`/`brand` 的表头行），填入粘贴框（用户仍可查看/编辑）。不添加新依赖；在 `request-builders.ts` 中实现解析（`parseUploadedList`），并进行单元测试。
- **X2：企业会员匹配。**在 `ProfileForm` 中添加企业会员粘贴框（`ProfileSchema` 已有该字段），添加 `RunRequest.businessMemberNames`，在步骤 ④ 中使用 `nameMatches` 设置 `businessMember`，显示 "Already a business member" 徽标，不增加评分（仅展示徽标）。为匹配逻辑编写单元测试。

在 X2 完成之前，`businessMember` 始终为 `false`，企业会员输入框保持隐藏。
