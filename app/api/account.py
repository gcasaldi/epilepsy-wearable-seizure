"""Account endpoints aligned with consolidated API naming."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db.session import SessionLocal
from app.security_service import get_user_by_email


router = APIRouter(tags=["Authentication"])


@router.get("/me")
async def me(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        return {
            "username": current_user,
            "account_type": user.account_type,
            "provider_status": user.provider_status,
            "account_active": bool(user.is_active),
            "authenticated": True,
            "timestamp": datetime.utcnow(),
        }
    finally:
        db.close()
