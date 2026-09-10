# CN Evidence — China Supplier Due Diligence API

Machine-readable evidence for AI agents verifying Chinese suppliers. **No signup or API key. Pay per call with x402 and USDC on Base.** A compatible funded wallet is needed for paid calls; reading the documentation and static examples is free.

[中文说明](README.zh-CN.md) · [English HTML documentation](docs/index.html) · [中文 HTML 文档](docs/zh/index.html) · [Live OpenAPI](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/openapi.json)

CN Evidence supports Chinese supplier and vendor verification with company identity / Unified Social Credit Code (USCC), government procurement contract-award history, regulatory-history facts, available administrative-penalty evidence, and traceable evidence sources. It aggregates configured datasets into JSON so an agent can inspect scope and provenance in one response.

**Results are limited to configured official/open datasets and must not be interpreted as nationwide completeness.** No record found does not mean no record exists elsewhere. Procurement awards do not verify downstream contract performance. Historical abnormal-operation records do not by themselves establish current abnormal status.

## Use cases

- [Supplier identity](https://yangchunhong3000.github.io/cn-evidence-public-docs/china-supplier-verification/)
- [Government procurement](https://yangchunhong3000.github.io/cn-evidence-public-docs/china-government-procurement-evidence/)
- [Regulatory evidence](https://yangchunhong3000.github.io/cn-evidence-public-docs/china-company-regulatory-evidence/)

## Choose a tool

| Tool | Method and path | Price | Use it for |
| --- | --- | --- | --- |
| `resolve_china_company` | `GET /free/cn/entity/resolve` | Free | Resolve a Chinese legal company name; inspect ambiguity before buying evidence. |
| `get_china_supplier_evidence_basic` | `GET /x402/cn/supplier/evidence/basic` | $0.002 USDC | Low-cost identity, procurement and regulatory screening summaries, linkage and source coverage. Detailed evidence rows are omitted. |
| `get_china_supplier_evidence_full` | `POST /x402/cn/supplier/evidence` | $0.01 USDC | Screening plus detailed evidence rows and provenance, when available in configured datasets. |

Canonical API origin: <https://cn-evidence-agent402-public.mikeyang7789.workers.dev>

If the resolver returns multiple candidates, do not pick automatically. Obtain the intended entity's exact USCC, then use it in Basic or Full. The resolver itself accepts a company-name query, not a `uscc` parameter.

## Try discovery without paying

```bash
# Free entity resolution. The company is the one used in the public static examples.
curl --get \
  'https://cn-evidence-agent402-public.mikeyang7789.workers.dev/free/cn/entity/resolve' \
  --data-urlencode 'company=深圳希施玛数据科技有限公司'

# Unsigned Basic request: inspect HTTP 402; this command cannot pay.
curl -i --get \
  'https://cn-evidence-agent402-public.mikeyang7789.workers.dev/x402/cn/supplier/evidence/basic' \
  --data-urlencode 'uscc=9144030033518485XF'

# Unsigned Full request: inspect HTTP 402; no payment signature is supplied.
curl -i -X POST \
  'https://cn-evidence-agent402-public.mikeyang7789.workers.dev/x402/cn/supplier/evidence' \
  -H 'Content-Type: application/json' \
  --data '{"uscc":"9144030033518485XF","include_evidence":true,"evidence_limit":2}'
```

These are ordinary unsigned HTTP requests, not an auto-paying SDK. To purchase, a payment-capable client must separately validate the live challenge, obtain spending authorization, sign and retry. `no API key` does not mean paid data is free.

## Input and response contract

- Resolver: `company` is required, 2–200 characters.
- Basic and Full: supply at least one of `company` (2–200 characters) or `uscc` (18 uppercase letters/digits, `^[0-9A-Z]{18}$`). Prefer a confirmed USCC when names are ambiguous.
- Full: `include_evidence` defaults to `true`; `evidence_limit` is an integer from 0 to 100, default 100. Basic omits detailed rows.
- Supplier responses expose `entity`, `procurement_track_record`, `regulatory_facts`, `linkage`, `dataset_coverage`, `evidence_meta`, `evidence` and timestamps. See the live schema for required versus optional fields and nullability.
- Evidence rows have a common provenance contract: `type`, `source`, `dataset`, `checked_at`, and at least one valid `dataset_id` or `content_id`. Preserve source-specific record identifiers and `source_files` when returned. A dataset identifier locates the dataset; record-level fields provide finer traceability.
- Check `evidence_meta.returned_items`, `total_items` and `truncated` before assuming a report contains every available row. `checked_at` is not a guarantee that every source record was freshly updated.

## Inspect free, static examples

| Example | What it explains |
| --- | --- |
| [Resolver](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/.well-known/cn-evidence/examples/resolve.json) | Exact-name resolution and a separate same-name ambiguity illustration. |
| [Basic](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/.well-known/cn-evidence/examples/basic.json) | Summary fields and coverage, without detailed evidence rows. |
| [Full](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/.well-known/cn-evidence/examples/full.json) | Two representative rows: procurement award and regulatory history; a limit of 2, total of 6, and truncation. |

The examples are marked `example:true` and `not_live_query:true`. They are not fresh facts about a supplier. In particular, the regulatory-history example's `NOT_ENTERED` disposition is **not** a confirmed current abnormal listing or a penalty.

## Source coverage and interpretation

The current published contract describes Shenzhen company/USCC, abnormal-operation and administrative-penalty datasets, plus Beijing government procurement award data. Read each response's `dataset_coverage` and `coverage_notes`; regional source coverage does not expand merely because the queried supplier is elsewhere in China.

- `COMPLETE` means completeness within the configured dataset's synchronization scope, not nationwide coverage.
- A zero confirmed-penalty count is not nationwide clearance or a legal/compliance certification.
- Do not attach same-name procurement or penalty records to an entity without the returned linkage support.
- Beijing procurement evidence is an award/transaction track record, not verified delivery, acceptance or contract performance.
- Do not turn a historical abnormal-operation workflow record into a current negative status. Preserve `UNKNOWN`, ambiguity and source limitations.

## Machine discovery and integrations

- [Machine homepage](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/)
- [OpenAPI](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/openapi.json)
- [Agent manifest](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/.well-known/agent.json)
- [x402 manifest](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/.well-known/x402)
- [Agent usage guide](https://cn-evidence-agent402-public.mikeyang7789.workers.dev/llms.txt)
- [Agent402 marketplace](https://agent402.tools/base?all=1) · [Unbranded route query](https://agent402.tools/api/route?q=China%20supplier%20evidence%20company%20identity%20public%20procurement%20regulatory%20history%20provenance&network=base)
- [MPP-compatible API origin](https://cn-evidence-mpp-public.mikeyang7789.workers.dev) · [MPP OpenAPI](https://cn-evidence-mpp-public.mikeyang7789.workers.dev/openapi.json)
- [Remote MCP endpoint](https://cn-evidence-mcp-public.mikeyang7789.workers.dev/mcp) — **LIVE / public MCP SDK verified**, Streamable HTTP, 3 tools.
- [Glama Connector](https://glama.ai/mcp/connectors/dev.workers.mikeyang7789.cn-evidence-mcp-public/cn-evidence-china-supplier-due-diligence) — **LIVE / Healthy / 3 tools**.
- [Official MCP Registry record](https://registry.modelcontextprotocol.io/v0.1/servers?search=cn-evidence) — **active**, version **0.1.0**; server name: `dev.workers.mikeyang7789.cn-evidence-mcp-public/cn-evidence`.
- [MPPScan listing](https://mppscan.com/server/10e814be2d90b2566a8df027a63795b0a8142e279327cf6dbd9302a241d7aa45) — **LIVE**.
- [GitHub Pages documentation](https://yangchunhong3000.github.io/cn-evidence-public-docs/) — **LIVE**.

**Integration status updated 2026-09-10:** Remote MCP is live and public MCP SDK verification has passed. The three tools are `resolve_china_company`, `get_china_supplier_evidence_basic`, and `get_china_supplier_evidence_full`. Resolution is free; Basic and Full remain paid tools requiring explicit spending authorization. Directory publication does not guarantee natural-language discovery by every agent or search engine.

The MPP origin is a separate adapter advertising MPP and x402. Inspect its live contract for protocol-specific requirements. A registry listing or `discover <URL>` result is not evidence of natural-language central-search ranking.

## Canonical x402 payment parameters

| Field | Value |
| --- | --- |
| Protocol / scheme | x402 v2 / `exact` |
| Network | Base mainnet, `eip155:8453` |
| Asset | USDC, `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Basic / Full atomic amount | `2000` / `10000` |
| Transfer method | EIP-3009 (`eip3009`) |
| Recipient | `0x3aEDB825B264e82676A42B1a6d12EA253c0Ce852` |

Always validate the live challenge before signing. Documentation checks do not prove a new settlement or a seller balance change.

## About this repository

Public documentation and unsigned examples only. It does not contain the private service implementation, databases, deployment credentials or wallet keys. The HTML files under `docs/` are published on [GitHub Pages](https://yangchunhong3000.github.io/cn-evidence-public-docs/). A live page does not guarantee search-engine indexing.

Documentation and authored examples are licensed under [CC BY 4.0](LICENSE). No license to underlying datasets, third-party source material or private implementation is granted by this repository.
