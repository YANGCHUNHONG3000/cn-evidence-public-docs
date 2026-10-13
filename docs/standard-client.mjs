#!/usr/bin/env node
// Node 20+. Preview/recovery need no packages, wallet, signature or payment.
// Buy dependencies: @x402/core@2.25.0 @x402/evm@2.25.0 viem@2.56.3
import {createHash, randomBytes} from 'node:crypto';
import {readFile, open, lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as equal} from 'node:util';

const ORIGIN = 'https://api.cnevidence.com';
const SKU = 'screening-standard-v1', ENDPOINT = ORIGIN + '/x402/cn/products/' + SKU;
const SELLER = '0x3aedb825b264e82676a42b1a6d12ea253c0ce852';
const ASSET = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TOOLS = ['v3_company_detail','v3_operation_exception','v3_administrative_penalty',
  'v3_shareholder_list','v3_industrial_change','v3_license_list','v3_tax_credit',
  'v3_tax_overdue','v3_court_trial_list','v3_law_list'];
const guard = (ok, label) => { if (!ok) throw new Error(label); };
const hash = text => createHash('sha256').update(text).digest('hex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
const canonical = value => JSON.stringify(sorted(value));
const normalize = s => typeof s === 'string' ? s.replaceAll('（','(').replaceAll('）',')').trim() : '';
const digestShape = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);

export function validateProduct(p) {
  guard(p?.sku === SKU && p.version === 'screening-20261012-v1' && digestShape(p.contract), 'product_identity');
  guard(p.price_atomic === 290000 && p.price_usdc === '0.290000' && p.currency === 'USDC' && p.network === 'eip155:8453', 'product_price');
  guard(Array.isArray(p.checks) && equal(p.checks.map(c => c.tool), TOOLS) && p.checks.every(c => digestShape(c.contract)), 'product_checklist');
  guard(p.max_jinghai_calls === 10 && p.max_jinghai_points === 10 && p.max_qcc_points === 0 && p.retention_hours === 24, 'product_limits');
  guard(equal(p.formats, ['json','zh-CN','en']) && p.recovery_token_required === true, 'product_delivery');
  for (const key of ['automatic_retry','automatic_paging','partial_report_charged','complete_due_diligence','qcc_automatic_fallback','human_review_included']) guard(p[key] === false, 'product_boundary');
  return p;
}

export function validateQuote(q) {
  guard(q?.x402Version === 2 && q.resource?.url === ENDPOINT && q.accepts?.length === 1, 'quote_resource');
  const a = q.accepts[0];
  guard(a.scheme === 'exact' && a.network === 'eip155:8453' && a.amount === '290000', 'quote_price');
  guard(a.asset?.toLowerCase() === ASSET && a.payTo?.toLowerCase() === SELLER, 'quote_destination');
  guard(Number.isInteger(a.maxTimeoutSeconds) && a.maxTimeoutSeconds > 0 && a.maxTimeoutSeconds <= 300, 'quote_expiry');
  guard(a.extra?.name === 'USD Coin' && a.extra?.version === '2' && (a.extra.assetTransferMethod ?? 'eip3009') === 'eip3009', 'quote_authorization');
  return q;
}

export function validateReport(r, p, company) {
  validateProduct(p);
  guard(r?.schema_version === 'cn-evidence-screening-product/1' && r.sku === SKU && r.contract === p.contract && r.price_usdc === '0.290000', 'report_product');
  guard(digestShape(r.request_id) && equal(r.checklist, TOOLS) && r.data?.length === 10, 'report_checklist');
  guard(r.usage?.upstream_attempts === 10 && r.usage?.qcc_calls === 0, 'report_usage');
  guard(normalize(r.analysis?.subject?.legal_name_cn) === normalize(company) && normalize(company), 'report_subject');
  guard(r.coverage?.all_contracted_checks_returned === true && r.coverage?.complete_due_diligence === false, 'report_coverage');
  guard(typeof r.analysis?.decision?.status === 'string' && r.analysis.decision.status !== 'identity_blocked', 'report_decision');
  let identity;
  for (let i = 0; i < 10; i++) {
    const entry = r.data[i], reply = entry.response, plan = p.checks[i];
    guard(reply?.tool === plan.tool && reply.contract === plan.contract, 'report_tool_contract');
    guard(reply.request_id === hash(canonical({parent:r.request_id,sku:SKU,contract:p.contract,tool:plan.tool})), 'report_child_operation');
    const raw = reply.result, copies = [];
    guard(raw && typeof raw === 'object' && (raw.isError === undefined || raw.isError === false), 'report_business_error');
    if (raw.structuredContent !== undefined) copies.push(raw.structuredContent);
    guard(raw.content === undefined || Array.isArray(raw.content), 'report_content');
    for (const c of raw.content ?? []) { guard(c?.type === 'text' && typeof c.text === 'string', 'report_content'); copies.push(JSON.parse(c.text)); }
    guard(copies.length && copies.every(c => equal(c, copies[0])), 'report_conflicting_copies');
    const b = copies[0], data = b?.data;
    guard(b?.status === 200 && b.success === true && data && typeof data === 'object', 'report_business_shape');
    if (i === 0) {
      guard(normalize(data.companyName) === normalize(company) && /^[0-9A-HJ-NPQRTUWXY]{18}$/.test(data.creditNumber ?? '') && data.creditNumber === r.analysis.subject.uscc, 'registration_identity');
      guard(typeof data.id === 'string' && data.id.trim(), 'registration_id'); identity = data;
      guard(equal(entry.arguments, {company_name:company}), 'report_arguments');
    } else {
      guard(equal(entry.arguments, {company_id:identity.id}), 'report_arguments');
      guard(data.pageIndex === 1 && Number.isInteger(data.pageSize) && data.pageSize >= 1 && data.pageSize <= 5 && Array.isArray(data.records) && data.records.length <= data.pageSize, 'report_first_page');
    }
  }
  const sources = r.analysis.sources;
  guard(Array.isArray(sources) && sources.length === 10 && TOOLS.every(tool => sources.filter(s => s.module === tool).length === 1), 'report_sources');
  guard(sources.every(s => ['ok','no_records'].includes(s.state) && ['matched','request_bound'].includes(s.identity_binding)), 'report_source_state');
  return r;
}

async function absent(file) { try { await lstat(file); } catch(e) { if(e.code === 'ENOENT') return; throw e; } throw new Error('file_exists'); }
async function save(file, value) { const fd=await open(file,'wx',0o600); try { await fd.writeFile(typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n'); await fd.sync(); } finally { await fd.close(); } }
async function bytes(response) {
  let size = 0; const parts = [];
  guard(response.body, 'empty_response');
  for await (const part of response.body) { size += part.byteLength; guard(size <= 2100000, 'oversized_response'); parts.push(Buffer.from(part)); }
  return Buffer.concat(parts).toString('utf8');
}
async function json(response) { return JSON.parse(await bytes(response)); }
function headers(internal) { return {'Accept':'application/json','Content-Type':'application/json',
  'User-Agent':internal ? 'CN-Evidence-Monitor/standard-client-1.0' : 'CN-Evidence-Buyer-Standard/1.0', ...(internal ? {'X-CN-Traffic':'internal_test'} : {})}; }
function request(fetchImpl, url, h, body, timeout = 30000) { return fetchImpl(url,{method:body === undefined ? 'GET':'POST',redirect:'error',headers:h,...(body === undefined ? {} : {body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeout)}); }
function checkCompany(name) { guard(typeof name === 'string' && name === name.trim() && name.length >= 2 && name.length <= 200 && /[\u3400-\u9fff]/u.test(name) && !/[\u0000-\u001f\u007f]/u.test(name), 'exact_chinese_name_required'); }
function checkPaths(state, out) { guard(state && out && ![state,state+'.attempt.json',state+'.receipt.json'].some(p => resolve(p) === resolve(out)), 'private_paths'); }
const help = `Standard-only example. Node 20+. No QCC or other product purchases.
  node standard-client.mjs preview --company "EXACT CHINESE LEGAL NAME" [--internal-test]
  node standard-client.mjs buy --company "EXACT CHINESE LEGAL NAME" --approve-contract HASH_FROM_PREVIEW --max-usdc 0.29 --state NEW_PRIVATE_FILE --out NEW_REPORT_JSON [--internal-test]
  node standard-client.mjs recover --state PRIVATE_FILE --out NEW_FILE [--format json|en|zh-CN] [--internal-test]
Preview never reads a wallet. Buy makes ONE signed request, with no automatic retry.
Buy alone uses CN_EVIDENCE_PRIVATE_KEY from a secure environment; never pass a key in arguments.
Store state/attempt/receipt/report files in a private, non-synced directory (restrict Windows ACLs yourself).
If an attempt is interrupted, keep its files and use recover; do not buy again with new files.
Recovery is free, uses the original contract/order and requires no wallet; retention is 24 hours.
This new client has offline and unsigned checks, not a fresh funded-client acceptance.`;

async function defaultSign(quote) {
  const key = process.env.CN_EVIDENCE_PRIVATE_KEY;
  guard(/^0x[0-9a-fA-F]{64}$/.test(key ?? ''), 'wallet_unavailable');
  const {privateKeyToAccount} = await import('viem/accounts');
  const {x402Client} = await import('@x402/core/client');
  const {ExactEvmScheme} = await import('@x402/evm/exact/client');
  const account = privateKeyToAccount(key); let count = 0;
  const signer = {address:account.address,signTypedData:async data => {
    guard(++count === 1, 'one_signature');
    const m = data.message, now = BigInt(Math.floor(Date.now()/1000));
    guard(Number(data.domain?.chainId) === 8453 && data.domain?.verifyingContract?.toLowerCase() === ASSET && data.domain?.name === 'USD Coin' && data.domain?.version === '2', 'signing_domain');
    guard(data.primaryType === 'TransferWithAuthorization' && m?.from?.toLowerCase() === account.address.toLowerCase() && m?.to?.toLowerCase() === SELLER && BigInt(m.value) === 290000n, 'signing_transfer');
    guard(BigInt(m.validAfter) >= 0n && BigInt(m.validAfter) <= now && BigInt(m.validBefore) > now && BigInt(m.validBefore) <= now+300n && /^0x[0-9a-fA-F]{64}$/.test(m.nonce), 'signing_expiry_nonce');
    return account.signTypedData(data);
  }};
  const client = new x402Client(); client.register('eip155:8453',new ExactEvmScheme(signer));
  return client.createPaymentPayload(quote);
}

export async function run(args, {fetchImpl=globalThis.fetch,sign=defaultSign,write=console.log}={}) {
  if (!args.length || args[0] === '--help') { write(help); return; }
  const [command,...rest] = args, opt = {};
  guard(['preview','buy','recover'].includes(command), 'command');
  const allowed = command === 'preview' ? ['--company','--internal-test'] : command === 'buy'
    ? ['--company','--internal-test','--approve-contract','--max-usdc','--state','--out'] : ['--state','--out','--format','--internal-test'];
  for (let i=0;i<rest.length;i++) { const key=rest[i]; guard(allowed.includes(key) && !(key in opt),'arguments'); opt[key]=key === '--internal-test' ? true : rest[++i]; guard(opt[key] !== undefined && (opt[key] === true || !opt[key].startsWith('--')), 'argument_value'); }
  const h = headers(opt['--internal-test']);
  if (command === 'recover') {
    const state=opt['--state'],out=opt['--out'],format=opt['--format'] ?? 'json';
    checkPaths(state,out); guard(['json','en','zh-CN'].includes(format),'format'); await absent(out);
    const saved=JSON.parse(await readFile(state,'utf8')),attempt=JSON.parse(await readFile(state+'.attempt.json','utf8'));
    guard(saved.version === 1 && saved.sku === SKU && saved.url === ENDPOINT && digestShape(saved.recovery_token) && digestShape(attempt.operation_id),'state');
    checkCompany(saved.company_name); validateProduct(saved.product);
    const response=await request(fetchImpl,ORIGIN+'/free/cn/products/recover',h,{recovery_token:saved.recovery_token,format:'json'}),result=await json(response);
    guard(response.status === 200 && result.state === 'settled' && result.new_charge === false && result.upstream_called === false && String(result.amount_atomic) === '290000', 'recovery_unavailable_do_not_repay');
    validateReport(result.report,saved.product,saved.company_name); guard(result.report.request_id === attempt.operation_id,'recovery_order');
    if (format === 'json') await save(out,result.report);
    else {
      const html=await request(fetchImpl,ORIGIN+'/free/cn/products/recover',h,{recovery_token:saved.recovery_token,format});
      guard(html.status === 200 && html.headers.get('content-type')?.includes('text/html') && html.headers.get('cache-control')?.includes('no-store'),'html_response');
      const page=await bytes(html); guard(page.includes('<html') && !page.includes(saved.recovery_token) && page.includes(result.report.analysis.subject.uscc),'html_identity'); await save(out,page);
    }
    write(JSON.stringify({report_saved:true,format,new_payment_submitted:false,original_order_recovered:true})); return;
  }
  const company=opt['--company']; checkCompany(company);
  if (command === 'buy') {
    guard(opt['--max-usdc'] === '0.29' && digestShape(opt['--approve-contract']),'explicit_approval');
    checkPaths(opt['--state'],opt['--out']);
    for (const path of [opt['--state'],opt['--state']+'.attempt.json',opt['--state']+'.receipt.json',opt['--out']]) await absent(path);
  }
  const catalogResponse=await request(fetchImpl,ORIGIN+'/free/cn/products',h),catalog=await json(catalogResponse);
  guard(catalogResponse.status === 200 && catalog.schema_version === 'cn-evidence-products/1' && Array.isArray(catalog.products),'catalog');
  const matches=catalog.products.filter(p => p.sku === SKU); guard(matches.length === 1,'unique_product'); const p=validateProduct(matches[0]);
  guard(p.availability?.available === true && p.availability.contract === p.contract && p.purchase_endpoint === '/x402/cn/products/'+SKU,'product_unavailable');
  if(command === 'buy') guard(opt['--approve-contract'] === p.contract,'contract_changed_review_again');
  const body={arguments:{company_name:company},contract:p.contract};
  const unpaid=await request(fetchImpl,ENDPOINT,h,body); guard(unpaid.status === 402,'expected_unpaid_quote');
  const quote=validateQuote(await json(unpaid)),encoded=unpaid.headers.get('payment-required');
  guard(encoded && encoded.length < 20000,'quote_header'); const headerQuote=validateQuote(JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
  guard(equal(headerQuote.accepts,quote.accepts),'conflicting_quote');
  if(command === 'preview') { write(JSON.stringify({preview:true,sku:SKU,contract:p.contract,price_usdc:'0.29',checks:10,qcc_calls:0,payment_submitted:false,delivery_guaranteed:false})); return; }
  const state=opt['--state'],out=opt['--out'],token=randomBytes(32).toString('hex');
  // Exclusive reservation before wallet access/signing. Never reuse/delete it to retry.
  await save(state,{version:1,sku:SKU,url:ENDPOINT,product:p,company_name:company,recovery_token:token,intent:'one_attempt_reserved'});
  const payment=await sign(quote),auth=payment?.payload?.authorization;
  guard(/^0x[0-9a-fA-F]{40}$/.test(auth?.from ?? '') && /^0x[0-9a-fA-F]{64}$/.test(auth?.nonce ?? ''),'payment_identity');
  const operation=hash(auth.from.toLowerCase()+':'+auth.nonce.toLowerCase());
  await save(state+'.attempt.json',{operation_id:operation,state:'signed_request_about_to_send'});
  let reportSaved=false;
  try {
    const paid=await request(fetchImpl,ENDPOINT,{...h,'X-CN-Recovery-Token':token,'PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(payment)).toString('base64')},body,120000);
    const receiptHeader=paid.headers.get('payment-response'); guard(paid.status === 200 && receiptHeader && receiptHeader.length < 20000,'paid_response');
    const receipt=JSON.parse(Buffer.from(receiptHeader,'base64').toString('utf8'));
    guard(receipt.success === true && receipt.network === 'eip155:8453' && /^0x[0-9a-fA-F]{64}$/.test(receipt.transaction ?? ''),'settlement_metadata');
    const report=validateReport(await json(paid),p,company); guard(report.request_id === operation,'paid_order');
    await save(out,report); reportSaved=true; await save(state+'.receipt.json',{transaction:receipt.transaction,report_request_id:operation,report_saved:true});
    write(JSON.stringify({report_saved:true,payment_attempts:1,settlement_metadata_received:true,independent_chain_verification:false}));
  } catch {
    const result={report_saved:reportSaved,payment_attempts:1,state:'uncertain_do_not_repay',next_step:'Keep the state and attempt files. Use recover on the same order with a new output filename; never buy again automatically.'};
    write(JSON.stringify(result)); return result;
  }
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run(process.argv.slice(2)).then(r=>{if(r?.state === 'uncertain_do_not_repay') process.exitCode=2;}).catch(() => {console.error('Stopped safely. If private state exists, keep it and recover/reconcile that order; never automatically pay again.');process.exitCode=1;});
