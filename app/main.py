"""
FastAPI Application - Epilepsy Seizure Prediction
Con autenticazione JWT per proteggere gli endpoint
"""
from datetime import datetime, timedelta
import logging
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Deque, Dict
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.models import (
    LoginRequest, GoogleLoginRequest, TokenResponse, AccountDeleteResponse, PhysiologicalData,
    RiskPrediction, HealthStatus
)
from app.auth import (
    create_access_token,
    get_current_user,
    get_local_account_profile,
    get_password_hash,
    verify_google_id_token,
)
from app.predictor import predictor
from app.config import settings
from app.security_db import SessionLocal, init_security_db
from app.security_service import (
    ensure_provider_organization_context,
    ensure_user_exists,
    get_user_by_email,
    get_provider_status,
    list_active_consents_for_user,
    soft_delete_account,
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API protetta con JWT per predizione rischio crisi epilettiche",
    docs_url="/docs",
    redoc_url="/redoc"
)


class AuthRateLimiter:
    """Rate limiter in-memory per endpoint/IP per mitigare brute force sugli endpoint auth."""

    def __init__(self, window_seconds: int, max_attempts: int):
        self.window_seconds = window_seconds
        self.max_attempts = max_attempts
        self.attempts: Dict[str, Deque[float]] = defaultdict(deque)

    def _clean(self, key: str, now: float):
        cutoff = now - self.window_seconds
        records = self.attempts[key]
        while records and records[0] < cutoff:
            records.popleft()

    def check(self, key: str):
        now = time.time()
        self._clean(key, now)
        if len(self.attempts[key]) >= self.max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Troppi tentativi di autenticazione. Riprova più tardi."
            )

    def register(self, key: str):
        now = time.time()
        self._clean(key, now)
        self.attempts[key].append(now)


auth_rate_limiter = AuthRateLimiter(
    window_seconds=settings.auth_rate_limit_window_seconds,
    max_attempts=settings.auth_rate_limit_max_attempts,
)

init_security_db()
FRONTEND_DIR = Path("frontend")


def frontend_page(filename: str) -> FileResponse:
    return FileResponse(FRONTEND_DIR / filename)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.trusted_hosts,
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.path.startswith("/auth") or request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response

# Serve frontend statico
try:
    app.mount("/static", StaticFiles(directory="frontend"), name="static")
except Exception as e:
    logger.warning(f"Frontend directory not found: {e}")


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Errore non gestito: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Errore interno del server",
            "message": str(exc) if settings.debug else "Si è verificato un errore",
            "timestamp": datetime.now().isoformat()
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": f"Errore {exc.status_code}",
            "message": exc.detail,
            "timestamp": datetime.now().isoformat()
        }
    )


# ===== ENDPOINTS PUBBLICI =====

@app.get("/", tags=["Root"])
async def root():
    """Landing web app"""
    return frontend_page("landing.html")


@app.get("/login", include_in_schema=False)
async def login_page():
    return frontend_page("login.html")


@app.get("/login/provider", include_in_schema=False)
async def provider_login_page():
    return frontend_page("login-provider.html")


@app.get("/app", include_in_schema=False)
async def app_download_page():
    return frontend_page("app-download.html")


@app.get("/dashboard", include_in_schema=False)
async def patient_dashboard_page():
    return frontend_page("dashboard.html")


@app.get("/consents", include_in_schema=False)
async def consents_page():
    return frontend_page("consents.html")


@app.get("/settings", include_in_schema=False)
async def settings_page():
    return frontend_page("settings.html")


@app.get("/provider", include_in_schema=False)
async def provider_gate_page():
    return frontend_page("provider.html")


@app.get("/provider/dashboard", include_in_schema=False)
async def provider_dashboard_page():
    return frontend_page("provider-dashboard.html")


@app.get("/provider/patients", include_in_schema=False)
async def provider_patients_page():
    return frontend_page("provider-patients.html")


@app.get("/provider/invites", include_in_schema=False)
async def provider_invites_page():
    return frontend_page("provider-invites.html")


@app.get("/provider/audit", include_in_schema=False)
async def provider_audit_page():
    return frontend_page("provider-audit.html")


@app.get("/privacy", include_in_schema=False)
async def privacy_page():
    return frontend_page("privacy.html")


@app.get("/terms", include_in_schema=False)
async def terms_page():
    return frontend_page("terms.html")


@app.get("/contact", include_in_schema=False)
async def contact_page():
    return frontend_page("contact.html")


@app.get("/disclaimer", include_in_schema=False)
async def disclaimer_page():
    return frontend_page("disclaimer.html")


@app.get("/health", response_model=HealthStatus, tags=["Health"])
async def health_check():
    """Health check - pubblico"""
    return HealthStatus(
        status="healthy",
        version=settings.app_version,
        authenticated=False,
        timestamp=datetime.now()
    )


@app.post(
    "/auth/login",
    response_model=TokenResponse,
    tags=["Authentication"],
    summary="Login e ottenimento JWT token"
)
async def login(credentials: LoginRequest, http_request: Request):
    """
    Autentica l'utente e restituisce un JWT token.
    
    Il token deve essere incluso nell'header Authorization delle richieste protette:
    ```
    Authorization: Bearer <token>
    ```
    """
    ip = http_request.client.host if http_request.client else "unknown"
    limiter_key = f"login:{ip}"
    auth_rate_limiter.check(limiter_key)
    logger.info(f"Tentativo di login per utente: {credentials.username}")
    
    account_profile = get_local_account_profile(credentials.username, credentials.password)
    
    if not account_profile:
        auth_rate_limiter.register(limiter_key)
        logger.warning(f"Login fallito per: {credentials.username}")
        raise HTTPException(
            status_code=401,
            detail="Username o password non corretti"
        )
    
    # Crea token
    db = SessionLocal()
    try:
        persisted_user = ensure_user_exists(
            db,
            email=account_profile["email"],
            auth_provider=account_profile["auth_provider"],
            account_type=account_profile["account_type"],
            provider_status=account_profile["provider_status"],
        )
        ensure_provider_organization_context(db, persisted_user)
    finally:
        db.close()

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": persisted_user.email, "ver": persisted_user.token_version},
        expires_delta=access_token_expires
    )
    
    logger.info(f"Login riuscito per: {persisted_user.email}")
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        username=persisted_user.email
    )


@app.get("/auth/google-config", tags=["Authentication"], summary="Config Google Sign-In")
async def google_config():
    """Restituisce la configurazione pubblica per Google Sign-In frontend."""
    return {
        "google_client_id": settings.google_client_id,
        "enabled": bool(settings.google_client_id)
    }


@app.post(
    "/auth/google",
    response_model=TokenResponse,
    tags=["Authentication"],
    summary="Login con Google ID token"
)
async def google_login(payload: GoogleLoginRequest, http_request: Request):
    """Verifica token Google e restituisce JWT applicativo."""
    ip = http_request.client.host if http_request.client else "unknown"
    limiter_key = f"google_login:{ip}"
    auth_rate_limiter.check(limiter_key)

    username = verify_google_id_token(payload.credential)
    if not username:
        auth_rate_limiter.register(limiter_key)
        raise HTTPException(status_code=401, detail="Token Google non valido")

    db = SessionLocal()
    try:
        persisted_user = ensure_user_exists(
            db,
            email=username,
            auth_provider="google",
            account_type="personal",
            provider_status=None,
        )
    finally:
        db.close()

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": username, "ver": persisted_user.token_version},
        expires_delta=access_token_expires
    )

    logger.info(f"Login Google riuscito per: {username}")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        username=username
    )


# ===== ENDPOINTS PROTETTI =====

@app.get(
    "/api/me",
    tags=["Authentication"],
    summary="Info utente corrente"
)
async def get_current_user_info(current_user: str = Depends(get_current_user)):
    """Restituisce informazioni sull'utente autenticato"""
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
    finally:
        db.close()

    return {
        "username": current_user,
        "account_type": user.account_type if user else "unknown",
        "provider_status": user.provider_status if user else None,
        "account_active": bool(user.is_active) if user else False,
        "authenticated": True,
        "timestamp": datetime.now()
    }


@app.get(
    "/api/provider/status",
    tags=["Authentication"],
    summary="Stato accesso ente sanitario"
)
async def provider_status(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        status_payload = get_provider_status(db, current_user)
    finally:
        db.close()

    return {
        "username": current_user,
        **status_payload,
    }


@app.get(
    "/api/consents",
    tags=["Authentication"],
    summary="Consensi attivi utente"
)
async def user_consents(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        consents = list_active_consents_for_user(db, current_user)
    finally:
        db.close()

    return {
        "count": len(consents),
        "items": consents,
    }


@app.delete(
    "/api/account",
    response_model=AccountDeleteResponse,
    tags=["Authentication"],
    summary="Cancellazione account con revoca consensi"
)
async def delete_account(current_user: str = Depends(get_current_user)):
    """
    Soft delete account utente:
    - blocco login
    - revoca consensi attivi
    - revoca link caregiver
    - audit immutabile
    """
    db = SessionLocal()
    try:
        result = soft_delete_account(db, current_user)
    finally:
        db.close()

    return AccountDeleteResponse(
        status="deleted",
        revoked_consents=result["revoked_consents"],
        revoked_caregiver_links=result["revoked_caregiver_links"],
        message="Account disattivato e consensi revocati con successo"
    )


@app.post(
    "/api/predict",
    response_model=RiskPrediction,
    tags=["Prediction"],
    summary="Predice rischio crisi epilettiche (PROTETTO)"
)
async def predict_seizure_risk(
    data: PhysiologicalData,
    current_user: str = Depends(get_current_user)
):
    """
    **Endpoint protetto - richiede autenticazione JWT**
    
    Riceve dati fisiologici dal wearable e calcola il rischio di crisi.
    
    Parametri analizzati:
    - HRV (Heart Rate Variability)
    - Battito cardiaco
    - Livello di movimento
    - Ore di sonno
    - Assunzione farmaci
    
    Restituisce:
    - risk_score: 0-1
    - risk_level: "low", "medium", "high"
    - message: messaggio per l'utente
    """
    try:
        logger.info(f"[{current_user}] Richiesta predizione - HRV={data.hrv}, HR={data.heart_rate}")
        
        prediction = predictor.predict(data)
        
        logger.info(f"[{current_user}] Predizione: {prediction.risk_level} (score={prediction.risk_score})")
        
        return prediction
        
    except Exception as e:
        logger.error(f"Errore predizione: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Errore durante il calcolo della predizione"
        )


@app.get(
    "/api/test",
    tags=["Prediction"],
    summary="Test predizione con dati di esempio (PROTETTO)"
)
async def test_prediction(current_user: str = Depends(get_current_user)):
    """Test dell'algoritmo di predizione con dati di esempio"""
    
    test_data = PhysiologicalData(
        hrv=50.5,
        heart_rate=75,
        movement=120.0,
        sleep_hours=7.5,
        medication_taken=True
    )
    
    prediction = predictor.predict(test_data)
    
    return {
        "user": current_user,
        "input": test_data.model_dump(),
        "output": prediction.model_dump(),
        "note": "Test con dati di esempio"
    }


# ===== UTILITY ENDPOINT (solo sviluppo) =====

@app.get("/generate-password-hash", include_in_schema=settings.debug, tags=["Dev"])
async def generate_hash(password: str):
    """
    SOLO SVILUPPO - Genera hash bcrypt di una password.
    Usa questo per configurare ADMIN_PASSWORD_HASH in .env
    """
    if not settings.debug:
        raise HTTPException(status_code=404, detail="Not found")
    
    hash_value = get_password_hash(password)
    return {
        "password": password,
        "hash": hash_value,
        "instruction": "Copia questo hash nel file .env come ADMIN_PASSWORD_HASH"
    }


if __name__ == "__main__":
    import uvicorn
    
    # Genera hash password admin al primo avvio
    admin_pass = "EpilepSy2025!Secure"
    hash_val = get_password_hash(admin_pass)
    logger.info("="*60)
    logger.info("CONFIGURAZIONE PASSWORD ADMIN")
    logger.info("="*60)
    logger.info(f"Aggiungi questa riga al file .env:")
    logger.info(f"ADMIN_PASSWORD_HASH={hash_val}")
    logger.info("="*60)
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
