-- Epiguard core storage schema (MVP)
-- Focus: single source of truth for mobile + web + risk engine

CREATE TABLE IF NOT EXISTS raw_health_data (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    source VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32) NOT NULL,
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(255) NOT NULL,
    quality_flag VARCHAR(32) DEFAULT 'ok'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_health_data_idempotency
ON raw_health_data (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS ix_raw_health_data_user_metric_time
ON raw_health_data (user_id, metric, measured_at DESC);

CREATE TABLE IF NOT EXISTS feature_store (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    feature_name VARCHAR(128) NOT NULL,
    feature_value DOUBLE PRECISION NOT NULL,
    window VARCHAR(32) NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    model_input_version VARCHAR(32) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_feature_store_user_time
ON feature_store (user_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS risk_scores (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    risk_level VARCHAR(16) NOT NULL,
    risk_score DOUBLE PRECISION NOT NULL,
    horizon VARCHAR(8) NOT NULL,
    factors JSONB,
    model_version VARCHAR(32) NOT NULL,
    scored_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_risk_scores_user_horizon_time
ON risk_scores (user_id, horizon, scored_at DESC);

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16),
    notes TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_events_user_type_time
ON events (user_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    scope JSONB NOT NULL,
    status VARCHAR(16) NOT NULL,
    version INTEGER NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_consents_user_status
ON consents (user_id, status);

CREATE TABLE IF NOT EXISTS device_registry (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    app_version VARCHAR(32),
    os_version VARCHAR(32),
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_registry_user_device
ON device_registry (user_id, device_id);
