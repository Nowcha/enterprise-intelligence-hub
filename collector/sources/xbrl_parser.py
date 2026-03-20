"""XBRL parser for extracting financial data from EDINET documents."""

import zipfile
import logging
import re
from io import BytesIO
from typing import Any
from lxml import etree

logger = logging.getLogger(__name__)

# JPCRPタクソノミのタグマッピング（日本基準）
JPCORP_TAG_MAP: dict[str, str] = {
    "jppfs_cor:NetSales": "revenue",
    "jppfs_cor:Revenue": "revenue",
    "jppfs_cor:OperatingIncome": "operating_income",
    "jppfs_cor:OperatingLoss": "operating_income",  # 損失は負値
    "jppfs_cor:OrdinaryIncome": "ordinary_income",
    "jppfs_cor:OrdinaryLoss": "ordinary_income",
    "jppfs_cor:NetIncomeLoss": "net_income",
    "jppfs_cor:ProfitLoss": "net_income",
    "jppfs_cor:TotalAssets": "total_assets",
    "jppfs_cor:NetAssets": "net_assets",
    "jppfs_cor:EquityRatio": "equity_ratio",
    "jppfs_cor:NetCashProvidedByUsedInOperatingActivities": "operating_cf",
    "jppfs_cor:NetCashProvidedByUsedInInvestingActivities": "investing_cf",
    "jppfs_cor:NetCashProvidedByUsedInFinancingActivities": "financing_cf",
    "jppfs_cor:EarningsPerShare": "eps",
    "jppfs_cor:DividendPaidPerShareSummaryOfBusinessResults": "dividend_per_share",
}

# IFRSタクソノミのタグマッピング
IFRS_TAG_MAP: dict[str, str] = {
    "ifrs-full:Revenue": "revenue",
    "ifrs-full:OperatingIncome": "operating_income",
    "ifrs-full:ProfitLoss": "net_income",
    "ifrs-full:Assets": "total_assets",
    "ifrs-full:Equity": "net_assets",
    "ifrs-full:CashFlowsFromUsedInOperatingActivities": "operating_cf",
    "ifrs-full:CashFlowsFromUsedInInvestingActivities": "investing_cf",
    "ifrs-full:CashFlowsFromUsedInFinancingActivities": "financing_cf",
    "ifrs-full:BasicEarningsLossPerShare": "eps",
}


def parse_xbrl(xbrl_zip_bytes: bytes) -> dict[str, Any]:
    """
    Parse XBRL ZIP from EDINET API (type=1).

    Args:
        xbrl_zip_bytes: ZIP file content from EDINET download_document

    Returns:
        Dict with 'tree' (lxml element), 'namespaces' (dict), 'period' info
    """
    try:
        with zipfile.ZipFile(BytesIO(xbrl_zip_bytes)) as zf:
            # XBRLインスタンスドキュメントを特定（拡張子.xbrl）
            xbrl_files = [f for f in zf.namelist() if f.endswith('.xbrl') and 'PublicDoc' in f]
            if not xbrl_files:
                xbrl_files = [f for f in zf.namelist() if f.endswith('.xbrl')]

            if not xbrl_files:
                logger.warning("No XBRL file found in ZIP")
                return {}

            # 最初のXBRLファイルを使用
            xbrl_content = zf.read(xbrl_files[0])
            tree = etree.fromstring(xbrl_content)

            # 名前空間を抽出
            namespaces: dict[str, str] = {}
            for ns_prefix, ns_uri in tree.nsmap.items():
                if ns_prefix:
                    namespaces[ns_prefix] = ns_uri

            # 期間情報を取得
            period_info = _extract_period_info(tree, namespaces)

            return {
                "tree": tree,
                "namespaces": namespaces,
                "period": period_info,
                "xbrl_files": xbrl_files,
            }
    except Exception as e:
        logger.error(f"Failed to parse XBRL ZIP: {e}")
        return {}


def _extract_period_info(tree: etree._Element, namespaces: dict[str, str]) -> dict[str, str]:
    """Extract fiscal period information from XBRL context."""
    period_info: dict[str, str] = {}
    try:
        contexts = tree.findall('.//{http://www.xbrl.org/2003/instance}context')
        for ctx in contexts:
            ctx_id = ctx.get('id', '')
            if 'CurrentYear' in ctx_id or 'FilingDateInstant' in ctx_id:
                period_elem = ctx.find('.//{http://www.xbrl.org/2003/instance}endDate')
                if period_elem is not None and period_elem.text:
                    # "2024-03-31" → "2024-03"
                    date_parts = period_elem.text[:7]
                    period_info['end_date'] = period_elem.text
                    period_info['period'] = date_parts
                    break
    except Exception as e:
        logger.warning(f"Failed to extract period info: {e}")
    return period_info


def extract_financials(xbrl_result: dict[str, Any]) -> dict[str, Any]:
    """
    Extract financial data from parsed XBRL.

    Args:
        xbrl_result: Result from parse_xbrl()

    Returns:
        FinancialPeriod-compatible dict (without collected_at, schema_version)
    """
    if not xbrl_result or "tree" not in xbrl_result:
        return {}

    tree: etree._Element = xbrl_result["tree"]
    namespaces: dict[str, str] = xbrl_result.get("namespaces", {})
    period: dict[str, str] = xbrl_result.get("period", {})

    financials: dict[str, Any] = {
        "period": period.get("period", "unknown"),
        "period_type": "annual",
        "revenue": 0,
        "operating_income": 0,
        "ordinary_income": 0,
        "net_income": 0,
        "total_assets": 0,
        "net_assets": 0,
        "equity_ratio": 0.0,
        "roe": None,
        "roa": None,
        "operating_cf": None,
        "investing_cf": None,
        "financing_cf": None,
        "eps": None,
        "dividend_per_share": None,
        "segments": [],
        "data_source": "xbrl",
    }

    # 全タグマッピングを統合
    all_tag_maps: dict[str, str] = {**JPCORP_TAG_MAP, **IFRS_TAG_MAP}

    # XBRLツリーから値を抽出
    for element in tree.iter():
        # local_name と namespace を取得
        tag = element.tag
        if '}' in tag:
            ns_uri, local_name = tag[1:].split('}', 1)
            # 名前空間プレフィックスを逆引き
            ns_prefix: str | None = None
            for prefix, uri in namespaces.items():
                if uri == ns_uri:
                    ns_prefix = prefix
                    break

            if ns_prefix:
                full_tag = f"{ns_prefix}:{local_name}"
                if full_tag in all_tag_maps:
                    field_name = all_tag_maps[full_tag]
                    try:
                        value_text = element.text
                        if value_text and value_text.strip():
                            value = float(value_text.strip())
                            # 百万円単位に変換（XBRLは円単位の場合がある）
                            decimals = element.get('decimals', '0')
                            if decimals == '-6':
                                pass  # 既に百万円単位
                            elif decimals == '-3':
                                value = value / 1000  # 千円→百万円
                            elif decimals in ('0', 'INF', '2'):
                                value = value / 1_000_000  # 円→百万円

                            current = financials.get(field_name)
                            if current == 0 or current is None:
                                financials[field_name] = value
                    except (ValueError, TypeError):
                        pass
                else:
                    # 未知のタグをデバッグログ
                    if ns_prefix in ('jppfs_cor', 'ifrs-full') and local_name[0].isupper():
                        logger.debug(f"Unknown XBRL tag: {full_tag}")

    return financials


def extract_segments(xbrl_result: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extract segment information from XBRL.

    Returns:
        List of Segment-compatible dicts
    """
    if not xbrl_result or "tree" not in xbrl_result:
        return []

    segments: list[dict[str, Any]] = []
    # セグメント情報の抽出（簡易実装）
    # jppfs_cor:NetSales のcontextにセグメント情報が含まれる場合がある
    logger.info("Segment extraction: basic implementation")
    return segments


def calculate_derived_metrics(financials: dict[str, Any]) -> dict[str, Any]:
    """
    Calculate derived financial metrics from base financials.

    Args:
        financials: Base financials dict from extract_financials

    Returns:
        Updated financials dict with derived metrics added
    """
    result = dict(financials)

    try:
        revenue = float(result.get("revenue", 0) or 0)
        operating_income = float(result.get("operating_income", 0) or 0)
        net_income = float(result.get("net_income", 0) or 0)
        total_assets = float(result.get("total_assets", 0) or 0)
        net_assets = float(result.get("net_assets", 0) or 0)

        # 自己資本比率
        if total_assets > 0 and result.get("equity_ratio", 0) == 0:
            result["equity_ratio"] = round(net_assets / total_assets * 100, 2)

        # ROE
        if net_assets > 0:
            result["roe"] = round(net_income / net_assets * 100, 2)

        # ROA
        if total_assets > 0:
            result["roa"] = round(net_income / total_assets * 100, 2)

        # 営業利益率（フィールドには含まないがloggingで確認）
        if revenue > 0:
            operating_margin = round(operating_income / revenue * 100, 2)
            logger.info(f"Operating margin: {operating_margin}%")

    except (TypeError, ZeroDivisionError) as e:
        logger.warning(f"Failed to calculate derived metrics: {e}")

    return result
