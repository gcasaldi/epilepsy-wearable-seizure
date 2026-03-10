"""Time-series risk service: baseline, anomaly detection, risk score and explainability."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.security_db import BiometricRecord


@dataclass
class RiskComputation:
    score: float
    level: str
    factors: List[str]
    timestamp: datetime


def _clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, value))


def _risk_level(score: float) -> str:
    if score < 0.34:
        return "LOW"
    if score < 0.67:
        return "MEDIUM"
    return "HIGH"


def _safe_mean(values: list[float], fallback: float) -> float:
    return sum(values) / len(values) if values else fallback


def _extract_components(current: BiometricRecord, baseline_rows: list[BiometricRecord]) -> dict[str, float]:
    baseline_hrv = _safe_mean([float(r.hrv) for r in baseline_rows], float(current.hrv))
    baseline_hr = _safe_mean([float(r.heart_rate) for r in baseline_rows], float(current.heart_rate))
    baseline_sleep = _safe_mean([float(r.sleep_hours) for r in baseline_rows], float(current.sleep_hours))
    baseline_movement = _safe_mean([float(r.movement) for r in baseline_rows], float(current.movement))

    hrv_component = _clamp((baseline_hrv - float(current.hrv)) / max(10.0, baseline_hrv))
    hr_component = _clamp(abs(float(current.heart_rate) - baseline_hr) / 40.0)
    sleep_component = _clamp((baseline_sleep - float(current.sleep_hours)) / 3.0)
    movement_component = _clamp(abs(float(current.movement) - baseline_movement) / 220.0)

    if current.stress_index is not None:
        stress_component = _clamp(float(current.stress_index))
    else:
        stress_component = _clamp(0.65 - (float(current.hrv) / 180.0))

    return {
        "hrv": hrv_component,
        "heart_rate": hr_component,
        "sleep": sleep_component,
        "movement": movement_component,
        "stress": stress_component,
    }


def _factors_from_components(components: dict[str, float]) -> list[str]:
    labels = {
        "hrv": "hrv_bassa_vs_baseline",
        "heart_rate": "heart_rate_fuori_baseline",
        "sleep": "sonno_ridotto_24h",
        "movement": "movimento_anomalo",
        "stress": "stress_index_alto",
    }
    ordered = sorted(components.items(), key=lambda item: item[1], reverse=True)
    selected = [labels[name] for name, value in ordered if value >= 0.2]
    return selected[:3] if selected else ["nessuna_anomalia_rilevante"]


def compute_risk_for_point(current: BiometricRecord, baseline_rows: list[BiometricRecord]) -> RiskComputation:
    components = _extract_components(current, baseline_rows)
    score = _clamp(
        0.34 * components["hrv"]
        + 0.21 * components["heart_rate"]
        + 0.20 * components["sleep"]
        + 0.10 * components["movement"]
        + 0.15 * components["stress"]
    )
    return RiskComputation(
        score=round(score, 4),
        level=_risk_level(score),
        factors=_factors_from_components(components),
        timestamp=current.timestamp,
    )


def load_recent_records(db: Session, user_id: str, limit: int = 120) -> list[BiometricRecord]:
    rows = (
        db.query(BiometricRecord)
        .filter(BiometricRecord.user_id == user_id)
        .order_by(BiometricRecord.timestamp.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


def get_current_risk(db: Session, user_id: str) -> Optional[RiskComputation]:
    rows = load_recent_records(db, user_id=user_id, limit=120)
    if not rows:
        return None

    current = rows[-1]
    baseline = rows[:-1][-72:] if len(rows) > 1 else []
    return compute_risk_for_point(current=current, baseline_rows=baseline)


def get_risk_timeline(db: Session, user_id: str, hours: int = 24) -> list[RiskComputation]:
    if hours <= 0:
        return []

    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(BiometricRecord)
        .filter(
            BiometricRecord.user_id == user_id,
            BiometricRecord.timestamp >= cutoff,
        )
        .order_by(BiometricRecord.timestamp.asc())
        .all()
    )

    if not rows:
        return []

    timeline: list[RiskComputation] = []
    for index, row in enumerate(rows):
        baseline = rows[max(0, index - 72):index]
        timeline.append(compute_risk_for_point(current=row, baseline_rows=baseline))

    return timeline
