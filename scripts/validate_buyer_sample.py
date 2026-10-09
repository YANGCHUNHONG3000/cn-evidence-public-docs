"""Offline checks for the readable sample. No network, purchase or production writes."""
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'


class SampleParser(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, text):
        super().__init__()
        self.stack, self.errors, self.links, self.ids, self.text, self.values = [], [], [], [], [], {}
        self.capture = None
        self.forbidden = []
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in self.VOID:
            self.stack.append(tag)
        if tag in ('script', 'form', 'iframe'):
            self.forbidden.append(tag)
        if 'id' in a:
            self.ids.append(a['id'])
        if 'href' in a:
            self.links.append(a['href'])
        if 'data-json-pointer' in a:
            self.capture = (tag, a['data-json-pointer'])
            self.values[self.capture[1]] = ''

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append('Mismatched closing tag: ' + tag)
        else:
            self.stack.pop()
        if self.capture and self.capture[0] == tag:
            self.capture = None

    def handle_data(self, data):
        self.text.append(data)
        if self.capture:
            self.values[self.capture[1]] += data


def main():
    page = (DOCS / 'sample-report.html').read_text(encoding='utf-8')
    data = json.loads((DOCS / 'sample-report.json').read_text(encoding='utf-8'))
    doc = SampleParser(page)
    checks = 0

    def check(ok, label):
        nonlocal checks
        checks += 1
        if not ok:
            raise AssertionError(label)

    check(not doc.errors and not doc.stack, 'Balanced HTML')
    check(not doc.forbidden, 'No active forms, scripts or embedded requests')
    check(len(doc.ids) == len(set(doc.ids)), 'Unique anchors')
    check(len(doc.values) == 7, 'Seven evidence anchors mapped to the raw sample')
    for pointer, displayed in doc.values.items():
        value = data
        for part in pointer.strip('/').split('/'):
            value = value[int(part)] if isinstance(value, list) else value[part]
        expected = value if isinstance(value, str) else json.dumps(value)
        check(displayed == expected, 'Matching JSON value: ' + pointer)
    full_only = ('serious_violations', 'enforcement', 'dishonesty', 'bankruptcy', 'qualifications', 'customs')
    check(all(data['modules'][name]['status'] == 'not_requested' for name in full_only), 'Six unrequested modules')
    check(data['fictional'] and data['not_live_query'] and data['usage']['payment_made'] is False, 'Fictional no-payment fixture')
    for wording in ('Entirely fictional', 'not a real customer case', 'not an additional automated assessment feature',
                    'no_records', 'not_requested', 'Unknown pagination', 'at most ten records',
                    '0.032', '0.093', 'not an offer of a free live query'):
        check(wording in page, 'Required boundary: ' + wording)
    for href in doc.links:
        u = urlparse(href)
        if u.scheme:
            check(u.scheme == 'https', 'HTTPS external link')
            continue
        target = DOCS / u.path if u.path else DOCS / 'sample-report.html'
        if target.is_dir():
            target /= 'index.html'
        check(target.is_file(), 'Existing local target: ' + href)
        if u.fragment and not u.path:
            check(u.fragment in doc.ids, 'Existing anchor: ' + href)
    for entry in (DOCS / 'index.html', DOCS / 'buyer-guide.html', ROOT / 'README.md', ROOT / 'README.zh-CN.md', DOCS / 'llms.txt'):
        check('sample-report.html' in entry.read_text(encoding='utf-8'), 'Entry links sample: ' + entry.name)
    home = (DOCS / 'index.html').read_text(encoding='utf-8')
    check(home.index('href="sample-report.html"') < home.index('href="https://api.cnevidence.com/openapi.json"'), 'Example before technical entry')
    print(f'PASS: {checks} offline checks. No paid/API requests made.')


if __name__ == '__main__':
    main()
