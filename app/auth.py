"""
Sistema di autenticazione con JWT
"""
from datetime import datetime, timedelta
import importlib
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings
from app.security_db import SessionLocal
from app.security_service import is_session_valid

# Context per hashing password
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security scheme per JWT Bearer token
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica che la password corrisponda all'hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Genera hash bcrypt della password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crea un JWT token
    
    Args:
        data: Dati da includere nel token (es. username)
        expires_delta: Durata validità token
        
    Returns:
        JWT token string
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    
    return encoded_jwt


def authenticate_user(username: str, password: str) -> Optional[str]:
    """
    Autentica l'utente verificando username e password
    
    Args:
        username: Username fornito
        password: Password in chiaro
        
    Returns:
        Username se autenticazione OK, None altrimenti
    """
    if username != settings.admin_username:
        return None
    
    # Prima volta: genera hash e lo mostra per configurazione
    if not settings.admin_password_hash:
        raise HTTPException(
            status_code=500,
            detail="Password hash non configurato. Vedi logs per generarlo."
        )
    
    if not verify_password(password, settings.admin_password_hash):
        return None
    
    return username


def get_local_account_profile(username: str, password: str) -> Optional[dict]:
    """
    Risolve profilo account locale (admin/demo) e valida credenziali.

    Returns:
        dict con email/account_type/provider_status/auth_provider oppure None.
    """
    if settings.enable_legacy_admin_login and username == settings.admin_username:
        authenticated_username = authenticate_user(username, password)
        if not authenticated_username:
            return None
        return {
            "email": authenticated_username,
            "account_type": "personal",
            "provider_status": None,
            "auth_provider": "local",
        }

    if settings.enable_demo_accounts:
        if username == settings.demo_user_username and password == settings.demo_user_password:
            return {
                "email": settings.demo_user_username,
                "account_type": "personal",
                "provider_status": None,
                "auth_provider": "demo",
            }

        if username == settings.demo_provider_username and password == settings.demo_provider_password:
            return {
                "email": settings.demo_provider_username,
                "account_type": "provider",
                "provider_status": "provider_verified",
                "auth_provider": "demo",
            }

    return None


def verify_google_id_token(token: str) -> Optional[str]:
    """
    Verifica un Google ID token e restituisce l'identificativo utente.

    Returns:
        Email utente se disponibile, altrimenti subject (sub), None se non valido.
    """
    if not settings.google_client_id:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth non configurato. Imposta GOOGLE_CLIENT_ID nel file .env"
        )

    try:
        google_id_token = importlib.import_module("google.oauth2.id_token")
        google_requests = importlib.import_module("google.auth.transport.requests")

        id_info = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id
        )
    except (ValueError, ModuleNotFoundError):
        return None

    email = id_info.get("email")
    subject = id_info.get("sub")

    return email or subject


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Dependency per proteggere gli endpoint - valida JWT token
    
    Args:
        credentials: Token JWT dal header Authorization
        
    Returns:
        Username dell'utente autenticato
        
    Raises:
        HTTPException: Se token invalido o scaduto
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenziali non valide",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: Optional[str] = payload.get("sub")
        token_version: Optional[int] = payload.get("ver")
        
        if username is None:
            raise credentials_exception

        db = SessionLocal()
        try:
            if not is_session_valid(db, username, token_version):
                raise credentials_exception
        finally:
            db.close()
            
    except JWTError:
        raise credentials_exception
    
    return username
