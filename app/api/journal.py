"""Consolidated journal endpoints for mobile quick input and timeline."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException

from app.auth import get_current_user
from app.db.session import SessionLocal
from app.models import JournalEventRequest, JournalEventResponse, JournalHistoryItem
from app.security_service import get_user_by_email
from app.services.journal_service import add_journal_event, list_journal_events


router = APIRouter(prefix="/journal", tags=["Journal"])


_SEVERITY_MAP = {"low": 1, "medium": 2, "high": 3}


@router.post("/event", response_model=JournalEventResponse)
async def create_journal_event(payload: JournalEventRequest, current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        severity = None
        if payload.severity:
            severity = _SEVERITY_MAP.get(payload.severity.strip().lower())

        row = add_journal_event(
            db=db,
            user_id=user.id,
            event_type=payload.event_type.strip().lower(),
            notes=payload.notes,
            intensity=severity,
            occurred_at=payload.occurred_at,
        )
        return JournalEventResponse(event_id=row.id, status="stored")
    finally:
        db.close()


@router.get("/history", response_model=list[JournalHistoryItem])
async def get_journal_history(
    hours: int = Query(default=168, ge=1, le=24 * 90),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: str = Depends(get_current_user),
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        rows = [r for r in list_journal_events(db, user.id, limit=limit) if r.timestamp >= cutoff]
        return [
            JournalHistoryItem(
                event_id=row.id,
                event_type=row.event_type,
                severity=row.intensity,
                notes=row.notes,
                occurred_at=row.timestamp,
            )
            for row in rows
        ]
    finally:
        db.close()
