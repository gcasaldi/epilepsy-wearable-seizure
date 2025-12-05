"""
Logica predizione rischio crisi epilettiche
"""
from app.models import PhysiologicalData, RiskPrediction
from app.config import settings


class SeizurePredictor:
    """
    Calcola il rischio di crisi epilettica basandosi su parametri fisiologici.
    
    Fattori considerati:
    - HRV basso = stress elevato = rischio aumentato
    - Heart rate anomalo = segnale di alert
    - Movimento estremo (iper/ipo) = possibile prodromo
    - Sonno insufficiente = fattore critico
    - Mancata assunzione farmaci = rischio massimo
    """
    
    def __init__(self):
        self.low_threshold = settings.low_risk_threshold
        self.high_threshold = settings.high_risk_threshold
    
    def predict(self, data: PhysiologicalData) -> RiskPrediction:
        """Calcola predizione rischio"""
        
        # Calcola rischi individuali (0-1)
        hrv_risk = self._hrv_risk(data.hrv)
        hr_risk = self._heart_rate_risk(data.heart_rate)
        movement_risk = self._movement_risk(data.movement)
        sleep_risk = self._sleep_risk(data.sleep_hours)
        medication_risk = 0.0 if data.medication_taken else 1.0
        
        # Rischio totale pesato
        total_risk = (
            hrv_risk * settings.weight_hrv +
            hr_risk * settings.weight_heart_rate +
            movement_risk * settings.weight_movement +
            sleep_risk * settings.weight_sleep +
            medication_risk * settings.weight_medication
        )
        
        risk_score = max(0.0, min(1.0, total_risk))
        risk_level, message = self._categorize(risk_score)
        
        return RiskPrediction(
            risk_score=round(risk_score, 3),
            risk_level=risk_level,
            message=message,
            timestamp=data.timestamp
        )
    
    def _hrv_risk(self, hrv: float) -> float:
        """HRV basso = stress = rischio alto"""
        if hrv >= 60:
            return 0.0
        elif hrv >= 40:
            return 0.3
        elif hrv >= 25:
            return 0.6
        else:
            return 0.9
    
    def _heart_rate_risk(self, hr: int) -> float:
        """Battito anomalo = rischio"""
        if 60 <= hr <= 85:
            return 0.1
        elif 50 <= hr < 60 or 85 < hr <= 100:
            return 0.4
        elif 40 <= hr < 50 or 100 < hr <= 120:
            return 0.7
        else:
            return 1.0
    
    def _movement_risk(self, movement: float) -> float:
        """Movimento estremo = possibile prodromo"""
        if 80 <= movement <= 180:
            return 0.1
        elif 50 <= movement < 80 or 180 < movement <= 250:
            return 0.4
        elif 20 <= movement < 50 or 250 < movement <= 350:
            return 0.7
        else:
            return 0.9
    
    def _sleep_risk(self, sleep_hours: float) -> float:
        """Sonno insufficiente = fattore critico"""
        if 7.0 <= sleep_hours <= 9.0:
            return 0.0
        elif 6.0 <= sleep_hours < 7.0 or 9.0 < sleep_hours <= 10.0:
            return 0.3
        elif 5.0 <= sleep_hours < 6.0 or 10.0 < sleep_hours <= 11.0:
            return 0.6
        elif 4.0 <= sleep_hours < 5.0:
            return 0.8
        else:
            return 1.0
    
    def _categorize(self, risk_score: float) -> tuple[str, str]:
        """Categorizza rischio e genera messaggio"""
        if risk_score < self.low_threshold:
            return "low", "Rischio basso: tutto stabile."
        elif risk_score < self.high_threshold:
            return "medium", "Rischio moderato: tieni monitorato."
        else:
            return "high", "Rischio elevato: segui il piano di sicurezza."


predictor = SeizurePredictor()
