"use client";

import { BookOpen, Cpu, BarChart2, Shield, FileText, Zap } from "lucide-react";

const sections = [
  {
    icon: BarChart2,
    title: "Macro View",
    description:
      "Global macro dashboard. Displays economic regime indicators, yield curve dynamics, cross-asset correlation matrices, and factor exposures. Data sourced via FRED and Yahoo Finance.",
  },
  {
    icon: Zap,
    title: "ML Alpha",
    description:
      "Machine learning alpha signals. LSTM and regression models trained on price, volume, and macro features. Signals expressed as directional probability scores (0-100).",
  },
  {
    icon: FileText,
    title: "Screener",
    description:
      "Fundamental and quantitative screener. Filter universe by P/E, P/B, EV/EBITDA, momentum, volatility, and sector. Supports saved preset configurations.",
  },
  {
    icon: Shield,
    title: "Scorer",
    description:
      "Composite asset scoring engine. Combines valuation, momentum, quality, and risk factors into a single normalized score (0-100). Useful for ranking and selection.",
  },
  {
    icon: Cpu,
    title: "Portfolio Optimizer",
    description:
      "Multi-method portfolio construction. Supported methods: HRP (Hierarchical Risk Parity), Mean-Variance (Markowitz), Minimum Volatility, Equal Weights. Outputs weights, allocation, Sharpe, Sortino, Calmar, Beta, max drawdown.",
  },
  {
    icon: BarChart2,
    title: "Monte Carlo Simulation",
    description:
      "Correlated GBM simulation using Cholesky decomposition. Configurable simulations (100-10,000) and horizon (21-1,260 days). Returns P5/P25/P50/P75/P95 percentile paths, VaR 95%, CVaR 95%.",
  },
  {
    icon: BookOpen,
    title: "Reporting",
    description:
      "Institutional PDF report generator. Compiles portfolio metrics, allocation table, and Monte Carlo risk summary into a downloadable PDF (fpdf2).",
  },
];

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Documentation
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
          CAPITALIS V2 — Institutional Quantitative Terminal. Technical reference for all modules.
        </p>
      </div>

      {/* Architecture */}
      <section
        className="rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: "var(--ink)" }}>
          Architecture
        </h2>
        <div className="space-y-2 text-sm" style={{ color: "var(--ink-2)" }}>
          <p>
            <span className="font-medium" style={{ color: "var(--ink)" }}>Backend:</span> FastAPI (Python 3.11). Routers under{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--card)", color: "var(--orange)" }}>
              /api/v1/
            </code>
            . SQLite for portfolio persistence. In-memory LRU cache for expensive computations.
          </p>
          <p>
            <span className="font-medium" style={{ color: "var(--ink)" }}>Frontend:</span> Next.js 14 App Router. TanStack Query for server state. Tailwind CSS + CSS custom properties design system. JetBrains Mono for numerical data, Inter for UI text.
          </p>
          <p>
            <span className="font-medium" style={{ color: "var(--ink)" }}>Data:</span> Yahoo Finance (yfinance) as primary source. 10-year daily OHLCV for portfolio analytics. Log returns throughout — no simple returns.
          </p>
          <p>
            <span className="font-medium" style={{ color: "var(--ink)" }}>Auth:</span> JWT-based sessions stored in localStorage. All protected routes redirect to{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--card)", color: "var(--orange)" }}>
              /login
            </code>{" "}
            when unauthenticated.
          </p>
        </div>
      </section>

      {/* API Base URL */}
      <section
        className="rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: "var(--ink)" }}>
          API Reference
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--ink-2)" }}>
          All endpoints proxied through Next.js at{" "}
          <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--card)", color: "var(--orange)" }}>
            /api
          </code>
          . Direct backend:{" "}
          <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--card)", color: "var(--orange)" }}>
            http://localhost:8000
          </code>
          .
        </p>
        <div className="space-y-2">
          {[
            ["POST", "/api/portfolio/optimize", "Run portfolio optimization"],
            ["POST", "/api/portfolio/monte-carlo", "Monte Carlo simulation"],
            ["GET",  "/api/portfolio/saved", "List saved portfolios"],
            ["POST", "/api/portfolio/save", "Save portfolio"],
            ["DELETE", "/api/portfolio/saved/{name}", "Delete saved portfolio"],
            ["POST", "/api/reporting/generate-pdf", "Generate institutional PDF report"],
            ["GET",  "/api/equity/{ticker}", "Equity fundamentals"],
            ["GET",  "/api/macro/indicators", "Macro indicators"],
            ["GET",  "/api/screener/screen", "Run screener"],
            ["GET",  "/api/scorer/score", "Run scorer"],
          ].map(([method, path, desc]) => (
            <div key={path} className="flex items-start gap-3 text-sm">
              <span
                className="font-mono text-xs font-semibold flex-shrink-0 pt-0.5"
                style={{
                  color: method === "GET" ? "var(--green)" : method === "DELETE" ? "var(--red)" : "var(--orange)",
                  minWidth: 48,
                }}
              >
                {method}
              </span>
              <code
                className="font-mono text-xs flex-shrink-0"
                style={{ color: "var(--ink)", minWidth: 280 }}
              >
                {path}
              </code>
              <span style={{ color: "var(--ink-2)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <div>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--ink)" }}>
          Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="rounded-xl p-5"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: 32, height: 32,
                      background: "var(--orange-dim)",
                      border: "1px solid var(--orange-border)",
                    }}
                  >
                    <Icon size={15} style={{ color: "var(--orange)" }} />
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {s.title}
                  </h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {s.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stack */}
      <section
        className="rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--ink)" }}>
          Tech Stack
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Python 3.11", "Runtime"],
            ["FastAPI", "API framework"],
            ["NumPy / Pandas", "Numerical computing"],
            ["SciPy", "Optimization"],
            ["yfinance", "Market data"],
            ["fpdf2", "PDF generation"],
            ["Next.js 14", "Frontend"],
            ["TanStack Query", "Data fetching"],
            ["Tailwind CSS", "Styling"],
            ["Zod", "Schema validation"],
            ["SQLite", "Persistence"],
            ["JWT", "Auth"],
          ].map(([name, role]) => (
            <div
              key={name}
              className="rounded-lg p-3"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{name}</div>
              <div className="text-xxs mt-0.5" style={{ color: "var(--ink-3)" }}>{role}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs pb-6" style={{ color: "var(--ink-3)" }}>
        CAPITALIS V2 — Institutional use only. This documentation is auto-maintained.
      </p>
    </div>
  );
}
