#!/usr/bin/env node
// Node 20+. No dependencies, wallet access, signing, spending or automatic retry.
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const API='https://api.cnevidence.com/free/cn/payment/recover';
const MCP='https://mcp.cnevidence.com/mcp';
const help=`CN Evidence free recovery helper (Node 20+)
  node recovery-client.mjs init PRIVATE_FILE
  node recovery-client.mjs diagnose
  node recovery-client.mjs status PRIVATE_FILE [--txhash EXISTING_BASE_TX]
  node recovery-client.mjs recover PRIVATE_FILE --out NEW_REPORT_FILE [--txhash EXISTING_BASE_TX]
Init saves a secret and headers. Your payment client must send that header on the
original paid request; this helper does NOT configure your wallet/payment client.
Use a unique file per purchase. Never share it or put it in source control.
No private keys are requested. No command buys data or retries a payment.`;

async function absent(file){
  try{await lstat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
  throw new Error('Destination already exists; refusing to overwrite.');
}
async function request(url,body,fetchImpl,extraHeaders={}){
  const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json',...extraHeaders},body:JSON.stringify(body)});
  let size=0;const parts=[];
  if(response.body)for await(const chunk of response.body){
    size+=chunk.byteLength;if(size>2_100_000)throw new Error('Response too large; stop and reconcile.');parts.push(Buffer.from(chunk));
  }
  let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new Error('Non-JSON response; stop and reconcile.');}
  return {status:response.status,data};
}
export async function run(args,{fetchImpl=globalThis.fetch,write=console.log}={}){
  const [command,file,...options]=args;
  if(!command||command==='--help'){write(help);return;}
  if(command==='diagnose'){
    if(file)throw new Error('diagnose takes no arguments.');
    const r=await request(MCP,{jsonrpc:'2.0',id:1,method:'tools/list',params:{}},fetchImpl,
      {Accept:'application/json, text/event-stream','X-CN-Traffic':'internal_test'});
    const toolCount=r.data.result?.tools?.length;
    write(JSON.stringify({http_status:r.status,tool_count:toolCount??null,connection_ok:r.status===200&&Number.isInteger(toolCount),payment_tested:false,company_data_requested:false}));return;
  }
  if(!['init','status','recover'].includes(command)||!file)throw new Error('Invalid arguments. Use --help.');
  if(command==='init'){
    if(options.length)throw new Error('init accepts only the private file path.');
    const token=randomBytes(32).toString('hex');
    await writeFile(file,JSON.stringify({version:1,recovery_token:token,headers:{'X-CN-Recovery-Token':token}},null,2)+'\n',{flag:'wx',mode:0o600});
    write('Private recovery file created. Send its header on the paid request using your separately authorized payment client. Token not printed.');return;
  }
  let out,tx;
  for(let i=0;i<options.length;i+=2){
    const k=options[i],v=options[i+1];
    if(!v||!['--out','--txhash'].includes(k))throw new Error('Invalid option; use --help.');
    if(k==='--out'){if(out)throw new Error('Duplicate --out.');out=v;}
    else{if(tx)throw new Error('Duplicate --txhash.');tx=v;}
  }
  if(command==='recover'&&!out)throw new Error('recover requires --out; reports are never printed.');
  if(command==='status'&&out)throw new Error('status does not write reports.');
  if(tx&&!/^0x[0-9a-fA-F]{64}$/.test(tx))throw new Error('Invalid transaction hash.');
  if(out){if(resolve(file)===resolve(out))throw new Error('Output cannot be the token file.');await absent(out);}
  const privateData=JSON.parse(await readFile(file,'utf8'));
  const token=privateData.recovery_token;
  if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw new Error('Invalid recovery file.');
  const body={recovery_token:token,include_report:command==='recover'};
  if(tx)body.transaction_hash=tx;
  const {status,data}=await request(API,body,fetchImpl);
  let saved=false;
  if(status===200&&command==='recover'&&data.refund?.status!=='refunded_confirmed'){
    if(data.state!=='settled'||!data.report||data.new_charge!==false)throw new Error('Unexpected recovery response; no report saved.');
    await writeFile(out,JSON.stringify(data.report,null,2)+'\n',{flag:'wx',mode:0o600});saved=true;
  }
  // Only sanitized order metadata; never log token, request body or report.
  write(JSON.stringify({http_status:status,state:data.state??null,order_id:data.order_id??null,chain_check:data.chain_check??null,
    restored_from_archive:data.restored_from_archive===true,refund_status:data.refund?.status??null,refund_transaction:data.refund?.transaction??null,
    report_saved:saved,new_payment_submitted:false,next_step:status===200?'Keep your private receipt.':'Do not pay again automatically. Check the guide or ask for reconciliation.'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  run(process.argv.slice(2)).catch(()=>{console.error('Operation failed. Check arguments, private file and connectivity. No payment was submitted; do not automatically buy again.');process.exitCode=1;});
}
