// Pure local presentation helpers. No network, wallet, storage or HTML interpretation.
export const OFFERS = Object.freeze({
  'screening-standard-v1': {name:'Standard screening / 标准筛查', price:'0.29', scope:'10 Jinghai-first check dimensions / 十项优先鲸海；Jinghai first page, max 5 per list / 鲸海首页最多五条；conditional ONE QCC license replacement, max 100, incomplete / 许可失败限定兜底一次、最多100条、不完整'},
  'screening-enhanced-v1': {name:'Qualifications-enhanced screening / 资质增强筛查', price:'0.59', scope:'Standard + ONE QCC qualifications query / 标准十项及许可限定兜底 + 一次企查查资质，最多30条；max two QCC calls / 最多两次企查查；not comprehensive cross-checking / 不是全面交叉核验'},
  'qcc-qualifications-v1': {name:'QCC qualifications JSON / 企查查资质 JSON', price:'0.03', scope:'ONE qualifications query, max 30 records, no analysis / 一次资质查询，最多30条，不含分析报告'}
});
const guard=(ok,label)=>{if(!ok)throw new Error(label);};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const text=(v,max=2400)=>{guard(typeof v==='string'&&v.length<=max,'invalid_text');return v;};
export function coverageRow(label, returned, total, truncated) {
  const got=count(returned), claimed=count(total);
  return {label:text(label,200),returned:got,total:claimed,
    remaining:got!==null&&claimed!==null&&claimed>=got?claimed-got:null,
    warning:got!==null&&claimed!==null&&claimed<got?'conflicting_counts':
      truncated===true||(got!==null&&claimed!==null&&claimed>got)?'more_indicated':'completeness_unknown'};
}
export function readReport(raw) {
  guard(typeof raw==='string'&&new TextEncoder().encode(raw).length<=2100000,'report_too_large');
  const r=JSON.parse(raw);guard(plain(r),'invalid_report');
  // Reject private checkout state/credential files rather than displaying their contents.
  guard(!['recovery_token','private_key','payment_signature','authorization'].some(k=>Object.hasOwn(r,k)),'private_state_not_report');
  const sample=r.schema_version==='cn-evidence-screening-redacted-example/1';
  if(sample){
    guard(r.redacted===true&&r.internal_test===true&&r.customer_case===false&&Array.isArray(r.checks)&&r.checks.length<=64,'invalid_sample');
    return {sample:true,subject:text(r.subject_label,200),uscc:'Withheld / 已脱敏',sku:text(r.sku,100),
      when:text(r.queried_at_utc,100),decision:'Historical internal sample / 历史内部样张',
      rows:r.checks.map(c=>coverageRow(c.tool,c.returned_record_count,c.vendor_total_records,c.more_records_indicated)),
      actions:[],limitations:(r.limitations??[]).slice(0,30).map(x=>text(x))};
  }
  const isAnalysis=r.schema_version==='cn-evidence-analysis/1';
  guard(isAnalysis||r.schema_version==='cn-evidence-screening-product/1'||r.schema_version==='cn-evidence-qcc-product/1','unsupported_report_schema');
  if(!isAnalysis)guard(Object.hasOwn(OFFERS,r.sku),'unsupported_product');
  const a=isAnalysis?r:r.analysis,subject=a?.subject??r.subject;
  guard(plain(subject),'missing_subject');
  const result={sample:false,subject:text(subject.legal_name_cn,200),uscc:text(subject.uscc,100),sku:isAnalysis?'Imported analysis / 导入分析':r.sku,
    when:text(a?.cutoff??r.queried_at??'Unknown / 未知',100),decision:'Qualifications only / 仅资质数据',rows:[],actions:[],limitations:[]};
  if(a){
    guard(a.schema_version==='cn-evidence-analysis/1'&&plain(a.decision)&&['identity_blocked','insufficient_evidence','needs_review'].includes(a.decision.status),'invalid_decision');
    guard(Array.isArray(a.sources)&&a.sources.length<=900&&Array.isArray(a.decision.next_actions)&&a.decision.next_actions.length<=300,'invalid_sources');
    guard(Array.isArray(a.limitations)&&a.limitations.length<=100,'invalid_limitations');
    result.decision=a.decision.status+' — '+text(a.decision.summary);
    result.rows=a.sources.map(s=>coverageRow(text(s.label,200)+' / '+text(s.state,80),s.returned_count,s.vendor_total,s.possibly_truncated));
    result.actions=a.decision.next_actions.map(x=>text(x));result.limitations=a.limitations.map(x=>text(x));
  }
  const supplements=r.qcc_data??a?.provider_supplements??[];
  guard(Array.isArray(supplements)&&supplements.length<=30,'invalid_supplements');
  for(const q of supplements)result.rows.push(coverageRow('QCC / '+text(q.tool,100),q.returned_count,q.vendor_total_claim,null));
  guard(result.rows.length>0,'missing_coverage');
  return result;
}
export function prepareBrief({company,uscc='',sku,format,purpose}) {
  guard(Object.hasOwn(OFFERS,sku),'invalid_product');
  guard(['en','zh-CN','json'].includes(format),'invalid_format');
  guard(sku!=='qcc-qualifications-v1'||format==='json','qcc_json_only');
  text(company,200);guard(company===company.trim()&&company.length>=2&&/[\u3400-\u9fff]/u.test(company)&&!/[\u0000-\u001f\u007f]/u.test(company),'exact_chinese_legal_name_required');
  text(uscc,18);guard(uscc===''||/^[0-9A-Z]{18}$/.test(uscc),'invalid_uscc_format');
  guard(sku!=='qcc-qualifications-v1'||uscc.length===18,'qcc_uscc_required');
  guard(['supplier_onboarding','qualification_review','integration_evaluation'].includes(purpose),'invalid_purpose');
  return ['CN Evidence — pilot scope / 试点范围（not an order / 非订单）',
    'Company / 企业中文登记全称: '+company,'USCC / 统一社会信用代码: '+(uscc||'Not supplied / 未提供'),'Product / 产品: '+OFFERS[sku].name,
    'Published price / 标价: '+OFFERS[sku].price+' USDC; confirm live contract before purchase.',
    'Scope / 范围: '+OFFERS[sku].scope,'Output / 输出: '+format,'Purpose / 用途: '+purpose,
    'Please confirm identity and scope before any paid query. / 付费查询前请先确认主体与范围。',
    'This brief does not authorize payment or promise a free live query. / 本需求单不授权付款，也不承诺免费实查。',
    'Only x402/Base USDC checkout is implemented; card/invoice billing is not promised.'].join('\n');
}
