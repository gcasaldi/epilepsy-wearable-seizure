package com.epilepsy.wearmonitor

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*
import com.epilepsy.wearmonitor.ui.theme.EpilepsyWearTheme
import com.epilepsy.wearmonitor.viewmodel.MonitorViewModel
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            EpilepsyWearTheme {
                WearApp()
            }
        }
    }
}

@Composable
fun WearApp(
    viewModel: MonitorViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
        when {
            !uiState.isLoggedIn -> LoginScreen(viewModel)
            else -> MonitoringScreen(viewModel, uiState)
        }
    }
}

@Composable
fun LoginScreen(viewModel: MonitorViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "🧠 Epilepsy\nMonitor",
            style = MaterialTheme.typography.title3,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = { viewModel.login() },
            modifier = Modifier.fillMaxWidth(0.8f)
        ) {
            Text("Login")
        }
    }
}

@Composable
fun MonitoringScreen(viewModel: MonitorViewModel, uiState: MonitorViewModel.UiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Risk Circle
        val riskColor = when (uiState.riskLevel) {
            "low" -> androidx.compose.ui.graphics.Color.Green
            "medium" -> androidx.compose.ui.graphics.Color.Yellow
            "high" -> androidx.compose.ui.graphics.Color.Red
            else -> androidx.compose.ui.graphics.Color.Gray
        }
        
        Text(
            text = "${(uiState.riskScore * 100).toInt()}%",
            style = MaterialTheme.typography.display1,
            color = riskColor
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = uiState.message,
            style = MaterialTheme.typography.caption1,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Sensor data
        Column(horizontalAlignment = Alignment.Start) {
            Text("❤️ ${uiState.heartRate} bpm", style = MaterialTheme.typography.caption2)
            Text("📊 HRV: ${uiState.hrv} ms", style = MaterialTheme.typography.caption2)
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Control button
        Button(
            onClick = { 
                if (uiState.isMonitoring) viewModel.stopMonitoring()
                else viewModel.startMonitoring()
            },
            modifier = Modifier.fillMaxWidth(0.8f)
        ) {
            Text(if (uiState.isMonitoring) "Stop" else "Start")
        }
    }
}
