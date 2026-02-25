"""
Servizi sicurezza: provisioning utenti, session validation, soft delete e audit.
"""
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.security_db import (
    AuditLog,
    CaregiverLink,
    Organization,
    OrgMembership,
    Patient,
    PatientOrgConsent,
    SessionLocal,
    User,
)


def get_db() -> Session:
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def ensure_user_exists(
    db: Session,
    email: str,
    auth_provider: str,
    account_type: str = "personal",
    provider_status: Optional[str] = None,
) -> User:
    user = get_user_by_email(db, email)
    if user:
        if not user.is_active:
            user.is_active = True
            user.deleted_at = None
        if user.auth_provider != auth_provider:
            user.auth_provider = auth_provider
        user.account_type = account_type
        user.provider_status = provider_status
        db.commit()
        db.refresh(user)
        return user

    user = User(
        email=email,
        auth_provider=auth_provider,
        account_type=account_type,
        provider_status=provider_status if account_type == "provider" else None,
    )
    db.add(user)
    db.flush()

    patient = Patient(owner_user_id=user.id)
    db.add(patient)

    db.commit()
    db.refresh(user)
    return user


def ensure_provider_organization_context(db: Session, user: User) -> None:
    """Garantisce che un provider verificato abbia ente e membership admin attiva."""
    if user.account_type != "provider" or user.provider_status != "provider_verified":
        return

    domain = user.email.split("@")[-1] if "@" in user.email else None
    org = db.query(Organization).filter(Organization.domain == domain).first() if domain else None

    if not org:
        org = Organization(
            legal_name=f"Demo Ente {domain or 'Sanitario'}",
            vat_or_tax_code="DEMO-ENTE-001",
            domain=domain,
            status="verified",
            created_by_user_id=user.id,
            verified_at=datetime.utcnow(),
        )
        db.add(org)
        db.flush()

    membership = (
        db.query(OrgMembership)
        .filter(
            OrgMembership.org_id == org.id,
            OrgMembership.user_id == user.id,
        )
        .first()
    )
    if not membership:
        membership = OrgMembership(
            org_id=org.id,
            user_id=user.id,
            role="admin",
            status="active",
        )
        db.add(membership)
    else:
        membership.role = "admin"
        membership.status = "active"

    db.commit()


def is_session_valid(db: Session, email: str, token_version: Optional[int]) -> bool:
    user = get_user_by_email(db, email)
    if not user:
        return False
    if not user.is_active or user.deleted_at is not None:
        return False
    if token_version is not None and token_version != user.token_version:
        return False
    return True


def write_audit(
    db: Session,
    actor_user_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    meta: Optional[Dict[str, Any]] = None,
    org_id: Optional[str] = None,
) -> None:
    audit = AuditLog(
        org_id=org_id,
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meta=meta,
    )
    db.add(audit)


def soft_delete_account(db: Session, email: str) -> Dict[str, int]:
    user = get_user_by_email(db, email)
    if not user:
        return {
            "revoked_consents": 0,
            "revoked_caregiver_links": 0,
        }

    patient = db.query(Patient).filter(Patient.owner_user_id == user.id).first()
    revoked_consents = 0
    revoked_links = 0

    if patient:
        active_consents = (
            db.query(PatientOrgConsent)
            .filter(
                PatientOrgConsent.patient_id == patient.id,
                PatientOrgConsent.status == "active",
            )
            .all()
        )
        for consent in active_consents:
            consent.status = "revoked"
            consent.revoked_at = datetime.utcnow()
            consent.revoked_by_user_id = user.id
            revoked_consents += 1

        caregiver_links = (
            db.query(CaregiverLink)
            .filter(
                CaregiverLink.patient_id == patient.id,
                CaregiverLink.status.in_(["active", "pending"]),
            )
            .all()
        )
        for link in caregiver_links:
            link.status = "revoked"
            revoked_links += 1

    as_caregiver_links = (
        db.query(CaregiverLink)
        .filter(
            CaregiverLink.caregiver_user_id == user.id,
            CaregiverLink.status.in_(["active", "pending"]),
        )
        .all()
    )
    for link in as_caregiver_links:
        link.status = "revoked"
        revoked_links += 1

    user.is_active = False
    user.deleted_at = datetime.utcnow()
    user.token_version += 1

    write_audit(
        db=db,
        actor_user_id=user.id,
        action="ACCOUNT_SOFT_DELETED",
        entity_type="user",
        entity_id=user.id,
        meta={
            "revoked_consents": revoked_consents,
            "revoked_caregiver_links": revoked_links,
        },
    )

    db.commit()
    return {
        "revoked_consents": revoked_consents,
        "revoked_caregiver_links": revoked_links,
    }


def get_provider_status(db: Session, email: str) -> Dict[str, Any]:
    user = get_user_by_email(db, email)
    if not user:
        return {
            "account_type": "unknown",
            "provider_status": None,
            "verified": False,
            "organization": None,
            "role": None,
        }

    if user.account_type != "provider":
        return {
            "account_type": user.account_type,
            "provider_status": user.provider_status,
            "verified": False,
            "organization": None,
            "role": None,
        }

    membership = (
        db.query(OrgMembership)
        .filter(
            OrgMembership.user_id == user.id,
            OrgMembership.status == "active",
        )
        .first()
    )

    organization = None
    role = None
    if membership:
        org = db.query(Organization).filter(Organization.id == membership.org_id).first()
        role = membership.role
        if org:
            organization = {
                "id": org.id,
                "legal_name": org.legal_name,
                "status": org.status,
                "domain": org.domain,
            }

    is_verified = user.provider_status == "provider_verified"
    if organization and organization["status"] != "verified":
        is_verified = False

    return {
        "account_type": user.account_type,
        "provider_status": user.provider_status,
        "verified": is_verified,
        "organization": organization,
        "role": role,
    }


def list_active_consents_for_user(db: Session, email: str) -> list[Dict[str, Any]]:
    user = get_user_by_email(db, email)
    if not user:
        return []

    patient = db.query(Patient).filter(Patient.owner_user_id == user.id).first()
    if not patient:
        return []

    consents = (
        db.query(PatientOrgConsent)
        .filter(
            PatientOrgConsent.patient_id == patient.id,
            PatientOrgConsent.status == "active",
        )
        .all()
    )

    result: list[Dict[str, Any]] = []
    for consent in consents:
        org = db.query(Organization).filter(Organization.id == consent.org_id).first()
        result.append(
            {
                "consent_id": consent.id,
                "organization_id": consent.org_id,
                "organization_name": org.legal_name if org else "Ente",
                "organization_status": org.status if org else "unknown",
                "scope": consent.scope,
                "version": consent.version,
                "granted_at": consent.granted_at.isoformat(),
            }
        )

    return result