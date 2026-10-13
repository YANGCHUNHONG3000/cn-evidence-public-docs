import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateProduct, validateQuote, validateReport} from '../docs/standard-client.mjs';

const COMPANY = '示例（上海）有限公司';
const USCC = '91310000MA1FL8XK3Q';
const SKU = 'screening-standard-v1';
const VERSION = 'screening-20261012-v1';
const URL = 'https://api.cnevidence.com/x402/cn/products/screening-standard-v1';
const SELLER = '0x3aedb825b264e82676a42b1a6d12ea253c0ce852';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TOOLS = [
  'v3_company_detail', 'v3_operation_exception', 'v3_administrative_penalty',
  'v3_shareholder_list', 'v3_industrial_change', 'v3_license_list',
  'v3_tax_credit', 'v3_tax_overdue', 'v3_court_trial_list', 'v3_law_list',
];
const LABELS = ['主体登记', '经营异常', '行政处罚', '股东', '登记变更', '行政许可', '纳税信用', '欠税', '开庭公告', '裁判文书'];
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);

// Fully synthetic values: no real buyer, report, order, wallet, or recovery token.
export function fixtureProduct() {
  return {
    sku: SKU, version: VERSION, price_atomic: 290000, price_usdc: '0.290000',
    currency: 'USDC', network: 'eip155:8453',
    checks: TOOLS.map((tool, i) => ({tool, label_zh: LABELS[i], contract: (i + 1).toString(16).padStart(64, '0')})),
    max_jinghai_calls: 10, max_jinghai_points: 10, max_qcc_points: 0,
    formats: ['json', 'zh-CN', 'en'], retention_hours: 24,
    automatic_retry: false, automatic_paging: false, partial_report_charged: false,
    complete_due_diligence: false, qcc_automatic_fallback: false,
    human_review_included: false, recovery_token_required: true,
    billing: 'Fixed checklist; all contracted checks must validate before settlement.',
    status: 'implemented', reason: null,
    contract: 'abcdef0123456789'.repeat(4),
  };
}

export function fixtureQuote() {
  return {
    x402Version: 2,
    resource: {url: URL},
    accepts: [{
      scheme: 'exact', network: 'eip155:8453', amount: '290000',
      payTo: SELLER, asset: USDC, maxTimeoutSeconds: 120,
      extra: {name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009'},
    }],
  };
}

export function fixtureReport(product = fixtureProduct(), companyName = COMPANY, operationId = hash('synthetic-standard-operation')) {
  const operation = operationId;
  const checks = product.checks.map(({tool, contract}, i) => {
    const businessData = i === 0
      ? {companyName, creditNumber: USCC, id: 'synthetic-company-id'}
      : {pageIndex: 1, pageSize: 5, records: [{synthetic_id: `sample-${i}`}], totalRecords: 8};
    const payload = {status: 200, success: true, data: businessData};
    const childRequest = hash(canonical({parent: operation, sku: product.sku, contract: product.contract, tool}));
    return {tool, arguments: i === 0 ? {company_name: companyName} : {company_id: 'synthetic-company-id'}, response: {
      tool, contract, request_id: childRequest,
      result: {isError: false, structuredContent: payload, content: [{type: 'text', text: JSON.stringify(payload)}]},
    }};
  });
  return {
    schema_version: 'cn-evidence-screening-product/1', sku: product.sku,
    contract: product.contract, price_usdc: '0.290000', request_id: operation,
    checklist: product.checks.map(c => c.tool),
    usage: {upstream_attempts: 10, qcc_calls: 0}, data: checks,
    analysis: {
      subject: {legal_name_cn: companyName, uscc: USCC},
      decision: {status: 'review_required'},
      sources: product.checks.map(c => ({module: c.tool, state: 'ok', identity_binding: 'matched'})),
    },
    coverage: {all_contracted_checks_returned: true, complete_due_diligence: false},
  };
}

test('validateProduct accepts the exact Standard contract and safety boundaries', () => {
  assert.doesNotThrow(() => validateProduct(fixtureProduct()));
});

test('validateProduct rejects wrong identity, price, check order/contracts, and unsafe flags', () => {
  const badSku = fixtureProduct(); badSku.sku = 'screening-enhanced-v1';
  assert.throws(() => validateProduct(badSku));
  const badPrice = fixtureProduct(); badPrice.price_atomic = 290001;
  assert.throws(() => validateProduct(badPrice));
  const reordered = fixtureProduct(); [reordered.checks[0], reordered.checks[1]] = [reordered.checks[1], reordered.checks[0]];
  assert.throws(() => validateProduct(reordered));
  const badContract = fixtureProduct(); badContract.checks[3].contract = 'not-a-contract';
  assert.throws(() => validateProduct(badContract));
  const badFormats = fixtureProduct(); badFormats.formats = ['json'];
  assert.throws(() => validateProduct(badFormats));
  const badRetention = fixtureProduct(); badRetention.retention_hours = 48;
  assert.throws(() => validateProduct(badRetention));
  const badMaxCalls = fixtureProduct(); badMaxCalls.max_jinghai_calls = 9;
  assert.throws(() => validateProduct(badMaxCalls));
  const badMaxPoints = fixtureProduct(); badMaxPoints.max_qcc_points = 1;
  assert.throws(() => validateProduct(badMaxPoints));
  for (const key of ['automatic_retry', 'automatic_paging', 'partial_report_charged', 'complete_due_diligence', 'qcc_automatic_fallback', 'human_review_included']) {
    const unsafe = fixtureProduct(); unsafe[key] = true;
    assert.throws(() => validateProduct(unsafe), `must reject ${key}=true`);
  }
  const optionalRecovery = fixtureProduct(); optionalRecovery.recovery_token_required = false;
  assert.throws(() => validateProduct(optionalRecovery));
});

test('validateQuote accepts the Standard Base USDC exact-payment quote', () => {
  assert.doesNotThrow(() => validateQuote(fixtureQuote()));
});

test('validateQuote rejects wrong resource, scheme, destination, amount, expiry, or token metadata', () => {
  for (const [path, value] of [
    [['resource', 'url'], 'https://example.invalid/'],
    [['accepts', 0, 'scheme'], 'upto'],
    [['accepts', 0, 'network'], 'eip155:1'],
    [['accepts', 0, 'payTo'], '0x0000000000000000000000000000000000000001'],
    [['accepts', 0, 'asset'], '0x0000000000000000000000000000000000000001'],
    [['accepts', 0, 'amount'], '290001'],
    [['accepts', 0, 'maxTimeoutSeconds'], 301],
    [['accepts', 0, 'extra', 'name'], 'Other Token'],
    [['accepts', 0, 'extra', 'version'], '1'],
    [['accepts', 0, 'extra', 'assetTransferMethod'], 'approve'],
  ]) {
    const quote = fixtureQuote();
    let target = quote;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
    assert.throws(() => validateQuote(quote), `must reject ${path.join('.')}`);
  }
});

test('validateReport accepts a synthetic ten-check report for the requested company', () => {
  const product = fixtureProduct();
  assert.doesNotThrow(() => validateReport(fixtureReport(product), product, COMPANY));
});

test('validateReport rejects identity, contract, usage, checklist, business-result, page-limit, coverage, and source mismatches', () => {
  const product = fixtureProduct();
  const wrongName = fixtureReport(product); wrongName.analysis.subject.legal_name_cn = '其他（上海）有限公司';
  assert.throws(() => validateReport(wrongName, product, COMPANY));
  const wrongContract = fixtureReport(product); wrongContract.contract = 'f'.repeat(64);
  assert.throws(() => validateReport(wrongContract, product, COMPANY));
  const wrongChecklist = fixtureReport(product); wrongChecklist.checklist.pop();
  assert.throws(() => validateReport(wrongChecklist, product, COMPANY));
  const wrongUsage = fixtureReport(product); wrongUsage.usage.upstream_attempts = 9;
  assert.throws(() => validateReport(wrongUsage, product, COMPANY));
  const wrongChildContract = fixtureReport(product); wrongChildContract.data[1].response.contract = 'f'.repeat(64);
  assert.throws(() => validateReport(wrongChildContract, product, COMPANY));
  const wrongChildOperation = fixtureReport(product); wrongChildOperation.data[1].response.request_id = 'f'.repeat(64);
  assert.throws(() => validateReport(wrongChildOperation, product, COMPANY));
  const businessError = fixtureReport(product); businessError.data[2].response.result.isError = true;
  assert.throws(() => validateReport(businessError, product, COMPANY));
  const tooMany = fixtureReport(product);
  const sixRows = Array.from({length: 6}, (_, i) => ({synthetic_id: `oversized-${i}`}));
  tooMany.data[2].response.result.structuredContent.data.records = sixRows;
  tooMany.data[2].response.result.content[0].text = JSON.stringify(tooMany.data[2].response.result.structuredContent);
  assert.throws(() => validateReport(tooMany, product, COMPANY));
  const qccUsed = fixtureReport(product); qccUsed.usage.qcc_calls = 1;
  assert.throws(() => validateReport(qccUsed, product, COMPANY));
  const incomplete = fixtureReport(product); incomplete.coverage.all_contracted_checks_returned = false;
  assert.throws(() => validateReport(incomplete, product, COMPANY));
  const overclaim = fixtureReport(product); overclaim.coverage.complete_due_diligence = true;
  assert.throws(() => validateReport(overclaim, product, COMPANY));
  const wrongSource = fixtureReport(product); wrongSource.analysis.sources[0].module = 'uncontracted_tool';
  assert.throws(() => validateReport(wrongSource, product, COMPANY));
  const missingSource = fixtureReport(product); missingSource.analysis.sources.pop();
  assert.throws(() => validateReport(missingSource, product, COMPANY));
});
