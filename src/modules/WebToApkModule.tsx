import { AlertTriangle, CheckCircle2, Download, Layers, RefreshCw, Smartphone } from 'lucide-react';
import JSZip from 'jszip';
import { useMemo, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { saveProjectToWorkspace } from '../lib/workspaceService.ts';
import type { GeneratedFileItem } from '../shared/titanTypes.ts';

type WebToApkMode = 'webview' | 'capacitor' | 'twa-pwa' | 'hybrid-native';

export function WebToApkModule() {
  const { user, capabilities, notify } = useTitan();
  const [mode, setMode] = useState<WebToApkMode>('webview');
  const [appName, setAppName] = useState('TITAN CODE');
  const [packageId, setPackageId] = useState('com.titancode.app');
  const [targetUrl, setTargetUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'https://titancode.app',
  );
  const [versionName, setVersionName] = useState('1.0.0');
  const [versionCode, setVersionCode] = useState(1);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape' | 'unspecified'>('portrait');
  const [splashColor, setSplashColor] = useState('#070709');
  const [sha256Fingerprint, setSha256Fingerprint] = useState(
    '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
  );
  const [permissions, setPermissions] = useState<string[]>([
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
  ]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const togglePerm = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const pkgPath = packageId.replace(/\./g, '/');

  const generatedFiles: GeneratedFileItem[] = useMemo(() => {
    const permXml = permissions
      .map((p) => `    <uses-permission android:name="${p}" />`)
      .join('\n');

    const workflowYml = `name: Build Android APK
on:
  workflow_dispatch:
  push:
    branches: [ main ]
jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
      - name: Build Debug APK
        run: ./gradlew assembleDebug || gradle assembleDebug
      - name: Build Release APK & AAB (requires keystore secrets in CI)
        run: ./gradlew assembleRelease bundleRelease || gradle assembleRelease bundleRelease
      - uses: actions/upload-artifact@v4
        with:
          name: ${packageId}-android-artifacts
          path: |
            app/build/outputs/apk/**/*.apk
            app/build/outputs/bundle/**/*.aab
`;

    const gradleSettings = `pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}
rootProject.name = "${appName.replace(/"/g, '')}"
include(":app")
`;

    const rootGradle = `plugins {
  id("com.android.application") version "8.6.0" apply false
  id("org.jetbrains.kotlin.android") version "2.0.20" apply false
}
`;

    const stringsXml = `<resources>
  <string name="app_name">${appName}</string>
  <string name="target_url">${targetUrl}</string>
  <string name="offline_title">Conexão indisponível</string>
  <string name="retry_label">Tentar novamente</string>
</resources>
`;

    const stylesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="Theme.TitanApp" parent="android:Theme.Material.NoActionBar">
    <item name="android:windowBackground">@color/titan_splash_bg</item>
    <item name="android:statusBarColor">@color/titan_splash_bg</item>
    <item name="android:navigationBarColor">@color/titan_splash_bg</item>
  </style>
  <color name="titan_splash_bg">${splashColor}</color>
</resources>
`;

    if (mode === 'capacitor') {
      const capConfig = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${packageId}',
  appName: '${appName.replace(/'/g, '')}',
  webDir: 'dist',
  server: {
    url: '${targetUrl}',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '${splashColor}',
      showSpinner: false,
    },
  },
};

export default config;
`;
      const capPkg = JSON.stringify(
        {
          name: packageId.replace(/\./g, '-'),
          version: versionName,
          private: true,
          scripts: {
            'cap:sync': 'npx cap sync android',
            'cap:build:debug': 'cd android && ./gradlew assembleDebug',
            'cap:build:aab': 'cd android && ./gradlew bundleRelease',
          },
          dependencies: {
            '@capacitor/core': '^6.2.0',
            '@capacitor/android': '^6.2.0',
            '@capacitor/splash-screen': '^6.0.3',
          },
          devDependencies: {
            '@capacitor/cli': '^6.2.0',
          },
        },
        null,
        2,
      );
      return [
        { path: 'capacitor.config.ts', language: 'TypeScript', fileKind: 'Config', content: capConfig },
        { path: 'package.json', language: 'JSON', fileKind: 'Config', content: capPkg },
        { path: 'android/settings.gradle.kts', language: 'Kotlin', fileKind: 'Config', content: gradleSettings },
        { path: 'android/build.gradle.kts', language: 'Kotlin', fileKind: 'Config', content: rootGradle },
        {
          path: 'android/app/src/main/AndroidManifest.xml',
          language: 'XML',
          fileKind: 'Manifest',
          content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permXml}
  <application
    android:allowBackup="true"
    android:label="@string/app_name"
    android:theme="@style/Theme.TitanApp">
    <activity
      android:name="com.getcapacitor.BridgeActivity"
      android:screenOrientation="${orientation}"
      android:exported="true"
      android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`,
        },
        { path: 'android/app/src/main/res/values/styles.xml', language: 'XML', fileKind: 'Manifest', content: stylesXml },
        { path: 'android/app/src/main/res/values/strings.xml', language: 'XML', fileKind: 'Manifest', content: stringsXml },
        { path: '.github/workflows/android-apk.yml', language: 'YAML', fileKind: 'Config', content: workflowYml },
      ];
    }

    if (mode === 'twa-pwa') {
      const host = targetUrl.replace(/^https?:\/\//i, '').split('/')[0];
      return [
        {
          path: 'settings.gradle.kts',
          language: 'Kotlin',
          fileKind: 'Config',
          content: gradleSettings,
        },
        {
          path: 'build.gradle.kts',
          language: 'Kotlin',
          fileKind: 'Config',
          content: rootGradle,
        },
        {
          path: 'app/build.gradle.kts',
          language: 'Kotlin',
          fileKind: 'Config',
          content: `plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "${packageId}"
  compileSdk = 35
  defaultConfig {
    applicationId = "${packageId}"
    minSdk = 24
    targetSdk = 35
    versionCode = ${versionCode}
    versionName = "${versionName}"
  }
}

dependencies {
  implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
  implementation("androidx.browser:browser:1.8.0")
}
`,
        },
        {
          path: 'app/src/main/AndroidManifest.xml',
          language: 'XML',
          fileKind: 'Manifest',
          content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permXml}
  <application
    android:allowBackup="true"
    android:label="@string/app_name"
    android:theme="@android:style/Theme.Translucent.NoTitleBar">
    <meta-data
      android:name="asset_statements"
      android:resource="@string/asset_statements" />
    <activity
      android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
      android:exported="true">
      <meta-data
        android:name="android.support.customtabs.trusted.DEFAULT_URL"
        android:value="${targetUrl}" />
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="${host}" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`,
        },
        {
          path: 'app/src/main/res/values/strings.xml',
          language: 'XML',
          fileKind: 'Manifest',
          content: `<resources>
  <string name="app_name">${appName}</string>
  <string name="asset_statements">[{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": { "namespace": "web", "site": "${targetUrl}" }
  }]</string>
</resources>
`,
        },
        {
          path: 'public/.well-known/assetlinks.json',
          language: 'JSON',
          fileKind: 'Manifest',
          content: JSON.stringify(
            [
              {
                relation: ['delegate_permission/common.handle_all_urls'],
                target: {
                  namespace: 'android_app',
                  package_name: packageId,
                  sha256_cert_fingerprints: [sha256Fingerprint],
                },
              },
            ],
            null,
            2,
          ),
        },
        {
          path: '.github/workflows/android-apk.yml',
          language: 'YAML',
          fileKind: 'Config',
          content: workflowYml,
        },
      ];
    }

    // Mode 1 (WebView) & Mode 3 (Hybrid/Native Bridge)
    const mainActivityKt =
      mode === 'hybrid-native'
        ? `package ${packageId}

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import android.widget.Toast

class TitanNativeBridge(private val activity: ComponentActivity) {
  @JavascriptInterface
  fun getPlatformInfo(): String = "TITAN-Android-${versionName}"

  @JavascriptInterface
  fun showNativeToast(msg: String) {
    activity.runOnUiThread {
      Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
    }
  }
}

class MainActivity : ComponentActivity() {
  private lateinit var webView: WebView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    webView = WebView(this)
    setContentView(webView)

    with(webView.settings) {
      javaScriptEnabled = true
      domStorageEnabled = true
      databaseEnabled = true
      allowFileAccess = true
      mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
      userAgentString = "$userAgentString TitanCodeHybrid/${versionName}"
    }
    webView.addJavascriptInterface(TitanNativeBridge(this), "TitanAndroid")
    webView.webChromeClient = WebChromeClient()
    webView.webViewClient = object : WebViewClient() {
      override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
        if (req.isForMainFrame) {
          view.loadData("<html><body style='background:#070709;color:#fff;font-family:sans-serif;padding:32px'><h2>Sem conexão</h2><button onclick='location.reload()'>Tentar novamente</button></body></html>", "text/html", "UTF-8")
        }
      }
    }
    webView.loadUrl("${targetUrl}")
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (webView.canGoBack()) webView.goBack() else finish()
      }
    })
  }
}
`
        : `package ${packageId}

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : ComponentActivity() {
  private lateinit var webView: WebView
  private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

  private val filePickerLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
  ) { result ->
    val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
    fileUploadCallback?.onReceiveValue(uris)
    fileUploadCallback = null
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    webView = WebView(this)
    setContentView(webView)

    CookieManager.getInstance().setAcceptCookie(true)
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

    with(webView.settings) {
      javaScriptEnabled = true
      domStorageEnabled = true
      databaseEnabled = true
      allowFileAccess = true
      useWideViewPort = true
      loadWithOverviewMode = true
      cacheMode = WebSettings.LOAD_DEFAULT
      userAgentString = "$userAgentString TitanWebView/${versionName}"
    }

    webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
      val request = DownloadManager.Request(Uri.parse(url)).apply {
        setMimeType(mimeType)
        addRequestHeader("User-Agent", userAgent)
        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "titan-download")
      }
      val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
      dm.enqueue(request)
    }

    webView.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(
        view: WebView,
        callback: ValueCallback<Array<Uri>>,
        params: FileChooserParams
      ): Boolean {
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = callback
        return try {
          filePickerLauncher.launch(params.createIntent())
          true
        } catch (_: Exception) {
          fileUploadCallback = null
          false
        }
      }
    }

    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val host = uri.host ?: ""
        return if (host.contains("accounts.google.com") || uri.scheme == "http" || uri.scheme == "https") {
          false
        } else {
          startActivity(Intent(Intent.ACTION_VIEW, uri))
          true
        }
      }

      override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
        if (req.isForMainFrame) {
          val offlineHtml = """
            <html><body style='background:#070709;color:#e4e4e7;font-family:sans-serif;padding:36px;text-align:center'>
            <h2 style='color:#dc2626'>TITAN CODE Offline</h2>
            <p>Verifique sua conexão e tente novamente.</p>
            <button onclick="location.href='${targetUrl}'" style='background:#dc2626;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-weight:bold'>Recarregar</button>
            </body></html>
          """.trimIndent()
          view.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null)
        }
      }
    }

    webView.loadUrl("${targetUrl}")

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (webView.canGoBack()) webView.goBack() else finish()
      }
    })
  }
}
`;

    return [
      { path: 'settings.gradle.kts', language: 'Kotlin', fileKind: 'Config', content: gradleSettings },
      { path: 'build.gradle.kts', language: 'Kotlin', fileKind: 'Config', content: rootGradle },
      {
        path: 'app/build.gradle.kts',
        language: 'Kotlin',
        fileKind: 'Config',
        content: `plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "${packageId}"
  compileSdk = 35
  defaultConfig {
    applicationId = "${packageId}"
    minSdk = 24
    targetSdk = 35
    versionCode = ${versionCode}
    versionName = "${versionName}"
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.activity:activity-ktx:1.9.3")
}
`,
      },
      {
        path: 'app/src/main/AndroidManifest.xml',
        language: 'XML',
        fileKind: 'Manifest',
        content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permXml}
  <application
    android:allowBackup="true"
    android:usesCleartextTraffic="false"
    android:label="@string/app_name"
    android:theme="@style/Theme.TitanApp">
    <activity
      android:name=".MainActivity"
      android:screenOrientation="${orientation}"
      android:exported="true"
      android:configChanges="orientation|screenSize|keyboardHidden">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`,
      },
      {
        path: `app/src/main/java/${pkgPath}/MainActivity.kt`,
        language: 'Kotlin',
        fileKind: 'Source',
        content: mainActivityKt,
      },
      { path: 'app/src/main/res/values/styles.xml', language: 'XML', fileKind: 'Manifest', content: stylesXml },
      { path: 'app/src/main/res/values/strings.xml', language: 'XML', fileKind: 'Manifest', content: stringsXml },
      { path: '.github/workflows/android-apk.yml', language: 'YAML', fileKind: 'Config', content: workflowYml },
    ];
  }, [mode, appName, packageId, pkgPath, targetUrl, versionName, versionCode, orientation, splashColor, sha256Fingerprint, permissions]);

  const handleExportZip = async () => {
    const zip = new JSZip();
    for (const f of generatedFiles) {
      zip.file(f.path, f.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${packageId}-${mode}-android.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('success', 'Pacote Android exportado', `${generatedFiles.length} arquivos exportados com workflow CI Gradle.`);
  };

  const handleSaveToWorkspace = async () => {
    if (!user) return;
    await saveProjectToWorkspace({
      ownerId: user.uid,
      name: `${appName} (${mode})`,
      description: `Projeto Android ${mode} para ${targetUrl} (${packageId})`,
      projectType: 'android',
      language: 'Kotlin',
      environment: 'Android',
      status: 'COMPLETED',
      files: generatedFiles,
    });
    notify('success', 'Salvo no Workspace', `Projeto ${packageId} salvo no Firestore.`);
  };

  const activeFile = generatedFiles[selectedIdx] || generatedFiles[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Web-to-APK Builder
          </h1>
          <p className="text-sm text-zinc-400">
            Empacote o sistema Web em App Android WebView, PWA/TWA (Trusted Web Activity) ou Híbrido Nativo com GitHub Actions CI.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSaveToWorkspace()}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg cursor-pointer"
          >
            Salvar no Workspace
          </button>
          <button
            type="button"
            onClick={() => void handleExportZip()}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar ZIP + CI Gradle</span>
          </button>
        </div>
      </div>

      {/* Honest SDK status banner */}
      <div className="p-4 rounded-xl bg-[#0E0E13] border border-amber-800/50 flex items-start gap-3">
        {capabilities?.androidSdkAvailable && capabilities?.gradleAvailable ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="text-xs text-zinc-300 space-y-1">
          <p className="font-semibold text-white">
            Status do Compilador Binário APK neste servidor:{' '}
            {capabilities?.androidSdkAvailable ? 'Android SDK & Gradle Disponíveis' : 'Android SDK / Gradle não instalados no container'}
          </p>
          <p className="text-zinc-400">
            Todos os arquivos Kotlin, XML, Manifest, TWA <code>assetlinks.json</code>, Gradle e pipeline <code>.github/workflows/android-apk.yml</code> são gerados integralmente para compilação imediata no Android Studio ou GitHub Actions — nenhum arquivo binário <code>.apk</code> é falsificado.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Config Panel */}
        <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-red-500" />
            <span>Modo & Metadados</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {[
              { id: 'webview' as WebToApkMode, title: 'Modo 1 — WebView App', sub: 'Sessão/cookies, uploads, downloads, tela offline' },
              { id: 'capacitor' as WebToApkMode, title: 'Modo 2 — Capacitor Android', sub: 'capacitor.config.ts + BridgeActivity + SplashScreen + AAB' },
              { id: 'twa-pwa' as WebToApkMode, title: 'Modo 3 — PWA / TWA', sub: 'Trusted Web Activity + assetlinks.json + Manifest' },
              { id: 'hybrid-native' as WebToApkMode, title: 'Modo 4 — App Híbrido', sub: 'Bridge JS <-> Kotlin nativa + WebView' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setSelectedIdx(0);
                }}
                className={`p-3 rounded-lg border text-left cursor-pointer ${
                  mode === m.id
                    ? 'bg-red-600/15 border-red-600/60 text-white'
                    : 'bg-[#09090D] border-zinc-800 text-zinc-300'
                }`}
              >
                <div className="text-xs font-semibold">{m.title}</div>
                <div className="text-[11px] text-zinc-500">{m.sub}</div>
              </button>
            ))}
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Nome do App</label>
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Package ID</label>
              <input
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">URL Base da Aplicação Web</label>
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Version Name</label>
                <input
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Version Code</label>
                <input
                  type="number"
                  value={versionCode}
                  onChange={(e) => setVersionCode(Number(e.target.value) || 1)}
                  className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Orientação</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape' | 'unspecified')}
                  className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                  <option value="unspecified">Automática</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Splash Background</label>
                <input
                  value={splashColor}
                  onChange={(e) => setSplashColor(e.target.value)}
                  className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
                />
              </div>
            </div>

            {mode === 'twa-pwa' && (
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">SHA-256 Keystore Fingerprint (TWA)</label>
                <input
                  value={sha256Fingerprint}
                  onChange={(e) => setSha256Fingerprint(e.target.value)}
                  className="w-full bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-[11px] font-mono text-white"
                />
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] text-zinc-400">Permissões AndroidManifest</div>
              {['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'].map((perm) => (
                <label key={perm} className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm)}
                    onChange={() => togglePerm(perm)}
                    className="accent-red-600"
                  />
                  <span className="font-mono">{perm.replace('android.permission.', '')}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* File Viewer + OTA vs Rebuild Rules */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {generatedFiles.map((f, idx) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`px-2.5 py-1 rounded text-xs font-mono cursor-pointer ${
                    selectedIdx === idx
                      ? 'bg-red-600/20 text-white border border-red-600/50'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {f.path}
                </button>
              ))}
            </div>
            {activeFile && (
              <pre className="bg-[#09090D] border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-200 overflow-x-auto max-h-96">
                {activeFile.content}
              </pre>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualização Instantânea via Web (Sem Novo APK)</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Alterações em interface React, rotas de API, provedores de IA, validadores e regras de negócio publicadas na URL Web refletem automaticamente no WebView/TWA após recarregar.
              </p>
            </div>
            <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <Layers className="w-3.5 h-3.5" />
                <span>Alterações que Exigem Novo APK/AAB</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Mudanças em Package ID (<code>{packageId}</code>), nome do app, ícone nativo, permissões do Manifest, versão do código nativo ou URL base embutida exigem nova compilação Gradle.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
