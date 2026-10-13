// Offline only. The imported fixture module also runs the six pure-validator tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {run} from '../docs/standard-client.mjs';
import {fixtureProduct, fixtureQuote, fixtureReport} from './test_standard_client.mjs';

const COMPANY='示例（上海）有限公司', ROOT='https://api.cnevidence.com';
const URL=ROOT+'/x402/cn/products/screening-standard-v1';
const AUTH={from:'0x'+'1'.repeat(40),nonce:'0x'+'2'.repeat(64)};
const OP=createHash('sha256').update(AUTH.from+':'+AUTH.nonce).digest('hex');
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64');
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
function product(){const p=fixtureProduct();return {...p,availability:{available:true,contract:p.contract},purchase_endpoint:'/x402/cn/products/'+p.sku};}
function quoteResponse(header=fixtureQuote()){return reply(fixtureQuote(),402,{'payment-required':b64(header)});}
function catalogResponse(p=product()){return reply({schema_version:'cn-evidence-products/1',products:[p]});}
function paidResponse(p=product(),report=fixtureReport(p,COMPANY,OP)){return reply(report,200,{'payment-response':b64({success:true,network:'eip155:8453',transaction:'0x'+'3'.repeat(64)})});}
function recovered(p=product()){return {state:'settled',new_charge:false,upstream_called:false,amount_atomic:290000,report:fixtureReport(p,COMPANY,OP)};}
async function isolated(fn){
  const dir=await mkdtemp(join(tmpdir(),'cn-standard-client-'));
  try{return await fn({dir,state:join(dir,'state.json'),out:join(dir,'report.json')});}
  finally{
    // Delete only this test-created exact directory, after validating its parent/name.
    assert.equal(resolve(dir,'..'),resolve(tmpdir()));assert.ok(basename(dir).startsWith('cn-standard-client-'));
    await rm(dir,{recursive:true,force:true});
  }
}
const buyArgs=(f,p=product())=>['buy','--company',COMPANY,'--approve-contract',p.contract,'--max-usdc','0.29','--state',f.state,'--out',f.out,'--internal-test'];
function network(responses){
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
    const next=responses.shift();assert.notEqual(next,undefined,'unexpected network request');if(next instanceof Error)throw next;return typeof next==='function'?next(url,options):next;}};
}
async function seed(f,p=product()){
  await writeFile(f.state,JSON.stringify({version:1,sku:p.sku,url:URL,product:p,company_name:COMPANY,recovery_token:'a'.repeat(64)}));
  await writeFile(f.state+'.attempt.json',JSON.stringify({operation_id:OP}));
}

test('preview is exactly catalog + unsigned quote, with no signing or private state',async()=>{
  const n=network([catalogResponse(),quoteResponse()]),logs=[];
  await run(['preview','--company',COMPANY,'--internal-test'],{...n,sign:()=>assert.fail('preview signed'),write:s=>logs.push(JSON.parse(s))});
  assert.equal(n.calls.length,2);assert.equal(n.calls[0].url,ROOT+'/free/cn/products');
  assert.equal(n.calls[1].options.headers['PAYMENT-SIGNATURE'],undefined);
  for(const c of n.calls){assert.equal(c.options.headers['X-CN-Traffic'],'internal_test');assert.match(c.options.headers['User-Agent'],/^CN-Evidence-Monitor\//);}
  assert.equal(logs[0].payment_submitted,false);assert.equal(logs[0].delivery_guaranteed,false);assert.equal(logs[0].price_usdc,'0.29');
});

test('buy reserves recovery before one signature, submits once, persists matching report and blocks reuse before networking',async()=>isolated(async f=>{
  const n=network([catalogResponse(),quoteResponse(),paidResponse()]),logs=[];let signatures=0;
  await run(buyArgs(f),{...n,write:s=>logs.push(JSON.parse(s)),sign:async()=>{
    signatures++;const saved=JSON.parse(await readFile(f.state,'utf8'));assert.match(saved.recovery_token,/^[a-f0-9]{64}$/);return {payload:{authorization:AUTH}};
  }});
  assert.equal(signatures,1);assert.equal(n.calls.length,3);assert.equal(n.calls[2].options.method,'POST');
  assert.ok(n.calls[2].options.headers['PAYMENT-SIGNATURE']);
  const saved=JSON.parse(await readFile(f.state,'utf8'));
  assert.equal(n.calls[2].options.headers['X-CN-Recovery-Token'],saved.recovery_token);
  assert.equal(JSON.parse(await readFile(f.out,'utf8')).request_id,OP);
  assert.equal(JSON.parse(await readFile(f.state+'.attempt.json','utf8')).operation_id,OP);
  assert.equal(JSON.parse(await readFile(f.state+'.receipt.json','utf8')).report_saved,true);
  assert.equal(logs[0].independent_chain_verification,false);assert.ok(!JSON.stringify(logs).includes(saved.recovery_token));
  await assert.rejects(run(buyArgs(f),{fetchImpl:()=>assert.fail('reused state networked'),sign:()=>assert.fail('reused state signed')}),/file_exists/);
}));

test('timeout after signed dispatch never retries; same order recovery needs no signer/catalog/current contract',async()=>isolated(async f=>{
  const n=network([catalogResponse(),quoteResponse(),new Error('simulated timeout')]),logs=[];
  const result=await run(buyArgs(f),{...n,sign:async()=>({payload:{authorization:AUTH}}),write:s=>logs.push(JSON.parse(s))});
  assert.equal(n.calls.length,3);assert.equal(result.state,'uncertain_do_not_repay');await assert.rejects(access(f.out));
  const rec=network([reply(recovered())]);
  await run(['recover','--state',f.state,'--out',f.out],{...rec,sign:()=>assert.fail('recovery signed'),write:s=>logs.push(JSON.parse(s))});
  assert.equal(rec.calls.length,1);assert.equal(rec.calls[0].url,ROOT+'/free/cn/products/recover');
  assert.equal(rec.calls[0].options.headers['PAYMENT-SIGNATURE'],undefined);
  assert.equal(logs.at(-1).new_payment_submitted,false);
}));

test('explicit approval, price ceiling, paths, flags and exact name rejected before network',async()=>isolated(async f=>{
  const base=buyArgs(f);
  const cases=[base.filter((v,i)=>![base.indexOf('--approve-contract'),base.indexOf('--approve-contract')+1].includes(i)),
    base.map(v=>v==='0.29'?'0.59':v),base.map(v=>v===f.out?f.state:v),base.concat(['--unknown','yes']),base.concat(['--out',f.out]),
    ['preview','--company','Tencent'],['preview','--company',' '+COMPANY]];
  for(const args of cases)await assert.rejects(run(args,{fetchImpl:()=>assert.fail('invalid options networked'),sign:()=>assert.fail('invalid options signed')}));
}));

test('contract change, unavailable or duplicate SKU and conflicting quote fail without signing/state',async()=>isolated(async f=>{
  const changed=product();changed.contract='f'.repeat(64);changed.availability.contract=changed.contract;
  const unavailable=product();unavailable.availability.available=false;
  const inconsistent=fixtureQuote();inconsistent.accepts[0].maxTimeoutSeconds=90;
  const responses=[[catalogResponse(changed)],[catalogResponse(unavailable)],
    [reply({schema_version:'cn-evidence-products/1',products:[product(),product()]})],[catalogResponse(),quoteResponse(inconsistent)]];
  for(const batch of responses){const n=network(batch);await assert.rejects(run(buyArgs(f),{...n,sign:()=>assert.fail('bad preflight signed')}));await assert.rejects(access(f.state));}
}));

test('signature failure retains reservation but never submits a payment',async()=>isolated(async f=>{
  const n=network([catalogResponse(),quoteResponse()]);
  await assert.rejects(run(buyArgs(f),{...n,sign:async()=>{throw new Error('no signer');}}));
  assert.equal(n.calls.length,2);await access(f.state);await assert.rejects(access(f.state+'.attempt.json'));
}));

test('wrong signed-order report is uncertain, not accepted and never repaid',async()=>isolated(async f=>{
  const n=network([catalogResponse(),quoteResponse(),paidResponse(product(),fixtureReport(product(),COMPANY,'f'.repeat(64)))]);
  const result=await run(buyArgs(f),{...n,sign:async()=>({payload:{authorization:AUTH}}),write:()=>{}});
  assert.equal(result.state,'uncertain_do_not_repay');assert.equal(n.calls.length,3);await assert.rejects(access(f.out));
}));

test('recovery rejects different order/company, wrong price, new charge or upstream call',async()=>isolated(async f=>{
  await seed(f);
  for(const mutation of [r=>{r.report=fixtureReport(product(),COMPANY,'f'.repeat(64));},r=>{r.report=fixtureReport(product(),'其他示例有限公司',OP);},
    r=>{r.amount_atomic=590000;},r=>{r.new_charge=true;},r=>{r.upstream_called=true;},r=>{r.state='pending';}]){
    const body=recovered();mutation(body);const n=network([reply(body)]);
    await assert.rejects(run(['recover','--state',f.state,'--out',f.out],{...n,sign:()=>assert.fail('signed'),write:()=>{}}));
    assert.equal(n.calls.length,1);await assert.rejects(access(f.out));
  }
}));

test('HTML recovery validates JSON first, then saves original HTML without signature or token output',async()=>isolated(async f=>{
  await seed(f);const report=recovered(),html='<html><body>'+report.report.analysis.subject.uscc+'</body></html>';
  const n=network([reply(report),new Response(html,{headers:{'content-type':'text/html','cache-control':'no-store'}})]),logs=[];
  await run(['recover','--state',f.state,'--out',f.out,'--format','en','--internal-test'],{...n,sign:()=>assert.fail('signed'),write:s=>logs.push(s)});
  assert.equal(n.calls.length,2);assert.equal(JSON.parse(n.calls[0].options.body).format,'json');assert.equal(JSON.parse(n.calls[1].options.body).format,'en');
  assert.equal(await readFile(f.out,'utf8'),html);assert.ok(!logs.join('').includes('a'.repeat(64)));
  await assert.rejects(run(['recover','--state',f.state,'--out',f.out],{fetchImpl:()=>assert.fail('existing output networked')}),/file_exists/);
}));

test('HTML recovery rejects missing no-store, leaked token or wrong identity',async()=>isolated(async f=>{
  await seed(f);const uscc=recovered().report.analysis.subject.uscc;
  for(const [body,cache] of [['<html>'+uscc,'public'],['<html>'+uscc+'a'.repeat(64),'no-store'],['<html>wrong company','no-store']]){
    const n=network([reply(recovered()),new Response(body,{headers:{'content-type':'text/html','cache-control':cache}})]);
    await assert.rejects(run(['recover','--state',f.state,'--out',f.out,'--format','en'],{...n,write:()=>{}}));await assert.rejects(access(f.out));
  }
}));

test('oversized preflight response and non-402 quote stop without a signer',async()=>{
  for(const batch of [[new Response('x'.repeat(2100001))],[catalogResponse(),reply({error:'unavailable'},503)]]){
    await assert.rejects(run(['preview','--company',COMPANY],{...network(batch),sign:()=>assert.fail('signed')}));
  }
});

test('receipt write collision preserves true report_saved and refuses a second paid attempt',async()=>isolated(async f=>{
  const n=network([catalogResponse(),quoteResponse(),async()=>{await writeFile(f.state+'.receipt.json','simulated race');return paidResponse();}]);
  const result=await run(buyArgs(f),{...n,sign:async()=>({payload:{authorization:AUTH}}),write:()=>{}});
  assert.equal(result.report_saved,true);assert.equal(result.state,'uncertain_do_not_repay');assert.equal(n.calls.length,3);await access(f.out);
}));
