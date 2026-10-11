#!/usr/bin/env node
// Node20+; npm install @x402/core@2.25.0 @x402/evm@2.25.0 viem@2.56.3
// Preview is free. One explicit --pay authorizes ONE signed HTTP attempt only.
import {randomBytes} from 'node:crypto';
import {writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const ORIGIN='https://api.cnevidence.com';
const SELLER='0x3aedb825b264e82676a42b1a6d12ea253c0ce852';
const ASSET='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const requireSafe=(ok,label)=>{if(!ok)throw new Error(label);};
const PRICES={basic:'32000',full:'93000',v3_company_detail:'11000'};
const normalizeName=value=>value.replaceAll('（','(').replaceAll('）',')').trim();
export function validateQuote(q,tier,url,max){
  requireSafe(Object.hasOwn(PRICES,tier),'product');
  const price=PRICES[tier];
  requireSafe(q?.x402Version===2&&q.accepts?.length===1&&q.resource?.url===url,'quote');
  const a=q.accepts[0];
  requireSafe(a.scheme==='exact'&&a.network==='eip155:8453'&&a.asset?.toLowerCase()===ASSET&&a.payTo?.toLowerCase()===SELLER,'destination');
  requireSafe(a.amount===price&&BigInt(price)<=max,'price');
  requireSafe(a.extra?.name==='USD Coin'&&a.extra?.version==='2'&&(a.extra.assetTransferMethod??'eip3009')==='eip3009','authorization_type');
  requireSafe(Number.isInteger(a.maxTimeoutSeconds)&&a.maxTimeoutSeconds>0&&a.maxTimeoutSeconds<=300,'expiry');
  return a;
}
async function jsonResponse(response){
  let length=0;const chunks=[];
  for await(const chunk of response.body){length+=chunk.length;requireSafe(length<=2100000,'response_too_large');chunks.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function absent(file){try{await lstat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}throw new Error('file_exists');}
async function writePrivate(file,obj){await writeFile(file,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});}
async function saveReport(report,tier,out,identity){
  if(tier==='v3_company_detail'){
    requireSafe(report?.schema_version==='3.0.0'&&report.tool===tier&&report.result_assessment?.business_success===true&&report.result_assessment?.entity_identity_verified===true,'unexpected_report');
    const raw=report.result,sections=[];
    requireSafe(raw&&typeof raw==='object'&&(raw.isError??false)===false,'business_error');
    if(raw.structuredContent!==undefined)sections.push(raw.structuredContent);
    requireSafe(raw.content===undefined||Array.isArray(raw.content),'business_shape');
    for(const block of raw.content??[]){requireSafe(block?.type==='text'&&typeof block.text==='string','business_shape');sections.push(JSON.parse(block.text));}
    requireSafe(sections.length>0&&sections.every(s=>isDeepStrictEqual(s,sections[0])),'business_conflict');
    const p=sections[0],data=p?.data;
    requireSafe(p?.status===200&&p.success===true&&data&&typeof data.id==='string'&&data.id.trim()&&typeof data.companyName==='string','business_shape');
    requireSafe(normalizeName(data.companyName)===normalizeName(identity.company_name),'entity_mismatch');
  }else{
    requireSafe(report?.schema_version==='2.0.0'&&report.tier===tier&&report.modules&&typeof report.modules==='object','unexpected_report');
  }
  await writePrivate(out,report);
}
export async function run(args,{fetchImpl=globalThis.fetch,sign,write=console.log}={}){
  if(args.includes('--help')||!args.length){write('Free V3 preview: node purchase-client.mjs --tool v3_company_detail --company "EXACT CHINESE LEGAL NAME"\nBuy once: add --pay --max-usdc 0.011 --state NEW_PRIVATE_FILE --out NEW_REPORT_FILE\nLegacy: --tier basic (0.032) or --tier full (0.093), with either --company or --uscc.\nThis example supports company-name V3 detail only, not all V3 tools or MCP payment.\nProvide CN_EVIDENCE_PRIVATE_KEY via a secure environment/secret manager, never a command-line argument.\nAfter any interrupted attempt, use recovery-client.mjs status/recover with the SAME private file; never rerun buy with a new file.');return;}
  const opt={};for(let i=0;i<args.length;i++){
    const key=args[i];requireSafe(['--tier','--tool','--company','--uscc','--pay','--max-usdc','--state','--out'].includes(key)&&!(key in opt),'arguments');
    opt[key]=key==='--pay'?true:args[++i];requireSafe(opt[key]!==undefined&&(key==='--pay'||!opt[key].startsWith('--')),'missing_argument');
  }
  requireSafe(Object.hasOwn(opt,'--tier')!==Object.hasOwn(opt,'--tool'),'one_product');
  const v3=Object.hasOwn(opt,'--tool'),tier=v3?opt['--tool']:opt['--tier'];
  requireSafe(v3?tier==='v3_company_detail':['basic','full'].includes(tier),'product');
  const common={'Accept':'application/json','User-Agent':'CN-Evidence-Buyer-Example/1.0'};
  let identity,url,request;
  if(v3){
    const name=opt['--company']?.trim();
    requireSafe(!Object.hasOwn(opt,'--uscc')&&name&&name.length<=200&&/[\u3400-\u9fff]/u.test(name)&&!/[\u0000-\u001f\u007f]/u.test(name),'confirmed_chinese_name_required');
    identity={company_name:name};
    url=ORIGIN+'/x402/cn/tools/v3_company_detail';request={method:'POST',body:JSON.stringify({arguments:identity})};
  }else{
    requireSafe(Boolean(opt['--company'])!==Boolean(opt['--uscc']),'one_identity');
    identity=opt['--company']?{company:opt['--company']}:{uscc:opt['--uscc']};
    const pre=await fetchImpl(ORIGIN+'/free/cn/identity/preflight',{method:'POST',redirect:'error',headers:{...common,'Content-Type':'application/json'},body:JSON.stringify(identity),signal:AbortSignal.timeout(20000)});
    const prepared=await jsonResponse(pre);requireSafe(pre.status===200&&prepared.input_ready===true,'identity_not_ready');
    requireSafe(prepared.normalized_identity&&Object.keys(prepared.normalized_identity).length===1,'normalized_identity');
    identity=prepared.normalized_identity;
    url=ORIGIN+'/x402/cn/supplier/evidence'+(tier==='basic'?'/basic?'+new URLSearchParams(identity):'');
    request=tier==='basic'?{method:'GET'}:{method:'POST',body:JSON.stringify(identity)};
  }
  if(request.method==='POST')common['Content-Type']='application/json';
  const response=await fetchImpl(url,{...request,headers:common,redirect:'error',signal:AbortSignal.timeout(20000)});
  requireSafe(response.status===402,'expected_unpaid_quote');
  const quote=await jsonResponse(response);
  const maxString=opt['--max-usdc'];
  if(opt['--pay'])requireSafe(typeof maxString==='string'&&/^(0|[1-9][0-9]*)\.[0-9]{1,6}$/.test(maxString),'explicit_budget');
  const max=opt['--pay']?BigInt(maxString.split('.')[0])*1000000n+BigInt(maxString.split('.')[1].padEnd(6,'0')):1000000n;
  validateQuote(quote,tier,url,max);
  const product=v3?{tool:tier}:{tier};
  if(!opt['--pay']){write(JSON.stringify({preview:true,...product,price_usdc:({basic:'0.032',full:'0.093',v3_company_detail:'0.011'})[tier],payment_submitted:false}));return;}
  const state=opt['--state'],out=opt['--out'];requireSafe(state&&out&&resolve(state)!==resolve(out)&&resolve(state+'.receipt.json')!==resolve(out),'private_paths');
  await absent(out);await absent(state+'.receipt.json');
  const token=randomBytes(32).toString('hex');
  // Exclusive state reservation BEFORE signing; existing state always blocks repurchase.
  await writePrivate(state,{version:1,recovery_token:token,headers:{'X-CN-Recovery-Token':token},...product,url,amount:quote.accepts[0].amount,intent:'single_payment_attempt_reserved'});
  if(!sign)sign=async q=>{
    const key=process.env.CN_EVIDENCE_PRIVATE_KEY;requireSafe(/^0x[0-9a-fA-F]{64}$/.test(key??''),'wallet_unavailable');
    const {privateKeyToAccount}=await import('viem/accounts');
    const {x402Client}=await import('@x402/core/client');const {ExactEvmScheme}=await import('@x402/evm/exact/client');
    const account=privateKeyToAccount(key);let signatures=0;
    const signer={address:account.address,signTypedData:async data=>{
      requireSafe(++signatures===1,'one_signature_only');
      requireSafe(Number(data.domain?.chainId)===8453&&data.domain?.verifyingContract?.toLowerCase()===ASSET&&data.domain?.name==='USD Coin'&&data.domain?.version==='2','signing_domain');
      const m=data.message,now=Math.floor(Date.now()/1000);
      requireSafe(data.primaryType==='TransferWithAuthorization'&&m?.from?.toLowerCase()===account.address.toLowerCase()&&m?.to?.toLowerCase()===SELLER&&BigInt(m.value)===BigInt(q.accepts[0].amount),'signing_transfer');
      requireSafe(Number(m.validBefore)>now&&Number(m.validBefore)<=now+300,'signing_expiry');
      return account.signTypedData(data);
    }};
    const client=new x402Client();client.register('eip155:8453',new ExactEvmScheme(signer));
    return client.createPaymentPayload(q);
  };
  let transaction=null;
  try{
    const payment=await sign(quote);
    const paid=await fetchImpl(url,{...request,redirect:'error',headers:{...common,'X-CN-Recovery-Token':token,'PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(payment)).toString('base64')},signal:AbortSignal.timeout(120000)});
    const encoded=paid.headers.get('payment-response');
    if(encoded){const receipt=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));if(/^0x[0-9a-fA-F]{64}$/.test(receipt.transaction??''))transaction=receipt.transaction;}
    const report=await jsonResponse(paid);requireSafe(paid.status===200,'paid_response_not_successful');
    await saveReport(report,tier,out,identity);
    await writePrivate(state+'.receipt.json',{transaction,report_request_id:report.request_id??null,report_saved:true});
    write(JSON.stringify({report_saved:true,recovered:false,transaction}));return;
  }catch{
    // One FREE recovery attempt, never a second paid request or fresh signature.
    const r=await fetchImpl(ORIGIN+'/free/cn/payment/recover',{method:'POST',redirect:'error',headers:{...common,'Content-Type':'application/json'},body:JSON.stringify({recovery_token:token,include_report:true,...(transaction?{transaction_hash:transaction}:{})}),signal:AbortSignal.timeout(20000)});
    const data=await jsonResponse(r);
    if(r.status===200&&data.state==='settled'&&data.report&&data.new_charge===false){await saveReport(data.report,tier,out,identity);write(JSON.stringify({report_saved:true,recovered:true,transaction:data.transaction??transaction}));return;}
    write(JSON.stringify({report_saved:false,recovery_status:r.status,refund_status:data.refund?.status??null,next_step:'Keep the private state file. Use recovery-client status/recover; do not purchase again.'}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){run(process.argv.slice(2)).catch(()=>{console.error('Stopped. If the private state file exists, do not buy again; use free status/recovery. No payment is retried automatically.');process.exitCode=1;});}
