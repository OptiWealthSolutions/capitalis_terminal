import sqlite3
import pandas as pd
from typing import List
from contextlib import contextmanager
from pathlib import Path
import streamlit as st
from src.core import config as settings


class DatabaseManager:
    def __init__(self, db_path=None):
        self.db_market = str(settings.DB_MARKET_PATH)
        self.db_scores = str(settings.DB_SCORES_PATH)
        self.db_portfolios = str(settings.DB_PORTFOLIOS_PATH)
        self._create_tables()

    @contextmanager
    def get_connection(self, db_path: str):
        conn = sqlite3.connect(db_path)
        try:
            yield conn
        finally:
            conn.commit()
            conn.close()

    def _create_tables(self) -> None:
        # 1. Base de données de Scoring et d'Univers
        with self.get_connection(self.db_scores) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS assets (
                    ticker TEXT PRIMARY KEY,
                    name TEXT,
                    sector TEXT,
                    industry TEXT,
                    country TEXT,
                    is_active INTEGER DEFAULT 1
                )
            """)
            try:
                conn.execute("ALTER TABLE assets ADD COLUMN country TEXT DEFAULT 'Inconnu'")
            except sqlite3.OperationalError:
                pass # La colonne existe deja
            conn.execute("""
                CREATE TABLE IF NOT EXISTS scores (
                    ticker TEXT,
                    timestamp TEXT,
                    score_value REAL,
                    rank INTEGER,
                    model_version TEXT,
                    cagr REAL,
                    vol_ann REAL,
                    sharpe REAL,
                    trailing_pe REAL,
                    forward_pe REAL,
                    price_to_book REAL,
                    return_on_equity REAL,
                    dividend_yield REAL,
                    PRIMARY KEY (ticker, timestamp, model_version),
                    FOREIGN KEY(ticker) REFERENCES assets(ticker)
                )
            """)
            
        # 2. Base de données des Données de Marché
        with self.get_connection(self.db_market) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS market_data (
                    ticker TEXT,
                    timestamp TEXT,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume INTEGER,
                    adj_close REAL,
                    PRIMARY KEY (ticker, timestamp)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS market_regimes (
                    timestamp TEXT PRIMARY KEY,
                    regime_id INTEGER,
                    confidence REAL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS fama_french_factors (
                    date TEXT,
                    model_type TEXT,
                    mkt_rf REAL,
                    smb REAL,
                    hml REAL,
                    rmw REAL,
                    cma REAL,
                    rf REAL,
                    PRIMARY KEY (date, model_type)
                )
            """)
            
        # 3. Base de données des Portefeuilles
        with self.get_connection(self.db_portfolios) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS portfolios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE,
                    creation_date TEXT,
                    cagr REAL,
                    vol REAL,
                    sharpe REAL,
                    method TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_assets (
                    portfolio_id INTEGER,
                    ticker TEXT,
                    weight REAL,
                    FOREIGN KEY(portfolio_id) REFERENCES portfolios(id),
                    PRIMARY KEY (portfolio_id, ticker)
                )
            """)

    def upsert_assets(self, df: pd.DataFrame) -> None:
        if df.empty:
            return
            
        query = """
            INSERT INTO assets (ticker, name, sector, industry, country, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker) DO UPDATE SET
                name=excluded.name,
                sector=excluded.sector,
                industry=excluded.industry,
                country=excluded.country,
                is_active=excluded.is_active
        """
        
        expected_cols = ['ticker', 'name', 'sector', 'industry', 'country', 'is_active']
        df_upsert = df.copy()
        
        # Standardisation de la casse pour Pandas -> SQL
        col_mapping = {c: c.lower() for c in df_upsert.columns}
        df_upsert = df_upsert.rename(columns=col_mapping)
        
        for col in expected_cols:
            if col not in df_upsert.columns:
                df_upsert[col] = 'Inconnu' if col != 'is_active' else 1
                
        records = df_upsert[expected_cols].values.tolist()
        with self.get_connection(self.db_scores) as conn:
            conn.executemany(query, records)

    def upsert_market_data(self, df: pd.DataFrame) -> None:
        if df.empty:
            return
            
        query = """
            INSERT INTO market_data (ticker, timestamp, open, high, low, close, volume, adj_close)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker, timestamp) DO UPDATE SET
                open=excluded.open, high=excluded.high, low=excluded.low,
                close=excluded.close, volume=excluded.volume, adj_close=excluded.adj_close
        """
        expected_cols = ['ticker', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'adj_close']
        df_upsert = df.copy()
        
        if 'timestamp' in df_upsert.columns:
            df_upsert['timestamp'] = pd.to_datetime(df_upsert['timestamp']).dt.strftime('%Y-%m-%dT%H:%M:%S')
            
        for col in expected_cols:
            if col not in df_upsert.columns:
                df_upsert[col] = 0.0
                
        records = df_upsert[expected_cols].values.tolist()
        with self.get_connection(self.db_market) as conn:
            conn.executemany(query, records)

    def get_returns_matrix(self, tickers: List[str], start_date: str, end_date: str) -> pd.DataFrame:
        if not tickers:
            return pd.DataFrame()
            
        placeholders = ','.join('?' * len(tickers))
        query = f"""
            SELECT timestamp, ticker, close
            FROM market_data
            WHERE ticker IN ({placeholders})
              AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp ASC
        """
        params = tickers + [start_date, end_date]
        
        with self.get_connection(self.db_market) as conn:
            df = pd.read_sql_query(query, conn, params=params)
        
        if df.empty:
            return pd.DataFrame()
        
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        pivot_df = df.pivot(index='timestamp', columns='ticker', values='close')
        returns_matrix = pivot_df.pct_change().dropna(how='all')
        
        return returns_matrix

    def upsert_scores(self, df: pd.DataFrame, model_version: str = "v1.0") -> None:
        if df.empty:
            return
            
        query = """
            INSERT INTO scores (
                ticker, timestamp, score_value, rank, model_version, 
                cagr, vol_ann, sharpe, trailing_pe, forward_pe, 
                price_to_book, return_on_equity, dividend_yield
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker, timestamp, model_version) DO UPDATE SET
                score_value=excluded.score_value,
                rank=excluded.rank,
                cagr=excluded.cagr,
                vol_ann=excluded.vol_ann,
                sharpe=excluded.sharpe,
                trailing_pe=excluded.trailing_pe,
                forward_pe=excluded.forward_pe,
                price_to_book=excluded.price_to_book,
                return_on_equity=excluded.return_on_equity,
                dividend_yield=excluded.dividend_yield
        """
        df_upsert = df.copy()
        ticker_col = next((c for c in df_upsert.columns if str(c).lower() in ['ticker', 'symbol']), None)
        score_col = next((c for c in df_upsert.columns if str(c).lower() in ['total_score', 'score']), None)
        
        if not ticker_col or not score_col: return
            
        timestamp = pd.Timestamp.now().strftime('%Y-%m-%dT%H:%M:%S')
        df_upsert = df_upsert.sort_values(by=score_col, ascending=False).reset_index(drop=True)
        
        # Mapping securise pour eviter les KeyError si une colonne manque
        def get_val(row, col_name): return float(row[col_name]) if col_name in row and pd.notnull(row[col_name]) else 0.0
        
        records = [(
            row[ticker_col], timestamp, float(row[score_col]), idx + 1, model_version,
            get_val(row, 'CAGR'), get_val(row, 'Vol_Ann'), get_val(row, 'Sharpe'),
            get_val(row, 'trailingPE'), get_val(row, 'forwardPE'), get_val(row, 'priceToBook'),
            get_val(row, 'returnOnEquity'), get_val(row, 'dividendYield')
        ) for idx, row in df_upsert.iterrows()]
            
        with self.get_connection(self.db_scores) as conn:
            conn.executemany(query, records)

    def get_latest_scores(self, model_version: str = "v1.0") -> pd.DataFrame:
        query = """
            SELECT s.ticker AS Ticker, a.name AS Name, a.sector AS Sector, a.country AS Country, a.industry AS Industry,
                   s.score_value AS Total_Score, s.rank AS Rank,
                   s.cagr AS CAGR, s.vol_ann AS Vol_Ann, s.sharpe AS Sharpe,
                   s.trailing_pe AS trailingPE, s.forward_pe AS forwardPE,
                   s.price_to_book AS priceToBook, s.return_on_equity AS returnOnEquity,
                   s.dividend_yield AS dividendYield
            FROM scores s
            LEFT JOIN assets a ON s.ticker = a.ticker
            WHERE s.model_version = ?
              AND s.timestamp = (SELECT MAX(timestamp) FROM scores WHERE model_version = ?)
            ORDER BY s.rank ASC
        """
        with self.get_connection(self.db_scores) as conn:
            return pd.read_sql_query(query, conn, params=(model_version, model_version))
            
    def get_screened_assets(self) -> pd.DataFrame:
        query = "SELECT ticker AS Ticker, name AS Name, sector AS Sector, industry AS Industry FROM assets WHERE is_active = 1"
        with self.get_connection(self.db_scores) as conn:
            return pd.read_sql_query(query, conn)

    def save_portfolio(self, name: str, portfolio_data: dict) -> bool:
        try:
            creation_date = pd.Timestamp.now().strftime('%Y-%m-%dT%H:%M:%S')
            cagr = portfolio_data.get('cagr', 0.0)
            vol = portfolio_data.get('vol', 0.0)
            sharpe = portfolio_data.get('sharpe', 0.0)
            method = portfolio_data.get('method', 'Unknown')
            weights = portfolio_data.get('weights', {})
            
            with self.get_connection(self.db_portfolios) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO portfolios (name, creation_date, cagr, vol, sharpe, method)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(name) DO UPDATE SET
                        creation_date=excluded.creation_date,
                        cagr=excluded.cagr,
                        vol=excluded.vol,
                        sharpe=excluded.sharpe,
                        method=excluded.method
                """, (name, creation_date, cagr, vol, sharpe, method))
                
                cursor.execute("SELECT id FROM portfolios WHERE name = ?", (name,))
                pf_id = cursor.fetchone()[0]
                
                cursor.execute("DELETE FROM portfolio_assets WHERE portfolio_id = ?", (pf_id,))
                
                asset_records = [(pf_id, ticker, weight) for ticker, weight in weights.items()]
                cursor.executemany("""
                    INSERT INTO portfolio_assets (portfolio_id, ticker, weight)
                    VALUES (?, ?, ?)
                """, asset_records)
            return True
        except Exception as e:
            return False

    def get_all_portfolios(self) -> pd.DataFrame:
        query = "SELECT * FROM portfolios ORDER BY creation_date DESC"
        with self.get_connection(self.db_portfolios) as conn:
            return pd.read_sql_query(query, conn)

    def load_portfolio(self, name: str) -> dict:
        query_pf = "SELECT * FROM portfolios WHERE name = ?"
        query_assets = "SELECT a.ticker, a.weight FROM portfolio_assets a JOIN portfolios p ON a.portfolio_id = p.id WHERE p.name = ?"
        with self.get_connection(self.db_portfolios) as conn:
            df_pf = pd.read_sql_query(query_pf, conn, params=(name,))
            if df_pf.empty: return {}
            df_assets = pd.read_sql_query(query_assets, conn, params=(name,))
            
        pf_info = df_pf.iloc[0]
        weights = {row['ticker']: row['weight'] for _, row in df_assets.iterrows()}
        
        return {
            'weights': weights,
            'cagr': float(pf_info['cagr']),
            'vol': float(pf_info['vol']),
            'sharpe': float(pf_info['sharpe']),
            'method': pf_info['method'],
            'tickers': list(weights.keys())
        }

    def delete_portfolio(self, name: str) -> None:
        """Supprime un portefeuille de la base de donnees avec validation explicite."""
        with self.get_connection(self.db_portfolios) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM portfolios WHERE name = ?", (name,))
            row = cursor.fetchone()
            if row:
                pf_id = row[0]
                cursor.execute("DELETE FROM portfolio_assets WHERE portfolio_id = ?", (pf_id,))
                cursor.execute("DELETE FROM portfolios WHERE id = ?", (pf_id,))

    def upsert_fama_french_factors(self, df: pd.DataFrame, model_type: str) -> None:
        if df.empty:
            return
            
        query = """
            INSERT INTO fama_french_factors (date, model_type, mkt_rf, smb, hml, rmw, cma, rf)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, model_type) DO UPDATE SET
                mkt_rf=excluded.mkt_rf, smb=excluded.smb, hml=excluded.hml,
                rmw=excluded.rmw, cma=excluded.cma, rf=excluded.rf
        """
        df_upsert = df.copy()
        df_upsert['date'] = pd.to_datetime(df_upsert.index).strftime('%Y-%m-%d')
        
        for col in ['Mkt-RF', 'SMB', 'HML', 'RMW', 'CMA', 'RF']:
            if col not in df_upsert.columns:
                df_upsert[col] = 0.0
                
        records = [(row['date'], model_type, row['Mkt-RF'], row['SMB'], row['HML'], row['RMW'], row['CMA'], row['RF']) for _, row in df_upsert.iterrows()]
            
        with self.get_connection(self.db_market) as conn:
            conn.executemany(query, records)

    def get_fama_french_factors(self, start_date: str, end_date: str, model_type: str) -> pd.DataFrame:
        query = """
            SELECT date, mkt_rf AS "Mkt-RF", smb AS "SMB", hml AS "HML", rmw AS "RMW", cma AS "CMA", rf AS "RF"
            FROM fama_french_factors
            WHERE model_type = ? AND date >= ? AND date <= ?
            ORDER BY date ASC
        """
        with self.get_connection(self.db_market) as conn:
            df = pd.read_sql_query(query, conn, params=(model_type, start_date, end_date))
            
        if df.empty:
            return pd.DataFrame()
            
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        if model_type.startswith('3'):
            df.drop(columns=['RMW', 'CMA'], inplace=True, errors='ignore')
        return df


@st.cache_resource
def get_db() -> "DatabaseManager":
    """Singleton cache du DatabaseManager. Une seule instanciation par session Streamlit."""
    return DatabaseManager()