"""Consolidated dashboard summary endpoint for web control center."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db.session import SessionLocal
from app.models import DashboardSummaryResponse, RiskCurrentResponse, WearableStatusResponse
from app.security_db import SeizureEvent
from app.security_service import get_user_by_email
from app.services.risk_service import get_current_risk
from app.services.sync_service import wearable_status


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        current = get_current_risk(db, user.id)
        if current:
            risk = RiskCurrentResponse(
                level=current.level,
                score=current.score,
                window="2h",
                factors=current.factors,
                updated_at=current.timestamp,
            )
        else:
            risk = RiskCurrentResponse(
                level="LOW",
                score=0.15,
                window="2h",
                factors=["dati_insufficienti"],
                updated_at=datetime.utcnow(),
            )

        status = WearableStatusResponse(**wearable_status(db, user.id))

        since = datetime.utcnow() - timedelta(hours=24)
        journal_count = (
            db.query(SeizureEvent)
            .filter(
                SeizureEvent.user_id == user.id,
                SeizureEvent.timestamp >= since,
            )
            .count()
        )

        return DashboardSummaryResponse(
            risk=risk,
            wearable_status=status,
            journal_events_24h=journal_count,
        )
    finally:
        db.close()
