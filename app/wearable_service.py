"""Servizi per integrazione provider wearable e fitness app."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.security_db import WearableConnection


PROVIDER_CATALOG = {
    "fitbit": {
        "provider_name": "Fitbit",
        "category": "watch+fitness",
        "supported_mode": "oauth",
        "oauth_auth_url": "https://www.fitbit.com/oauth2/authorize",
    },
    "garmin_connect": {
        "provider_name": "Garmin Connect",
        "category": "watch+fitness",
        "supported_mode": "oauth",
        "oauth_auth_url": "https://connect.garmin.com/oauthConfirm",
    },
    "samsung_health": {
        "provider_name": "Samsung Health",
        "category": "watch+phone",
        "supported_mode": "bridge",
        "oauth_auth_url": None,
    },
    "health_connect": {
        "provider_name": "Android Health Connect",
        "category": "phone-hub",
        "supported_mode": "bridge",
        "oauth_auth_url": None,
    },
    "apple_health": {
        "provider_name": "Apple Health",
        "category": "phone-hub",
        "supported_mode": "bridge",
        "oauth_auth_url": None,
    },
    "oura": {
        "provider_name": "Oura",
        "category": "ring+sleep",
        "supported_mode": "oauth",
        "oauth_auth_url": "https://cloud.ouraring.com/oauth/authorize",
    },
    "polar_flow": {
        "provider_name": "Polar Flow",
        "category": "watch+fitness",
        "supported_mode": "oauth",
        "oauth_auth_url": "https://flow.polar.com/oauth2/authorization",
    },
    "withings": {
        "provider_name": "Withings",
        "category": "wearable+health",
        "supported_mode": "oauth",
        "oauth_auth_url": "https://account.withings.com/oauth2_user/authorize2",
    },
    "strava": {
        "provider_name": "Strava",
        "category": "activity",
        "supported_mode": "oauth",
        "oauth_auth_url": "https://www.strava.com/oauth/authorize",
    },
    "google_fit": {
        "provider_name": "Google Fit (legacy)",
        "category": "fitness",
        "supported_mode": "legacy",
        "oauth_auth_url": None,
    },
}


def list_supported_providers() -> list[dict]:
    return [
        {
            "provider_key": provider_key,
            **metadata,
        }
        for provider_key, metadata in PROVIDER_CATALOG.items()
    ]


def get_provider(provider_key: str) -> Optional[dict]:
    return PROVIDER_CATALOG.get(provider_key)


def get_connection(db: Session, user_id: str, provider_key: str) -> Optional[WearableConnection]:
    return (
        db.query(WearableConnection)
        .filter(
            WearableConnection.user_id == user_id,
            WearableConnection.provider_key == provider_key,
            WearableConnection.status == "connected",
        )
        .first()
    )


def list_connections(db: Session, user_id: str) -> dict[str, WearableConnection]:
    rows = (
        db.query(WearableConnection)
        .filter(
            WearableConnection.user_id == user_id,
            WearableConnection.status == "connected",
        )
        .all()
    )
    return {row.provider_key: row for row in rows}


def upsert_connection(
    db: Session,
    user_id: str,
    provider_key: str,
    mode: str,
    scope: Optional[str] = None,
    external_user_id: Optional[str] = None,
    access_token_hint: Optional[str] = None,
    refresh_token_hint: Optional[str] = None,
) -> WearableConnection:
    existing = get_connection(db, user_id, provider_key)
    if existing:
        existing.mode = mode
        existing.scope = scope
        existing.external_user_id = external_user_id
        existing.access_token_hint = access_token_hint
        existing.refresh_token_hint = refresh_token_hint
        existing.connected_at = datetime.utcnow()
        existing.disconnected_at = None
        db.commit()
        db.refresh(existing)
        return existing

    item = WearableConnection(
        user_id=user_id,
        provider_key=provider_key,
        mode=mode,
        scope=scope,
        external_user_id=external_user_id,
        access_token_hint=access_token_hint,
        refresh_token_hint=refresh_token_hint,
        status="connected",
        connected_at=datetime.utcnow(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def disconnect_connection(db: Session, user_id: str, provider_key: str) -> bool:
    row = get_connection(db, user_id, provider_key)
    if not row:
        return False

    row.status = "revoked"
    row.disconnected_at = datetime.utcnow()
    db.commit()
    return True
