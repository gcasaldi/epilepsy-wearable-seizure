"""
Configurazione dell'applicazione
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configurazione con variabili d'ambiente"""
    
    # Application
    app_name: str = "Epilepsy Seizure Prediction API"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # Security - JWT
    secret_key: str = "CHANGE-THIS-SECRET-KEY-IN-PRODUCTION-USE-LONG-RANDOM-STRING"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 ore
    
    # Admin credentials (hashed password)
    admin_username: str = "admin"
    admin_password_hash: str = ""  # Generato al primo avvio
    
    # CORS
    cors_origins: list = ["*"]  # In produzione: ["https://tuodominio.com"]
    
    # Thresholds rischio
    low_risk_threshold: float = 0.33
    high_risk_threshold: float = 0.67
    
    # Pesi calcolo rischio
    weight_hrv: float = 0.25
    weight_heart_rate: float = 0.20
    weight_movement: float = 0.15
    weight_sleep: float = 0.25
    weight_medication: float = 0.15
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
