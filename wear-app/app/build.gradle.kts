plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // Namespace per il codice generato (R.java, ecc.)
    namespace = "com.epiguard.wearmonitor"
    compileSdk = 34

    defaultConfig {
        // ID UNICO SUL PLAY STORE - Non può essere cambiato dopo la pubblicazione
        applicationId = "com.epiguard.wearmonitor"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        
        val apiBaseUrl = (project.findProperty("API_BASE_URL") as String?) ?: "http://10.0.2.2:8010/"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            // Abilitiamo l'ottimizzazione e l'offuscamento per la sicurezza
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug") // Temporaneo finché non creiamo il keystore
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = "17"
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.4"
    }
    
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.wear:wear:1.3.0")
    implementation("androidx.wear.compose:compose-material:1.3.0")
    implementation("androidx.wear.compose:compose-foundation:1.3.0")
    implementation("androidx.wear.compose:compose-navigation:1.3.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.health:health-services-client:1.0.0-rc01")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("androidx.datastore:datastore-preferences:1.0.0")
}
