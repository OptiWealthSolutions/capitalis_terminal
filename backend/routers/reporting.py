"""
Reporting router — institutional PDF generation.
POST /reporting/generate-pdf  →  multi-page PDF (binary response)

PDF sections:
  1. Cover page
  2. Risk metrics table + allocation table
  3. Monte Carlo fan chart + VaR/CVaR box
  4. Allocation bar chart
"""

import io
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from ..auth.jwt_handler import get_current_user
from ..plan_gate import get_limits, get_plan_for_user

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.pf_engine.risk_management.monte_carlo_simulation import (
    run_monte_carlo_portfolio,
    calculate_var_cvar_simple,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Chart color palette — same as frontend CHART_COLORS
# ---------------------------------------------------------------------------
_COLORS = [
    "#2B5EA7", "#3D72C4", "#5588D6", "#7AA7E8", "#A3C2EF",
    "#86B38A", "#C9B178", "#D48585", "#A97CC0", "#5BBCB8",
]

# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------
class PrecomputedMetrics(BaseModel):
    expected_annual_return: float | None = None
    annual_volatility: float | None = None
    sharpe_ratio: float | None = None
    sortino_ratio: float | None = None
    calmar_ratio: float | None = None
    max_drawdown: float | None = None
    beta: float | None = None


class ReportRequest(BaseModel):
    portfolio_name: str = Field(..., min_length=1, max_length=64)
    method: str = Field(default="Custom", max_length=32)
    tickers: list[str] = Field(..., min_length=1, max_length=50)
    weights: list[float] = Field(..., min_length=1, max_length=50)
    capital: float = Field(..., gt=0)
    n_simulations: int = Field(default=500, ge=100, le=5000)
    precomputed_metrics: PrecomputedMetrics | None = None


# ---------------------------------------------------------------------------
# Chart helpers
# ---------------------------------------------------------------------------
def _mc_chart(sim_df: pd.DataFrame, capital: float) -> bytes:
    """Monte Carlo fan chart → PNG bytes."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.ticker as mticker

        horizon = sim_df.shape[0]
        days = np.arange(horizon + 1)

        initial = np.full((1, sim_df.shape[1]), capital)
        vals = np.vstack([initial, sim_df.values])

        p5  = np.percentile(vals, 5,  axis=1)
        p25 = np.percentile(vals, 25, axis=1)
        p50 = np.percentile(vals, 50, axis=1)
        p75 = np.percentile(vals, 75, axis=1)
        p95 = np.percentile(vals, 95, axis=1)

        fig, ax = plt.subplots(figsize=(11, 4), dpi=150)
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        ax.fill_between(days, p5,  p95, alpha=0.07, color="#2B5EA7", label="P5–P95")
        ax.fill_between(days, p25, p75, alpha=0.16, color="#2B5EA7", label="IQR (P25–P75)")
        ax.plot(days, p50, color="#2B5EA7", linewidth=2,   label="Median")
        ax.plot(days, p5,  color="#C0392B", linewidth=0.9, linestyle="--", label="P5 (Worst)")
        ax.plot(days, p95, color="#27AE60", linewidth=0.9, linestyle="--", label="P95 (Best)")
        ax.axhline(capital, color="#888888", linewidth=0.8, linestyle=":", alpha=0.7, label="Initial capital")

        ax.set_xlabel("Trading Days", fontsize=9, color="#333333")
        ax.set_ylabel("Portfolio Value", fontsize=9, color="#333333")
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"€{x:,.0f}"))
        ax.grid(True, alpha=0.25, color="#CCCCCC", linestyle="-")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.tick_params(labelsize=8, colors="#444444")
        ax.legend(fontsize=8, loc="upper left", framealpha=0.85, frameon=True)

        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning("MC chart generation failed: %s", e)
        return b""


def _alloc_chart(tickers: list[str], weights: list[float]) -> bytes:
    """Horizontal allocation bar chart → PNG bytes."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        pairs = sorted(zip(weights, tickers), reverse=True)
        ws, ts = zip(*pairs) if pairs else ([], [])

        n = len(ts)
        fig_h = max(2.5, n * 0.50)
        fig, ax = plt.subplots(figsize=(9, fig_h), dpi=150)
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        bar_colors = [_COLORS[i % len(_COLORS)] for i in range(n)]
        bars = ax.barh(range(n), [w * 100 for w in ws], color=bar_colors, height=0.6, edgecolor="none")

        for bar, w in zip(bars, ws):
            ax.text(
                bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                f"{w:.1%}", va="center", fontsize=9, color="#333333",
            )

        ax.set_yticks(range(n))
        ax.set_yticklabels(list(ts), fontsize=9, color="#333333")
        ax.set_xlabel("Weight (%)", fontsize=9, color="#333333")
        max_w = max(ws) if ws else 1
        ax.set_xlim(0, max_w * 120)
        ax.grid(True, axis="x", alpha=0.25, color="#CCCCCC", linestyle="-")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.tick_params(axis="x", labelsize=8, colors="#444444")

        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning("Alloc chart generation failed: %s", e)
        return b""


def _fetch_meta(tickers: list[str]) -> dict[str, dict[str, str]]:
    """Bulk fetch sector + country per ticker via yfinance. Cached side-effect: best-effort."""
    out: dict[str, dict[str, str]] = {}
    for t in tickers:
        try:
            info = yf.Ticker(t).info or {}
            out[t] = {
                "sector":  info.get("sector")  or "Unknown",
                "country": info.get("country") or "Unknown",
            }
        except Exception:
            out[t] = {"sector": "Unknown", "country": "Unknown"}
    return out


def _pie_chart(data: dict[str, float], title: str) -> bytes:
    """Generic donut chart (sector / geographic) → PNG bytes."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        if not data or sum(data.values()) <= 0:
            return b""

        # sort + clip — group small slices into "Other"
        items = sorted(data.items(), key=lambda x: x[1], reverse=True)
        if len(items) > 8:
            head = items[:7]
            tail_sum = sum(v for _, v in items[7:])
            items = head + [("Other", tail_sum)]

        labels  = [k for k, _ in items]
        values  = [v for _, v in items]
        colors  = [_COLORS[i % len(_COLORS)] for i in range(len(items))]

        fig, ax = plt.subplots(figsize=(9, 5), dpi=150)
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        wedges, _texts, autotexts = ax.pie(
            values, labels=None, colors=colors,
            autopct=lambda pct: f"{pct:.1f}%" if pct >= 4 else "",
            pctdistance=0.78, startangle=90,
            wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2),
            textprops=dict(color="white", fontsize=9, fontweight="bold"),
        )
        ax.set_title(title, fontsize=11, color="#16315F", fontweight="bold", pad=12)

        # Legend on right with weights
        legend_labels = [f"{l} — {v:.1%}" for l, v in zip(labels, values)]
        ax.legend(wedges, legend_labels, loc="center left", bbox_to_anchor=(1.02, 0.5),
                  fontsize=9, frameon=False, labelcolor="#333333")

        ax.set(aspect="equal")
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning("Pie chart generation failed (%s): %s", title, e)
        return b""


def _sector_chart(tickers: list[str], weights: list[float], meta: dict) -> bytes:
    """Sector exposure donut → PNG bytes."""
    agg: dict[str, float] = {}
    for t, w in zip(tickers, weights):
        sector = meta.get(t, {}).get("sector", "Unknown")
        agg[sector] = agg.get(sector, 0.0) + float(w)
    return _pie_chart(agg, "Sector Allocation")


def _geographic_chart(tickers: list[str], weights: list[float], meta: dict) -> bytes:
    """Country / geographic exposure donut → PNG bytes."""
    agg: dict[str, float] = {}
    for t, w in zip(tickers, weights):
        country = meta.get(t, {}).get("country", "Unknown")
        agg[country] = agg.get(country, 0.0) + float(w)
    return _pie_chart(agg, "Geographic Allocation")


def _equity_curve_chart(tickers: list[str], weights: list[float], capital: float) -> bytes:
    """Portfolio equity curve vs SPY benchmark → PNG bytes."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.ticker as mticker
        import matplotlib.dates as mdates

        w_arr = np.array(weights, dtype=float)
        all_tickers = list(set(tickers + ["SPY"]))

        raw = yf.download(all_tickers, period="1y", interval="1d", progress=False, auto_adjust=True)
        if isinstance(raw.columns, pd.MultiIndex):
            close = raw["Close"]
        else:
            close = raw

        # Align to portfolio tickers
        pf_close = close[tickers].dropna()
        if pf_close.empty:
            return b""

        # Normalize returns
        norm = pf_close / pf_close.iloc[0]
        port_vals = (norm.values @ w_arr) * capital
        dates = pf_close.index

        # SPY benchmark
        spy_close = close.get("SPY", pd.Series(dtype=float))
        if spy_close is not None and len(spy_close) > 0:
            spy_aligned = spy_close.reindex(dates).ffill().bfill()
            spy_vals = (spy_aligned / spy_aligned.iloc[0]) * capital
        else:
            spy_vals = None

        fig, ax = plt.subplots(figsize=(11, 3.5), dpi=150)
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        ax.fill_between(dates, port_vals, alpha=0.08, color="#2B5EA7")
        ax.plot(dates, port_vals, color="#2B5EA7", linewidth=2, label="Portfolio")
        if spy_vals is not None:
            ax.plot(dates, spy_vals, color="#888888", linewidth=1.2, linestyle="--", label="SPY (Benchmark)")
        ax.axhline(capital, color="#888888", linewidth=0.8, linestyle=":", alpha=0.6)

        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b '%y"))
        ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=30, ha="right")
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"€{x:,.0f}"))
        ax.set_ylabel("Portfolio Value", fontsize=9, color="#333333")
        ax.grid(True, alpha=0.2, color="#CCCCCC")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.tick_params(labelsize=8, colors="#444444")
        ax.legend(fontsize=8, loc="upper left", framealpha=0.85)

        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning("Equity curve chart generation failed: %s", e)
        return b""


# ---------------------------------------------------------------------------
# PDF builder
# ---------------------------------------------------------------------------
def _embed_image(pdf, png_bytes: bytes, fallback_msg: str) -> bool:
    """Robust PNG embed via PIL → bypasses BytesIO format-detection edge cases."""
    if not png_bytes:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 8, f"  {fallback_msg}", 0, 1)
        pdf.set_text_color(30, 30, 30)
        return False
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(png_bytes))
        pdf.image(img, x=pdf.l_margin, y=None, w=pdf.w - 2 * pdf.l_margin)
        return True
    except Exception as e:
        logger.warning("PDF image embed failed: %s — falling back to BytesIO", e)
        try:
            buf = io.BytesIO(png_bytes)
            pdf.image(buf, x=pdf.l_margin, y=None, w=pdf.w - 2 * pdf.l_margin)
            return True
        except Exception as e2:
            logger.error("PDF image embed BytesIO fallback also failed: %s", e2)
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(120, 120, 120)
            pdf.cell(0, 8, f"  {fallback_msg}", 0, 1)
            pdf.set_text_color(30, 30, 30)
            return False


def _build_pdf(
    req: ReportRequest,
    port_ret: float,
    port_vol: float,
    sharpe: float,
    var_95: float,
    cvar_95: float,
    expected_final: float,
    sim_df: pd.DataFrame,
    precomputed: PrecomputedMetrics | None,
) -> bytes:
    from fpdf import FPDF

    # Use precomputed from frontend optimizer if available (more accurate)
    m_ret    = precomputed.expected_annual_return if (precomputed and precomputed.expected_annual_return is not None) else port_ret
    m_vol    = precomputed.annual_volatility       if (precomputed and precomputed.annual_volatility is not None)       else port_vol
    m_sharpe = precomputed.sharpe_ratio            if (precomputed and precomputed.sharpe_ratio is not None)            else sharpe
    m_sortino = precomputed.sortino_ratio if precomputed else None
    m_calmar  = precomputed.calmar_ratio  if precomputed else None
    m_maxdd   = precomputed.max_drawdown  if precomputed else None
    m_beta    = precomputed.beta          if precomputed else None

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    date_str = datetime.now().strftime("%d %B %Y")

    # ── Theme colours ──
    NAVY   = (22,  49,  99)
    BLUE   = (43,  94, 167)
    LIGHT  = (242, 245, 251)
    DARK   = (30,  30,  30)
    GRAY   = (120, 120, 120)
    WHITE  = (255, 255, 255)
    GREEN  = (34, 120, 60)
    RED    = (180, 40,  40)

    class _PDF(FPDF):
        def header(self):
            # Navy bar
            self.set_fill_color(*NAVY)
            self.rect(0, 0, self.w, 18, "F")
            self.set_y(4)
            self.set_font("Helvetica", "B", 13)
            self.set_text_color(*WHITE)
            self.cell(0, 10, "  CAPITALIS", 0, 0, "L")
            self.set_font("Helvetica", "", 8)
            self.set_text_color(200, 210, 230)
            self.cell(0, 10, "PORTFOLIO REPORT  ", 0, 0, "R")
            self.set_text_color(*DARK)
            self.ln(20)

        def footer(self):
            self.set_y(-13)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*GRAY)
            self.cell(0, 6, f"Generated by Capitalis  |  {now_str}", 0, 0, "L")
            self.cell(0, 6, f"Page {self.page_no()}", 0, 0, "R")

        def section_title(self, title: str):
            self.set_fill_color(*LIGHT)
            self.set_font("Helvetica", "B", 10)
            self.set_text_color(*BLUE)
            self.rect(self.l_margin, self.get_y(), self.w - 2 * self.l_margin, 8, "F")
            self.cell(0, 8, f"  {title}", 0, 1)
            self.set_text_color(*DARK)
            self.ln(2)

        def kv_row(self, label: str, value: str, shade: bool = False, value_color=None):
            if shade:
                self.set_fill_color(248, 250, 253)
                self.rect(self.l_margin, self.get_y(), self.w - 2 * self.l_margin, 7, "F")
            self.set_font("Helvetica", "", 9)
            self.set_text_color(*GRAY)
            self.cell(90, 7, label, 0, 0)
            self.set_font("Helvetica", "B", 9)
            if value_color:
                self.set_text_color(*value_color)
            else:
                self.set_text_color(*DARK)
            self.cell(0, 7, value, 0, 1)
            self.set_text_color(*DARK)

    pdf = _PDF()
    pdf.core_fonts_encoding = "cp1252"
    pdf.set_margins(15, 25, 15)
    pdf.set_auto_page_break(auto=True, margin=18)

    # ── PAGE 1: Cover ── ─────────────────────────────────────────────────────
    pdf.add_page()

    # Large navy cover band
    pdf.set_fill_color(*NAVY)
    pdf.rect(0, 18, pdf.w, 72, "F")

    pdf.set_y(28)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 14, req.portfolio_name.upper(), 0, 1, "C")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(180, 200, 230)
    pdf.cell(0, 8, "Portfolio Analysis Report", 0, 1, "C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 7, date_str, 0, 1, "C")

    pdf.set_y(100)
    pdf.set_text_color(*DARK)

    # Summary box
    pdf.set_fill_color(*LIGHT)
    pdf.set_draw_color(*BLUE)
    box_x, box_w = 30, pdf.w - 60
    pdf.set_x(box_x)
    pdf.set_font("Helvetica", "", 9)

    meta = [
        ("Optimization Method", req.method),
        ("Capital Invested",    f"€{req.capital:,.0f}"),
        ("Assets",              str(len(req.tickers))),
        ("Report Date",         date_str),
        ("Simulations (MC)",    f"{req.n_simulations:,}"),
    ]
    for i, (k, v) in enumerate(meta):
        shade = i % 2 == 0
        if shade:
            pdf.set_fill_color(240, 244, 252)
            pdf.rect(box_x, pdf.get_y(), box_w, 8, "F")
        pdf.set_x(box_x)
        pdf.set_text_color(*GRAY)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(70, 8, k)
        pdf.set_text_color(*DARK)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 8, v, 0, 1)

    pdf.set_y(-40)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(*GRAY)
    pdf.multi_cell(0, 5,
        "Generated by Capitalis for personal portfolio analysis. "
        "Past performance does not guarantee future results. Monte Carlo simulations are based on "
        "historical return estimates and do not account for tail risk events beyond the modelled distribution.",
        0, "C"
    )

    # ── PAGE 2: Risk Metrics + Allocation table ── ───────────────────────────
    pdf.add_page()

    pdf.section_title("RISK METRICS")

    # Expected return color
    ret_color = GREEN if m_ret >= 0 else RED

    rows_metrics = [
        ("Expected Annual Return",  f"{m_ret:.2%}",    ret_color),
        ("Annual Volatility",       f"{m_vol:.2%}",    None),
        ("Sharpe Ratio (Rf = 4%)",  f"{m_sharpe:.4f}", None),
    ]
    if m_sortino is not None:
        rows_metrics.append(("Sortino Ratio", f"{m_sortino:.4f}", None))
    if m_calmar is not None:
        rows_metrics.append(("Calmar Ratio", f"{m_calmar:.4f}", None))
    if m_maxdd is not None:
        rows_metrics.append(("Max Drawdown", f"{m_maxdd:.2%}", RED))
    if m_beta is not None:
        rows_metrics.append(("Beta (vs S&P 500)", f"{m_beta:.4f}", None))
    rows_metrics += [
        ("VaR 95% — 1Y",  f"-€{var_95:,.0f}",  RED),
        ("CVaR 95% — 1Y", f"-€{cvar_95:,.0f}", RED),
        ("Expected Final Value (Median MC)", f"€{expected_final:,.0f}", GREEN),
    ]

    for i, row in enumerate(rows_metrics):
        label, value = row[0], row[1]
        vc = row[2] if len(row) > 2 else None
        pdf.kv_row(label, value, shade=(i % 2 == 0), value_color=vc)

    pdf.ln(6)
    pdf.section_title("PORTFOLIO ALLOCATION")

    # Table header
    pdf.set_fill_color(*NAVY)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 8)
    col_w = [50, 40, 55, 45]
    headers = ["TICKER", "WEIGHT", "ALLOCATION (€)", "CUMUL. WEIGHT"]
    for h, w in zip(headers, col_w):
        pdf.cell(w, 7, h, 0, 0, "L")
    pdf.ln()
    pdf.set_text_color(*DARK)

    sorted_alloc = sorted(zip(req.tickers, req.weights), key=lambda x: x[1], reverse=True)
    cumul = 0.0
    for i, (tkr, wgt) in enumerate(sorted_alloc):
        cumul += wgt
        shade = i % 2 == 0
        if shade:
            pdf.set_fill_color(248, 250, 253)
            pdf.rect(pdf.l_margin, pdf.get_y(), sum(col_w), 7, "F")
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*BLUE)
        pdf.cell(col_w[0], 7, tkr)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*DARK)
        pdf.cell(col_w[1], 7, f"{wgt:.2%}")
        pdf.cell(col_w[2], 7, f"€{wgt * req.capital:,.0f}")
        pdf.cell(col_w[3], 7, f"{cumul:.2%}")
        pdf.ln()
    pdf.set_text_color(*DARK)

    # ── PAGE 3: Historical Equity Curve ── ───────────────────────────────────────
    pdf.add_page()
    pdf.section_title("HISTORICAL PERFORMANCE — 1Y")

    ec_png = _equity_curve_chart(req.tickers, req.weights, req.capital)
    if _embed_image(pdf, ec_png, "Chart unavailable — market data could not be fetched."):
        pdf.ln(3)

    # ── PAGE 4: MC fan chart + VaR box ── ────────────────────────────────────
    pdf.add_page()
    pdf.section_title("MONTE CARLO SIMULATION — 1Y HORIZON")

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 6, f"{req.n_simulations:,} simulated paths · 252 trading days · Log-normal returns", 0, 1)
    pdf.ln(2)

    mc_png = _mc_chart(sim_df, req.capital)
    if _embed_image(pdf, mc_png, "Monte Carlo chart unavailable."):
        pdf.ln(4)
    else:
        pdf.ln(4)

    # VaR summary box
    pdf.set_fill_color(*LIGHT)
    pdf.rect(pdf.l_margin, pdf.get_y(), pdf.w - 2 * pdf.l_margin, 28, "F")
    pdf.set_y(pdf.get_y() + 3)
    var_items = [
        ("VaR 95% (1Y)",        f"-€{var_95:,.0f}",  RED),
        ("CVaR 95% (1Y)",       f"-€{cvar_95:,.0f}", RED),
        ("Expected Final Value", f"€{expected_final:,.0f}", GREEN),
    ]
    for label, value, color in var_items:
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(*GRAY)
        pdf.cell(90, 7, f"  {label}")
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(*color)
        pdf.cell(0, 7, value, 0, 1)
    pdf.set_text_color(*DARK)

    # ── PAGE 5: Allocation bar chart ── ──────────────────────────────────────
    pdf.add_page()
    pdf.section_title("ALLOCATION BREAKDOWN")

    alloc_png = _alloc_chart(req.tickers, req.weights)
    _embed_image(pdf, alloc_png, "Allocation chart unavailable.")

    # ── PAGE 6: Sector exposure ── ──────────────────────────────────────────
    pdf.add_page()
    pdf.section_title("SECTOR EXPOSURE")
    meta = _fetch_meta(req.tickers)
    sector_png = _sector_chart(req.tickers, req.weights, meta)
    _embed_image(pdf, sector_png, "Sector chart unavailable — yfinance metadata missing.")

    # ── PAGE 7: Geographic exposure ── ──────────────────────────────────────
    pdf.add_page()
    pdf.section_title("GEOGRAPHIC EXPOSURE")
    geo_png = _geographic_chart(req.tickers, req.weights, meta)
    _embed_image(pdf, geo_png, "Geographic chart unavailable — yfinance metadata missing.")

    return bytes(pdf.output())


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/generate-pdf")
def generate_pdf_report(req: ReportRequest, current_user: dict = Depends(get_current_user)) -> Response:
    plan = get_plan_for_user(current_user["sub"])
    if not get_limits(plan).get("pdf_export", False):
        raise HTTPException(status_code=402, detail=f"PDF export requires Pro or higher (current plan: {plan}).")
    if len(req.tickers) != len(req.weights):
        raise HTTPException(status_code=422, detail="tickers and weights must have equal length.")

    w_arr = np.array(req.weights, dtype=float)
    if not np.isclose(w_arr.sum(), 1.0, atol=1e-3):
        raise HTTPException(status_code=422, detail=f"Weights must sum to 1.0 (got {w_arr.sum():.4f}).")

    # ── Fetch market data ────────────────────────────────────────────────────
    try:
        raw   = yf.download(req.tickers, period="5y", interval="1d", progress=False, auto_adjust=True)
        close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        if hasattr(close, "columns") and len(close.columns) == 0:
            raise ValueError("No data returned.")
        rets   = np.log(close / close.shift(1)).dropna()
        mu_vec = rets.mean().values * 252
        cov    = rets.cov().values * 252
    except Exception as exc:
        logger.error("Data fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail="Market data unavailable.")

    # ── Compute basic metrics (used if no precomputed) ───────────────────────
    port_ret = float(w_arr @ mu_vec)
    port_vol = float(np.sqrt(w_arr @ cov @ w_arr))
    sharpe   = (port_ret - 0.04) / port_vol if port_vol > 0 else 0.0

    # ── Monte Carlo ──────────────────────────────────────────────────────────
    try:
        sim_df = run_monte_carlo_portfolio(
            initial_capital=req.capital,
            weights=w_arr,
            mu_vec=mu_vec,
            cov_matrix=cov,
            horizon_days=252,
            n_simulations=req.n_simulations,
        )
        final_vals     = sim_df.iloc[-1].values
        var_95, cvar_95 = calculate_var_cvar_simple(final_vals, initial_capital=req.capital)
        expected_final  = float(np.median(final_vals))
    except Exception as exc:
        logger.error("Monte Carlo error: %s", exc)
        raise HTTPException(status_code=500, detail="Monte Carlo simulation failed.")

    # ── Build PDF ────────────────────────────────────────────────────────────
    try:
        pdf_bytes = _build_pdf(
            req=req,
            port_ret=port_ret,
            port_vol=port_vol,
            sharpe=sharpe,
            var_95=var_95,
            cvar_95=cvar_95,
            expected_final=expected_final,
            sim_df=sim_df,
            precomputed=req.precomputed_metrics,
        )
    except Exception as exc:
        logger.error("PDF build error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")

    filename = f"capitalis_{req.portfolio_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
