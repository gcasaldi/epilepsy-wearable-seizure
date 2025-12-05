"""
Sistema di autenticazione con JWT
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

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
        username: str = payload.get("sub")
        
        if username is None:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    return username
