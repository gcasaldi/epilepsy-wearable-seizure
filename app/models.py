"""
Modelli Pydantic per validazione dati
"""
from datetime import datetime
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
