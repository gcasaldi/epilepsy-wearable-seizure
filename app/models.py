"""
Modelli Pydantic per validazione dati
"""
from datetime import datetime, time
from typing import Optional
from pydantic import BaseModel, Field


# --- Autenticazione ---

class LoginRequest(BaseModel):
    """Richiesta di login"""
    username: str = Field(..., min_length=3, description="Username")
    password: str = Field(..., min_length=8, description="Password")
    
    class Config:
        json_schema_extra = {
            "example": {
                "username": "admin",
                "password": "your-password"
            }
        }


class TokenResponse(BaseModel):
    """Risposta con JWT token"""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Tipo token")
    expires_in: int = Field(..., description="Secondi prima della scadenza")
    username: str = Field(..., description="Username autenticato")


class GoogleLoginRequest(BaseModel):
    """Richiesta login con Google Identity token"""
    credential: str = Field(..., min_length=20, description="Google ID token")


class RegisterRequest(BaseModel):
    """Richiesta registrazione account locale"""
    email: str = Field(..., min_length=5, description="Email account")
    password: str = Field(..., min_length=8, description="Password account")


class PasswordRecoveryRequest(BaseModel):
    """Richiesta avvio recovery password."""
    email: str = Field(..., min_length=5, description="Email account")


class PasswordRecoveryConfirmRequest(BaseModel):
    """Conferma recovery password con token ricevuto."""
    email: str = Field(..., min_length=5, description="Email account")
    recovery_token: str = Field(..., min_length=12, description="Token temporaneo recovery")
    new_password: str = Field(..., min_length=8, description="Nuova password account")


class PasswordRecoveryResponse(BaseModel):
    """Risposta recovery password."""
    status: str
    message: str
    recovery_token: Optional[str] = None
    expires_in_seconds: Optional[int] = None


# --- Dati Fisiologici ---

class PhysiologicalData(BaseModel):
    """Dati fisiologici dal wearable"""
    
    hrv: float = Field(..., ge=0, le=200, description="Heart Rate Variability (ms)")
    heart_rate: int = Field(..., ge=30, le=220, description="Battito cardiaco (bpm)")
    movement: float = Field(..., ge=0, description="Livello movimento/attività")
    sleep_hours: float = Field(..., ge=0, le=24, description="Ore di sonno (ultime 24h)")
    medication_taken: bool = Field(..., description="Farmaci assunti regolarmente")
    spo2: Optional[float] = Field(default=None, ge=50, le=100, description="Saturazione ossigeno (%)")
    respiratory_rate: Optional[float] = Field(default=None, ge=1, le=80, description="Atti respiratori/min")
    skin_temperature: Optional[float] = Field(default=None, ge=30, le=45, description="Temperatura cutanea (°C)")
    steps: Optional[int] = Field(default=None, ge=0, description="Passi registrati")
    stress_index: Optional[float] = Field(default=None, ge=0, le=1, description="Indice stress normalizzato (0-1)")
    calories_burned: Optional[float] = Field(default=None, ge=0, description="Calorie bruciate")
    fall_detected: Optional[bool] = Field(default=None, description="Possibile caduta rilevata")
    timestamp: Optional[datetime] = Field(default_factory=datetime.now, description="Timestamp rilevazione")

    class Config:
        json_schema_extra = {
            "example": {
                "hrv": 50.5,
                "heart_rate": 75,
                "movement": 120.0,
                "sleep_hours": 7.5,
                "medication_taken": True,
                "spo2": 97.2,
                "respiratory_rate": 14.5,
                "skin_temperature": 36.4,
                "steps": 4860,
                "stress_index": 0.34,
                "calories_burned": 212.0,
                "fall_detected": False
            }
        }


# --- Predizione Rischio ---

class RiskPrediction(BaseModel):
    """Risposta con predizione rischio crisi"""
    
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Punteggio rischio (0-1)")
    risk_level: str = Field(..., description="Categoria: low, medium, high")
    message: str = Field(..., description="Messaggio per l'utente")
    timestamp: datetime = Field(default_factory=datetime.now, description="Timestamp predizione")
    
    class Config:
        json_schema_extra = {
            "example": {
                "risk_score": 0.45,
                "risk_level": "medium",
                "message": "Rischio moderato: tieni monitorato.",
                "timestamp": "2025-12-05T10:30:00"
            }
        }


# --- Health Check ---

class HealthStatus(BaseModel):
    """Stato salute servizio"""
    status: str
    version: str
    authenticated: bool
    timestamp: datetime


class AccountDeleteResponse(BaseModel):
    """Risposta cancellazione account con revoche applicate"""
    status: str
    revoked_consents: int
    revoked_caregiver_links: int
    message: str

# --- Terapia ---

class TherapyRequest(BaseModel):
    """Richiesta per aggiungere o modificare una terapia"""
    medication_name: str = Field(..., description="Nome del farmaco")
    dosage: Optional[str] = Field(None, description="Dosaggio (es. 50mg)")
    intake_time: Optional[time] = Field(None, description="Orario di assunzione")

    class Config:
        orm_mode = True

# --- Dashboard ---

class RiskDataPoint(BaseModel):
    """Punto dati per grafico andamento rischio"""
    timestamp: datetime
    risk_score: float


# --- Integrazioni Wearable/Fitness ---

class WearableConnectRequest(BaseModel):
    """Richiesta connessione provider wearable."""
    redirect_uri: Optional[str] = Field(
        default=None,
        description="Redirect URI da usare nel flusso OAuth provider"
    )
    mode: str = Field(
        default="demo",
        description="demo o oauth (oauth pronto per credenziali reali)"
    )


class WearableProviderStatus(BaseModel):
    """Stato connessione singolo provider."""
    provider_key: str
    provider_name: str
    category: str
    supported_mode: str
    connected: bool
    status: str
    connected_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    message: Optional[str] = None


class WearableProvidersResponse(BaseModel):
    """Lista provider supportati con stato utente."""
    total: int
    connected: int
    items: list[WearableProviderStatus]


class WearableConnectResponse(BaseModel):
    """Risposta avvio connessione provider."""
    provider_key: str
    mode: str
    status: str
    auth_url: Optional[str] = None
    message: str


class WearableDisconnectResponse(BaseModel):
    """Risposta disconnessione provider."""
    provider_key: str
    status: str
    message: str
