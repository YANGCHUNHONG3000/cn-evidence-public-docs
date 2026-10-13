import {OFFERS,readReport,prepareBrief} from './report-workbench-core.mjs';
const $=id=>document.getElementById(id);
let brief='',generation=0;
function resetBrief(){brief='';$('brief-result').hidden=true;$('brief-text').textContent='';$('brief-status').textContent='';}
function offer(){resetBrief();const q=$('sku').value==='qcc-qualifications-v1';$('format').disabled=q;$('uscc').required=q;if(q)$('format').value='json';$('scope').textContent=OFFERS[$('sku').value].scope;}
$('sku').addEventListener('change',offer);offer();
for(const id of ['company','uscc','format','purpose'])$(id).addEventListener('input',resetBrief);
$('brief-form').addEventListener('submit',e=>{e.preventDefault();resetBrief();try{
  brief=prepareBrief(Object.fromEntries(['company','uscc','sku','format','purpose'].map(id=>[id,$(id).value])));
  $('brief-text').textContent=brief;$('brief-result').hidden=false;$('brief-status').textContent='Prepared locally. Not submitted or paid. / 已本地生成，未提交、未付款。';
}catch{$('brief-status').textContent='Check the Chinese registered name, USCC and output format. / 请检查中文登记全称、统一社会信用代码和输出格式。';}});
$('download-brief').addEventListener('click',()=>{if(!brief)return;const url=URL.createObjectURL(new Blob([brief],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='cn-evidence-pilot-scope.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
function clearReport(){generation++;$('report-result').hidden=true;$('report-status').textContent='';for(const id of ['subject','report-meta','decision','coverage','actions','limitations'])$(id).replaceChildren();}
$('clear-report').addEventListener('click',()=>{clearReport();$('report-file').value='';});
function list(id,values){const target=$(id);for(const value of values){const li=document.createElement('li');li.textContent=value;target.append(li);}if(!values.length){const li=document.createElement('li');li.textContent='Not supplied in this file / 此文件未提供';target.append(li);}}
$('report-file').addEventListener('change',async()=>{clearReport();const current=generation,file=$('report-file').files[0];if(!file)return;
  try{if(file.size>2100000)throw new Error('size');const r=readReport(await file.text());if(current!==generation)return;
    $('subject').textContent=r.subject;$('report-meta').textContent=r.uscc+' · '+r.sku+' · '+r.when;$('decision').textContent=r.decision;
    for(const row of r.rows){const tr=document.createElement('tr');const labels={conflicting_counts:'Conflicting counts / 数量冲突',more_indicated:'More indicated / 有未取记录线索',completeness_unknown:'Not proven complete / 未证明完整'};
      for(const val of [row.label,row.returned??'Unknown / 未知',row.total??'Unknown / 未知',row.remaining??'Unknown / 未知',labels[row.warning]]){const td=document.createElement('td');td.textContent=String(val);tr.append(td);}
      if(row.warning!=='completeness_unknown')tr.lastChild.className='warning';$('coverage').append(tr);}
    list('actions',r.actions);list('limitations',r.limitations);$('report-result').hidden=false;$('report-status').textContent=r.sample?'Historical internal sample, not a customer report. / 历史内部样张，非客户案例。':'Local file loaded. Authenticity and payment are not verified. / 已本地读取，未验证真实性或付款。';
  }catch{if(current!==generation)return;clearReport();$('report-file').value='';$('report-status').textContent='Cannot read as a supported report. Choose a report JSON, not private state; maximum 2.1 MB. / 无法识别，请选择报告 JSON 而非私密状态文件（最大2.1 MB）。';}
});
