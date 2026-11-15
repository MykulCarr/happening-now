import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing reads a git-ignored keystore.properties (storeFile,
// storePassword, keyAlias, keyPassword). Without it only debug builds work.
val keystore = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "net.happeningnow.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.happeningnow.widget"
        minSdk = 28
        targetSdk = 35
        versionCode = 3
        versionName = "1.0"
    }

    signingConfigs {
        if (keystore.containsKey("storeFile")) create("release") {
            storeFile = file(keystore.getProperty("storeFile"))
            storePassword = keystore.getProperty("storePassword")
            keyAlias = keystore.getProperty("keyAlias")
            keyPassword = keystore.getProperty("keyPassword")
        }
    }

    buildTypes {
        // The debug build is the beta: its own app id, name and link scheme,
        // so it installs beside the real one and the two never share settings.
        debug {
            applicationIdSuffix = ".debug"
            resValue("string", "app_name", "HN Widget (beta)")
            resValue("string", "scheme", "hnwidgetdebug")
            manifestPlaceholders["scheme"] = "hnwidgetdebug"
        }
        release {
            // R8 strips unused code (mostly the Kotlin library): a smaller
            // download. Classes named in the manifest are kept automatically.
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            resValue("string", "app_name", "Happening Now Widget")
            resValue("string", "scheme", "hnwidget")
            manifestPlaceholders["scheme"] = "hnwidget"
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
