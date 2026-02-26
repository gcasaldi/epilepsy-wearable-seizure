
package com.epilepsy.wearmonitor.sensor

import android.content.Context
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.SampleDataPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TelemetrySnapshot(
    val heartRate: Int,
    val hrv: Float,
    val movement: Float,
    val sleepHours: Float,
    val medicationTaken: Boolean,
    val spo2: Float?,
    val respiratoryRate: Float?,
    val skinTemperature: Float?,
    val steps: Int?,
    val stressIndex: Float?,
    val caloriesBurned: Float?,
    val fallDetected: Boolean
)

class HealthSensorManager(context: Context) {

    private val measureClient = HealthServices.getClient(context).measureClient
    private var monitoringJob: Job? = null

    private val _snapshotState = MutableStateFlow(createEmptySnapshot())
    val snapshotState: StateFlow<TelemetrySnapshot> = _snapshotState.asStateFlow()

    private val measureCallback = object : MeasureCallback {
        override fun onAvailabilityChanged(dataType: DataType, availability: Availability) {
            // Handle sensor availability changes if needed
        }

        override fun onDataReceived(data: List<SampleDataPoint<*>>) {
            var updatedSnapshot = _snapshotState.value
            data.forEach { dataPoint ->
                when (dataPoint.dataType) {
                    DataType.HEART_RATE_BPM -> {
                        val hr = dataPoint.value.toInt()
                        updatedSnapshot = updatedSnapshot.copy(heartRate = hr)
                    }
                    DataType.HEART_RATE_VARIABILITY_RMSSD -> {
                        val hrv = dataPoint.value.toFloat()
                        updatedSnapshot = updatedSnapshot.copy(hrv = hrv)
                    }
                    // Add other data types as needed
                    else -> {}
                }
            }
            _snapshotState.value = updatedSnapshot
        }
    }

    fun startMonitoring(scope: CoroutineScope) {
        monitoringJob?.cancel()
        monitoringJob = scope.launch {
            measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, measureCallback)
            measureClient.registerMeasureCallback(DataType.HEART_RATE_VARIABILITY_RMSSD, measureCallback)
            // Register other data types
        }
    }

    fun stopMonitoring() {
        monitoringJob?.cancel()
        monitoringJob = null
        measureClient.unregisterMeasureCallback(DataType.HEART_RATE_BPM, measureCallback)
        measureClient.unregisterMeasureCallback(DataType.HEART_RATE_VARIABILITY_RMSSD, measureCallback)
        // Unregister other data types
    }

    private fun createEmptySnapshot() = TelemetrySnapshot(
        heartRate = 0,
        hrv = 0f,
        movement = 0f,
        sleepHours = 0f,
        medicationTaken = true,
        spo2 = null,
        respiratoryRate = null,
        skinTemperature = null,
        steps = null,
        stressIndex = null,
        caloriesBurned = null,
        fallDetected = false
    )
}
