# Baho IMS Android app

The Android app is the web app in `../frontend`, packaged with Capacitor.
Screens and the offline logic (device cache, outbox, sync) live in
`../frontend/src` (`lib/api.ts`, `lib/offline/`), so the web and the app always
have the same modules. This folder only holds the Android project.

```
mobile/
├── capacitor.config.ts   app id rw.baho.ims, name, web build = ../frontend/dist
├── package.json          Capacitor + plugin versions (same exact versions as ../frontend)
└── android/              native Android project (Gradle)
```

Build an APK (Windows, see the main README for the tools):

```powershell
npm install
npm run prepare-android
cd android
$env:JAVA_HOME="F:\baho-tools\jdk21"; $env:ANDROID_HOME="F:\baho-tools\android-sdk"
.\gradlew.bat assembleRelease   # app\build\outputs\apk\release\app-release.apk
```

When upgrading Capacitor or a plugin, change the version in **both**
`package.json` files (here and in `../frontend`).
