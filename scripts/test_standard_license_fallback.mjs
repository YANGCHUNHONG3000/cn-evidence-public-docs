import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateProduct, validateReport} from '../docs/standard-client.mjs';

const COMPANY = '示例（上海）有限公司';
const USCC = '91310000MA1FL8XK3Q';
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

// Entirely synthetic fixtures: no real orders, reports, identities, or provider calls.
function product() {
  return {
    sku: 'screening-standard-v1', version: 'screening-license-fallback-20261013-v1',
    price_atomic: 290000, price_usdc: '0.290000', currency: 'USDC', network: 'eip155:8453',
    checks: TOOLS.map((tool, i) => ({tool, label_zh: LABELS[i], contract: (i + 1).toString(16).padStart(64, '0')})),
    max_jinghai_calls: 10, max_jinghai_points: 10, max_qcc_points: 3,
    formats: ['json', 'zh-CN', 'en'], retention_hours: 24,
    automatic_retry: false, automatic_paging: false, partial_report_charged: false,
    complete_due_diligence: false, qcc_automatic_fallback: true, human_review_included: false,
    recovery_token_required: true,
    fallback_checks: [{primary_tool:'v3_license_list', provider:'qcc', server:'operation',
      tool:'get_administrative_license', points:3, max_records:100,
      trigger:'primary_transport_failure_or_open_circuit', max_attempts:1,
      result_profile:'qcc_administrative_license_normalized_v1',
      coverage:'partial_records_completeness_unestablished'}],
    contract: 'abcdef0123456789'.repeat(4),
  };
}

function report(p = product(), failure = null) {
  const operation = hash('synthetic-license-fallback-operation');
  const circuitOpen = failure === 'primary_circuit_open_not_dispatched';
  const fallback = failure !== null;
  const jhCalls = circuitOpen ? 9 : 10;
  const checks = p.checks.map(({tool, contract}, i) => {
    const child = hash(canonical({parent:operation, sku:p.sku, contract:p.contract, tool}));
    if (i === 5 && fallback) return {
      tool, arguments:{company_id:'synthetic-company-id'}, response:{tool, contract,
        request_id:child, failure, result:{isError:true, content:[]}, usage:{upstream_attempts:circuitOpen ? 0 : 1}},
    };
    const businessData = i === 0
      ? {companyName:COMPANY, creditNumber:USCC, id:'synthetic-company-id'}
      : {pageIndex:1, pageSize:5, records:[{synthetic_id:`sample-${i}`}], totalRecords:8};
    const payload = {status:200, success:true, data:businessData};
    return {tool, arguments:i === 0 ? {company_name:COMPANY} : {company_id:'synthetic-company-id'},
      response:{tool, contract, request_id:child,
        result:{isError:false, structuredContent:payload, content:[{type:'text', text:JSON.stringify(payload)}]}}};
  });
  const record = {'决定文书/许可编号':'synthetic-license-1', '决定文书/许可证名称':'Synthetic Permit',
    '许可状态':'有效', '有效期自':'2026-01-01', '有效期至':'2027-01-01', '许可机关':'Synthetic Authority'};
  const qcc = {
    schema_version:'cn-evidence-provider-supplement/1', id:'QCC-'+ 'a'.repeat(20),
    provider:'qcc', provider_source_group:'qcc', independent_corroboration:false,
    tool:'get_administrative_license', server:'operation', topic:'licenses',
    input_sha256:'a'.repeat(64), subject:{legal_name_cn:COMPANY, uscc:USCC},
    state:'records_returned', identity_binding:'legal_name_and_returned_uscc',
    queried_at:'2026-10-13T12:00:00Z', freshness:'within_window', dataset_updated_at:null,
    returned_count:1, vendor_total_claim:1, coverage:'partial_records_completeness_unestablished',
    primary_gaps_closed:false, safety_conclusion:null, observations:{records:[record]}, reason:null,
    limitations:[],
  };
  const sources = p.checks.map(({tool}) => ({module:tool,
    state:fallback && tool === 'v3_license_list' ? 'unavailable' : 'ok',
    identity_binding:'matched'}));
  const r = {
    schema_version:'cn-evidence-screening-product/1', sku:p.sku, contract:p.contract,
    price_usdc:'0.290000', request_id:operation, checklist:p.checks.map(c => c.tool), data:checks,
    usage:{upstream_attempts:jhCalls+(fallback ? 1 : 0), qcc_calls:fallback ? 1 : 0,
      reserved_qcc_points:fallback ? 3 : 0, jinghai_calls:jhCalls},
    analysis:{subject:{legal_name_cn:COMPANY, uscc:USCC}, decision:{status:'review_required'}, sources,
      ...(fallback ? {provider_supplements:[qcc]} : {})},
    coverage:{all_contracted_checks_returned:true, complete_due_diligence:false,
      ...(fallback ? {fallback_checks:[{primary_tool:'v3_license_list', provider:'qcc',
        tool:'operation/get_administrative_license', source_id:qcc.id,
        scope:'partial_records_completeness_unestablished'}]} : {})},
    ...(fallback ? {qcc_data:[qcc]} : {}),
  };
  return r;
}

test('new version accepts exact product and no-fallback Standard report', () => {
  const p = product();
  assert.doesNotThrow(() => validateProduct(p));
  const r = report(p);
  assert.equal(r.usage.qcc_calls, 0);
  assert.doesNotThrow(() => validateReport(r, p, COMPANY));
});

test('license transport failure permits exactly one administrative-license fallback', () => {
  const p = product(), r = report(p, 'primary_transport_failed_or_uncertain');
  assert.equal(r.usage.upstream_attempts, 11);
  assert.equal(r.usage.qcc_calls, 1);
  assert.doesNotThrow(() => validateReport(r, p, COMPANY));
});

test('open circuit permits one fallback without dispatching the failed Jinghai call', () => {
  const p = product(), r = report(p, 'primary_circuit_open_not_dispatched');
  assert.equal(r.usage.upstream_attempts, 10);
  assert.equal(r.usage.jinghai_calls, 9);
  assert.equal(r.usage.qcc_calls, 1);
  assert.doesNotThrow(() => validateReport(r, p, COMPANY));
});

test('rejects out-of-scope fallback tool, subject, required fields, record cap, source state, and accounting', () => {
  const p = product();
  const mutations = [
    r => { r.qcc_data[0].tool = 'get_qualifications'; },
    r => { r.qcc_data[0].subject.legal_name_cn = '别的公司（上海）有限公司'; r.analysis.provider_supplements[0].subject.legal_name_cn = '别的公司（上海）有限公司'; },
    r => { delete r.qcc_data[0].observations.records[0]['许可机关']; },
    r => {
      r.qcc_data[0].observations.records = Array.from({length:101}, (_,i) => ({
        '决定文书/许可编号':`synthetic-${i}`, '决定文书/许可证名称':'Synthetic Permit', '许可机关':'Synthetic Authority'}));
      r.qcc_data[0].returned_count = 101; r.qcc_data[0].vendor_total_claim = 101;
    },
    r => { r.analysis.sources.find(s => s.module === 'v3_license_list').state = 'ok'; },
    r => { r.usage.reserved_qcc_points = 2; },
  ];
  for (const mutate of mutations) {
    const r = report(p, 'primary_transport_failed_or_uncertain');
    mutate(r);
    assert.throws(() => validateReport(r, p, COMPANY));
  }
});

test('rejects QCC use without an allowed license transport failure and wrong fallback price cap', () => {
  const p = product();
  const usedWithoutFailure = report(p);
  usedWithoutFailure.qcc_data = [report(product(), 'primary_transport_failed_or_uncertain').qcc_data[0]];
  usedWithoutFailure.analysis.provider_supplements = usedWithoutFailure.qcc_data;
  usedWithoutFailure.usage.qcc_calls = 1;
  usedWithoutFailure.usage.reserved_qcc_points = 3;
  assert.throws(() => validateReport(usedWithoutFailure, p, COMPANY));

  const wrongCap = product(); wrongCap.max_qcc_points = 4;
  assert.throws(() => validateProduct(wrongCap));
  const wrongUsedPoints = report(p, 'primary_transport_failed_or_uncertain');
  wrongUsedPoints.usage.reserved_qcc_points = 4;
  assert.throws(() => validateReport(wrongUsedPoints, p, COMPANY));
});
