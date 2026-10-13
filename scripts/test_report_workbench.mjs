import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {coverageRow, OFFERS, prepareBrief, readReport} from '../docs/report-workbench-core.mjs';

const samplePath = new URL('../docs/standard-report-example.json', import.meta.url);
const workbenchHtmlPath = new URL('../docs/report-workbench.html', import.meta.url);
const workbenchModulePath = new URL('../docs/report-workbench.mjs', import.meta.url);
const company = '示例测试有限公司';
const subject = {legal_name_cn: company, uscc: '91310000MA1FL8XK7Y'};

function analysis(sources = [{
  label: 'Registration', state: 'ok', returned_count: null,
  vendor_total: null, possibly_truncated: false,
}]) {
  return {
    schema_version: 'cn-evidence-analysis/1',
    subject,
    cutoff: '2026-10-12T00:00:00Z',
    decision: {status: 'needs_review', summary: 'Evidence is bounded.', next_actions: []},
    sources,
    limitations: ['First-page evidence only.'],
  };
}

function productReport(sku, extra = {}) {
  return {
    schema_version: 'cn-evidence-screening-product/1', sku,
    subject, queried_at: '2026-10-12T00:00:00Z',
    analysis: analysis(), ...extra,
  };
}

function qccReport(extra = {}) {
  return {
    schema_version: 'cn-evidence-qcc-product/1', sku: 'qcc-qualifications-v1',
    subject, queried_at: '2026-10-12T00:00:00Z',
    qcc_data: [{tool: 'qualifications', returned_count: 2, vendor_total_claim: 9}],
    ...extra,
  };
}

test('reads the real public redacted Standard sample', async () => {
  const raw = await readFile(samplePath, 'utf8');
  const parsed = readReport(raw);
  assert.equal(parsed.sample, true);
  assert.equal(parsed.rows.length, 10);
  assert.equal(parsed.subject, 'Company A — identity withheld');
  assert.equal(parsed.rows.find(row => row.label === 'v3_industrial_change').warning, 'more_indicated');
  assert.equal(parsed.rows.find(row => row.label === 'v3_company_detail').warning, 'completeness_unknown');
  const emptyResult = parsed.rows.find(row => row.label === 'v3_operation_exception');
  assert.equal(emptyResult.returned, 0);
  assert.equal(emptyResult.warning, 'completeness_unknown');
});

test('reads constructed Standard, Enhanced, and QCC-only product shapes', () => {
  const standard = readReport(JSON.stringify(productReport('screening-standard-v1')));
  assert.equal(standard.sku, 'screening-standard-v1');
  assert.equal(standard.rows.length, 1);

  const enhanced = readReport(JSON.stringify(productReport('screening-enhanced-v1', {
    qcc_data: [{tool: 'qualifications', returned_count: 2, vendor_total_claim: 9}],
  })));
  assert.equal(enhanced.sku, 'screening-enhanced-v1');
  assert.equal(enhanced.rows.length, 2);
  assert.match(enhanced.rows[1].label, /QCC/);

  const qcc = readReport(JSON.stringify(qccReport()));
  assert.equal(qcc.sku, 'qcc-qualifications-v1');
  assert.equal(qcc.rows.length, 1);
  assert.equal(qcc.rows[0].remaining, 7);
  assert.deepEqual(Object.keys(OFFERS), [
    'screening-standard-v1', 'screening-enhanced-v1', 'qcc-qualifications-v1',
  ]);
});

test('unknown values stay unknown; conflicting totals are not coerced', () => {
  assert.deepEqual(coverageRow('Unknown', null, null, false), {
    label: 'Unknown', returned: null, total: null, remaining: null,
    warning: 'completeness_unknown',
  });
  const conflict = coverageRow('Conflict', 5, 3, false);
  assert.equal(conflict.warning, 'conflicting_counts');
  assert.equal(conflict.remaining, null);
});

test('zero records and equal counts never prove completeness', () => {
  const empty = coverageRow('Empty result', 0, 0, false);
  assert.equal(empty.remaining, 0);
  assert.equal(empty.warning, 'completeness_unknown');
  const equal = coverageRow('Equal counts', 4, 4, false);
  assert.equal(equal.warning, 'completeness_unknown');
  assert.notEqual(empty.warning, 'complete');
  assert.notEqual(equal.warning, 'complete');
});

test('hostile report strings remain data for text-only rendering', () => {
  const hostile = '<img src=x onerror=alert(1)>&\"';
  const report = productReport('screening-standard-v1', {
    analysis: analysis([{label: hostile, state: 'ok', returned_count: 1, vendor_total: 1}]),
  });
  assert.equal(readReport(JSON.stringify(report)).rows[0].label, `${hostile} / ok`);
  assert.equal(readReport(JSON.stringify({...report, analysis: {
    ...report.analysis, decision: {...report.analysis.decision, next_actions: [hostile]},
  }})).actions[0], hostile);
});

test('rejects credential and private-state objects', () => {
  for (const key of ['recovery_token', 'private_key', 'payment_signature', 'authorization']) {
    assert.throws(() => readReport(JSON.stringify({
      ...productReport('screening-standard-v1'), [key]: 'must-not-be-displayed',
    })), /private_state_not_report/);
  }
});

test('enforces the 2.1 MB byte limit at the boundary', () => {
  const base = productReport('screening-standard-v1');
  const emptyPadding = JSON.stringify({...base, padding: ''});
  const paddingLength = 2_100_000 - Buffer.byteLength(emptyPadding);
  assert.ok(paddingLength > 0);
  const atLimit = JSON.stringify({...base, padding: 'x'.repeat(paddingLength)});
  assert.equal(Buffer.byteLength(atLimit), 2_100_000);
  assert.equal(readReport(atLimit).sku, 'screening-standard-v1');
  const tooLarge = JSON.stringify({...base, padding: 'x'.repeat(paddingLength + 1)});
  assert.equal(Buffer.byteLength(tooLarge), 2_100_001);
  assert.throws(() => readReport(tooLarge), /report_too_large/);
});

test('requires a Chinese registered name; an English brand is not guessed', () => {
  assert.throws(() => prepareBrief({
    company: 'Acme Global', sku: 'screening-standard-v1', format: 'en',
    purpose: 'supplier_onboarding',
  }), /exact_chinese_legal_name_required/);
  assert.match(prepareBrief({
    company, sku: 'screening-standard-v1', format: 'en', purpose: 'supplier_onboarding',
  }), /Company \/ 企业中文登记全称/);
});

test('QCC-only brief accepts JSON but rejects HTML output', () => {
  const uscc = 'A'.repeat(18); // Fictional test value; format-only fixture.
  const brief = prepareBrief({
    company, uscc, sku: 'qcc-qualifications-v1', format: 'json', purpose: 'qualification_review',
  });
  assert.match(brief, /QCC qualifications JSON/);
  assert.equal(brief.split('\n').find(line => line.startsWith('USCC / 统一社会信用代码: ')),
    `USCC / 统一社会信用代码: ${uscc}`);
  assert.throws(() => prepareBrief({
    company, uscc, sku: 'qcc-qualifications-v1', format: 'en', purpose: 'qualification_review',
  }), /qcc_json_only/);
  assert.throws(() => prepareBrief({
    company, sku: 'qcc-qualifications-v1', format: 'json', purpose: 'qualification_review',
  }), /qcc_uscc_required/);
  assert.throws(() => prepareBrief({
    company, uscc: '1234-bad', sku: 'qcc-qualifications-v1', format: 'json', purpose: 'qualification_review',
  }), /invalid_uscc_format/);
});

test('Standard leaves USCC optional and reports absence; any supplied value is format-checked', () => {
  const brief = prepareBrief({
    company, sku: 'screening-standard-v1', format: 'en', purpose: 'supplier_onboarding',
  });
  assert.equal(brief.split('\n').find(line => line.startsWith('USCC / 统一社会信用代码: ')),
    'USCC / 统一社会信用代码: Not supplied / 未提供');
  assert.throws(() => prepareBrief({
    company, uscc: 'not-a-code', sku: 'screening-standard-v1', format: 'en', purpose: 'supplier_onboarding',
  }), /invalid_uscc_format/);
  const withCode = prepareBrief({
    company, uscc: 'A'.repeat(18), sku: 'screening-standard-v1', format: 'en', purpose: 'supplier_onboarding',
  });
  assert.equal(withCode.split('\n').find(line => line.startsWith('USCC / 统一社会信用代码: ')),
    `USCC / 统一社会信用代码: ${'A'.repeat(18)}`);
});

test('rejects missing schemas and incomplete structure', () => {
  assert.throws(() => readReport(JSON.stringify({subject})), /unsupported_report_schema/);
  assert.throws(() => readReport(JSON.stringify({
    schema_version: 'cn-evidence-screening-product/1',
    sku: 'screening-standard-v1', subject, analysis: {},
  })), /invalid_decision/);
  assert.throws(() => readReport(JSON.stringify({
    schema_version: 'cn-evidence-screening-product/1',
    sku: 'screening-standard-v1', subject,
  })), /missing_coverage/);
  assert.throws(() => readReport(JSON.stringify(qccReport({qcc_data: 'not-an-array'}))), /invalid_supplements/);
});

test('static guardrails: offline CSP, no storage/network/HTML injection/auto-payment', async () => {
  const [html, module] = await Promise.all([
    readFile(workbenchHtmlPath, 'utf8'), readFile(workbenchModulePath, 'utf8'),
  ]);
  assert.match(html, /Content-Security-Policy[^>]*connect-src 'none'/i);
  assert.doesNotMatch(module, /\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b|\.innerHTML\b/);
  assert.match(module, /\.textContent\s*=/);
  assert.doesNotMatch(`${html}\n${module}`, /window\.ethereum|PAYMENT-SIGNATURE|\bauto(?:matic)?[-_ ]?pay\b/i);
  assert.match(html, /not a checkout/i);
});
