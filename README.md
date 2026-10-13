# CN Evidence — China company data and screening reports

**See a delivered Standard example:** [English redacted sample](https://yangchunhong3000.github.io/cn-evidence-public-docs/standard-report-example.html) · [中文样张](https://yangchunhong3000.github.io/cn-evidence-public-docs/standard-report-example-zh.html) · [Evaluate a bounded pilot](https://yangchunhong3000.github.io/cn-evidence-public-docs/integration-pilot.html). Historical internal acceptance, identity-redacted editorial extract; not a customer case, full original report or API response schema. No live query or wallet needed to view.

**Screening reports:** [Products and pricing](https://yangchunhong3000.github.io/cn-evidence-public-docs/products.html) · [Live product catalog](https://api.cnevidence.com/free/cn/products). Standard `screening-standard-v1` costs 0.29 USDC and returns ten Jinghai checks as JSON plus Chinese and English HTML reports. Enhanced `screening-enhanced-v1` costs 0.59 USDC and returns the same ten Jinghai checks plus exactly one QCC qualification lookup. QCC `qcc-qualifications-v1` costs 0.03 USDC and returns only the canonical JSON response, up to 30 records, without report analysis. These products are HTTP x402 only; they are not new MCP tools. Check live catalog availability before purchase. Delivery depends on provider balance and runtime availability; there is no manual daily or total commercial quota, but this is not a per-order limit waiver or delivery guarantee.

**Current V3 single-tool catalog:** 64 individual data tools are deployed. MCP `tools/list` currently returns 68 tools total (64 data tools, 3 older tools and one schema helper). The live catalog is authoritative for enabled tools and schemas: https://api.cnevidence.com/free/cn/tools. See the [V3 call guide](https://yangchunhong3000.github.io/cn-evidence-public-docs/v3-tools.html). New V3 calls cost 0.011 USDC per tool call. On 2026-10-10, one owner-funded HTTP `v3_company_detail` purchase passed payment, settlement, delivery and free recovery checks. This is not a customer sale or paid acceptance of all 64 tools or the V3 MCP transport. Delivery depends on provider balance and runtime availability.

**Failure handling:** no automatic repayment or upstream business retry. Repeated failures temporarily pause the affected tool. Save a unique recovery token before purchase; use free order lookup and report recovery after a lost response. Unknown payment status requires reconciliation. Reports have a 24-hour recovery window; refund review is not a completed or guaranteed refund. [Failure and recovery details](https://yangchunhong3000.github.io/cn-evidence-public-docs/v3-tools.html#failure-recovery).

**Evaluate the output first:** [Read a fictional supplier-check example](https://yangchunhong3000.github.io/cn-evidence-public-docs/sample-report.html) — what was returned, what remains unknown, and what needs further review. No wallet, signup or live query. The explanation is documentation, not an automated supplier-safety assessment. [Inspect the matching JSON](https://yangchunhong3000.github.io/cn-evidence-public-docs/sample-report.json).

**Paid lookup:** adding the MCP URL alone does not enable payment. Buyers need an x402 v2 payment client, Base USDC wallet and spending authorization. [Buyer setup, request examples and identity guidance](https://yangchunhong3000.github.io/cn-evidence-public-docs/buyer-guide.html).

CN Evidence provides structured Chinese company information for supplier verification and due diligence. The old local procurement/regulatory dataset is retired from active service. Existing API URLs and MCP tool names remain available.

## Legacy Basic and Full packages

The prices and module counts below describe only the retained legacy Basic/Full packages. They are not the whole service catalog.

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
- [Remote MCP — GitHub entry](https://mcp.cnevidence.com/mcp?cn_source=github)

[PayAPI Market company-detail listing](https://payapi.market/api/cn-evidence-company-detail): on 2026-10-11, its operator performed one platform-funded 0.011 USDC verification. The transaction matched our settlement and response-sent records, and the operator reported valid company-detail JSON. This is verification of that single route, not organic customer demand, report-product acceptance or certification of all tools.

Optional attribution: clients configured from this GitHub guide can retain `?cn_source=github` on the MCP URL, or send `X-CN-Source: github` on API requests. Canonical untagged URLs remain supported. This label identifies the entry channel, not a person; automated discovery and internal tests are not counted as customers. No company query text or payment credentials are stored in traffic analytics. Removing the label does not affect service or pricing.

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

当前 V3 提供 64 个单独计费数据工具，每次选定工具调用 0.011 USDC，MCP 共 68 项定义。完整工具范围、参数和限制见 https://yangchunhong3000.github.io/cn-evidence-public-docs/v3-tools.html 。买方指南提供 V3 企业详情购买示例，并非全部工具的通用购买客户端。

以下为保留的旧版 Basic/Full 套餐摘要，不代表当前 V3 的完整目录：Basic 每次 0.032 USDC，包含工商、经营异常、行政处罚；Full 每次 0.093 USDC，另含严重违法、被执行、失信、破产、资质、海关，共九个模块。旧版套餐的每个列表仅首页、最多十条；不含政府采购历史，不自动翻页或补查历史。旧域名及工具名保留；免费实体检索、原生 MPP 和旧 the402 回调暂不提供原服务。没有记录不代表没有风险。以实时 OpenAPI 和支付报价为准。
