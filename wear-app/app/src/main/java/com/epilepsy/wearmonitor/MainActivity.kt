package com.epilepsy.wearmonitor

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.wear.compose.material.*
import com.epilepsy.wearmonitor.ui.theme.EpilepsyWearTheme
import com.epilepsy.wearmonitor.viewmodel.MonitorViewModel
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : FragmentActivity() { // FragmentActivity necessaria per BiometricPrompt
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
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val context = androidx.compose.ui.platform.LocalContext.current

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 32.dp, start = 16.dp, end = 16.dp, bottom = 32.dp)
    ) {
        item {
            Text(
                text = "🧠 Epiguard",
                style = MaterialTheme.typography.title3,
                color = Color.Cyan
            )
        }

        item { Spacer(modifier = Modifier.height(8.dp)) }

        item {
            Button(
                onClick = { /* TODO: Implementare Intent Google Sign-In */ },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.secondaryButtonColors()
            ) {
                Text("G Login Google")
            }
        }

        item {
            Button(
                onClick = { 
                    showBiometricPrompt(context as FragmentActivity) {
                        viewModel.login("admin", "EpilepSy2025!Secure") // Login rapido biometrico
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.secondaryButtonColors()
            ) {
                Text("☝️ Biometrico")
            }
        }

        item {
            Text("--- oppure ---", style = MaterialTheme.typography.caption2)
        }

        item {
            TextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("User") },
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            TextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Pass") },
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            Button(
                onClick = { viewModel.login(username, password) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Accedi")
            }
        }
    }
}

fun showBiometricPrompt(
    activity: FragmentActivity,
    onSuccess: () -> Unit
) {
    val executor = ContextCompat.getMainExecutor(activity)
    val biometricPrompt = BiometricPrompt(activity, executor,
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                onSuccess()
            }
        })

    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Accesso Epiguard")
        .setSubtitle("Usa l'impronta o il PIN per accedere")
        .setNegativeButtonText("Annulla")
        .build()

    biometricPrompt.authenticate(promptInfo)
}

@Composable
fun MonitoringScreen(viewModel: MonitorViewModel, uiState: MonitorViewModel.UiState) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 32.dp, start = 16.dp, end = 16.dp, bottom = 32.dp)
    ) {
        item {
            val riskColor = when (uiState.riskLevel) {
                "low" -> Color.Green
                "medium" -> Color.Yellow
                "high" -> Color.Red
                else -> Color.Gray
            }
            
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(100.dp)) {
                CircularProgressIndicator(
                    progress = uiState.riskScore,
                    modifier = Modifier.fillMaxSize(),
                    startAngle = 295f,
                    endAngle = 245f,
                    indicatorColor = riskColor,
                    trackColor = Color.DarkGray
                )
                Text(
                    text = "${(uiState.riskScore * 100).toInt()}%",
                    style = MaterialTheme.typography.display2,
                    color = riskColor
                )
            }
        }
        
        item {
            Text(
                text = uiState.message,
                style = MaterialTheme.typography.caption1,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        
        item {
            Row(
                modifier = Modifier.padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Chip(
                    onClick = {},
                    label = { Text("${uiState.heartRate}") },
                    icon = { Text("❤️") },
                    colors = ChipDefaults.secondaryChipColors()
                )
            }
        }

        item {
            Button(
                onClick = { 
                    if (uiState.isMonitoring) viewModel.stopMonitoring()
                    else viewModel.startMonitoring()
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (uiState.isMonitoring) "STOP MONITOR" else "START MONITOR")
            }
        }
    }
}
