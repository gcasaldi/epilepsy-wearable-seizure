"""Consolidated risk endpoints based on time-series pipeline."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException

from app.auth import get_current_user
from app.db.session import SessionLocal
from app.models import RiskCurrentResponse, RiskTimelinePoint
from app.security_service import get_user_by_email
from app.services.risk_service import get_current_risk, get_risk_timeline


router = APIRouter(prefix="/risk", tags=["Risk"])


@router.get("/current", response_model=RiskCurrentResponse)
async def risk_current(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        result = get_current_risk(db, user.id)
        if not result:
            return RiskCurrentResponse(
                level="LOW",
                score=0.15,
                window="2h",
                factors=["dati_insufficienti"],
                updated_at=datetime.utcnow(),
            )

        return RiskCurrentResponse(
            level=result.level,
            score=result.score,
            window="2h",
            factors=result.factors,
            updated_at=result.timestamp,
        )
    finally:
        db.close()


@router.get("/timeline", response_model=list[RiskTimelinePoint])
async def risk_timeline(
    hours: int = Query(default=24, ge=1, le=24 * 30),
    current_user: str = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        timeline = get_risk_timeline(db, user.id, hours=hours)
        return [
            RiskTimelinePoint(timestamp=item.timestamp, score=item.score, level=item.level)
            for item in timeline
        ]
    finally:
        db.close()
