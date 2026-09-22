#!/usr/bin/env node
// Node20+; npm install @x402/core@2.25.0 @x402/evm@2.25.0 viem@2.56.3
// Preview is free. One explicit --pay authorizes ONE signed HTTP attempt only.
import {randomBytes} from 'node:crypto';
import {writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const ORIGIN='https://api.cnevidence.com';
const SELLER='0x3aedb825b264e82676a42b1a6d12ea253c0ce852';
const ASSET='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const requireSafe=(ok,label)=>{if(!ok)throw new Error(label);};
export function validateQuote(q,tier,url,max){
  requireSafe(['basic','full'].includes(tier),'tier');
  const price=tier==='basic'?'32000':'93000';
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
async function saveReport(report,tier,out){
  requireSafe(report?.schema_version==='2.0.0'&&report.tier===tier&&report.modules&&typeof report.modules==='object','unexpected_report');
  await writePrivate(out,report);
}
export async function run(args,{fetchImpl=globalThis.fetch,sign,write=console.log}={}){
  if(args.includes('--help')||!args.length){write('Free preview: node purchase-client.mjs --tier basic --company "EXACT CHINESE LEGAL NAME"\nBuy once: add --pay --max-usdc 0.032 --state NEW_PRIVATE_FILE --out NEW_REPORT_FILE\nFull: --tier full --max-usdc 0.093. Use either --company or --uscc.\nProvide CN_EVIDENCE_PRIVATE_KEY via a secure environment/secret manager, never a command-line argument.\nAfter any interrupted attempt, use recovery-client.mjs status/recover with the SAME private file; never rerun buy with a new file.');return;}
  const opt={};for(let i=0;i<args.length;i++){
    const key=args[i];requireSafe(['--tier','--company','--uscc','--pay','--max-usdc','--state','--out'].includes(key)&&!(key in opt),'arguments');
    opt[key]=key==='--pay'?true:args[++i];requireSafe(opt[key]!==undefined,'missing_argument');
  }
  const tier=opt['--tier'];requireSafe(['basic','full'].includes(tier),'tier');
  requireSafe(Boolean(opt['--company'])!==Boolean(opt['--uscc']),'one_identity');
  let identity=opt['--company']?{company:opt['--company']}:{uscc:opt['--uscc']};
  const common={'Accept':'application/json','User-Agent':'CN-Evidence-Buyer-Example/1.0'};
  const pre=await fetchImpl(ORIGIN+'/free/cn/identity/preflight',{method:'POST',redirect:'error',headers:{...common,'Content-Type':'application/json'},body:JSON.stringify(identity),signal:AbortSignal.timeout(20000)});
  const prepared=await jsonResponse(pre);requireSafe(pre.status===200&&prepared.input_ready===true,'identity_not_ready');
  requireSafe(prepared.normalized_identity&&Object.keys(prepared.normalized_identity).length===1,'normalized_identity');
  identity=prepared.normalized_identity;
  const url=ORIGIN+'/x402/cn/supplier/evidence'+(tier==='basic'?'/basic?'+new URLSearchParams(identity):'');
  const request=tier==='basic'?{method:'GET'}:{method:'POST',body:JSON.stringify(identity)};
  if(tier==='full')common['Content-Type']='application/json';
  const response=await fetchImpl(url,{...request,headers:common,redirect:'error',signal:AbortSignal.timeout(20000)});
  requireSafe(response.status===402,'expected_unpaid_quote');
  const quote=await jsonResponse(response);
  const maxString=opt['--max-usdc'];
  if(opt['--pay'])requireSafe(typeof maxString==='string'&&/^(0|[1-9][0-9]*)\.[0-9]{1,6}$/.test(maxString),'explicit_budget');
  const max=opt['--pay']?BigInt(maxString.split('.')[0])*1000000n+BigInt(maxString.split('.')[1].padEnd(6,'0')):1000000n;
  validateQuote(quote,tier,url,max);
  if(!opt['--pay']){write(JSON.stringify({preview:true,tier,price_usdc:quote.accepts[0].amount==='32000'?'0.032':'0.093',payment_submitted:false}));return;}
  const state=opt['--state'],out=opt['--out'];requireSafe(state&&out&&resolve(state)!==resolve(out)&&resolve(state+'.receipt.json')!==resolve(out),'private_paths');
  await absent(out);await absent(state+'.receipt.json');
  const token=randomBytes(32).toString('hex');
  // Exclusive state reservation BEFORE signing; existing state always blocks repurchase.
  await writePrivate(state,{version:1,recovery_token:token,headers:{'X-CN-Recovery-Token':token},tier,url,amount:quote.accepts[0].amount,intent:'single_payment_attempt_reserved'});
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
    await saveReport(report,tier,out);
    await writePrivate(state+'.receipt.json',{transaction,report_request_id:report.request_id??null,report_saved:true});
    write(JSON.stringify({report_saved:true,recovered:false,transaction}));return;
  }catch{
    // One FREE recovery attempt, never a second paid request or fresh signature.
    const r=await fetchImpl(ORIGIN+'/free/cn/payment/recover',{method:'POST',redirect:'error',headers:{...common,'Content-Type':'application/json'},body:JSON.stringify({recovery_token:token,...(transaction?{transaction_hash:transaction}:{})}),signal:AbortSignal.timeout(20000)});
    const data=await jsonResponse(r);
    if(r.status===200&&data.state==='settled'&&data.report&&data.new_charge===false){await saveReport(data.report,tier,out);write(JSON.stringify({report_saved:true,recovered:true,transaction:data.transaction??transaction}));return;}
    write(JSON.stringify({report_saved:false,recovery_status:r.status,refund_status:data.refund?.status??null,next_step:'Keep the private state file. Use recovery-client status/recover; do not purchase again.'}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){run(process.argv.slice(2)).catch(()=>{console.error('Stopped. If the private state file exists, do not buy again; use free status/recovery. No payment is retried automatically.');process.exitCode=1;});}
