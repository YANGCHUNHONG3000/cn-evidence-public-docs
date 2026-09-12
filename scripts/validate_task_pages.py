"""Static task-page QA. No requests, signing, production writes or frontend build."""
import argparse,hashlib,json,re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse,unquote
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1];DOCS=ROOT/'docs'
BASE='https://yangchunhong3000.github.io/cn-evidence-public-docs/'
API='https://api.cnevidence.com/openapi.json'
MCP='https://mcp.cnevidence.com/mcp'
PATHS=['china-supplier-verification/','china-government-procurement-evidence/','china-company-regulatory-evidence/',
       'zh/china-supplier-verification/','zh/government-procurement-evidence/','zh/regulatory-evidence/']

class Document(HTMLParser):
    VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self,text):
        super().__init__(convert_charrefs=True);self.stack=[];self.errors=[];self.tags=[];self.text=[];self.captures={};self.active=[]
        self.feed(text);self.close()
        if self.stack:self.errors.append('Unclosed tags: '+str(self.stack))
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.tags.append((tag,a))
        if len(a)!=len(attrs):self.errors.append('Duplicate attribute')
        if tag not in self.VOID:self.stack.append(tag)
        key=tag if tag in ('title','h1') else ('example' if tag=='code' and 'data-example' in a else None)
        if key:self.active.append(key);self.captures.setdefault(key,[]).append('')
    def handle_endtag(self,tag):
        if tag in self.VOID:return
        if not self.stack or self.stack[-1]!=tag:self.errors.append('Mismatched closing '+tag)
        else:self.stack.pop()
        key=tag if tag in ('title','h1') else ('example' if tag=='code' and self.active and self.active[-1]=='example' else None)
        if key and self.active and self.active[-1]==key:self.active.pop()
    def handle_data(self,data):
        self.text.append(data)
        for key in self.active:self.captures[key][-1]+=data

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'validation.json')
    p.add_argument('--contracts',type=Path,required=True,help='Saved public OpenAPI/static example JSON directory')
    args=p.parse_args();checks=[]
    def check(name,ok,detail=''):checks.append({'check':name,'status':'PASS' if ok else 'FAIL','detail':detail})
    docs={f.resolve():Document(f.read_text(encoding='utf-8')) for f in DOCS.rglob('*.html')}
    titles=[];heads=[];descriptions=[]
    for path in PATHS:
        file=(DOCS/path/'index.html').resolve();prefix=path
        check(prefix+'exists',file in docs)
        if file not in docs:continue
        doc=docs[file];text=' '.join(doc.text);tags=doc.tags
        title=doc.captures.get('title',[]);h1=doc.captures.get('h1',[])
        meta=[a.get('content','') for t,a in tags if t=='meta' and a.get('name')=='description']
        check(prefix+'title',len(title)==1 and bool(title[0].strip()));titles+=title
        check(prefix+'h1',len(h1)==1 and bool(h1[0].strip()));heads+=h1
        check(prefix+'description',len(meta)==1 and bool(meta[0].strip()));descriptions+=meta
        zh=path.startswith('zh/');check(prefix+'lang',any(t=='html' and a.get('lang')==('zh-CN' if zh else 'en') for t,a in tags))
        if not zh:check(prefix+'description_length',bool(meta) and 140<=len(meta[0])<=170)
        links=[a for t,a in tags if t=='link'];hrefs=[a.get('href') for t,a in tags if t=='a']
        check(prefix+'canonical',[a.get('href') for a in links if a.get('rel')=='canonical']==[BASE+path])
        alts={a.get('hreflang'):a.get('href') for a in links if a.get('rel')=='alternate'}
        en=PATHS[PATHS.index(path)%3];cn=PATHS[PATHS.index(path)%3+3]
        check(prefix+'paired_hreflang',alts.get('en')==BASE+en and alts.get('zh-CN')==BASE+cn)
        check(prefix+'MCP_URL',MCP in hrefs);check(prefix+'OpenAPI_URL',API in hrefs)
        check(prefix+'prices',all(x in text for x in ['Basic $0.002 USDC','Full $0.01 USDC']))
        check(prefix+'price_allowlist',set(re.findall(r'\$[0-9]+\.[0-9]+',text))=={'$0.002','$0.01'})
        check(prefix+'tool_ids',all(x in text for x in ['resolve_china_company','get_china_supplier_evidence_basic','get_china_supplier_evidence_full']))
        boundary='结果仅覆盖当前已配置的官方/开放数据集，不应理解为全国范围完整覆盖。' if zh else 'Results are limited to configured official/open datasets and must not be interpreted as nationwide completeness.'
        check(prefix+'coverage',boundary in text)
        check(prefix+'static_example_label','not_live_query' in text and 'example' in text.lower())
        check(prefix+'no_forms_or_scripts',not any(t in ('form','script') for t,a in tags))
        check(prefix+'related_pages',all(BASE+x in hrefs for x in PATHS if x!=path and x.startswith('zh/')==zh))
        check(prefix+'home',BASE+('zh/' if zh else '') in hrefs)
        if 'procurement' in path:check(prefix+'award_boundary',('中标 ≠ 已证明履约成功' if zh else 'Awards are not proof of contract performance') in text)
        if 'regulatory' in path:check(prefix+'history_boundary',('存在历史处罚记录 ≠ 自动判定当前不合格' if zh else 'A historical penalty record does not automatically mean a supplier is currently unqualified') in text)
        try:
            ex=json.loads(doc.captures['example'][0]);schema=json.loads((args.contracts/'openapi.json').read_text(encoding='utf-8'))
            if 'verification' in path:
                original=schema['components']['schemas']['FullSupplierEvidenceRequest']
                valid=ex['anyOf']==original['anyOf'] and all(all(original['properties'][k][a]==v for a,v in fields.items()) for k,fields in ex['properties'].items())
            else:
                samples=json.loads((args.contracts/'full.json').read_text(encoding='utf-8'))['response_example']['evidence']
                original=next(x for x in samples if x['type']==ex['type'])
                valid=all(original[k]==v for k,v in ex.items()) and all(k in ex for k in schema['components']['schemas']['EvidenceItem']['required'])
                valid=valid and bool(ex.get('dataset_id') or ex.get('content_id'))
            check(prefix+'example_public_projection',valid)
        except (ValueError,KeyError,StopIteration) as e:check(prefix+'example_public_projection',False,str(e))
    for label,values in [('titles',titles),('h1s',heads),('descriptions',descriptions)]:check('unique_'+label,len(values)==len(set(values))==6)
    for file,doc in docs.items():
        check(str(file.relative_to(ROOT))+' HTML balance',not doc.errors,str(doc.errors))
        ids=[a['id'] for t,a in doc.tags if 'id' in a];check(str(file.relative_to(ROOT))+' unique IDs',len(ids)==len(set(ids)))
        for t,a in doc.tags:
            if t not in ('a','link'):continue
            href=a.get('href','');u=urlparse(href)
            if u.scheme and not href.startswith(BASE):continue
            path=unquote(u.path)
            target=(DOCS/path[len(urlparse(BASE).path):]) if href.startswith(BASE) else file.parent/path
            if not path:target=file
            if target.is_dir():target=target/'index.html'
            target=target.resolve()
            check(f'{file.relative_to(ROOT)} link {href}',target.exists())
            if u.fragment and target in docs:check('fragment '+href,any(b.get('id')==u.fragment for _,b in docs[target].tags))
        text=' '.join(doc.text)
        check(str(file.relative_to(ROOT))+' no stale status',not re.search(r'\b421\b|\bpreview\b|Glama未发布|Registry未发布',text,re.I))
        check(str(file.relative_to(ROOT))+' no overclaim',not re.search(r'nationwide complete\b|all penalties\b|complete procurement database|covers all China government procurement|complete national tender database',text,re.I))
        check(str(file.relative_to(ROOT))+' no credentials',not re.search(r'-----BEGIN .*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{24,}',text))
    xml=ET.parse(DOCS/'sitemap.xml');urls=[x.text for x in xml.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    check('sitemap XML and unique URLs',len(urls)==len(set(urls)))
    for path in PATHS:check('sitemap '+path,BASE+path in urls);check('llms '+path,BASE+path in (DOCS/'llms.txt').read_text(encoding='utf-8'))
    for url in urls:check('sitemap local target '+url,(DOCS/url.removeprefix(BASE)/'index.html').exists())
    for zh,readme in [(False,'README.md'),(True,'README.zh-CN.md')]:
        for path in PATHS:
            if path.startswith('zh/')==zh:check(readme+' entry '+path,BASE+path in (ROOT/readme).read_text(encoding='utf-8'))
    check('nojekyll preserved',(DOCS/'.nojekyll').exists())
    counts=Counter(x['status'] for x in checks)
    result={'pass':counts['PASS'],'fail':counts['FAIL'],'checks':checks,'page_sha256':{p:hashlib.sha256((DOCS/p/'index.html').read_bytes()).hexdigest() for p in PATHS}}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['pass','fail']}));print('\n'.join(x['check']+': '+x['detail'] for x in checks if x['status']=='FAIL'))
    return bool(counts['FAIL'])

if __name__=='__main__':raise SystemExit(main())
