# Dr. Akram Clinic - Patient Consultation Slip Generator

A mobile-first, offline-capable consultation slip generator built for 80mm thermal receipt printers at **Dr. Akram Clinic (Tandlianwala)**.

## 📱 Features
- **Mobile Optimized**: Clean, fast, one-handed entry for busy clinic counters.
- **Mandatory Fields**: Patient Name, Parentage (`S/W/D:` default), and Address.
- **Concise 80mm Thermal Receipt**: Real-time live preview matching exact clinic slip format.
- **80mm Web Bluetooth Support**: Direct wireless printing to standard ESC/POS Bluetooth receipt printers.
- **System Print Fallback**: Optimized `@media print` layout for 80mm paper rolls (margin 0, compact cut line).
- **100% Offline (PWA)**: Works without internet or local servers once loaded/installed on mobile.

## 🖨️ How to Print
1. **Bluetooth**: Click **"Bluetooth Printer (Tap to Connect)"** at the top bar and select your 80mm Bluetooth printer.
2. **System Print**: Click **"Issue & Print Slip (پرنٹ پرچی)"** to print directly via Android Print Service, RawBT, or USB/network printer.

## 🌐 Android APK / App Installation
1. Open the hosted URL in Google Chrome on your Android phone.
2. Tap the Chrome menu (`⋮`) and select **"Add to Home screen"** or **"Install App"**.
3. It installs as a full-screen standalone application with the clinic icon on your phone and works 100% offline.
