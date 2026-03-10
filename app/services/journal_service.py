"""Journal service for aura/symptoms/therapy events."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.security_db import SeizureEvent


def add_journal_event(
    db: Session,
    user_id: str,
    event_type: str,
    notes: Optional[str],
    intensity: Optional[int],
    occurred_at: Optional[datetime],
) -> SeizureEvent:
    row = SeizureEvent(
        user_id=user_id,
        event_type=event_type,
        notes=notes,
        intensity=intensity,
        timestamp=occurred_at or datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_journal_events(db: Session, user_id: str, limit: int = 100) -> list[SeizureEvent]:
    rows = (
        db.query(SeizureEvent)
        .filter(SeizureEvent.user_id == user_id)
        .order_by(SeizureEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return rows
