"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard, Filter, Star, Brain, Briefcase, Wallet,
  TrendingUp, FileText, Settings, UserCircle, BookOpen,
  ChevronRight, AlertCircle, CheckCircle, Info, Lightbulb,
  ArrowRight, Play, Download, RefreshCw, Search, BarChart2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Section {
  id:      string;
  label:   string;
  icon:    React.ReactNode;
  group:   string;
}

// ---------------------------------------------------------------------------
// Sidebar sections
// ---------------------------------------------------------------------------
const SECTIONS: Section[] = [
  { id: "start",     label: "Getting started",     icon: <Play size={13} />,         group: "Introduction" },
  { id: "workflow",  label: "Recommended workflow", icon: <ArrowRight size={13} />,   group: "Introduction" },
  { id: "dashboard", label: "Dashboard",            icon: <LayoutDashboard size={13} />, group: "Pages" },
  { id: "screener",  label: "Screener",             icon: <Filter size={13} />,       group: "Pages" },
  { id: "scorer",    label: "Scorer",               icon: <Star size={13} />,         group: "Pages" },
  { id: "signals",   label: "AI Signals",           icon: <Brain size={13} />,        group: "Pages" },
  { id: "allocation",label: "Allocation (Optimizer)", icon: <Briefcase size={13} />, group: "Pages" },
  { id: "tracker",   label: "Portfolio Tracker",    icon: <Wallet size={13} />,       group: "Pages" },
  { id: "equity",    label: "Equity Review",        icon: <TrendingUp size={13} />,   group: "Pages" },
  { id: "reporting", label: "Reporting",            icon: <FileText size={13} />,     group: "Pages" },
  { id: "settings",  label: "Settings",             icon: <Settings size={13} />,     group: "Account" },
  { id: "account",   label: "Account & Billing",    icon: <UserCircle size={13} />,   group: "Account" },
  { id: "faq",       label: "FAQ",                  icon: <Info size={13} />,         group: "Help" },
];

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------
function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-xl font-semibold mb-1" style={{ color: "var(--t1)" }}>{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold mt-8 mb-3 pb-2 border-b" style={{ color: "var(--t1)", borderColor: "var(--border)" }}>{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold mt-5 mb-2 uppercase tracking-widest" style={{ color: "var(--orange)" }}>{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--t2)" }}>{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--orange)" }}>
      {children}
    </code>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl p-4 mb-4" style={{ background: "rgba(122,167,232,0.08)", border: "1px solid rgba(122,167,232,0.20)" }}>
      <Lightbulb size={14} style={{ color: "#7AA7E8", flexShrink: 0, marginTop: 2 }} />
      <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl p-4 mb-4" style={{ background: "rgba(201,177,120,0.08)", border: "1px solid rgba(201,177,120,0.22)" }}>
      <AlertCircle size={14} style={{ color: "var(--yellow)", flexShrink: 0, marginTop: 2 }} />
      <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-5">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
        style={{ background: "var(--orange)", color: "var(--bg-base)" }}>
        {n}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--t1)" }}>{title}</p>
        <div className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{children}</div>
      </div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="rounded-xl overflow-hidden border mb-5" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "var(--bg-hover)", borderBottom: "1px solid var(--border)" }}>
            {headers.map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-semibold tracking-widest" style={{ color: "var(--t3)", fontSize: 10 }}>
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg-card)" : "transparent" }}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5" style={{ color: j === 0 ? "var(--t1)" : "var(--t2)" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children, color = "var(--orange)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded inline-block"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page content by section ID
// ---------------------------------------------------------------------------
const CONTENT: Record<string, React.ReactNode> = {

  start: (
    <div>
      <H1>Getting started</H1>
      <P>CAPITALIS is an institutional-grade quantitative portfolio analysis tool. It helps you research stocks, score conviction, build optimized portfolios, track positions, and generate professional reports — all in one terminal.</P>

      <Tip>You do not need coding or finance expertise to use CAPITALIS. This guide walks through every feature step by step.</Tip>

      <H2>What you need before you start</H2>
      <P>Nothing to install on your end. CAPITALIS runs in your browser. You need:</P>
      <ul className="list-none space-y-2 mb-4">
        {[
          "A modern browser (Chrome, Firefox, Safari, Edge)",
          "An internet connection — market data is fetched live",
          "A CAPITALIS account (create one at the Login page)",
        ].map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--t2)" }}>
            <CheckCircle size={13} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
            {item}
          </li>
        ))}
      </ul>

      <H2>What CAPITALIS is NOT</H2>
      <Warning>
        CAPITALIS is a research and analysis tool — it does NOT execute trades. It does not connect to your brokerage. Results shown (backtests, Monte Carlo, equity curves) are based on historical data and are for informational purposes only. Past performance does not guarantee future results.
      </Warning>

      <H2>How data works</H2>
      <P>All market data is fetched from Yahoo Finance in real time. Prices update when you trigger an action (optimize, refresh equity curve, etc.) — they are not streaming live in the background. This keeps the app fast and avoids excessive API calls.</P>

      <Table
        headers={["Data type", "Source", "Update trigger"]}
        rows={[
          ["Stock prices (OHLCV)", "Yahoo Finance", "On demand"],
          ["Fundamentals (P/E, etc.)", "Yahoo Finance", "On demand"],
          ["Market overview", "Yahoo Finance", "Every 5 min (dashboard)"],
          ["Earnings / dividends", "Yahoo Finance", "On demand"],
          ["Preferences", "Backend (local file)", "On save"],
          ["Portfolios (optimizer)", "Your browser (localStorage)", "On save"],
          ["Tracker positions", "Your browser (localStorage)", "On save"],
        ]}
      />

      <Warning>
        Portfolio data (both optimizer results and tracker positions) is stored in your browser's localStorage. If you clear your browser data, you will lose your portfolios. Use the Export function in Settings → Data to back them up regularly.
      </Warning>
    </div>
  ),

  workflow: (
    <div>
      <H1>Recommended workflow</H1>
      <P>CAPITALIS is designed around a specific investment research process. Following this order will give you the best results.</P>

      <H2>The 6-step process</H2>

      <Step n={1} title="Screen the universe — Screener">
        Start here. Use the Screener to filter thousands of stocks down to a manageable shortlist based on fundamental and quantitative criteria (P/E ratio, momentum, volatility, sector, etc.). Export or note the tickers you find interesting.
      </Step>

      <Step n={2} title="Score your conviction — Scorer">
        Take your shortlist from the Screener and run it through the Scorer. This gives each stock a composite score (0–100) combining valuation, momentum, quality, and risk. High scores = stronger investment case. This helps you rank and prioritize.
      </Step>

      <Step n={3} title="Deep-dive on individual stocks — Equity Review">
        For your top-scored stocks, use Equity Review to get detailed fundamental analysis: financial ratios, price chart, earnings history, sector peers. This is where you validate your thesis before committing capital.
      </Step>

      <Step n={4} title="Check AI signals — AI Signals">
        Optional but useful. AI Signals shows machine-learning directional probability scores for stocks. A high ML score (above 60) adds confidence. Use this as a secondary filter, not a primary decision driver.
      </Step>

      <Step n={5} title="Build your portfolio — Allocation">
        Enter your final tickers in the Allocation (optimizer) page. Choose an optimization method (Sharpe maximization recommended for most users), set your capital, run the optimizer. Review weights, risk metrics, and Monte Carlo projections. Save the portfolio when satisfied.
      </Step>

      <Step n={6} title="Track and report">
        Add your actual purchased positions in Portfolio Tracker (with real entry prices and dates). Generate an institutional PDF report from the Reporting page for documentation or client presentation.
      </Step>

      <Tip>
        The Dashboard shows your latest optimizer portfolio and tracker portfolio side by side with live equity curves. Check it daily to monitor performance without navigating to individual pages.
      </Tip>
    </div>
  ),

  dashboard: (
    <div>
      <H1>Dashboard</H1>
      <P>The Dashboard is your daily command center. It shows portfolio performance, market context, and upcoming corporate events — all on one screen.</P>

      <H2>Optimizer equity curve</H2>
      <P>The top section shows the equity curve of your selected optimizer portfolio (from the Allocation page). It displays how your portfolio <em>would have performed</em> if you had invested on the start date (default: 1 year ago).</P>

      <Table
        headers={["Element", "What it means"]}
        rows={[
          ["Blue line", "Your optimizer portfolio value over time"],
          ["Dotted line", "SPY (S&P 500) benchmark for comparison"],
          ["Total Return", "Percentage gain/loss from start date to today"],
          ["Current Value", "Portfolio value in euros based on capital × price changes"],
          ["Ann. Return", "Return annualized (only shown if > 30 days of data)"],
          ["Volatility", "Annualized standard deviation of daily returns"],
          ["Sharpe Ratio", "Return per unit of risk (only shown if > 1 year of data)"],
          ["Max Drawdown", "Worst peak-to-trough decline during the period"],
        ]}
      />

      <Tip>Use the portfolio selector dropdown to switch between saved optimizer portfolios without leaving the dashboard.</Tip>

      <H2>Tracker equity curve</H2>
      <P>The second section shows your Portfolio Tracker — real positions you actually hold. Unlike the optimizer curve (which starts from a past date with theoretical weights), the tracker uses your <strong>actual entry prices and dates</strong>.</P>

      <Table
        headers={["Element", "What it means"]}
        rows={[
          ["Green line", "Your real portfolio value (sum of shares × current price)"],
          ["Dotted line", "Your total cost basis (sum of shares × entry price)"],
          ["Unrealized P&L", "Current value minus cost basis (profit or loss in euros)"],
          ["Position table", "Per-ticker breakdown: entry price, current price, P&L, return %"],
        ]}
      />

      <H2>Market Pulse</H2>
      <P>Below the equity curves, the Market Stress gauge and Global Markets grid give real-time context:</P>
      <ul className="list-none space-y-1.5 mb-4 text-sm" style={{ color: "var(--t2)" }}>
        <li>• <strong style={{ color: "var(--t1)" }}>Market Stress score</strong> — 0 to 100. Combines VIX, equity drawdowns, volatility, and rate changes. Green = calm, Red = stressed.</li>
        <li>• <strong style={{ color: "var(--t1)" }}>Index cards</strong> — SPY, QQQ, DAX, etc. Shows price, daily change %, and a sparkline chart.</li>
      </ul>

      <H2>Portfolio summary & Events</H2>
      <P>The bottom section shows the selected optimizer portfolio's key metrics (Expected Return, Sharpe, Volatility, Max Drawdown) and an allocation bar for each position. On the right: upcoming earnings announcements and dividend dates for your tickers — highlighted in orange when within 14 days.</P>

      <Warning>If "No portfolio yet" appears, go to the Allocation page and run an optimization first, then save the result.</Warning>
    </div>
  ),

  screener: (
    <div>
      <H1>Screener</H1>
      <P>The Screener filters a large universe of stocks using fundamental and quantitative criteria. Use it to go from thousands of stocks to a shortlist of 5–20 candidates.</P>

      <H2>How to run a screen</H2>

      <Step n={1} title="Choose filters">
        Select the criteria you care about. You do not need to fill every filter — leave fields empty to ignore them. Common starting points:
        <ul className="list-none mt-2 space-y-1">
          <li>• P/E Ratio max 25 → excludes overvalued stocks</li>
          <li>• Momentum min 0 → only stocks trending up</li>
          <li>• Market cap "Large" → established companies only</li>
        </ul>
      </Step>

      <Step n={2} title="Select sector (optional)">
        Filter by sector (Technology, Healthcare, Finance, etc.) to focus on industries you understand or want exposure to.
      </Step>

      <Step n={3} title="Run the screen">
        Click "Run Screener". Results appear as a sortable table. Each row is one stock.
      </Step>

      <Step n={4} title="Review results">
        Click any column header to sort. Click a ticker to open Equity Review for that stock. Note the tickers you like for the next step (Scorer).
      </Step>

      <H2>Filter reference</H2>
      <Table
        headers={["Filter", "What it measures", "Good value range"]}
        rows={[
          ["P/E Ratio", "Price relative to earnings. Lower = cheaper.", "10–25 for value investing"],
          ["P/B Ratio", "Price relative to book value.", "< 3 for value stocks"],
          ["EV/EBITDA", "Enterprise value to earnings. Lower = cheaper.", "< 15"],
          ["Momentum", "Price trend over past 12 months.", "> 0% = uptrend"],
          ["Volatility", "Daily price fluctuation. Higher = more risk.", "< 30% for conservative"],
          ["Market Cap", "Company size: Micro/Small/Mid/Large/Mega", "Large/Mega = less risk"],
        ]}
      />

      <Tip>Start with broad filters and narrow down. If you get 0 results, your filters are too strict — relax one or two criteria.</Tip>
    </div>
  ),

  scorer: (
    <div>
      <H1>Scorer</H1>
      <P>The Scorer ranks stocks by combining multiple factors into a single composite score from 0 to 100. Higher is better. Use it to prioritize which stocks from your Screener shortlist deserve closer attention.</P>

      <H2>How to score stocks</H2>

      <Step n={1} title="Enter tickers">
        Type one or more stock tickers (e.g. AAPL, MSFT, NVDA). Separate by comma. You can paste a list directly from your Screener results.
      </Step>

      <Step n={2} title="Run the scorer">
        Click "Score". The scorer fetches data for each ticker and computes the composite score. This takes a few seconds per ticker.
      </Step>

      <Step n={3} title="Interpret results">
        Results are displayed as a ranked table. The overall score and each sub-score are shown.
      </Step>

      <H2>Score components explained</H2>
      <Table
        headers={["Component", "What it measures", "Weight"]}
        rows={[
          ["Valuation", "How cheap/expensive the stock is (P/E, P/B, EV/EBITDA). Higher score = cheaper.", "25%"],
          ["Momentum", "Price trend strength over 1, 3, 6, 12 months. Higher score = stronger trend.", "25%"],
          ["Quality", "Earnings stability, ROE, debt levels. Higher score = healthier business.", "25%"],
          ["Risk", "Volatility and drawdown. Higher score = less risky (inverted — lower vol = higher score).", "25%"],
        ]}
      />

      <H2>How to interpret the score</H2>
      <Table
        headers={["Score range", "Interpretation"]}
        rows={[
          ["70–100", "Strong across most factors. High conviction candidate."],
          ["50–70", "Above average. Worth researching further."],
          ["30–50", "Mixed signals. Proceed with caution."],
          ["0–30", "Weak across most factors. Avoid unless you have a specific thesis."],
        ]}
      />

      <Warning>A high score does not guarantee future performance. The scorer is a systematic ranking tool, not a recommendation. Always validate with Equity Review before including a stock in your portfolio.</Warning>
    </div>
  ),

  signals: (
    <div>
      <H1>AI Signals</H1>
      <P>AI Signals uses machine learning models to predict short-term directional probability for stocks. The output is a score from 0 to 100 representing the model's confidence that a stock will go up over the next period.</P>

      <H2>How to use AI Signals</H2>

      <Step n={1} title="Enter tickers">
        Enter the tickers you want to analyze. These should be stocks you are already interested in (from Screener/Scorer results).
      </Step>

      <Step n={2} title="Run analysis">
        Click "Generate Signals". The backend runs trained ML models on historical price, volume, and macro features for each ticker.
      </Step>

      <Step n={3} title="Interpret scores">
        Scores above 60 indicate bullish bias. Scores below 40 indicate bearish bias. Scores near 50 are neutral/uncertain.
      </Step>

      <H2>Understanding the models</H2>
      <Table
        headers={["Model", "What it uses", "Best for"]}
        rows={[
          ["LSTM (Long Short-Term Memory)", "Sequential price and volume patterns", "Trend detection"],
          ["Gradient Boosting", "Fundamental + technical features", "Multi-factor signals"],
          ["Ensemble score", "Average of model outputs", "Overall signal (use this one)"],
        ]}
      />

      <Warning>AI Signals are based on patterns from historical data. Markets can change regime and historical patterns may stop working. Never use AI signals as the sole basis for investment decisions. Treat them as one input among many.</Warning>

      <Tip>Use AI Signals as a confirmation tool. If a stock already has a high Scorer score AND a high AI Signal, that alignment adds conviction. If they diverge, investigate why before acting.</Tip>
    </div>
  ),

  allocation: (
    <div>
      <H1>Allocation (Portfolio Optimizer)</H1>
      <P>The Allocation page is the core of CAPITALIS. It takes a list of tickers and mathematically computes the optimal portfolio weights to maximize returns for a given level of risk. This is based on Nobel Prize-winning Modern Portfolio Theory.</P>

      <H2>Step-by-step guide</H2>

      <Step n={1} title="Enter your ticker universe">
        In the Universe panel (left column), add the stocks you want to consider. These should be stocks you have researched via Screener, Scorer, and Equity Review. You can type tickers manually or paste a list. Minimum: 2 tickers. Maximum: 50.
      </Step>

      <Step n={2} title="Set parameters">
        In the Parameters panel (right column):
        <ul className="list-none mt-2 space-y-1">
          <li>• <strong>Capital</strong>: How much money you want to invest in euros.</li>
          <li>• <strong>Method</strong>: Choose the optimization algorithm (see below).</li>
          <li>• <strong>Data horizon</strong>: How many years of historical data to use for return/risk estimation.</li>
          <li>• <strong>Risk-free rate</strong>: The rate used to compute Sharpe ratio (default: 4% = current ECB rate).</li>
        </ul>
      </Step>

      <Step n={3} title="Run optimization">
        Click "Optimize". The optimizer fetches historical prices for all tickers, computes return and covariance estimates, then solves the optimization problem. This takes 5–15 seconds depending on the number of tickers.
      </Step>

      <Step n={4} title="Review results">
        Results appear as charts and a metrics table. Check the allocation bar chart (which stocks got the most weight), the sector/geography breakdown, and the 7 key risk metrics.
      </Step>

      <Step n={5} title="Save the portfolio">
        When satisfied, click "Save portfolio". Give it a name. The portfolio is saved to your browser and will appear in the Dashboard, Reporting, and Tracker.
      </Step>

      <H2>Optimization methods explained</H2>
      <Table
        headers={["Method", "What it does", "Best for"]}
        rows={[
          ["Sharpe Maximization", "Finds weights that maximize return per unit of risk. The \"sweet spot\" of risk/reward.", "General use — start here"],
          ["Minimum Variance", "Finds weights that minimize total portfolio volatility, regardless of returns.", "Conservative investors who prioritize stability"],
          ["Equal Weight", "Assigns 1/N weight to each asset. No math needed.", "Benchmarking or when you have no view on relative merit"],
          ["Maximum Return", "Maximizes expected return with no constraint on risk. Often concentrates in one asset.", "Aggressive/growth-oriented portfolios"],
          ["Risk Parity", "Assigns weights so each asset contributes equally to total portfolio risk.", "Diversification-focused portfolios"],
        ]}
      />

      <H2>Key metrics explained</H2>
      <Table
        headers={["Metric", "Formula / meaning", "Good range"]}
        rows={[
          ["Expected Annual Return", "Weighted sum of each asset's historical average annual return.", "> 8%"],
          ["Annual Volatility", "Standard deviation of portfolio daily returns × √252.", "< 20% for moderate risk"],
          ["Sharpe Ratio", "(Return − Risk-free rate) / Volatility. Return per unit of risk.", "> 1.0 is good, > 2.0 is excellent"],
          ["Sortino Ratio", "Like Sharpe but only penalizes downside volatility.", "> 1.5"],
          ["Calmar Ratio", "Annual return / Max Drawdown. Higher = better recovery from losses.", "> 0.5"],
          ["Max Drawdown", "Worst peak-to-trough decline in the historical period.", "< −20% is concerning"],
          ["Beta", "Portfolio sensitivity to the S&P 500. 1.0 = moves like the market.", "0.8–1.2 for balanced exposure"],
        ]}
      />

      <H2>Monte Carlo simulation</H2>
      <P>After optimization, you can run a Monte Carlo simulation. This generates thousands of random future scenarios based on the portfolio's estimated return and covariance, and shows a range of possible outcomes over a chosen horizon.</P>
      <Table
        headers={["Element", "What it means"]}
        rows={[
          ["Fan chart", "Shows P5 (worst 5%), IQR (middle 50%), and P95 (best 5%) of simulated portfolio values"],
          ["Median line", "Most likely outcome path"],
          ["VaR 95%", "Value at Risk: the maximum loss expected in 95% of scenarios"],
          ["CVaR 95%", "Expected loss in the worst 5% of scenarios (more conservative than VaR)"],
          ["Expected Final Value", "Median portfolio value at the end of the horizon"],
        ]}
      />

      <Tip>Run at least 500 simulations for reliable results. Use 1000+ for final reporting.</Tip>
    </div>
  ),

  tracker: (
    <div>
      <H1>Portfolio Tracker</H1>
      <P>The Portfolio Tracker records your actual holdings — the real positions you own, at the real prices and dates you bought them. Unlike the optimizer, which deals in theoretical weights, the tracker deals in real shares and euros.</P>

      <H2>Creating a portfolio</H2>

      <Step n={1} title="Create a new portfolio">
        Click the "+" button in the portfolio tab bar at the top. Enter a name (e.g. "Main portfolio", "Growth ETFs", "Tech trades"). Press Enter or click Create.
      </Step>

      <Step n={2} title="Add a position">
        Click "Add position". Fill in:
        <ul className="list-none mt-2 space-y-1">
          <li>• <strong>Ticker</strong>: Stock symbol (e.g. AAPL for Apple, MSFT for Microsoft)</li>
          <li>• <strong>Shares</strong>: Number of shares you own</li>
          <li>• <strong>Entry price</strong>: The price per share you paid (your average cost)</li>
          <li>• <strong>Entry date</strong>: When you bought (YYYY-MM-DD format)</li>
          <li>• <strong>Notes</strong>: Optional — your investment thesis or reminders</li>
        </ul>
      </Step>

      <Step n={3} title="Monitor performance">
        The tracker automatically fetches current prices and computes:
        <ul className="list-none mt-2 space-y-1">
          <li>• Current value (shares × current price)</li>
          <li>• Unrealized P&L (current value − cost basis)</li>
          <li>• Return % per position and total portfolio</li>
        </ul>
      </Step>

      <H2>Managing multiple portfolios</H2>
      <P>You can create multiple portfolios — for example, one for long-term holdings and one for shorter-term trades. Switch between them using the tab bar. Delete a portfolio with the X button on its tab.</P>

      <H2>KPI tiles</H2>
      <Table
        headers={["KPI", "Definition"]}
        rows={[
          ["Portfolio Value", "Total current market value of all positions"],
          ["Cost Basis", "Total amount invested (sum of shares × entry price)"],
          ["Unrealized P&L", "Profit or loss not yet realized (value − cost)"],
          ["Total Return", "Unrealized P&L as a percentage of cost basis"],
          ["Best position", "Ticker with highest return %"],
          ["Worst position", "Ticker with lowest return %"],
        ]}
      />

      <Warning>Tracker data is stored in your browser. It will not sync across devices. Export your data from Settings → Data regularly to avoid losing positions.</Warning>
    </div>
  ),

  equity: (
    <div>
      <H1>Equity Review</H1>
      <P>Equity Review provides deep fundamental analysis of a single stock. Use it to validate your investment thesis before including a stock in your portfolio.</P>

      <H2>How to use</H2>

      <Step n={1} title="Search for a stock">
        Enter a ticker in the search box (e.g. AAPL, NVDA, BNP.PA for French stocks). Press Enter. The page loads fundamental data for that company.
      </Step>

      <Step n={2} title="Review the fundamentals">
        Scroll through the sections: key ratios, financial health, price history, peer comparison.
      </Step>

      <Step n={3} title="Check the price chart">
        The interactive chart shows historical price with volume. You can zoom in by clicking and dragging. Check for trend direction, support levels, and volatility.
      </Step>

      <H2>Key metrics reference</H2>
      <Table
        headers={["Metric", "What it means", "Red flag threshold"]}
        rows={[
          ["P/E Ratio", "Price / Earnings per share. How expensive the stock is relative to profits.", "> 40 (expensive)"],
          ["P/B Ratio", "Price / Book value per share. How expensive vs assets.", "> 5 (potentially overvalued)"],
          ["EV/EBITDA", "Enterprise value / operating earnings. Lower = cheaper.", "> 20"],
          ["Debt/Equity", "Total debt relative to shareholder equity.", "> 2.0 (high leverage)"],
          ["ROE", "Return on Equity. How well the company generates profit from shareholder funds.", "< 10% (weak)"],
          ["Revenue Growth", "Year-over-year revenue change.", "Negative (declining business)"],
          ["Profit Margin", "Net income / Revenue.", "< 5% (thin margins)"],
        ]}
      />

      <Tip>Use the peer comparison section to see how your stock ranks vs sector competitors. A stock with a high P/E is less concerning if all sector peers also have high P/E.</Tip>
    </div>
  ),

  reporting: (
    <div>
      <H1>Reporting</H1>
      <P>The Reporting page generates institutional-grade PDF reports for any of your saved optimizer portfolios. These are suitable for personal documentation, client presentation, or compliance records.</P>

      <H2>How to generate a report</H2>

      <Step n={1} title="Select a portfolio">
        In the left panel, click on the portfolio you want to report on. The right panel will show a preview of its metrics and allocation.
      </Step>

      <Step n={2} title="Choose simulation settings">
        In the Report Settings section:
        <ul className="list-none mt-2 space-y-1">
          <li>• <strong>Monte Carlo simulations</strong>: More simulations = more accurate risk estimates but slower. 500 is standard. Use 1000+ for final reports.</li>
        </ul>
      </Step>

      <Step n={3} title="Generate PDF">
        Click "Generate Institutional Report". The backend runs the Monte Carlo simulation with live market data and builds the PDF. This takes 15–45 seconds depending on simulation count and market data latency.
      </Step>

      <Step n={4} title="Download">
        When done, the PDF downloads automatically. A toast notification confirms success.
      </Step>

      <H2>What the PDF contains</H2>
      <Table
        headers={["Page", "Content"]}
        rows={[
          ["1 — Cover", "Portfolio name, optimization method, capital, date, number of assets, legal disclaimer"],
          ["2 — Risk metrics", "Expected return, volatility, Sharpe, Sortino, Calmar, Max Drawdown, Beta, VaR 95%, CVaR 95%"],
          ["2 — Allocation table", "Each ticker, weight %, capital allocated in €, cumulative weight"],
          ["3 — Monte Carlo chart", "Fan chart showing simulated portfolio value paths over 1 year (P5, IQR, P95)"],
          ["3 — VaR summary", "VaR 95%, CVaR 95%, expected final portfolio value"],
          ["4 — Allocation chart", "Horizontal bar chart of portfolio weights by ticker"],
        ]}
      />

      <Warning>The portfolio must have a saved optimization result to generate a report. If you see "No optimization result", go to the Allocation page, run the optimizer, and save the portfolio.</Warning>

      <Tip>The report uses your precomputed metrics from the optimizer (more accurate) and fetches fresh data only for the Monte Carlo simulation. This ensures the metrics in the report match what you saw in the Allocation page.</Tip>
    </div>
  ),

  settings: (
    <div>
      <H1>Settings</H1>
      <P>Settings lets you personalize CAPITALIS and configure default values used throughout the app. Changes are saved to the backend (preferences file) and apply immediately.</P>

      <H2>Appearance</H2>
      <Table
        headers={["Setting", "What it does"]}
        rows={[
          ["Color theme", "Switch between Dark (default) and Light mode. Applies instantly."],
          ["UI density", "Compact: tighter padding. Normal: balanced. Spacious: more breathing room."],
          ["Accent color", "Choose from presets or enter a custom hex code. Used for highlights throughout the UI."],
        ]}
      />

      <H2>Financial defaults</H2>
      <Table
        headers={["Setting", "Where it's used"]}
        rows={[
          ["Display name", "Shown in PDF reports as the report author."],
          ["Default capital", "Pre-filled in the Allocation optimizer capital field."],
          ["Display currency", "Currency shown in metrics and PDF reports."],
          ["Risk-free rate", "Used to compute Sharpe, Sortino, and Calmar ratios. Default: 4% (ECB rate)."],
          ["Default benchmark", "Compared against in equity curve charts. Default: SPY (S&P 500)."],
          ["Default method", "Pre-selected optimization method in the Allocation page."],
          ["Decimal places", "Precision shown in metric tables throughout the app."],
        ]}
      />

      <H2>Simulation defaults</H2>
      <Table
        headers={["Setting", "What it does"]}
        rows={[
          ["Monte Carlo simulations", "Default simulation count pre-filled in Reporting settings."],
          ["Data horizon", "How many years of historical data used for return/covariance estimation."],
          ["Chart template", "Visual style for matplotlib charts embedded in PDF reports."],
        ]}
      />

      <H2>Data management</H2>
      <P>In the Data tab, you can:</P>
      <ul className="list-none space-y-1.5 mb-4 text-sm" style={{ color: "var(--t2)" }}>
        <li>• See how many optimizer portfolios and tracker portfolios are saved</li>
        <li>• <strong style={{ color: "var(--t1)" }}>Clear</strong> optimizer or tracker data independently</li>
        <li>• <strong style={{ color: "var(--t1)" }}>Export</strong> all data as a JSON file (recommended backup)</li>
        <li>• <strong style={{ color: "var(--t1)" }}>Import</strong> a previously exported JSON file to restore data</li>
      </ul>

      <Warning>Clearing portfolio data is irreversible. Export first if you want to keep a backup.</Warning>

      <H2>System tab</H2>
      <P>Shows backend health, API key status (FRED, Alpha Vantage, JWT), backend version, and tech stack info. Useful for diagnosing data issues — if an API key shows "Not set", some features may not work correctly.</P>
    </div>
  ),

  account: (
    <div>
      <H1>Account & Billing</H1>
      <P>The Account page manages your profile, subscription plan, payment method, and security settings.</P>

      <H2>Overview tab</H2>

      <H3>Profile</H3>
      <P>Shows your email address, member since date, and current plan. You can edit your display name (shown in PDF reports) and save it.</P>

      <H3>Subscription plans</H3>
      <Table
        headers={["Plan", "Price", "Key features"]}
        rows={[
          ["Free", "€0 / forever", "3 screener runs/day, HRP optimizer only, 1 tracker portfolio, no PDF export"],
          ["Pro", "€29 / month", "Unlimited screener+scorer, all 5 optimizer methods, Monte Carlo, ML signals, PDF reports, unlimited tracker portfolios, API access 1000 req/day"],
          ["Institutional", "€149 / month", "Everything in Pro + unlimited API, white-label PDFs, priority support (SLA 4h), 10 team seats, on-premise deployment option"],
        ]}
      />

      <P>To upgrade, click the "Upgrade →" button on your desired plan. You will be redirected to Stripe's secure checkout page to enter your payment details. CAPITALIS never stores your card information.</P>

      <H2>Billing tab</H2>
      <P>Shows your current payment method and invoice history. Click "Manage payment in Stripe Portal" to update your card, cancel, or download invoices directly from Stripe.</P>

      <H2>Security tab</H2>

      <H3>Change password</H3>
      <P>Enter your current password and a new password (minimum 8 characters). Click "Update password".</P>

      <H3>Two-factor authentication (2FA)</H3>
      <P>TOTP-based 2FA (Google Authenticator, Authy, 1Password) is coming in a future release. It will add a second layer of security to your login.</P>

      <H3>Data provider API keys</H3>
      <P>Some features use FRED (macroeconomic data) and Alpha Vantage (earnings fallback). You can enter your free API keys here. They are stored only in your browser — never sent to any third party.</P>
      <ul className="list-none space-y-1 mb-4 text-sm" style={{ color: "var(--t2)" }}>
        <li>• FRED key: <Code>fred.stlouisfed.org</Code> — free, instant registration</li>
        <li>• Alpha Vantage key: <Code>alphavantage.co</Code> — free tier available</li>
      </ul>

      <H3>Danger zone</H3>
      <Warning>Account deletion permanently removes your account and all associated data. This cannot be undone. Contact support@capitalis.io for account deletion requests — email confirmation is required.</Warning>
    </div>
  ),

  faq: (
    <div>
      <H1>Frequently asked questions</H1>

      {[
        {
          q: "My portfolio data disappeared — what happened?",
          a: "Portfolio data is stored in your browser's localStorage. It can be lost if you clear your browser data, use a different browser, or use private/incognito mode. Export your data regularly from Settings → Data → Export JSON.",
        },
        {
          q: "The optimizer returns 100% weight on one stock — is this normal?",
          a: "This can happen with \"Maximum Return\" method, which concentrates everything in the highest-returning asset. Use \"Sharpe Maximization\" or \"Minimum Variance\" for diversified portfolios. Adding more tickers also forces more diversification.",
        },
        {
          q: "Market data is loading slowly or failing",
          a: "All data comes from Yahoo Finance via the internet. Slow internet, Yahoo Finance rate limits, or market closures (weekends, holidays) can cause delays. Try refreshing. If a specific ticker fails, verify the ticker symbol is correct (e.g. use BNP.PA not just BNP for French stocks).",
        },
        {
          q: "The Sharpe Ratio shows '< 1Y' — why?",
          a: "Sharpe Ratio requires at least 252 trading days of data to be statistically meaningful. If your portfolio start date is less than 1 year ago, the ratio is suppressed to avoid misleading results.",
        },
        {
          q: "How do I add a European stock?",
          a: "Use Yahoo Finance ticker format. French stocks: add .PA (e.g. LVMH.PA). German stocks: add .DE (e.g. SAP.DE). UK stocks: add .L (e.g. BP.L). Italian stocks: add .MI.",
        },
        {
          q: "The PDF report failed to generate",
          a: "This usually means the backend timed out fetching market data for the Monte Carlo simulation. Try again with fewer simulations (250 instead of 1000). If it persists, the backend may be restarting — wait 30 seconds and try again.",
        },
        {
          q: "Can I use CAPITALIS on mobile?",
          a: "CAPITALIS is designed for desktop use. On mobile, the layout may not display correctly, especially charts and data tables. A mobile-optimized version is planned for a future release.",
        },
        {
          q: "How accurate are the AI Signals?",
          a: "AI Signals are trained on historical data and have backtested accuracy in specific market regimes. They should be treated as one probabilistic input among many, not as definitive predictions. Markets are not fully predictable.",
        },
        {
          q: "Can I import my brokerage data into Portfolio Tracker?",
          a: "Currently, positions must be entered manually. A CSV import feature is on the roadmap. In the meantime, enter your positions one by one.",
        },
        {
          q: "What is the difference between optimizer portfolio and tracker portfolio?",
          a: "The optimizer portfolio uses theoretical weights optimized by the algorithm — it shows what would have happened if you had invested at those weights. The tracker portfolio uses your real positions (real shares, real entry prices, real dates) — it shows your actual P&L.",
        },
      ].map(({ q, a }) => (
        <div key={q} className="mb-5 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--t1)" }}>
            {q}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{a}</p>
        </div>
      ))}

      <div className="mt-6 rounded-xl p-5 text-center" style={{ background: "var(--orange-dim)", border: "1px solid var(--orange-border)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--orange)" }}>Still have questions?</p>
        <p className="text-xs" style={{ color: "var(--t2)" }}>
          Contact support at <span style={{ color: "var(--orange)" }}>support@capitalis.io</span> or check the Account page for billing issues.
        </p>
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DocsPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<string>("start");

  const groups = Array.from(new Set(SECTIONS.map(s => s.group)));

  return (
    <div className="p-4 sm:p-6 max-w-[1200px] mx-auto fade-in">

      {/* Header */}
      <div className="mb-6 border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>{t.docs.breadcrumb}</p>
        <h1 className="text-xl font-semibold" style={{ color: "var(--t1)" }}>{t.docs.pageTitle}</h1>
        <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>{t.docs.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Sidebar */}
        <nav className="col-span-1 lg:col-span-3 space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--t3)", fontSize: 10 }}>
                {group}
              </p>
              <div className="space-y-0.5">
                {SECTIONS.filter(s => s.group === group).map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-all"
                    style={{
                      background:  active === s.id ? "var(--orange-dim)" : "transparent",
                      color:       active === s.id ? "var(--orange)" : "var(--t2)",
                      borderLeft:  active === s.id ? "2px solid var(--orange)" : "2px solid transparent",
                      fontWeight:  active === s.id ? 600 : 400,
                    }}
                  >
                    <span style={{ color: active === s.id ? "var(--orange)" : "var(--t3)" }}>{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Content */}
        <main className="col-span-1 lg:col-span-9" style={{ maxWidth: "100%" }}>
          <div className="rounded-2xl border p-8" style={{ borderColor: "var(--border)", background: "var(--bg-card)", minHeight: 500 }}>
            {CONTENT[active]}
          </div>

          {/* Navigation arrows */}
          <div className="flex justify-between mt-4">
            {(() => {
              const idx = SECTIONS.findIndex(s => s.id === active);
              const prev = idx > 0 ? SECTIONS[idx - 1] : null;
              const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;
              return (
                <>
                  {prev ? (
                    <button
                      onClick={() => setActive(prev.id)}
                      className="flex items-center gap-2 text-xs transition-all"
                      style={{ color: "var(--t3)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--orange)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                    >
                      ← {prev.label}
                    </button>
                  ) : <span />}
                  {next ? (
                    <button
                      onClick={() => setActive(next.id)}
                      className="flex items-center gap-2 text-xs transition-all"
                      style={{ color: "var(--t3)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--orange)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                    >
                      {next.label} →
                    </button>
                  ) : <span />}
                </>
              );
            })()}
          </div>
        </main>
      </div>
    </div>
  );
}
