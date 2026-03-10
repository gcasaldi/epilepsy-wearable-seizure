"""Consolidated wearable endpoints for MVP Health Connect-first flow."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db.session import SessionLocal
from app.models import WearableStatusResponse, WearableSyncRequest, WearableSyncResponse
from app.security_service import get_user_by_email
from app.services.sync_service import SyncRecord, sync_biometric_batch, wearable_status


router = APIRouter(prefix="/wearable", tags=["Wearable"])


@router.get("/status", response_model=WearableStatusResponse)
async def get_wearable_status(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        payload = wearable_status(db, user.id)
        return WearableStatusResponse(**payload)
    finally:
        db.close()


@router.post("/sync", response_model=WearableSyncResponse)
async def sync_wearable(payload: WearableSyncRequest, current_user: str = Depends(get_current_user)):
    if payload.provider.lower() != "health_connect":
        raise HTTPException(status_code=400, detail="MVP supporta solo provider health_connect")

    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        records = [
            SyncRecord(
                idempotency_key=item.idempotency_key,
                metric=item.metric,
                value=item.value,
                unit=item.unit,
                timestamp=item.timestamp,
                source=item.source,
            )
            for item in payload.records
        ]

        summary = sync_biometric_batch(db=db, user_id=user.id, records=records)
        return WearableSyncResponse(sync_id=str(uuid.uuid4()), **summary)
    finally:
        db.close()
