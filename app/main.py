"""
FastAPI Application - Epiguard Cyber-Terminal (SY-45)
L'interfaccia definitiva per la demo perfetta.
"""
from datetime import datetime, timedelta
import logging
import socket
import random
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException, Depends, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.models import (
    TokenResponse, PhysiologicalData, RiskPrediction, 
    TherapyRequest, RiskDataPoint, SeizureEventCreate, 
    SeizureEventResponse, BiometricSummary, GoogleLoginRequest
)
from app.auth import (
    create_access_token, get_current_user, get_password_hash,
    verify_password, verify_google_id_token
)
from app.predictor import predictor
from app.config import settings
from app.security_db import SessionLocal, init_security_db, Therapy, BiometricRecord, SeizureEvent, User
from app.security_service import ensure_user_exists, get_user_by_email

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Epiguard API", version="1.0.0")
init_security_db()

# --- UTILS ---
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

LOCAL_IP = get_local_ip()
print(f"\n{'-'*60}")
print(f"🚀 EPIGUARD TERMINAL ONLINE [SY-45]")
print(f"🔗 LOCAL DASHBOARD: http://localhost:8010")
print(f"🔗 MOBILE SYNC:    http://{LOCAL_IP}:8010/app")
print(f"👤 DEMO: admin / password")
print(f"👤 REAL: {settings.giulia_email}")
print(f"{'-'*60}\n")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

try:
    app.mount("/static", StaticFiles(directory="frontend"), name="static")
except:
    logger.warning("Frontend static non trovato")

# --- UI ROUTING (Tutte le pagine caricate correttamente) ---
@app.get("/")
async def root(): return FileResponse("frontend/landing.html")

@app.get("/login")
async def login_page(): return FileResponse("frontend/login.html")

@app.get("/dashboard")
async def dashboard_page(): return FileResponse("frontend/dashboard.html")

@app.get("/app")
async def app_page(): return FileResponse("frontend/app-download.html")

@app.get("/therapy")
async def therapy_page(): return FileResponse("frontend/therapy.html")

@app.get("/consents")
async def consents_page(): return FileResponse("frontend/consents.html")

@app.get("/settings")
async def settings_page(): return FileResponse("frontend/settings.html")

@app.get("/privacy")
async def privacy_page(): return FileResponse("frontend/privacy.html")

@app.get("/terms")
async def terms_page(): return FileResponse("frontend/terms.html")

@app.get("/disclaimer")
async def disclaimer_page(): return FileResponse("frontend/disclaimer.html")

# --- AUTH ---
@app.post("/auth/login-local", response_model=TokenResponse)
async def login_local(email: str = Form(...), password: str = Form(...)):
    email_clean = email.strip().lower()
    pass_clean = password.strip()
    
    is_admin = (email_clean == "admin" and pass_clean == "password")
    is_giulia = (email_clean == settings.giulia_email.lower() and pass_clean == settings.giulia_password)

    if not (is_admin or is_giulia):
        raise HTTPException(status_code=401, detail="AUTH_FAILED")

    db = SessionLocal()
    try:
        ensure_user_exists(db, email=email_clean, auth_provider="local")
        access_token = create_access_token(data={"sub": email_clean, "ver": 1})
        return TokenResponse(access_token=access_token, token_type="bearer", expires_in=3600, username=email_clean)
    finally:
        db.close()

@app.post("/auth/google", response_model=TokenResponse)
async def google_login(payload: GoogleLoginRequest):
    # Simulazione Google per Demo Locale se il token è quello finto
    if payload.credential == "DEMO_TOKEN_GUEST_USER_AUTHENTICATED":
        username = "demo.paziente@gmail.com"
    else:
        username = verify_google_id_token(payload.credential)
    
    if not username:
        raise HTTPException(status_code=401, detail="Google Auth Failed")

    db = SessionLocal()
    try:
        ensure_user_exists(db, email=username, auth_provider="google")
        access_token = create_access_token(data={"sub": username, "ver": 1})
        return TokenResponse(access_token=access_token, token_type="bearer", expires_in=3600, username=username)
    finally:
        db.close()

# --- APK DOWNLOAD ---
@app.get("/app/apk")
async def download_apk():
    apk_dir = Path("static_files")
    apk_dir.mkdir(exist_ok=True)
    apk_file = apk_dir / "epiguard-wear.apk"
    if not apk_file.exists():
        with open(apk_file, "w") as f: f.write("Epiguard Wear OS Package v1.0")
    return FileResponse(path=apk_file, filename="epiguard-wear.apk", media_type="application/vnd.android.package-archive")

# --- LIVE DEMO DATA GENERATOR ---
@app.get("/api/test")
async def test_pred(current_user: str = Depends(get_current_user)):
    # Dati fluttuanti per rendere i grafici vivi nella demo
    base_hrv = 50 + random.uniform(-5, 5)
    base_hr = 72 + random.uniform(-3, 10)
    data = PhysiologicalData(hrv=base_hrv, heart_rate=int(base_hr), movement=100, sleep_hours=7.5, medication_taken=True)
    return {"output": predictor.predict(data).model_dump()}

@app.get("/api/risk-history")
async def get_risk_history(current_user: str = Depends(get_current_user)):
    now = datetime.now()
    # Generiamo un andamento credibile
    return [RiskDataPoint(timestamp=now - timedelta(minutes=i*10), risk_score=max(0.05, 0.2 + 0.1 * random.uniform(-1, 1))) for i in range(24)]

@app.get("/api/physiological-summary")
async def get_phys_summary(current_user: str = Depends(get_current_user)):
    # Generiamo 12 ore di dati per i grafici neon
    return {
        "hr": [int(70 + 5 * random.uniform(-1, 2)) for _ in range(12)],
        "hrv": [float(50 + 8 * random.uniform(-1, 1)) for _ in range(12)],
        "labels": [(datetime.now() - timedelta(hours=i)).strftime("%H:%M") for i in range(12)][::-1]
    }

# --- PATIENT DATA ---
@app.get("/api/me")
async def get_me(current_user: str = Depends(get_current_user)):
    return {"username": current_user, "status": "active"}

@app.get("/api/events/history")
async def get_events(current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        if not user: return []
        return db.query(SeizureEvent).filter(SeizureEvent.user_id == user.id).order_by(SeizureEvent.timestamp.desc()).all()
    finally:
        db.close()

@app.post("/api/events/log")
async def log_event(event: SeizureEventCreate, current_user: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, current_user)
        new_event = SeizureEvent(user_id=user.id, event_type=event.event_type, intensity=event.intensity, notes=event.notes, timestamp=datetime.utcnow())
        db.add(new_event)
        db.commit()
        return {"status": "success"}
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
