"""Offline wording contracts for public entrypoint copies; no network access."""
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COPIES = (
    ROOT / "docs" / "llms.txt",
    ROOT / "README.md",
    ROOT / "README.zh-CN.md",
    ROOT / "docs" / "index.html",
)
COPY_LABELS = {
    ROOT / "docs" / "llms.txt": "llms.txt",
    ROOT / "README.md": "README.md",
    ROOT / "README.zh-CN.md": "README.zh-CN.md",
    ROOT / "docs" / "index.html": "index.html",
}


def visible_text(path):
    """Read a copy and remove markup while retaining its human-visible words."""
    text = path.read_text(encoding="utf-8")
    return re.sub(r"<[^>]*>", " ", text)


def chinese_summary(text):
    """Return only the 中文摘要 section so earlier English copy cannot mask gaps."""
    match = re.search(r"(?m)^##\s+中文摘要\s*$", text)
    if not match:
        return ""
    remainder = text[match.end():]
    next_heading = re.search(r"(?m)^##\s+", remainder)
    return remainder[:next_heading.start()] if next_heading else remainder


class EntrypointCopyContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.copies = {COPY_LABELS[path]: visible_text(path) for path in COPIES}

    def test_each_chinese_summary_separates_current_v3_from_legacy_packages(self):
        for name, text in self.copies.items():
            with self.subTest(copy=name):
                summary = chinese_summary(text)
                self.assertTrue(summary, "中文摘要 section is missing")
                self.assertIn("64", summary, "current V3 tool count is missing from summary")
                self.assertIn("68", summary, "MCP tools/list count is missing from summary")
                self.assertRegex(summary, r"0\.011\s*USDC", "current V3 price is missing from summary")
                self.assertRegex(summary, r"MCP.{0,100}68|68.{0,100}MCP",
                                 "68 must be identified as the MCP catalog count")
                self.assertRegex(summary, r"旧版.{0,60}Basic\s*/?\s*Full",
                                 "summary must explicitly label Basic/Full as legacy")
                self.assertRegex(summary, r"企业详情.{0,60}并非全部工具的通用购买客户端",
                                 "summary must bound the buyer guide to a company-detail example")

    def test_buyer_guide_is_not_described_as_legacy_only(self):
        text = self.copies["llms.txt"]
        self.assertIn("buyer-guide.html", text)
        self.assertRegex(text, r"guarded V3 company-detail purchase example",
                         "llms copy should identify the guarded V3 buyer-guide example")
        self.assertNotRegex(text, r"(?i)(old|legacy).{0,80}buyer guide.{0,100}(legacy packages only|only.{0,20}legacy packages)")
        self.assertNotRegex(text, r"(?i)buyer guide.{0,100}(legacy packages only|only.{0,20}legacy packages)")

    def test_buyer_guide_scope_is_limited_to_company_detail_example(self):
        guide = visible_text(ROOT / "docs" / "buyer-guide.html")
        self.assertRegex(guide, r"(?i)company.detail|企业详情",
                         "buyer guide should identify its V3 company-detail example")
        self.assertRegex(guide, r"(?i)not all 64|not all V3|company-name V3 detail only|other V3 tools require a separately reviewed client|仅.{0,12}企业详情|不支持全部.{0,8}工具|not a universal client",
                         "buyer guide should say its example is not a universal V3 client")


if __name__ == "__main__":
    unittest.main()
