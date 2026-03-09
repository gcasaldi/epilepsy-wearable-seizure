"""
Configurazione dell'applicazione - Epiguard Cyber-Terminal
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configurazione con variabili d'ambiente"""
    
    # Application
    app_name: str = "Epiguard AI Terminal"
    app_version: str = "1.0.0"
    debug: bool = True
    database_url: str = "sqlite:///./epilepsy_security.db"
    
    # Security - JWT
    secret_key: str = "CHANGE-THIS-SECRET-KEY-IN-PRODUCTION-USE-LONG-RANDOM-STRING"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    
    # Admin credentials (hashed password)
    admin_username: str = "admin"
    admin_password_hash: str = "" 

    # --- CREDENZIALI TEST REALE GIULIA (NON CANCELLARE) ---
    giulia_email: str = "giulia.casaldi@gmail.com"
    giulia_password: str = "GiuliaEpi2026!"

    # Demo accounts (solo sviluppo)
    enable_demo_accounts: bool = True
    demo_user_username: str = "demo.user@epilepsy.local"
    demo_user_password: str = "DemoUser2026!"
    demo_provider_username: str = "demo.ente@epilepsy.local"
    demo_provider_password: str = "DemoEnte2026!"

    # Google OAuth
    google_client_id: str = ""

    # Fitbit OAuth (first real wearable integration)
    fitbit_client_id: str = ""
    fitbit_client_secret: str = ""
    fitbit_redirect_uri: str = ""
    fitbit_scopes: str = "activity heartrate sleep profile"
    
    # Network Security
    cors_origins: list[str] = ["*"]
    trusted_hosts: list[str] = ["*"]

    # Auth hardening
    auth_rate_limit_window_seconds: int = 300
    auth_rate_limit_max_attempts: int = 10
    
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
