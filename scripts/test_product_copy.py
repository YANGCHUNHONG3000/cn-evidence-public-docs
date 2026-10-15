"""Offline assertions for public product copy; makes no network requests."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINTS = (
    "README.md",
    "README.zh-CN.md",
    "docs/index.html",
    "docs/llms.txt",
    "docs/buyer-guide.html",
    "docs/v3-tools.html",
)
OLD_UNAVAILABLE = (
    "currently unavailable for purchase",
    "currently not available for purchase",
    "暂不可购买",
    "预算保护暂不可",
)


class ProductCopyTests(unittest.TestCase):
    def test_license_fallback_does_not_claim_whole_bundle_acceptance(self):
        content = (ROOT / 'docs/products.html').read_text(encoding='utf-8')
        for phrase in ('License-only fallback', 'keeps the total and completeness unknown',
                       "does not repair the provider's HTTP 404", '3 provider points per call',
                       'screening-license-fallback-20261013-v1', 'at most two QCC calls',
                       'As of 2026-10-13, the updated contracts had not had a funded end-to-end purchase',
                       'On 2026-10-15, one owner-funded 0.29 USDC Standard MCP test',
                       'whole bundle is not settled', '上游实际扣费尚未核实'):
            self.assertIn(phrase, content)

    def test_paid_qcc_version_and_pilot_rules_are_not_conflated(self):
        content = (ROOT / 'docs/products.html').read_text(encoding='utf-8')
        for required in ('qcc-products-20261012-v1', 'qcc-products-20261012-v2',
                         'has not had a new funded purchase', 'HTTP 409',
                         'manually recharged', 'Per-order scope',
                         'free QCC pilot retains its gift-only and daily limits'):
            self.assertIn(required, content)
        self.assertNotIn('both QCC products require a gift-only', content)

    def test_all_entrypoints_describe_products_and_live_catalog(self):
        for relative in ENTRYPOINTS:
            with self.subTest(path=relative):
                content = (ROOT / relative).read_text(encoding="utf-8")
                for required in (
                    "0.29",
                    "0.59",
                    "0.03",
                    "HTTP x402",
                    "https://api.cnevidence.com/free/cn/products",
                    "products.html",
                ):
                    self.assertIn(required, content)

    def test_product_scope_is_explicit_in_product_overview(self):
        for relative in ENTRYPOINTS:
            with self.subTest(path=relative):
                content = (ROOT / relative).read_text(encoding="utf-8").lower()
                self.assertIn("screening-standard-v1", content)
                self.assertIn("screening-enhanced-v1", content)
                self.assertIn("qcc-qualifications-v1", content)
                self.assertIn("get_china_company_report", content)
                self.assertTrue("qcc-only qualifications remain http-only" in content
                                or "企查查资质单项仍仅支持 http" in content)
                self.assertNotIn("not new mcp tools", content)
                self.assertNotIn("不是新增mcp工具", content)

    def test_report_client_guide_preserves_payment_and_acceptance_boundaries(self):
        for relative in ('README.md', 'README.zh-CN.md'):
            content = (ROOT / relative).read_text(encoding='utf-8')
            for required in ('get_china_report_options', 'get_china_company_report',
                             'recover_china_company_report', 'examples/agent_report.py',
                             'X-CN-Recovery-Token', '1.59', 'x402==2.22.0'):
                self.assertIn(required, content)
        content = (ROOT / 'README.md').read_text(encoding='utf-8')
        self.assertIn('one owner-funded 0.29 USDC Standard MCP test', content)
        self.assertIn('No funded acceptance covers the complete 64-tool catalog', content)
        self.assertIn('current Enhanced and Resilient contracts have no funded acceptance', content)
        self.assertIn('do not rerun the purchase or sign another payment', content)
        self.assertIn('never in tool arguments or model-visible prompts', content)

    def test_no_stale_purchase_unavailable_assertions(self):
        for relative in ENTRYPOINTS + ("docs/products.html",):
            with self.subTest(path=relative):
                content = (ROOT / relative).read_text(encoding="utf-8").lower()
                for phrase in OLD_UNAVAILABLE:
                    self.assertNotIn(phrase.lower(), content)

    def test_enhanced_product_name_and_bounded_qcc_scope_are_clear(self):
        content = (ROOT / "docs/products.html").read_text(encoding="utf-8")
        for required in (
            "Qualifications-enhanced screening / 资质增强筛查",
            "0.59 USDC",
            "exactly ONE QCC qualifications query",
            "not complete QCC coverage or independent cross-verification",
            "Standard is 0.29 USDC for ten Jinghai-first check dimensions",
            "资质增强筛查为 0.59 USDC",
            "恰好一次企查查资质查询",
        ):
            with self.subTest(phrase=required):
                self.assertIn(required, content)

    def test_recovery_support_contact_requests_only_safe_diagnostics(self):
        content = (ROOT / "docs/products.html").read_text(encoding="utf-8")
        for required in (
            "original report can be recovered for 24 hours",
            "check or recover the original order",
            "mailto:contact@cnevidence.com",
            "order ID, occurrence time and error code",
            "Never send a payment signature, recovery token or private key",
            "原报告可在 24 小时内恢复",
            "仅提供订单 ID、发生时间和错误代码",
            "请勿发送付款签名、恢复口令或私钥",
        ):
            with self.subTest(phrase=required):
                self.assertIn(required, content)


if __name__ == "__main__":
    unittest.main()
