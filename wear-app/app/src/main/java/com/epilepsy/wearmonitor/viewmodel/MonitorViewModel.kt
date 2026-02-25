package com.epilepsy.wearmonitor.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.epilepsy.wearmonitor.alert.AlertManager
import com.epilepsy.wearmonitor.data.ApiClient
import com.epilepsy.wearmonitor.data.PhoneBridge
import com.epilepsy.wearmonitor.data.PhysiologicalData
import com.epilepsy.wearmonitor.sensor.HealthSensorManager
import com.epilepsy.wearmonitor.sensor.TelemetrySnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MonitorViewModel(application: Application) : AndroidViewModel(application) {

    private val apiClient = ApiClient()
    private val sensorManager = HealthSensorManager()
    private val phoneBridge = PhoneBridge(application)
    private val alertManager = AlertManager(application)

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private var lastHighRiskAlertAt = 0L

    data class UiState(
        val isLoggedIn: Boolean = false,
        val isMonitoring: Boolean = false,
        val riskScore: Float = 0f,
        val riskLevel: String = "unknown",
        val message: String = "In attesa...",
        val heartRate: Int = 0,
        val hrv: Float = 0f,
        val movement: Float = 0f,
        val sleepHours: Float = 7.5f,
        val medicationTaken: Boolean = true,
        val spo2: Float? = null,
        val respiratoryRate: Float? = null,
        val skinTemperature: Float? = null,
        val steps: Int? = null,
        val stressIndex: Float? = null,
        val caloriesBurned: Float? = null,
        val fallDetected: Boolean = false,
        val lastError: String? = null
    )

    init {
        viewModelScope.launch {
            val token = apiClient.getStoredToken(getApplication())
            if (token != null) {
                _uiState.value = _uiState.value.copy(isLoggedIn = true)
            }
        }
    }

    fun login() {
        viewModelScope.launch {
            try {
                val success = apiClient.login(
                    getApplication(),
                    "admin",
                    "EpilepSy2025!Secure"
                )
                _uiState.value = _uiState.value.copy(
                    isLoggedIn = success,
                    lastError = if (success) null else "Login non riuscito"
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(lastError = e.message)
            }
        }
    }

    fun startMonitoring() {
        _uiState.value = _uiState.value.copy(isMonitoring = true, lastError = null)

        sensorManager.startMonitoring(viewModelScope) { snapshot ->
            updateUiFromSnapshot(snapshot)
            sendPrediction(snapshot)
        }
    }

    fun stopMonitoring() {
        _uiState.value = _uiState.value.copy(isMonitoring = false)
        sensorManager.stopMonitoring()
    }

    private fun updateUiFromSnapshot(snapshot: TelemetrySnapshot) {
        _uiState.value = _uiState.value.copy(
            heartRate = snapshot.heartRate,
            hrv = snapshot.hrv,
            movement = snapshot.movement,
            sleepHours = snapshot.sleepHours,
            medicationTaken = snapshot.medicationTaken,
            spo2 = snapshot.spo2,
            respiratoryRate = snapshot.respiratoryRate,
            skinTemperature = snapshot.skinTemperature,
            steps = snapshot.steps,
            stressIndex = snapshot.stressIndex,
            caloriesBurned = snapshot.caloriesBurned,
            fallDetected = snapshot.fallDetected
        )
    }

    private fun sendPrediction(snapshot: TelemetrySnapshot) {
        viewModelScope.launch {
            try {
                val data = PhysiologicalData(
                    hrv = snapshot.hrv,
                    heart_rate = snapshot.heartRate,
                    movement = snapshot.movement,
                    sleep_hours = snapshot.sleepHours,
                    medication_taken = snapshot.medicationTaken,
                    spo2 = snapshot.spo2,
                    respiratory_rate = snapshot.respiratoryRate,
                    skin_temperature = snapshot.skinTemperature,
                    steps = snapshot.steps,
                    stress_index = snapshot.stressIndex,
                    calories_burned = snapshot.caloriesBurned,
                    fall_detected = snapshot.fallDetected
                )

                val prediction = apiClient.predict(getApplication(), data)

                _uiState.value = _uiState.value.copy(
                    riskScore = prediction.risk_score,
                    riskLevel = prediction.risk_level,
                    message = prediction.message,
                    lastError = null
                )

                phoneBridge.sendTelemetry(
                    snapshot = snapshot,
                    riskLevel = prediction.risk_level,
                    riskScore = prediction.risk_score
                )

                val now = System.currentTimeMillis()
                val isHighRisk = prediction.risk_level == "high"
                val canAlert = now - lastHighRiskAlertAt > 60_000

                if (isHighRisk && canAlert) {
                    lastHighRiskAlertAt = now
                    alertManager.triggerHighRiskAlert()
                    phoneBridge.sendAlert(
                        title = "Rischio crisi elevato",
                        message = prediction.message,
                        riskLevel = prediction.risk_level,
                        riskScore = prediction.risk_score
                    )
                }

            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(lastError = e.message ?: "Errore monitoraggio")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopMonitoring()
    }
}