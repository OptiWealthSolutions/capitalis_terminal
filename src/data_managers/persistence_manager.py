"""
Module de persistance des données de marché et macro-économiques.
Utilise DuckDB pour un stockage et une interrogation analytique performants.
"""

import duckdb
import pandas as pd
from pathlib import Path
from typing import Optional, List


class PersistenceManager:
    """
    Gère la connexion et les opérations CRUD avec la base de données DuckDB.
    Le schéma est optimisé pour les séries temporelles financières.
    """

    def __init__(self, db_path: Path):
        """
        Initialise le gestionnaire et établit la connexion à la base de données.

        Args:
            db_path (Path): Chemin vers le fichier de la base de données DuckDB.
        """
        self.db_path = str(db_path)
        self.con = duckdb.connect(database=self.db_path, read_only=False)
        self._initialize_schema()

    def _initialize_schema(self):
        """Crée les tables nécessaires si elles n'existent pas."""
        self.con.execute("""
            CREATE TABLE IF NOT EXISTS market_data (
                timestamp TIMESTAMP,
                ticker VARCHAR,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                volume BIGINT,
                PRIMARY KEY (timestamp, ticker)
            );
        """)
        self.con.execute("""
            CREATE TABLE IF NOT EXISTS market_regimes (
                timestamp TIMESTAMP PRIMARY KEY,
                regime INTEGER,
                regime_name VARCHAR
            );
        """)
        self.con.close()

    def write_data(self, df: pd.DataFrame, table_name: str):
        """
        Écrit ou met à jour un DataFrame dans une table spécifiée.
        Utilise une insertion avec gestion des conflits (UPSERT).

        Args:
            df (pd.DataFrame): Données à insérer. Doit contenir les colonnes de la table.
            table_name (str): Nom de la table cible ('market_data' ou 'market_regimes').
        """
        with duckdb.connect(self.db_path) as con:
            # DuckDB gère l'inférence de type et le remplacement via le nom du DataFrame
            con.register('df_temp', df)
            if table_name == 'market_data':
                con.execute(f"INSERT INTO {table_name} SELECT * FROM df_temp ON CONFLICT (timestamp, ticker) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume;")
            elif table_name == 'market_regimes':
                 con.execute(f"INSERT INTO {table_name} SELECT * FROM df_temp ON CONFLICT (timestamp) DO UPDATE SET regime=excluded.regime, regime_name=excluded.regime_name;")

    def get_market_data(self, tickers: Optional[List[str]] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> pd.DataFrame:
        """
        Récupère les données de marché pour une liste de tickers et une période donnée.
        """
        query = "SELECT * FROM market_data"
        conditions = []
        if tickers:
            conditions.append(f"ticker IN {tuple(tickers)}")
        if start_date:
            conditions.append(f"timestamp >= '{start_date}'")
        if end_date:
            conditions.append(f"timestamp <= '{end_date}'")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        with duckdb.connect(self.db_path) as con:
            return con.execute(query).fetchdf().set_index('timestamp')

    def get_data_for_regime(self, regime_name: str) -> pd.DataFrame:
        """
        Filtre les données de marché pour ne retourner que les périodes correspondant
        à un régime de marché spécifique (ex: 'BEAR / HIGH VOL').

        Args:
            regime_name (str): Le nom du régime à filtrer.

        Returns:
            pd.DataFrame: Un DataFrame de données de marché filtrées.
        """
        query = """
            SELECT m.* FROM market_data m
            JOIN market_regimes r ON m.timestamp = r.timestamp
            WHERE r.regime_name = ?;
        """
        with duckdb.connect(self.db_path) as con:
            return con.execute(query, [regime_name]).fetchdf()