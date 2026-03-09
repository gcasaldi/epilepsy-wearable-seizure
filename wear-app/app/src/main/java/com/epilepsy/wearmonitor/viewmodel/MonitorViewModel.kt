package com.epilepsy.wearmonitor.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.epilepsy.wearmonitor.data.ApiClient
import com.epilepsy.wearmonitor.data.PhysiologicalData
import com.epilepsy.wearmonitor.service.MonitoringService
import com.epilepsy.wearmonitor.sensor.HealthSensorManager
import com.epilepsy.wearmonitor.sensor.TelemetrySnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

class MonitorViewModel(application: Application) : AndroidViewModel(application) {

    private val apiClient = ApiClient()
    private val sensorManager = HealthSensorManager(application)

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    // ... (LocalPrediction and UiState data classes remain the same)
    private data class LocalPrediction(
        val riskScore: Float,
        val riskLevel: String,
        val message: String
    )

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

        sensorManager.snapshotState
            .onEach { snapshot ->
                updateUiFromSnapshot(snapshot)
                sendPrediction(snapshot)
            }
            .launchIn(viewModelScope)
    }

    fun login(username: String, password: String) {
        viewModelScope.launch {
            try {
                val context = getApplication<Application>()
                val success = apiClient.login(
                    context,
                    username,
                    password
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
        sensorManager.startMonitoring(viewModelScope)
        MonitoringService.start(getApplication())
    }

    fun stopMonitoring() {
        _uiState.value = _uiState.value.copy(isMonitoring = false)
        sensorManager.stopMonitoring()
        MonitoringService.stop(getApplication())
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

            val remotePrediction = runCatching {
                apiClient.predict(getApplication(), data)
            }.getOrNull()

            val effectivePrediction = if (remotePrediction != null) {
                LocalPrediction(
                    riskScore = remotePrediction.risk_score,
                    riskLevel = remotePrediction.risk_level,
                    message = remotePrediction.message
                )
            } else {
                val localPrediction = computeLocalPrediction(snapshot)
                localPrediction.copy(
                    message = "${localPrediction.message} (fallback locale)"
                )
            }

            _uiState.value = _uiState.value.copy(
                riskScore = effectivePrediction.riskScore,
                riskLevel = effectivePrediction.riskLevel,
                message = effectivePrediction.message,
                lastError = if (remotePrediction == null) "Backend non raggiungibile: uso stima locale" else null
            )

            // Alert e invio telemetria in background sono gestiti dal MonitoringService.
        }
    }

    private fun computeLocalPrediction(snapshot: TelemetrySnapshot): LocalPrediction {
        val hrvRisk = ((70f - snapshot.hrv) / 70f).coerceIn(0f, 1f)
        val heartRateRisk = ((snapshot.heartRate - 85f) / 65f).coerceIn(0f, 1f)
        val movementRisk = ((snapshot.movement - 180f) / 220f).coerceIn(0f, 1f)
        val sleepRisk = ((7.5f - snapshot.sleepHours) / 7.5f).coerceIn(0f, 1f)
        val medicationRisk = if (snapshot.medicationTaken) 0f else 1f
        val spo2Risk = snapshot.spo2?.let { ((95f - it) / 45f).coerceIn(0f, 1f) } ?: 0f
        val stressRisk = (snapshot.stressIndex ?: 0f).coerceIn(0f, 1f)
        val fallRisk = if (snapshot.fallDetected) 1f else 0f

        val score = (
            (0.22f * hrvRisk) +
            (0.18f * heartRateRisk) +
            (0.12f * movementRisk) +
            (0.18f * sleepRisk) +
            (0.12f * medicationRisk) +
            (0.08f * spo2Risk) +
            (0.05f * stressRisk) +
            (0.05f * fallRisk)
        ).coerceIn(0f, 1f)

        val level = when {
            score >= 0.67f -> "high"
            score >= 0.34f -> "medium"
            else -> "low"
        }

        val message = when (level) {
            "high" -> "Rischio elevato: attiva il piano di sicurezza"
            "medium" -> "Rischio moderato: resta monitorato"
            else -> "Rischio basso: parametri stabili"
        }

        return LocalPrediction(score, level, message)
    }

    override fun onCleared() {
        super.onCleared()
        stopMonitoring()
    }
}
