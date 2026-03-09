"""
FastAPI Application - Epilepsy Seizure Prediction
Con autenticazione JWT per proteggere gli endpoint
"""
from datetime import datetime, timedelta
import time as time_module
import secrets
import base64
import json
import hashlib
import math
import urllib.parse
import urllib.request
import urllib.error
import logging
from collections import defaultdict, deque
from pathlib import Path
from typing import Deque, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.models import (
    GoogleLoginRequest, TokenResponse, AccountDeleteResponse, PhysiologicalData,
    RiskPrediction, HealthStatus, TherapyRequest, RiskDataPoint,
    WearableConnectRequest, WearableConnectResponse, WearableDisconnectResponse,
    WearableProvidersResponse, WearableProviderStatus,
    LoginRequest, RegisterRequest,
    PasswordRecoveryRequest, PasswordRecoveryConfirmRequest, PasswordRecoveryResponse,
)
from app.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_google_id_token,
    get_local_account_profile,
)
from app.predictor import predictor
from app.config import settings
from app.security_db import SessionLocal, init_security_db, Therapy, PasswordRecoveryToken, BiometricRecord
from app.security_service import (
    ensure_provider_organization_context,
    ensure_user_exists,
    get_user_by_email,
    get_provider_status,
    list_active_consents_for_user,
    soft_delete_account,
    set_local_password,
    verify_local_password,
)
from app.wearable_service import (
    get_provider,
    list_connections,
    list_supported_providers,
    upsert_connection,
    disconnect_connection,
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
        now = time_module.time()
        self._clean(key, now)
        if len(self.attempts[key]) >= self.max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Troppi tentativi di autenticazione. Riprova più tardi."
            )

    def register(self, key: str):
        now = time_module.time()
        self._clean(key, now)
        self.attempts[key].append(now)


auth_rate_limiter = AuthRateLimiter(
    window_seconds=settings.auth_rate_limit_window_seconds,
    max_attempts=settings.auth_rate_limit_max_attempts,
)

init_security_db()
FRONTEND_DIR = Path("frontend")
WEAR_APP_DIR = Path("wear-app")
FITBIT_OAUTH_STATE: Dict[str, Dict[str, str]] = {}


def frontend_page(filename: str) -> FileResponse:
    return FileResponse(FRONTEND_DIR / filename)


def resolve_wear_apk() -> Path | None:
    candidate_paths = [
        WEAR_APP_DIR / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk",
        WEAR_APP_DIR / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk",
    ]

    for candidate in candidate_paths:
        if candidate.exists() and candidate.is_file():
            return candidate

    apk_files = sorted(
        (WEAR_APP_DIR / "app" / "build" / "outputs" / "apk").glob("**/*.apk"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    ) if (WEAR_APP_DIR / "app" / "build" / "outputs" / "apk").exists() else []

    return apk_files[0] if apk_files else None


def exchange_fitbit_oauth_code(code: str, redirect_uri: str) -> dict | None:
    """Scambio authorization code Fitbit -> token (best effort)."""
    if not settings.fitbit_client_id or not settings.fitbit_client_secret:
        return None

    credentials = f"{settings.fitbit_client_id}:{settings.fitbit_client_secret}".encode("utf-8")
    auth_header = base64.b64encode(credentials).decode("utf-8")
    payload = urllib.parse.urlencode(
        {
            "client_id": settings.fitbit_client_id,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code": code,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        "https://api.fitbit.com/oauth2/token",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        logger.warning("Fitbit token exchange failed: %s", exc)
        return None
    except Exception as exc:
        logger.warning("Fitbit token exchange unexpected error: %s", exc)
        return None


def hash_recovery_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

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


@app.get("/style.css", include_in_schema=False)
async def style_css_asset():
    return frontend_page("style.css")


@app.get("/web.js", include_in_schema=False)
async def web_js_asset():
    return frontend_page("web.js")


@app.get("/app", include_in_schema=False)
async def app_download_page():
    return frontend_page("app-download.html")


@app.get("/app/apk", include_in_schema=False)
async def app_download_apk():
    apk_path = resolve_wear_apk()
    if not apk_path:
        raise HTTPException(
            status_code=404,
            detail="APK non trovato. Compila prima il progetto Wear OS (debug o release)."
        )

    return FileResponse(
        apk_path,
        media_type="application/vnd.android.package-archive",
        filename=apk_path.name,
    )


@app.get("/dashboard", include_in_schema=False)
async def patient_dashboard_page():
    return frontend_page("dashboard.html")

@app.get("/dashboard-v2", include_in_schema=False)
async def patient_dashboard_v2_page():
    return frontend_page("dashboard-v2.html")

@app.get("/therapy", include_in_schema=False)
async def therapy_page():
    return frontend_page("therapy.html")


@app.get("/consents", include_in_schema=False)
async def consents_page():
    return frontend_page("consents.html")


@app.get("/settings", include_in_schema=False)
async def settings_page():
    return frontend_page("settings.html")


@app.get("/connect", include_in_schema=False)
async def connect_page():
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


@app.get("/auth/google-config", tags=["Authentication"], summary="Config Google Sign-In")
async def google_config():
    """Restituisce la configurazione pubblica per Google Sign-In frontend."""
    return {
        "google_client_id": settings.google_client_id,
        "enabled": bool(settings.google_client_id)
    }


@app.post(
    "/auth/register",
    response_model=TokenResponse,
    tags=["Authentication"],
    summary="Registrazione account locale (email/password)"
)
async def register_local_account(payload: RegisterRequest, http_request: Request):
    ip = http_request.client.host if http_request.client else "unknown"
    limiter_key = f"register_local:{ip}"
    auth_rate_limiter.check(limiter_key)

    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Email non valida")

    if email == settings.admin_username.lower():
        raise HTTPException(status_code=400, detail="Email riservata")

    db = SessionLocal()
    try:
        existing = get_user_by_email(db, email)
        if existing and existing.deleted_at is None and existing.is_active:
            raise HTTPException(status_code=409, detail="Account gia' registrato")

        user = ensure_user_exists(
            db,
            email=email,
            auth_provider="local",
            account_type="personal",
            provider_status=None,
        )
        set_local_password(db, user.id, payload.password)
    finally:
        db.close()

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": email, "ver": user.token_version},
        expires_delta=access_token_expires,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        username=email,
    )


@app.post(
    "/auth/login",
    response_model=TokenResponse,
    tags=["Authentication"],
    summary="Login locale (email/password)"
)
async def local_login(payload: LoginRequest, http_request: Request):
    ip = http_request.client.host if http_request.client else "unknown"
    limiter_key = f"local_login:{ip}"
    auth_rate_limiter.check(limiter_key)

    username = payload.username.strip()
    profile = get_local_account_profile(username, payload.password)

    db = SessionLocal()
    try:
        if profile:
            persisted_user = ensure_user_exists(
                db,
                email=profile["email"],
                auth_provider=profile["auth_provider"],
                account_type=profile["account_type"],
                provider_status=profile["provider_status"],
            )
            ensure_provider_organization_context(db, persisted_user)
            subject = profile["email"]
        else:
            user = get_user_by_email(db, username.lower())
            if not user or not verify_local_password(db, user.id, payload.password):
                auth_rate_limiter.register(limiter_key)
                raise HTTPException(status_code=401, detail="Credenziali non valide")
            subject = user.email
            persisted_user = user
    finally:
        db.close()

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": subject, "ver": persisted_user.token_version},
        expires_delta=access_token_expires,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        username=subject,
    )


@app.post(
    "/auth/password-recovery/request",
    response_model=PasswordRecoveryResponse,
    tags=["Authentication"],
    summary="Avvia recovery password account locale"
)
async def request_password_recovery(payload: PasswordRecoveryRequest, http_request: Request):
    ip = http_request.client.host if http_request.client else "unknown"
    limiter_key = f"password_recovery_request:{ip}"
    auth_rate_limiter.check(limiter_key)

    email = payload.email.strip().lower()
    generic_message = "Se l'account esiste, riceverai un codice recovery valido 15 minuti."

    db = SessionLocal()
    try:
        user = get_user_by_email(db, email)
        if not user:
            return PasswordRecoveryResponse(status="accepted", message=generic_message)

        token_raw = secrets.token_urlsafe(24)
        token_hash = hash_recovery_token(token_raw)
        expires_in_seconds = 15 * 60
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in_seconds)

        # Invalida token recovery precedenti ancora attivi.
        active_tokens = (
            db.query(PasswordRecoveryToken)
            .filter(
                PasswordRecoveryToken.user_id == user.id,
                PasswordRecoveryToken.used_at.is_(None),
                PasswordRecoveryToken.expires_at > datetime.utcnow(),
            )
            .all()
        )
        for row in active_tokens:
            row.used_at = datetime.utcnow()

        db.add(
            PasswordRecoveryToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )
        db.commit()
        logger.info("Password recovery requested for %s", email)

        # Modalita concreta senza SMTP: token restituito al chiamante per reset immediato.
        return PasswordRecoveryResponse(
            status="accepted",
            message="Recovery avviato: usa il token per impostare una nuova password.",
            recovery_token=token_raw,
            expires_in_seconds=expires_in_seconds,
        )
    finally:
        db.close()


@app.post(
    "/auth/password-recovery/confirm",
    response_model=PasswordRecoveryResponse,
    tags=["Authentication"],
    summary="Conferma recovery e imposta nuova password"
)
async def confirm_password_recovery(payload: PasswordRecoveryConfirmRequest, http_request: Request):
    ip = http_request.client.host if http_request.client else "unknown"
    limiter_key = f"password_recovery_confirm:{ip}"
    auth_rate_limiter.check(limiter_key)

    email = payload.email.strip().lower()
    token_hash = hash_recovery_token(payload.recovery_token.strip())

    db = SessionLocal()
    try:
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(status_code=400, detail="Token recovery non valido o scaduto")

        token_row = (
            db.query(PasswordRecoveryToken)
            .filter(
                PasswordRecoveryToken.user_id == user.id,
                PasswordRecoveryToken.token_hash == token_hash,
                PasswordRecoveryToken.used_at.is_(None),
                PasswordRecoveryToken.expires_at > datetime.utcnow(),
            )
            .first()
        )
        if not token_row:
            auth_rate_limiter.register(limiter_key)
            raise HTTPException(status_code=400, detail="Token recovery non valido o scaduto")

        set_local_password(db, user.id, payload.new_password)
        token_row.used_at = datetime.utcnow()
        user.token_version += 1
        db.commit()

        return PasswordRecoveryResponse(
            status="success",
            message="Password aggiornata con successo. Effettua il login con la nuova password.",
        )
    finally:
        db.close()


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


@app.get(
    "/api/wearable/providers",
    response_model=WearableProvidersResponse,
    tags=["Wearables"],
    summary="Provider wearable supportati e stato connessioni"
)
async def wearable_providers(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        connections = list_connections(db, user.id)
        provider_items: list[WearableProviderStatus] = []

        for provider in list_supported_providers():
            conn = connections.get(provider["provider_key"])
            provider_items.append(
                WearableProviderStatus(
                    provider_key=provider["provider_key"],
                    provider_name=provider["provider_name"],
                    category=provider["category"],
                    supported_mode=provider["supported_mode"],
                    connected=bool(conn),
                    status="connected" if conn else "not_connected",
                    connected_at=conn.connected_at if conn else None,
                    last_sync_at=conn.last_sync_at if conn else None,
                    message="Collegato" if conn else "Non collegato",
                )
            )

        return WearableProvidersResponse(
            total=len(provider_items),
            connected=sum(1 for i in provider_items if i.connected),
            items=provider_items,
        )
    finally:
        db.close()


@app.post(
    "/api/wearable/connect/{provider_key}",
    response_model=WearableConnectResponse,
    tags=["Wearables"],
    summary="Avvia connessione provider wearable"
)
async def wearable_connect(
    provider_key: str,
    payload: WearableConnectRequest,
    current_user: str = Depends(get_current_user),
):
    provider = get_provider(provider_key)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider non supportato")

    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        mode = payload.mode.lower().strip()
        if mode not in {"demo", "oauth"}:
            raise HTTPException(status_code=400, detail="mode deve essere demo oppure oauth")

        if mode == "oauth" and provider["supported_mode"] not in {"oauth"}:
            raise HTTPException(
                status_code=400,
                detail="Questo provider richiede bridge/app companion, non OAuth diretto",
            )

        if mode == "oauth":
            auth_url = provider.get("oauth_auth_url")
            if not auth_url:
                raise HTTPException(status_code=400, detail="OAuth URL non disponibile per provider")

            callback_url = settings.fitbit_redirect_uri or payload.redirect_uri or f"{settings.cors_origins[0]}/auth/fitbit/callback"

            if provider_key == "fitbit" and settings.fitbit_client_id:
                state = secrets.token_urlsafe(24)
                FITBIT_OAUTH_STATE[state] = {
                    "username": current_user,
                    "redirect_uri": callback_url,
                }
                scope = urllib.parse.quote(settings.fitbit_scopes)
                redirect_q = urllib.parse.quote(callback_url, safe="")
                client_q = urllib.parse.quote(settings.fitbit_client_id, safe="")
                auth_url = (
                    "https://www.fitbit.com/oauth2/authorize"
                    f"?response_type=code&client_id={client_q}&redirect_uri={redirect_q}"
                    f"&scope={scope}&state={state}&expires_in=604800&prompt=consent"
                )
                return WearableConnectResponse(
                    provider_key=provider_key,
                    mode=mode,
                    status="pending_oauth",
                    auth_url=auth_url,
                    message="Fitbit OAuth avviato: completa autorizzazione e callback.",
                )

            simulated_auth_url = f"{auth_url}?client_id=TO_CONFIGURE&redirect_uri={callback_url}&response_type=code&scope=heartrate%20sleep%20activity"
            return WearableConnectResponse(
                provider_key=provider_key,
                mode=mode,
                status="pending_oauth",
                auth_url=simulated_auth_url,
                message="Flusso OAuth pronto: configura client_id/secret nel backend per attivare la connessione reale.",
            )

        upsert_connection(
            db=db,
            user_id=user.id,
            provider_key=provider_key,
            mode=mode,
            scope="heartrate,sleep,activity,spo2",
            external_user_id=current_user,
        )
        return WearableConnectResponse(
            provider_key=provider_key,
            mode=mode,
            status="connected",
            message="Provider collegato in modalita demo bridge.",
        )
    finally:
        db.close()


@app.get(
    "/auth/fitbit/callback",
    tags=["Wearables"],
    summary="OAuth callback Fitbit"
)
async def fitbit_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        raise HTTPException(status_code=400, detail=f"Fitbit OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Callback Fitbit incompleto")

    state_payload = FITBIT_OAUTH_STATE.pop(state, None)
    if not state_payload:
        raise HTTPException(status_code=400, detail="State OAuth Fitbit non valido o scaduto")

    username = state_payload["username"]
    redirect_uri = state_payload["redirect_uri"]
    token_data = exchange_fitbit_oauth_code(code, redirect_uri)

    db = SessionLocal()
    try:
        user = get_user_by_email(db, username)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato per callback Fitbit")

        access_hint = None
        refresh_hint = None
        if token_data:
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            access_hint = access_token[:14] + "..." if access_token else None
            refresh_hint = refresh_token[:14] + "..." if refresh_token else None

        upsert_connection(
            db=db,
            user_id=user.id,
            provider_key="fitbit",
            mode="oauth",
            scope=settings.fitbit_scopes,
            external_user_id=username,
            access_token_hint=access_hint,
            refresh_token_hint=refresh_hint,
        )
    finally:
        db.close()

    return {
        "status": "connected",
        "provider": "fitbit",
        "token_exchanged": bool(token_data),
        "message": "Fitbit collegato. Torna alla dashboard impostazioni per aggiornare lo stato.",
    }


@app.delete(
    "/api/wearable/connect/{provider_key}",
    response_model=WearableDisconnectResponse,
    tags=["Wearables"],
    summary="Disconnette provider wearable"
)
async def wearable_disconnect(provider_key: str, current_user: str = Depends(get_current_user)):
    provider = get_provider(provider_key)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider non supportato")

    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        removed = disconnect_connection(db, user.id, provider_key)
        if not removed:
            return WearableDisconnectResponse(
                provider_key=provider_key,
                status="not_connected",
                message="Provider non risultava collegato.",
            )

        return WearableDisconnectResponse(
            provider_key=provider_key,
            status="disconnected",
            message="Provider disconnesso con successo.",
        )
    finally:
        db.close()


@app.post(
    "/api/wearable/sync",
    tags=["Wearables"],
    summary="Sincronizza adesso dati wearable verso dashboard"
)
async def wearable_sync_now(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        connections = list_connections(db, user.id)
        connected_items = [item for item in connections.values() if item.status == "connected"]
        if not connected_items:
            raise HTTPException(status_code=400, detail="Nessun provider wearable collegato")

        connected_count = len(connected_items)
        now = datetime.utcnow()

        # Baseline sintetico, progressivamente migliore con piu provider collegati.
        hr = max(52, min(145, int(74 + 8 * math.sin(now.timestamp() / 1800) - connected_count)))
        hrv = max(18, min(95, float(46 + 6 * math.cos(now.timestamp() / 2200) + connected_count * 1.4)))
        movement = max(1.0, 95 + connected_count * 25 + 20 * math.sin(now.timestamp() / 2600))
        sleep_hours = max(3.5, min(9.2, 6.8 + 0.25 * connected_count + 0.35 * math.cos(now.timestamp() / 7000)))
        stress_index = max(0.05, min(0.95, 0.62 - (hrv / 170)))

        db.add(
            BiometricRecord(
                user_id=user.id,
                hrv=round(hrv, 1),
                heart_rate=hr,
                movement=round(movement, 1),
                sleep_hours=round(sleep_hours, 2),
                stress_index=round(stress_index, 3),
                timestamp=now,
            )
        )

        provider_keys = []
        for conn in connected_items:
            conn.last_sync_at = now
            provider_keys.append(conn.provider_key)

        db.commit()
        return {
            "status": "success",
            "message": f"Sincronizzazione completata: {connected_count} provider aggiornati.",
            "synced_providers": provider_keys,
            "sample": {
                "heart_rate": hr,
                "hrv": round(hrv, 1),
                "sleep_hours": round(sleep_hours, 2),
                "movement": round(movement, 1),
                "stress_index": round(stress_index, 3),
            },
            "timestamp": now.isoformat(),
        }
    finally:
        db.close()


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


@app.get("/api/therapies", response_model=List[TherapyRequest], tags=["Therapy"])
async def get_therapies(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        therapies = db.query(Therapy).filter(Therapy.user_id == user.id).all()
        return therapies
    finally:
        db.close()


@app.post("/api/therapies", response_model=TherapyRequest, tags=["Therapy"])
async def add_therapy(therapy: TherapyRequest, current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        new_therapy = Therapy(
            user_id=user.id,
            medication_name=therapy.medication_name,
            dosage=therapy.dosage,
            intake_time=therapy.intake_time
        )
        db.add(new_therapy)
        db.commit()
        db.refresh(new_therapy)
        return new_therapy
    finally:
        db.close()


@app.delete("/api/therapies/{therapy_id}", tags=["Therapy"])
async def delete_therapy(therapy_id: str, current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        therapy = db.query(Therapy).filter(Therapy.id == therapy_id, Therapy.user_id == user.id).first()
        if not therapy:
            raise HTTPException(status_code=404, detail="Terapia non trovata")
        db.delete(therapy)
        db.commit()
        return {"status": "success", "message": "Terapia eliminata"}
    finally:
        db.close()


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

@app.get("/api/risk-history", response_model=List[RiskDataPoint], tags=["Dashboard"])
async def get_risk_history(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        rows = (
            db.query(BiometricRecord)
            .filter(BiometricRecord.user_id == user.id)
            .order_by(BiometricRecord.timestamp.desc())
            .limit(24)
            .all()
        )
        if rows:
            points = []
            for row in rows:
                risk_score = max(0.02, min(0.98, 0.62 - (row.hrv / 180) + (row.heart_rate - 70) / 180))
                points.append(RiskDataPoint(timestamp=row.timestamp, risk_score=risk_score))
            return list(reversed(points))
    finally:
        db.close()

    # Fallback demo se non ci sono ancora dati sync.
    now = datetime.now()
    return [
        RiskDataPoint(timestamp=now - timedelta(hours=i), risk_score=max(0, 0.5 + i * 0.1 - 0.2 * i * i + 0.01 * i * i * i))
        for i in range(24)
    ]

@app.get("/api/physiological-summary", tags=["Dashboard"])
async def get_physiological_summary(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        rows = (
            db.query(BiometricRecord)
            .filter(BiometricRecord.user_id == user.id)
            .order_by(BiometricRecord.timestamp.desc())
            .limit(12)
            .all()
        )

        if rows:
            rows = list(reversed(rows))
            return {
                "hr": [int(r.heart_rate) for r in rows],
                "hrv": [round(float(r.hrv), 1) for r in rows],
                "labels": [r.timestamp.strftime("%H:%M") for r in rows],
            }
    finally:
        db.close()

    # Fallback demo se non ci sono ancora dati sync.
    return {
        "hr": [70, 72, 75, 73, 76, 78, 80, 79, 77, 75, 74, 72],
        "hrv": [55, 53, 50, 52, 49, 47, 45, 46, 48, 50, 51, 53],
        "labels": [(datetime.now() - timedelta(hours=i)).strftime("%H:%M") for i in range(12)],
    }

@app.get("/api/medication-impact", tags=["Dashboard"])
async def get_medication_impact(current_user: str = Depends(get_current_user)):
    # Logica di esempio per impatto farmaci
    return {
        "with_medication": [0.3, 0.25, 0.2, 0.15, 0.1],
        "without_medication": [0.6, 0.55, 0.5, 0.45, 0.4],
        "labels": ["Giorno 1", "Giorno 2", "Giorno 3", "Giorno 4", "Giorno 5"]
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
