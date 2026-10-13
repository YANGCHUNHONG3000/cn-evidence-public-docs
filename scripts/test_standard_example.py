"""Offline contracts for the redacted standard report example pages."""

import json
import re
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
JSON_PATH = DOCS / "standard-report-example.json"
HTML_PAGES = (
    DOCS / "standard-report-example.html",
    DOCS / "standard-report-example-zh.html",
)
EXPECTED_TOOLS = {
    "v3_company_detail",
    "v3_operation_exception",
    "v3_administrative_penalty",
    "v3_shareholder_list",
    "v3_industrial_change",
    "v3_license_list",
    "v3_tax_credit",
    "v3_tax_overdue",
    "v3_court_trial_list",
    "v3_law_list",
}
FORBIDDEN_FIELD = re.compile(
    r"(?:order|wallet|auth|authorization|subject[_-]?(?:raw|name|id|identifier)|"
    r"raw[_-]?(?:record|provider)|record[_-]?(?:payload|identifier|id)|"
    r"request[_-]?id|recovery[_-]?secret|access[_-]?secret)",
    re.IGNORECASE,
)


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield str(key)
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


class StandardExampleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(JSON_PATH.read_text(encoding="utf-8"))

    def test_json_is_a_redacted_internal_review_example(self):
        data = self.data
        self.assertEqual(data["schema_version"], "cn-evidence-screening-redacted-example/1")
        self.assertFalse(data["fictional"])
        self.assertTrue(data["redacted"])
        self.assertTrue(data["internal_test"])
        self.assertFalse(data["customer_case"])
        self.assertFalse(data["human_review"])
        self.assertEqual(data["decision"], "needs_review")
        self.assertRegex(data["queried_at_utc"], r"Z$")
        datetime.fromisoformat(data["queried_at_utc"].replace("Z", "+00:00"))

    def test_json_contains_exactly_the_expected_tool_checks_and_counts(self):
        checks = self.data["checks"]
        tools = [check["tool"] for check in checks]
        self.assertEqual(set(tools), EXPECTED_TOOLS)
        self.assertEqual(len(tools), 10)
        counts = {check["tool"]: check.get("returned_record_count") for check in checks}
        self.assertEqual(counts, {
            "v3_company_detail": None,
            "v3_operation_exception": 0,
            "v3_administrative_penalty": 0,
            "v3_shareholder_list": 1,
            "v3_industrial_change": 5,
            "v3_license_list": 5,
            "v3_tax_credit": 3,
            "v3_tax_overdue": 0,
            "v3_court_trial_list": 0,
            "v3_law_list": 0,
        })
        for check in checks:
            if "page_index" in check:
                self.assertEqual(check["page_index"], 1)
                self.assertEqual(check["page_size"], 5)
        totals = {check["tool"]: check.get("vendor_total_records") for check in checks}
        self.assertEqual(totals["v3_industrial_change"], 178)
        self.assertEqual(totals["v3_license_list"], 216)

    def test_json_omits_sensitive_payload_and_transaction_fields(self):
        offenders = [key for key in walk_keys(self.data) if FORBIDDEN_FIELD.search(key)]
        self.assertEqual(offenders, [])

    def test_html_row_counts_match_fixture_and_empty_summary(self):
        import html as html_module
        rows = {row['tool']: row for row in self.data['checks']}
        self.assertEqual(sum(r.get('returned_record_count') == 0 for r in rows.values()), 5)
        for path in HTML_PAGES:
            content = path.read_text(encoding='utf-8')
            for tool, body in re.findall(r'<tr data-tool="([^"]+)">(.*?)</tr>', content, re.S):
                cells = re.findall(r'<td>(.*?)</td>', body, re.S)
                plain = [html_module.unescape(re.sub(r'<[^>]*>', '', c)).strip() for c in cells]
                if tool != 'v3_company_detail':
                    self.assertEqual(plain[1], str(rows[tool]['returned_record_count']))
                    self.assertEqual(plain[2], str(rows[tool]['vendor_total_records']))
            self.assertRegex(content, r'Five checks returned zero|五项查询返回 0 条')
            self.assertNotRegex(content, r'Four checks returned zero|四项查询返回 0 条')

    def test_html_pages_have_navigation_and_review_boundaries(self):
        for path in HTML_PAGES:
            with self.subTest(page=path.name):
                self.assertTrue(path.is_file(), f"missing {path.name}")
                html = path.read_text(encoding="utf-8")
                lower = html.lower()
                self.assertIn("products.html", lower)
                self.assertIn("integration-pilot.html", lower)
                self.assertIn("standard-report-example.json", lower)
                self.assertRegex(lower, r"standard-report-example(?:-zh)?\.html")
                tools = re.findall(r'data-tool=["\']([^"\']+)', html)
                self.assertEqual(set(tools), EXPECTED_TOOLS)
                self.assertEqual(len(tools), 10)
                for value in ("0", "1", "3", "5", "178", "216"):
                    self.assertRegex(html, rf"(?<![\w]){value}(?![\w])")
                self.assertRegex(lower, r"internal[_ -]?test|internal test|内部测试")
                self.assertRegex(lower, r"historical|not a current|历史|非当前")
                self.assertNotRegex(lower, r"<form\b|<script\b[^>]*\bsrc\s*=")


if __name__ == "__main__":
    unittest.main()
