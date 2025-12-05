package com.epilepsy.wearmonitor.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.epilepsy.wearmonitor.data.ApiClient
import com.epilepsy.wearmonitor.data.PhysiologicalData
import com.epilepsy.wearmonitor.sensor.HealthSensorManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MonitorViewModel(application: Application) : AndroidViewModel(application) {
    
    private val apiClient = ApiClient()
    private val sensorManager = HealthSensorManager(application)
    
    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()
    
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
        val medicationTaken: Boolean = true
    )
    
    init {
        // Auto-login con credenziali salvate
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
                if (success) {
                    _uiState.value = _uiState.value.copy(isLoggedIn = true)
                }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }
    
    fun startMonitoring() {
        _uiState.value = _uiState.value.copy(isMonitoring = true)
        
        viewModelScope.launch {
            sensorManager.startMonitoring { heartRate, hrv ->
                _uiState.value = _uiState.value.copy(
                    heartRate = heartRate,
                    hrv = hrv
                )
                
                // Invia dati al backend
                sendPrediction()
            }
        }
    }
    
    fun stopMonitoring() {
        _uiState.value = _uiState.value.copy(isMonitoring = false)
        sensorManager.stopMonitoring()
    }
    
    private fun sendPrediction() {
        viewModelScope.launch {
            try {
                val data = PhysiologicalData(
                    hrv = _uiState.value.hrv,
                    heart_rate = _uiState.value.heartRate,
                    movement = _uiState.value.movement,
                    sleep_hours = _uiState.value.sleepHours,
                    medication_taken = _uiState.value.medicationTaken
                )
                
                val prediction = apiClient.predict(getApplication(), data)
                
                _uiState.value = _uiState.value.copy(
                    riskScore = prediction.risk_score,
                    riskLevel = prediction.risk_level,
                    message = prediction.message
                )
                
                // Vibra se rischio alto
                if (prediction.risk_level == "high") {
                    // TODO: Trigger vibration
                }
                
            } catch (e: Exception) {
                // Handle error
            }
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        stopMonitoring()
    }
}
