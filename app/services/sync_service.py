"""Wearable sync service with idempotent batching and metric normalization."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.security_db import BiometricRecord


@dataclass
class SyncRecord:
    idempotency_key: str
    metric: str
    value: float
    unit: str
    timestamp: datetime
    source: str


def _normalize_metric(metric: str) -> str:
    key = metric.strip().lower()
    alias = {
        "hr": "heart_rate",
        "heartrate": "heart_rate",
        "heart_rate": "heart_rate",
        "hrv": "hrv",
        "hrv_rmssd": "hrv",
        "sleep": "sleep_hours",
        "sleep_hours": "sleep_hours",
        "activity": "movement",
        "movement": "movement",
    }
    return alias.get(key, key)


def _load_recent_defaults(db: Session, user_id: str) -> dict[str, float]:
    row = (
        db.query(BiometricRecord)
        .filter(BiometricRecord.user_id == user_id)
        .order_by(BiometricRecord.timestamp.desc())
        .first()
    )
    if not row:
        return {
            "heart_rate": 72.0,
            "hrv": 45.0,
            "movement": 100.0,
            "sleep_hours": 7.0,
        }

    return {
        "heart_rate": float(row.heart_rate),
        "hrv": float(row.hrv),
        "movement": float(row.movement),
        "sleep_hours": float(row.sleep_hours),
    }


def sync_biometric_batch(
    db: Session,
    user_id: str,
    records: list[SyncRecord],
) -> dict:
    if not records:
        return {"accepted": 0, "deduplicated": 0, "rejected": 0, "inserted": 0}

    seen_idempotency = set()
    accepted = 0
    deduplicated = 0
    rejected = 0

    grouped: dict[str, dict] = defaultdict(lambda: {"metrics": {}, "timestamp": None})

    for record in records:
        if record.idempotency_key in seen_idempotency:
            deduplicated += 1
            continue
        seen_idempotency.add(record.idempotency_key)

        metric = _normalize_metric(record.metric)
        if metric not in {"heart_rate", "hrv", "movement", "sleep_hours"}:
            rejected += 1
            continue

        ts_key = record.timestamp.replace(second=0, microsecond=0).isoformat()
        grouped[ts_key]["timestamp"] = record.timestamp
        grouped[ts_key]["metrics"][metric] = float(record.value)
        accepted += 1

    defaults = _load_recent_defaults(db, user_id)
    inserted = 0

    for payload in grouped.values():
        metrics = payload["metrics"]
        row = BiometricRecord(
            user_id=user_id,
            heart_rate=int(round(metrics.get("heart_rate", defaults["heart_rate"]))),
            hrv=float(metrics.get("hrv", defaults["hrv"])),
            movement=float(metrics.get("movement", defaults["movement"])),
            sleep_hours=float(metrics.get("sleep_hours", defaults["sleep_hours"])),
            stress_index=None,
            timestamp=payload["timestamp"] or datetime.utcnow(),
        )
        db.add(row)
        inserted += 1

    db.commit()
    return {
        "accepted": accepted,
        "deduplicated": deduplicated,
        "rejected": rejected,
        "inserted": inserted,
    }


def wearable_status(db: Session, user_id: str) -> dict:
    last = (
        db.query(BiometricRecord)
        .filter(BiometricRecord.user_id == user_id)
        .order_by(BiometricRecord.timestamp.desc())
        .first()
    )

    if not last:
        return {
            "status": "no_data",
            "last_sync_at": None,
            "signals": {},
        }

    return {
        "status": "ok",
        "last_sync_at": last.timestamp,
        "signals": {
            "heart_rate": int(last.heart_rate),
            "hrv": float(last.hrv),
            "sleep_hours": float(last.sleep_hours),
            "movement": float(last.movement),
        },
    }
