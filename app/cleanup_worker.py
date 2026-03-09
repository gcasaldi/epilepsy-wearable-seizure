
import logging
import time
from datetime import datetime, timedelta
from app.security_db import SessionLocal, BiometricRecord, SeizureEvent, AuditLog

# Configurazione logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("cleanup.log"),
        logging.StreamHandler()
    ]
)

RETENTION_PERIOD_DAYS = 5 * 365  # 5 anni (Rolling Retention)

def cleanup_old_data():
    """
    Esegue la pulizia progressiva dei dati più vecchi di 5 anni.
    Implementa la Data Retention Policy: cancellazione giornaliera rolling.
    """
    logging.info("Inizio job di cleanup Data Retention (5 anni rolling).")
    
    db = SessionLocal()
    cutoff_date = datetime.utcnow() - timedelta(days=RETENTION_PERIOD_DAYS)
    
    total_deleted = 0
    
    tables_to_clean = [
        (BiometricRecord, "BiometricRecord"),
        (SeizureEvent, "SeizureEvent"),
        (AuditLog, "AuditLog")
    ]
    
    try:
        for model, name in tables_to_clean:
            # Cancellazione progressiva
            deleted = db.query(model).filter(model.timestamp < cutoff_date).delete() if hasattr(model, 'timestamp') else \
                      db.query(model).filter(model.created_at < cutoff_date).delete()
            
            db.commit()
            total_deleted += deleted
            logging.info(f"Puliti {deleted} record obsoleti dalla tabella {name}.")
            
    except Exception as e:
        logging.error(f"Errore durante il cleanup: {e}")
        db.rollback()
    finally:
        db.close()
        
    logging.info(f"Job di cleanup terminato. Record totali rimossi: {total_deleted}.")

if __name__ == "__main__":
    # Esegue il cleanup una volta se lanciato come script
    cleanup_old_data()
