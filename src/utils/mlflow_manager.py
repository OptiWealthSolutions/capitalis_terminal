"""
Module for MLflow Tracking Management.

This module is responsible for centralizing the connection to the MLflow tracking server,
automating experiment creation, and managing autologging configurations.
"""

import logging
import mlflow
import mlflow.sklearn
from mlflow.exceptions import MlflowException


class MLFlowManager:
    """
    Manages MLflow sessions to ensure consistent experiment tracking.

    This class handles the creation of experiments securely, preventing
    'NoneType' errors by ensuring an experiment context is always available.
    """

    def __init__(self, tracking_uri: str = "http://127.0.0.1:5000"):
        """
        Initializes the MLflow manager and sets the tracking URI.

        Args:
            tracking_uri (str): The URI for the MLflow tracking server.
        """
        self.tracking_uri = tracking_uri
        mlflow.set_tracking_uri(self.tracking_uri)
        logging.info(f"MLflow tracking URI set to {self.tracking_uri}")

    def get_or_create_experiment(self, experiment_name: str) -> str:
        """
        Retrieves an existing experiment by name or creates it if it doesn't exist.
        
        Args:
            experiment_name (str): The name of the target experiment.
            
        Returns:
            str: The unique ID of the experiment.
        """
        try:
            experiment = mlflow.get_experiment_by_name(experiment_name)
            if experiment:
                logging.info(f"Experiment '{experiment_name}' found with ID: {experiment.experiment_id}.")
                return experiment.experiment_id
            
            logging.info(f"Experiment '{experiment_name}' not found. Creating a new one...")
            experiment_id = mlflow.create_experiment(experiment_name)
            logging.info(f"Experiment '{experiment_name}' created successfully with ID: {experiment_id}.")
            return experiment_id
        except MlflowException as e:
            logging.error(f"Error processing experiment '{experiment_name}': {e}")
            raise

    def start_autolog(self):
        """Activates the Scikit-Learn autologging mechanism in MLflow."""
        mlflow.sklearn.autolog(log_models=True, silent=False)
        logging.info("Scikit-Learn autologging has been activated.")