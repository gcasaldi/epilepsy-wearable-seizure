package com.epilepsy.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.epilepsy.mobile.data.PhoneAlertPayload
import com.epilepsy.mobile.data.PhoneTelemetryPayload
import com.epilepsy.mobile.data.TelemetryStore
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val store = TelemetryStore(this)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    MobileDashboard(store)
                }
            }
        }
    }
}

@Composable
private fun MobileDashboard(store: TelemetryStore) {
    var telemetry by remember { mutableStateOf(store.getTelemetry()) }
    var alert by remember { mutableStateOf(store.getAlert()) }

    LaunchedEffect(Unit) {
        while (true) {
            telemetry = store.getTelemetry()
            alert = store.getAlert()
            delay(1000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top
    ) {
        Text("Epiguard Mobile", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Ricezione dati da smartwatch in tempo reale")

        Spacer(modifier = Modifier.height(16.dp))
        AlertCard(alert)

        Spacer(modifier = Modifier.height(16.dp))
        TelemetryCard(telemetry)
    }
}

@Composable
private fun AlertCard(alert: PhoneAlertPayload?) {
    Text("Ultimo Alert", style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(6.dp))
    if (alert == null) {
        Text("Nessun alert ricevuto")
        return
    }

    Text("Titolo: ${alert.title}")
    Text("Messaggio: ${alert.message}")
    Text("Rischio: ${alert.riskLevel} (${(alert.riskScore * 100).toInt()}%)")
    Text("Quando: ${formatTime(alert.timestamp)}")
}

@Composable
private fun TelemetryCard(telemetry: PhoneTelemetryPayload?) {
    Text("Ultima Telemetria", style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(6.dp))
    if (telemetry == null) {
        Text("In attesa di dati dal watch")
        return
    }

    Text("Heart Rate: ${telemetry.heartRate} bpm")
    Text("HRV: ${"%.1f".format(telemetry.hrv)} ms")
    Text("SpO2: ${telemetry.spo2?.let { "%.1f".format(it) } ?: "--"}%")
    Text("Respirazione: ${telemetry.respiratoryRate?.let { "%.1f".format(it) } ?: "--"}")
    Text("Passi: ${telemetry.steps ?: 0}")
    Text("Rischio: ${telemetry.riskLevel} (${(telemetry.riskScore * 100).toInt()}%)")
    Text("Aggiornato: ${formatTime(telemetry.timestamp)}")
}

private fun formatTime(ts: Long): String {
    val sdf = SimpleDateFormat("dd/MM HH:mm:ss", Locale.getDefault())
    return sdf.format(Date(ts))
}
