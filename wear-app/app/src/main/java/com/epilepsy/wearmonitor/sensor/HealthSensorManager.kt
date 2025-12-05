package com.epilepsy.wearmonitor.sensor

import android.content.Context
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.PassiveListenerConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class HealthSensorManager(private val context: Context) {
    
    private val healthClient = HealthServices.getClient(context)
    private val passiveMonitoringClient = healthClient.passiveMonitoringClient
    
    private val _heartRate = MutableStateFlow(0)
    val heartRate: StateFlow<Int> = _heartRate
    
    private val _hrv = MutableStateFlow(0f)
    val hrv: StateFlow<Float> = _hrv
    
    suspend fun startMonitoring(onDataReceived: (heartRate: Int, hrv: Float) -> Unit) {
        val dataTypes = setOf(
            DataType.HEART_RATE_BPM,
            // HRV non sempre disponibile, dipende dal dispositivo
        )
        
        val config = PassiveListenerConfig.builder()
            .setDataTypes(dataTypes)
            .build()
        
        // Nota: Questo è un esempio semplificato
        // In produzione serve un PassiveListenerService più complesso
        
        // Simulazione per testing (da rimuovere in produzione)
        simulateSensorData(onDataReceived)
    }
    
    fun stopMonitoring() {
        // Stop passive monitoring
    }
    
    // Simulazione dati per testing
    private fun simulateSensorData(onDataReceived: (Int, Float) -> Unit) {
        // In produzione, questi dati vengono dai sensori reali
        val heartRate = (60..90).random()
        val hrv = (40f..70f).random()
        
        _heartRate.value = heartRate
        _hrv.value = hrv
        
        onDataReceived(heartRate, hrv)
    }
}
