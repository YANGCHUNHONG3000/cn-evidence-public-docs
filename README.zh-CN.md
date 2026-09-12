# CN Evidence：中国供应商核验 API

面向 AI Agent 的中国企业／供应商证据聚合服务。**无需注册或 API Key，使用 x402 按次支付 Base USDC。** 付费调用仍需要兼容的有余额钱包；阅读说明、OpenAPI 和静态样例免费。

[English](README.md) · [中文网页文档](docs/zh/index.html) · [英文网页文档](docs/index.html) · [实时 OpenAPI](https://api.cnevidence.com/openapi.json)

用于中国供应商核验、企业身份和统一社会信用代码确认、政府采购中标记录、监管历史及当前配置范围内的行政处罚证据查询，并保留数据集范围与可追溯来源。

**结果仅覆盖已配置的官方／开放数据集，不代表中国全国完整覆盖。** 没查到不等于全国不存在；中标不等于合同履约已核验；经营异常历史不等于当前经营异常。

## 使用场景

- [供应商主体核验](https://yangchunhong3000.github.io/cn-evidence-public-docs/zh/china-supplier-verification/)
- [政府采购与中标证据](https://yangchunhong3000.github.io/cn-evidence-public-docs/zh/government-procurement-evidence/)
- [行政处罚与监管证据](https://yangchunhong3000.github.io/cn-evidence-public-docs/zh/regulatory-evidence/)

## 如何选择

| 商品 | 接口 | 价格 | 适用场景 |
| --- | --- | --- | --- |
| 免费 Resolver | `GET /free/cn/entity/resolve` | 免费 | 根据中文公司名解析主体，检查同名候选。 |
| Basic | `GET /x402/cn/supplier/evidence/basic` | $0.002 USDC | 企业身份、采购与监管摘要、关联状态和覆盖范围，不返回详细证据行。 |
| Full | `POST /x402/cn/supplier/evidence` | $0.01 USDC | 在摘要基础上，按需返回详细证据行与来源信息；以数据集实际可用记录为准。 |

规范 API：<https://api.cnevidence.com>

如果 Resolver 返回多个候选，不要自动猜测。先取得目标公司的准确 USCC，再传给 Basic／Full。免费 Resolver 本身只接受 `company`，不要向它发送不存在的 `uscc` 参数。

## 参数与免费查看方式

- Resolver：必填 `company`，长度 2–200。
- Basic／Full：`company` 或 `uscc` 至少提供一个；`uscc` 为 18 位大写字母／数字。
- Full：`include_evidence` 默认 `true`；`evidence_limit` 为 0–100 的整数，默认 100。
- 无支付签名的合法付费请求会返回 HTTP 402；普通 curl 不会自动付款。不要把会自动支付的客户端与普通 curl 混淆。

```bash
curl -i -X POST \
  'https://api.cnevidence.com/x402/cn/supplier/evidence' \
  -H 'Content-Type: application/json' \
  --data '{"uscc":"9144030033518485XF","include_evidence":true,"evidence_limit":2}'
```

示例 USCC 来自服务公开静态样例，不是要求你为该公司购买报告。完整免费解析与 Basic 请求示例见[英文 README](README.md#try-discovery-without-paying)。

## 付款前看懂返回内容

- [Resolver 静态样例](https://api.cnevidence.com/.well-known/cn-evidence/examples/resolve.json)：精确命中与独立的歧义候选形状。
- [Basic 静态样例](https://api.cnevidence.com/.well-known/cn-evidence/examples/basic.json)：摘要、关联状态和来源范围，详细证据数组为空。
- [Full 静态样例](https://api.cnevidence.com/.well-known/cn-evidence/examples/full.json)：采购中标及监管历史各一行；总数 6，返回 2，`truncated=true`。

样例明确标记 `example:true`、`not_live_query:true`，不能当成实时尽调事实。其中监管样例的 `NOT_ENTERED` 不代表当前经营异常，更不是一条已确认处罚。

响应包含 `entity`、`procurement_track_record`、`regulatory_facts`、`linkage`、`dataset_coverage`、`evidence_meta` 和 `evidence` 等字段。必填性与可空性以 OpenAPI 为准。

每条 Evidence 至少包含 `type`、`source`、`dataset`、`checked_at`，以及至少一个有效的 `dataset_id` 或 `content_id`。数据集 ID 定位数据集；公告编号等记录字段提供更细定位，有 `source_files` 时应一并保留。请检查截断信息，不要把限定条数的响应当成全部证据。

## 数据来源与边界

当前公开契约描述的范围为：深圳企业／统一社会信用代码、经营异常与行政处罚数据集，以及北京政府采购中标数据。每次以 `dataset_coverage` 和 `coverage_notes` 为准。

1. `COMPLETE` 只表示配置数据集的同步范围，不表示全国完整。
2. 处罚确认数为 0 不等于全国无处罚，不构成合规认证。
3. 同名采购或处罚记录不得在缺少关联依据时自动挂到某家公司。
4. 北京中标记录不等于合同交付、验收或履约已核实。
5. 历史经营异常流程记录不等于当前负面状态；保留 `UNKNOWN`、歧义和来源限制。
6. `checked_at` 是查询／核对时间，不代表所有上游记录都在该时刻更新。

## 机器入口

- [OpenAPI](https://api.cnevidence.com/openapi.json)
- [Agent manifest](https://api.cnevidence.com/.well-known/agent.json)／[x402 manifest](https://api.cnevidence.com/.well-known/x402)／[使用指南](https://api.cnevidence.com/llms.txt)
- [Agent402 公共目录](https://agent402.tools/base?all=1)
- [MPP 适配入口](https://mpp.cnevidence.com)／[MPP OpenAPI](https://mpp.cnevidence.com/openapi.json)
- [Remote MCP 公网端点](https://mcp.cnevidence.com/mcp) — **LIVE / public MCP SDK verified**；Streamable HTTP，3 tools。
- [Glama Connector](https://glama.ai/mcp/connectors/dev.workers.mikeyang7789.cn-evidence-mcp-public/cn-evidence-china-supplier-due-diligence) — **LIVE / Healthy / 3 tools**。
- [Official MCP Registry 记录](https://registry.modelcontextprotocol.io/v0.1/servers?search=cn-evidence) — **active**，版本 **0.1.1**；server name：`dev.workers.mikeyang7789.cn-evidence-mcp-public/cn-evidence`。
- [MPPScan 公开页面](https://mppscan.com/server/7c16491831a2c807c38cf2b2529d6f9f09e3a97e082d028d7cdeb129b950beb1) — **LIVE**。
- [GitHub Pages 文档](https://yangchunhong3000.github.io/cn-evidence-public-docs/) — **LIVE**。

**集成状态更新于 2026-09-10：**Remote MCP 已上线，公网 MCP SDK 验证已通过。三个工具为 `resolve_china_company`、`get_china_supplier_evidence_basic`、`get_china_supplier_evidence_full`。Resolver 免费；Basic 和 Full 仍需明确支出授权后付款。目录上线不等于每个 Agent 或搜索引擎都能通过自然语言找到。

规范付费接口使用 x402 v2 / exact、Base `eip155:8453`、USDC、EIP-3009；Basic／Full 金额分别为 `2000`／`10000` 最小单位。完整资产与收款地址见[英文支付参数表](README.md#canonical-x402-payment-parameters)。MPP 入口是独立适配器，协议条件以其公开契约为准。

## 旧入口 / 兼容说明

新集成请使用 `https://api.cnevidence.com`、`https://mcp.cnevidence.com/mcp` 和 `https://mpp.cnevidence.com`。以下旧入口仅保留兼容用途，其 metadata 可指向正式域名：

- API：`https://cn-evidence-agent402-public.mikeyang7789.workers.dev`
- MCP：`https://cn-evidence-mcp-public.mikeyang7789.workers.dev/mcp`
- MPP：`https://cn-evidence-mpp-public.mikeyang7789.workers.dev`

域名链接更新于 2026-09-12。目录 identity 保持不变；尚未完成迁移的第三方目录可能仍显示旧 URL。

## 仓库范围

本仓库只公开文档和无签名调用示例，不公开核心代码、数据库、部署凭据或私钥。`docs/` 已发布到 [GitHub Pages](https://yangchunhong3000.github.io/cn-evidence-public-docs/)；网页可访问不等于搜索引擎已收录。

Results are limited to configured official/open datasets and must not be interpreted as nationwide completeness.

文档及自编示例采用 [CC BY 4.0](LICENSE)，不授予底层数据集、第三方材料或私有实现的使用许可。
