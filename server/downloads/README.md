# APK Downloads

Place your Flutter APK file in this directory:

## Required File
- `AquaChat.apk` - The Flutter Android application package

## Setup
1. Copy your built APK from `d:\Aqua-chat.apk\aquachat_flutter\build\app\outputs\flutter-apk\app-release.apk`
2. Rename it to `AquaChat.apk` (or update the filename in `/src/hooks/useApkDownload.js`)
3. Place it in this `downloads/` directory

## Usage
The APK will be served at:
- `http://localhost:5000/downloads/AquaChat.apk` (development)
- `https://yourdomain.com/downloads/AquaChat.apk` (production)

Users can then download the APK directly from the "Install App" button in AquaChat.
