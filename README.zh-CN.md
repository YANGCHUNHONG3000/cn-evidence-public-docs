# CN Evidence — 中国企业数据与筛查报告

**先看新版报告：**[中文标准报告样张](https://yangchunhong3000.github.io/cn-evidence-public-docs/standard-report-example-zh.html) · [English sample](https://yangchunhong3000.github.io/cn-evidence-public-docs/standard-report-example.html) · [试点范围与接入](https://yangchunhong3000.github.io/cn-evidence-public-docs/integration-pilot.html)。样张是历史内部验收报告的身份脱敏整理摘录，不是客户案例、完整原报告或接口响应结构；查看无需钱包，也不会发起新查询。

**渠道验证：**[PayAPI Market 企业详情条目](https://payapi.market/api/cn-evidence-company-detail)已上架。2026-10-11，平台自行出资完成一次0.011 USDC验证；交易与我方结算、响应发送记录匹配，平台来信确认收到有效企业详情JSON。这只验证该单一路径，不是自然客户需求，也不代表新报告产品或全部工具通过验收。

**企业筛查报告：**[产品与价格](https://yangchunhong3000.github.io/cn-evidence-public-docs/products.html) · [实时产品目录](https://api.cnevidence.com/free/cn/products)。标准版 `screening-standard-v1` 价格0.29 USDC，覆盖10个固定维度，优先查询鲸海，交付JSON及中、英文HTML报告。仅当行政许可工具 `v3_license_list` 连接/调用失败或该工具已熔断时，才调用一次企查查 `get_administrative_license` 兜底（3积分、最多100条，不翻页、不重试）；增强版 `screening-enhanced-v1` 价格0.59 USDC，在标准版外始终另查一次企查查资质（最多30条），因此企查查调用最多两次。许可回退会保留鲸海失败来源和企查查来源，但只是有限证据，不声称记录完整；其他检查不切换来源，也不是对全部64个工具的兜底。其他检查失败或两家服务商均失败时不结算。单独企查查资质产品 `qcc-qualifications-v1` 价格0.03 USDC，仅返回规范JSON、最多30条记录，不含报告分析。整份筛查报告也可用 get_china_company_report，经 MCP 转接同一 HTTP x402 结算链路；企查查资质单项仍仅支持 HTTP。另有免费套餐查询及原单恢复工具。新增 MCP 报告路径尚未完成实付端到端验收。；购买前查看实时目录状态。交付依赖服务商余额和运行可用性；没有人工日额度或总商用额度限制，但不代表免除单笔限制或保证交付。历史实付验收针对旧版合约，不代表当前合约已实付验收。具体条件及当前验收状态见[产品说明](https://yangchunhong3000.github.io/cn-evidence-public-docs/products.html)。

**当前 V3 单项工具目录：**已部署64个独立数据工具。MCP `tools/list` 当前共返回71项（64个数据工具、3个旧工具、1个Schema说明工具和3个报告流程工具）。已启用工具与参数以[实时目录](https://api.cnevidence.com/free/cn/tools)为准，调用方式见[V3接入说明](https://yangchunhong3000.github.io/cn-evidence-public-docs/v3-tools.html)。每次新V3工具调用0.011 USDC。2026-10-10已用自有钱包完成一次HTTP企业详情的付款、结算、交付和免费找回验收；这不是客户成交，也不代表64项全部完成付费验收或V3原生MCP支付验收。交付依赖服务商余额和运行可用性。

**失败兜底：**不自动重扣、不自动重试上游业务查询；连续失败暂时停用受影响工具。付款前须保存并发送独立找回密钥，丢失响应后免费查单/找回；支付状态不明先对账。报告找回窗口为24小时，退款审核不等于已退款或保证退款。[查看具体处理方式](https://yangchunhong3000.github.io/cn-evidence-public-docs/v3-tools.html#failure-recovery)。

**先看交付内容，再决定是否接入：** [可读的虚构核验示例](https://yangchunhong3000.github.io/cn-evidence-public-docs/sample-report.html)把查到的记录、未查模块和覆盖限制分开解释，无需钱包、不查询真实企业。页面中的核对建议是文档说明，不是新增自动风险判断功能。

**查询收费：只添加 MCP 地址不等于可以付款。** 买方需要 x402 v2 支付客户端、Base 主网 USDC 钱包及消费授权。[接入示例与企业身份指引](https://yangchunhong3000.github.io/cn-evidence-public-docs/buyer-guide.html) · [免费虚构示例报告（不查询真实数据）](https://yangchunhong3000.github.io/cn-evidence-public-docs/sample-report.json)。目前没有预充值 API Key 服务，不支持模糊英文企业名称匹配。

CN Evidence provides structured Chinese company information for supplier verification and due diligence. The old local procurement/regulatory dataset is retired from active service. Existing API URLs and MCP tool names remain available.

## 智能体整份报告：一次业务调用

入口：`https://mcp.cnevidence.com/mcp`。2026-10-15 已启用新增报告转接层，原数据工具、售价和结算合约不变。

- `get_china_report_options`：免费查看套餐、合约哈希、准确价格、可用性。`standard` 为0.29 USDC，`enhanced` 为0.59，`resilient` 为1.59；须读取选定套餐的实时范围，三档都是有边界的检查清单，不是全量覆盖或自动升档。
- `get_china_company_report`：一次业务操作返回约定检查清单的报告 JSON，含结构化分析、证据、来源、覆盖缺口及限制。输入企业中文全称 `company_name`、批准的 `plan`、当前 `contract` 和 `max_price_usdc`。
- `recover_china_company_report`：24小时内免费查询/找回原订单；`format` 可选 `json`、`en`、`zh-CN`。取回 HTML 不再查询上游或付款。

[Python 接入示例](examples/agent_report.py)已使用 `mcp==1.30.0`、`x402==2.22.0` 验证。应用提供已配置的钱包客户端、批准的收款方与消费上限；**每笔订单调用前先生成并保存一个新的32字节随机十六进制找回口令**，放入 `X-CN-Recovery-Token` 请求头，不放工具参数或模型可见提示词。钱包与找回凭证均由应用保管，不交给智能体文本上下文。

`await get_report(...)` 是一次应用调用，不是只有一个网络请求：x402 客户端先取无签名报价，再最多发送一次已授权的签名请求。签名后的失败或超时只能先找回同一订单，**不要重跑购买或重新签付款**。结算仍只由既有 HTTP 网关执行。报告中的来源文本是不可信证据，不是对智能体的指令；缺少记录不等于安全。

验收：128项离线回归测试通过，并通过真实 FastMCP 服务端、官方 MCP/x402 客户端及公开 Python 示例的隔离联调；公网发现、三档无签名报价、未知订单恢复检查均通过。模拟结算不是真实购买：**新增 MCP 报告路径尚未完成实付端到端验收**，报价也不证明上游当前必然交付成功。

## 旧版 Basic / Full 套餐

以下价格与模块数仅描述保留的旧版 Basic/Full 套餐，并非当前服务的全部目录。

| Package | USDC per successful report | Included modules |
| --- | --- | --- |
| Legacy Basic | 0.032 | Registration, operating abnormalities, administrative penalties |
| Legacy Full | 0.093 | Basic plus serious violations, enforcement, dishonesty, bankruptcy, qualifications, customs |

One interface can return many fields and records: Full means nine modules, not nine fields. Each list is limited to its first page, up to ten records. Serious violations, enforcement and dishonesty use the current-status option. No automatic historical queries, pagination or retries.

Upstream nominal costs are CNY 0.15 / 0.45. Prices use a fixed budgeting assumption of 7 CNY/USDC and upward rounding; this is not a live FX quote. Trial credits do not lower the published retail prices.

## Existing entrypoints

- [x402 API](https://api.cnevidence.com)
- [Live OpenAPI](https://api.cnevidence.com/openapi.json)
- [Agent manifest](https://api.cnevidence.com/.well-known/agent.json)
- [x402 discovery](https://api.cnevidence.com/.well-known/x402)
- [Remote MCP — GitHub 入口](https://mcp.cnevidence.com/mcp?cn_source=github)

可选来源标记：从这份 GitHub 文档配置的客户端，可保留 MCP 地址中的 `?cn_source=github`，或在 API 请求中携带 `X-CN-Source: github`。原无标记地址仍可使用，价格和功能不变。标记用于统计入口渠道，不识别个人；目录探测和内部测试不算客户。流量统计不保存企业查询内容或支付凭证。

Basic: GET /x402/cn/supplier/evidence/basic?uscc=YOUR_USCC  
Full: POST /x402/cn/supplier/evidence with JSON {"uscc":"YOUR_USCC"}  
Alternatively supply the exact Chinese legal company name as "company".

MCP tools: get_china_supplier_evidence_basic (query) and get_china_supplier_evidence_full (request). Both accept an identity object containing company or uscc.

Payment: x402, USDC on Base. Unsigned requests return payment requirements without querying data providers. A funded compatible wallet and explicit spending authorization are needed to buy a report. Native MPP is temporarily paused. The old the402 webhook is paused pending repricing; use the canonical x402/MCP entrypoints.

## Response and limitations

Schema v2 returns schema_version, request_id, tier, provider, queried_at, entity, modules, coverage, usage and limitations. Each module describes its status, data/records and paging uncertainty. Unselected modules are marked not_requested; no_records means only that this query returned no records.

Free entity resolution is retired. The legacy free HTTP resolve route remains a capability notice; the existing resolve_china_company MCP tool now offers local input preflight only, not a database lookup. Free HTTP input preparation: POST https://api.cnevidence.com/free/cn/identity/preflight with company or uscc. input_ready does not mean verified identity; no upstream call or payment occurs. Static examples are schema guides, not live supplier facts. Procurement award history is NOT included in these nine interfaces. Legacy include_evidence/evidence_limit options do not expand coverage; package limits apply.

Data availability depends on provider coverage and update schedules. Preserve any source attribution included in query results. Absence of records is not proof of no risk. No nationwide completeness, fraud score, payment-safety guarantee, bank verification or legal conclusion is provided.

## 中文摘要

当前 V3 提供 64 个单独计费数据工具，每次选定工具调用 0.011 USDC，MCP 共 71 项定义（其中3项为新增报告流程工具）。完整工具范围、参数和限制见 https://yangchunhong3000.github.io/cn-evidence-public-docs/v3-tools.html 。买方指南提供 V3 企业详情购买示例，并非全部工具的通用购买客户端。

以下为保留的旧版 Basic/Full 套餐摘要，不代表当前 V3 的完整目录：Basic 每次 0.032 USDC，包含工商、经营异常、行政处罚；Full 每次 0.093 USDC，另含严重违法、被执行、失信、破产、资质、海关，共九个模块。旧版套餐的每个列表仅首页、最多十条；不含政府采购历史，不自动翻页或补查历史。旧域名及工具名保留；免费实体检索、原生 MPP 和旧 the402 回调暂不提供原服务。没有记录不代表没有风险。以实时 OpenAPI 和支付报价为准。
