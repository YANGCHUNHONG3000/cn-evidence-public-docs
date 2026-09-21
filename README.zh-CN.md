# CN Evidence — China supplier information API (v2)

**查询收费：只添加 MCP 地址不等于可以付款。** 买方需要 x402 v2 支付客户端、Base 主网 USDC 钱包及消费授权。[接入示例与企业身份指引](https://yangchunhong3000.github.io/cn-evidence-public-docs/buyer-guide.html) · [免费虚构示例报告（不查询真实数据）](https://yangchunhong3000.github.io/cn-evidence-public-docs/sample-report.json)。目前没有预充值 API Key 服务，不支持模糊英文企业名称匹配。

CN Evidence provides structured Chinese company information for supplier verification and due diligence. The old local procurement/regulatory dataset is retired from active service. Existing API URLs and MCP tool names remain available.

## Pricing and coverage

| Package | USDC per successful report | Included modules |
| --- | --- | --- |
| Basic | 0.032 | Registration, operating abnormalities, administrative penalties |
| Full | 0.093 | Basic plus serious violations, enforcement, dishonesty, bankruptcy, qualifications, customs |

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

Free entity resolution is retired: the old free route/tool returns a capability notice, not a database lookup. Static examples are schema guides, not live supplier facts. Procurement award history is NOT included in these nine interfaces. Legacy include_evidence/evidence_limit options do not expand coverage; package limits apply.

Data availability depends on provider coverage and update schedules. Preserve any source attribution included in query results. Absence of records is not proof of no risk. No nationwide completeness, fraud score, payment-safety guarantee, bank verification or legal conclusion is provided.

## 中文摘要

提供中国企业信息核验与尽调数据服务。Basic 每次 0.032 USDC，包含工商、经营异常、行政处罚；Full 每次 0.093 USDC，另含严重违法、被执行、失信、破产、资质、海关，共九个模块。每个列表仅首页、最多十条；不含政府采购历史，不自动翻页或补查历史。旧域名及工具名保留；免费实体检索、原生 MPP 和旧 the402 回调暂不提供原服务。没有记录不代表没有风险。以实时 OpenAPI 和支付报价为准。
