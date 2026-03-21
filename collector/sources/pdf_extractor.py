"""PDF text extraction for governance data from annual reports."""

import re
import logging
from io import BytesIO
from typing import Any

import pdfplumber

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract full text from PDF bytes using pdfplumber."""
    if not pdf_bytes:
        raise ValueError("pdf_bytes is empty")

    try:
        pages: list[str] = []
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages.append(text)
        return "\n".join(pages)
    except Exception as exc:
        raise ValueError(f"Failed to parse PDF: {exc}") from exc


def extract_governance_section(full_text: str) -> str:
    """
    Extract corporate governance section from annual report text.

    Looks for section markers like:
    - コーポレート・ガバナンスの状況
    - 【コーポレート・ガバナンスの概要】
    """
    # Patterns that mark the start of the governance section
    start_patterns = [
        r"コーポレート・ガバナンスの状況等",
        r"コーポレート・ガバナンスの状況",
        r"【コーポレート・ガバナンスの概要】",
        r"コーポレートガバナンスの状況",
    ]

    # Patterns that mark the start of the NEXT major section (end boundary)
    end_patterns = [
        r"第[四五六七八][\s　]*【",
        r"株主総会",
        r"経理の状況",
        r"設備の状況",
        r"提出会社の状況",
    ]

    start_idx: int = -1
    for pattern in start_patterns:
        m = re.search(pattern, full_text)
        if m:
            start_idx = m.start()
            break

    if start_idx == -1:
        logger.debug("Governance section not found in text")
        return ""

    # Find the end boundary
    end_idx: int = len(full_text)
    for pattern in end_patterns:
        m = re.search(pattern, full_text[start_idx + 10:])
        if m:
            candidate = start_idx + 10 + m.start()
            if candidate < end_idx:
                end_idx = candidate

    return full_text[start_idx:end_idx]


def extract_board_members(governance_text: str) -> list[dict[str, Any]]:
    """
    Extract board member information from governance section text.

    Returns list of BoardMember-compatible dicts with:
    - name, role, is_outside, is_independent, career_summary, appointment_year
    """
    members: list[dict[str, Any]] = []

    # Role keywords (ordered from most specific to least)
    role_patterns = [
        (r"独立社外取締役", "独立社外取締役", True, True),
        (r"独立社外監査役", "独立社外監査役", True, True),
        (r"社外取締役", "社外取締役", True, False),
        (r"社外監査役", "社外監査役", True, False),
        (r"代表取締役社長", "代表取締役社長", False, False),
        (r"代表取締役", "代表取締役", False, False),
        (r"取締役会長", "取締役会長", False, False),
        (r"常務執行役員", "常務執行役員", False, False),
        (r"専務執行役員", "専務執行役員", False, False),
        (r"取締役", "取締役", False, False),
        (r"常勤監査役", "常勤監査役", False, False),
        (r"監査役", "監査役", False, False),
        (r"執行役員", "執行役員", False, False),
    ]

    # Pattern: role followed by name (Japanese name = kanji characters)
    # Example lines: "代表取締役社長　山田　太郎"  or  "社外取締役 鈴木 花子（独立）"
    name_pattern = re.compile(
        r"(独立社外取締役|独立社外監査役|社外取締役|社外監査役|代表取締役社長|"
        r"代表取締役|取締役会長|常務執行役員|専務執行役員|取締役|常勤監査役|監査役|執行役員)"
        r"[\s　]+([^\s　\n（(]{2,10}(?:[\s　]+[^\s　\n（(]{1,5})?)",
        re.MULTILINE,
    )

    seen_names: set[str] = set()
    for m in name_pattern.finditer(governance_text):
        role_str = m.group(1)
        name = m.group(2).strip()

        # Skip if name looks like noise (numbers, symbols)
        if re.search(r"[0-9０-９\-＋]", name):
            continue
        if name in seen_names:
            continue
        seen_names.add(name)

        is_outside = False
        is_independent = False
        for _pattern, _role, _outside, _independent in role_patterns:
            if _pattern in role_str:
                is_outside = _outside
                is_independent = _independent
                break

        # Check for independence marker near the match
        context = governance_text[max(0, m.start() - 50): m.end() + 100]
        if "独立" in context:
            is_independent = True
            if is_outside:
                pass  # already set

        # Look for appointment year near the entry
        year_match = re.search(r"(20\d{2}|平成\d{1,2}|令和\d{1,2})年", context)
        appointment_year: int | None = None
        if year_match:
            raw_year = year_match.group(1)
            if raw_year.startswith("20"):
                try:
                    appointment_year = int(raw_year)
                except ValueError:
                    pass
            elif raw_year.startswith("令和"):
                try:
                    reiwa_num = int(re.sub(r"令和", "", raw_year))
                    appointment_year = 2018 + reiwa_num
                except ValueError:
                    pass
            elif raw_year.startswith("平成"):
                try:
                    heisei_num = int(re.sub(r"平成", "", raw_year))
                    appointment_year = 1988 + heisei_num
                except ValueError:
                    pass

        members.append(
            {
                "name": name,
                "role": role_str,
                "is_outside": is_outside,
                "is_independent": is_independent,
                "career_summary": None,
                "appointment_year": appointment_year,
            }
        )

    return members


def extract_major_shareholders(full_text: str) -> list[dict[str, Any]]:
    """
    Extract major shareholders from annual report.

    Returns list of Shareholder-compatible dicts:
    - name, shares_held, ownership_ratio
    """
    shareholders: list[dict[str, Any]] = []

    # Find the major shareholders section
    section_pattern = re.compile(
        r"大株主の状況.{0,200}?(?=\n)",
        re.DOTALL,
    )
    section_match = re.search(r"大株主の状況", full_text)
    if not section_match:
        logger.debug("Major shareholders section not found")
        return shareholders

    # Extract up to 3000 chars after the section header
    section_text = full_text[section_match.start(): section_match.start() + 3000]

    # Pattern: shareholder name followed by share count and ownership ratio
    # Numbers may use full-width or half-width digits
    row_pattern = re.compile(
        r"([^\n\t]{2,30}?)[\s　\t]+([0-9,，０-９]+)[\s　\t]+([0-9０-９]+\.[0-9０-９]+)",
        re.MULTILINE,
    )

    def normalize_number(s: str) -> str:
        # Convert full-width digits to half-width
        table = str.maketrans("０１２３４５６７８９，", "0123456789,")
        return s.translate(table).replace(",", "")

    for m in row_pattern.finditer(section_text):
        name = m.group(1).strip()
        shares_str = normalize_number(m.group(2))
        ratio_str = normalize_number(m.group(3))

        # Skip header-like lines
        if any(kw in name for kw in ["株主名", "持株数", "持株比率", "氏名"]):
            continue
        if not name or re.match(r"^[0-9\s]+$", name):
            continue

        try:
            shares_held = int(shares_str)
            ownership_ratio = float(ratio_str)
        except ValueError:
            continue

        shareholders.append(
            {
                "name": name,
                "shares_held": shares_held,
                "ownership_ratio": ownership_ratio,
            }
        )
        if len(shareholders) >= 10:
            break

    return shareholders


def extract_executive_compensation(full_text: str) -> dict[str, Any]:
    """
    Extract executive compensation information.

    Returns dict with:
    - fixed_ratio, variable_ratio, total_amount
    """
    result: dict[str, Any] = {
        "fixed_ratio": 0.0,
        "variable_ratio": 0.0,
        "total_amount": None,
    }

    # Find compensation section
    section_match = re.search(r"役員の報酬等", full_text)
    if not section_match:
        section_match = re.search(r"取締役の報酬", full_text)
    if not section_match:
        logger.debug("Executive compensation section not found")
        return result

    section_text = full_text[section_match.start(): section_match.start() + 2000]

    # Look for total compensation amount (百万円)
    total_pattern = re.compile(
        r"(?:総額|合計)[^\n]{0,30}?([0-9,，０-９]+)\s*百万円",
        re.DOTALL,
    )
    total_match = total_pattern.search(section_text)
    if total_match:
        # Translate all fullwidth digits and fullwidth comma to ASCII equivalents.
        # NOTE: str.maketrans with two strings does NOT support ranges like "０-９";
        # each character is mapped positionally, so all digits must be listed explicitly.
        _fw_table = str.maketrans("０１２３４５６７８９，", "0123456789,")
        raw = total_match.group(1).translate(_fw_table).replace(",", "")
        try:
            result["total_amount"] = int(raw)
        except ValueError:
            pass

    # Look for fixed vs variable ratio mentions
    fixed_pattern = re.compile(r"固定(?:報酬)?[：:・]?\s*([0-9０-９]+)\s*[%％]")
    variable_pattern = re.compile(r"変動(?:報酬)?[：:・]?\s*([0-9０-９]+)\s*[%％]")

    def to_half(s: str) -> str:
        return s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))

    fixed_m = fixed_pattern.search(section_text)
    variable_m = variable_pattern.search(section_text)

    if fixed_m:
        try:
            result["fixed_ratio"] = float(to_half(fixed_m.group(1)))
        except ValueError:
            pass

    if variable_m:
        try:
            result["variable_ratio"] = float(to_half(variable_m.group(1)))
        except ValueError:
            pass

    # If we found fixed but not variable (or vice versa), infer the other
    fixed_r: float = result["fixed_ratio"]  # type: ignore[assignment]
    variable_r: float = result["variable_ratio"]  # type: ignore[assignment]
    if fixed_r > 0 and variable_r == 0.0:
        result["variable_ratio"] = max(0.0, 100.0 - fixed_r)
    elif variable_r > 0 and fixed_r == 0.0:
        result["fixed_ratio"] = max(0.0, 100.0 - variable_r)

    return result
