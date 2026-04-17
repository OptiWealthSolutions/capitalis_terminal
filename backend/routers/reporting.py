"""
Reporting router.
Endpoints: generate PDF institutional report (streamed as binary response).
"""

import sys
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.pf_engine.risk_management.monte_carlo_simulation import (
    run_monte_carlo_portfolio,
    calculate_var_cvar_simple,
)
from ..schemas.portfolio import MonteCarloRequest

logger = logging.getLogger(__name__)
router = APIRouter()


class ReportRequest(BaseModel):
    portfolio_name: str = Field(..., min_length=1, max_length=64)
    tickers: list[str] = Field(..., min_length=1, max_length=50)
    weights: list[float] = Field(..., min_length=1, max_length=50)
    capital: float = Field(..., gt=0)
    n_simulations: int = Field(default=500, ge=100, le=5000)


# ---------------------------------------------------------------------------
# POST /reporting/generate-pdf
# ---------------------------------------------------------------------------
@router.post("/generate-pdf")
def generate_pdf_report(req: ReportRequest) -> Response:
    """
    Generates a multi-page institutional PDF report.
    Returns the PDF as application/pdf binary response.
    """
    if len(req.tickers) != len(req.weights):
        raise HTTPException(status_code=422, detail="tickers and weights must have equal length.")

    w_arr = np.array(req.weights, dtype=float)
    if not np.isclose(w_arr.sum(), 1.0, atol=1e-3):
        raise HTTPException(status_code=422, detail=f"Weights must sum to 1.0 (got {w_arr.sum():.4f}).")

    # --- Build portfolio metrics ---
    try:
        raw = yf.download(req.tickers, period="5y", interval="1d", progress=False, auto_adjust=True)
        close = raw["Close"]
        rets = np.log(close / close.shift(1)).dropna()
        mu_vec = rets.mean().values * 252
        cov = rets.cov().values * 252
    except Exception as exc:
        logger.error("Data fetch for PDF report failed: %s", exc)
        raise HTTPException(status_code=503, detail="Market data unavailable for report generation.")

    port_ret = float(w_arr @ mu_vec)
    port_vol = float(np.sqrt(w_arr @ cov @ w_arr))
    sharpe = (port_ret - 0.04) / port_vol if port_vol > 0 else 0.0

    # --- Monte Carlo ---
    try:
        sim_df = run_monte_carlo_portfolio(
            initial_capital=req.capital,
            weights=w_arr,
            mu_vec=mu_vec,
            cov_matrix=cov,
            horizon_days=252,
            n_simulations=req.n_simulations,
        )
        final_vals = sim_df.iloc[-1]
        var_95, cvar_95 = calculate_var_cvar_simple(final_vals.values, initial_capital=req.capital)
    except Exception as exc:
        logger.error("Monte Carlo error in PDF report: %s", exc)
        raise HTTPException(status_code=500, detail="Monte Carlo simulation failed.")

    # --- PDF construction ---
    try:
        from fpdf import FPDF

        class _InstitutionalPDF(FPDF):
            def header(self):
                self.set_fill_color(0, 0, 0)
                self.rect(0, 0, self.w, 25, "F")
                self.set_y(8)
                self.set_font("Helvetica", "B", 16)
                self.set_text_color(255, 255, 255)
                self.cell(0, 10, "CAPITALIS V2", 0, 0, "L")
                self.set_font("Helvetica", "B", 9)
                self.set_text_color(200, 200, 200)
                self.cell(0, 10, "INSTITUTIONAL PORTFOLIO REPORT", 0, 0, "R")
                self.ln(20)
                self.set_text_color(0, 0, 0)

            def footer(self):
                self.set_y(-15)
                self.set_font("Helvetica", "I", 8)
                self.set_text_color(128, 128, 128)
                self.cell(0, 10, "CONFIDENTIAL — FOR INTERNAL USE ONLY | CAPITALIS V2", 0, 0, "L")
                self.cell(0, 10, f"Page {self.page_no()}", 0, 0, "R")

        pdf = _InstitutionalPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 12, f"PORTFOLIO: {req.portfolio_name.upper()}", ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 8, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}", ln=True)
        pdf.ln(6)

        # Key Metrics Table
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 10, "RISK METRICS", ln=True)
        pdf.set_font("Helvetica", "", 10)
        metrics = [
            ("Expected Annual Return", f"{port_ret:.2%}"),
            ("Annual Volatility", f"{port_vol:.2%}"),
            ("Sharpe Ratio (Rf=4%)", f"{sharpe:.4f}"),
            ("VaR 95% (1Y)", f"-{var_95:,.0f} EUR"),
            ("CVaR 95% (1Y)", f"-{cvar_95:,.0f} EUR"),
        ]
        for label, value in metrics:
            pdf.cell(95, 8, label, border="B")
            pdf.cell(95, 8, value, border="B", ln=True)

        pdf.ln(8)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 10, "PORTFOLIO ALLOCATION", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for ticker, weight, alloc in zip(req.tickers, req.weights, w_arr * req.capital):
            pdf.cell(60, 8, ticker, border="B")
            pdf.cell(60, 8, f"{weight:.2%}", border="B")
            pdf.cell(70, 8, f"{alloc:,.0f} EUR", border="B", ln=True)

        pdf_bytes = pdf.output()
    except Exception as exc:
        logger.error("PDF generation error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="PDF generation failed.")

    filename = f"capitalis_report_{req.portfolio_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
