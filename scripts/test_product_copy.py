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
                self.assertTrue(
                    "not new mcp tools" in content or "不是新增mcp工具" in content
                )

    def test_no_stale_purchase_unavailable_assertions(self):
        for relative in ENTRYPOINTS + ("docs/products.html",):
            with self.subTest(path=relative):
                content = (ROOT / relative).read_text(encoding="utf-8").lower()
                for phrase in OLD_UNAVAILABLE:
                    self.assertNotIn(phrase.lower(), content)


if __name__ == "__main__":
    unittest.main()
