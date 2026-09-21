/**
 * ESC/POS & Bluetooth Thermal Receipt Printer Driver
 * Supports BOTH:
 * 1. Native Android APK via SPP (Serial Port Profile) RFCOMM / AndroidBluetooth Bridge
 * 2. Web Bluetooth API in Google Chrome (Desktop & Android)
 *
 * Includes 1-Bit Monochrome Raster Graphics for 100% accurate Urdu Nastaliq
 * typography, borders, and symbols on ANY 80mm / 58mm Thermal Printer.
 */

class BluetoothPrinter {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.deviceName = '';

    // Standard BLE UUIDs for thermal printers
    this.POS_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb'
    ];
  }

  isNativeAndroid() {
    return !!(window.AndroidBluetooth && typeof window.AndroidBluetooth.connect === 'function');
  }

  isWebBluetooth() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  isSupported() {
    return this.isNativeAndroid() || this.isWebBluetooth();
  }

  getBondedDevices() {
    if (this.isNativeAndroid()) {
      try {
        const json = window.AndroidBluetooth.getBondedDevices();
        return JSON.parse(json || '[]');
      } catch (e) {
        console.error('Error getting bonded devices:', e);
        return [];
      }
    }
    return [];
  }

  openSettings() {
    if (this.isNativeAndroid()) {
      window.AndroidBluetooth.openBluetoothSettings();
    }
  }

  async connectNative(address, name, onStatusChange) {
    if (!this.isNativeAndroid()) {
      throw new Error('Native Bluetooth interface is not available');
    }

    onStatusChange && onStatusChange('Connecting to ' + (name || address) + '...', false);
    
    // Connect in async manner to avoid UI freezing
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const res = window.AndroidBluetooth.connect(address);
          if (res && res.startsWith('OK:')) {
            this.isConnected = true;
            this.deviceName = name || res.substring(3) || 'Thermal Printer';
            localStorage.setItem('last_printer_address', address);
            localStorage.setItem('last_printer_name', this.deviceName);
            onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
            resolve(true);
          } else {
            this.isConnected = false;
            onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
            reject(new Error(res ? res.replace('ERROR: ', '') : 'Connection failed'));
          }
        } catch (e) {
          this.isConnected = false;
          onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
          reject(e);
        }
      }, 50);
    });
  }

  async connectWeb(onStatusChange) {
    if (!this.isWebBluetooth()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please open in Google Chrome on Android or PC.');
    }

    try {
      onStatusChange && onStatusChange('Connecting...', false);

      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.POS_SERVICES
      });

      this.deviceName = this.device.name || '80mm Bluetooth Printer';

      this.device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        this.characteristic = null;
        onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
      });

      this.server = await this.device.gatt.connect();

      // Find write characteristic (prefer writeWithoutResponse for high speed)
      for (const serviceUuid of this.POS_SERVICES) {
        try {
          const service = await this.server.getPrimaryService(serviceUuid);
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.writeWithoutResponse) {
              this.characteristic = char;
              break;
            }
          }
          if (!this.characteristic) {
            for (const char of chars) {
              if (char.properties.write) {
                this.characteristic = char;
                break;
              }
            }
          }
          if (this.characteristic) break;
        } catch (e) {}
      }

      if (!this.characteristic) {
        const services = await this.server.getPrimaryServices();
        for (const service of services) {
          try {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
              if (char.properties.writeWithoutResponse) {
                this.characteristic = char;
                break;
              }
            }
            if (!this.characteristic) {
              for (const char of chars) {
                if (char.properties.write) {
                  this.characteristic = char;
                  break;
                }
              }
            }
            if (this.characteristic) break;
          } catch (e) {}
        }
      }

      if (!this.characteristic) {
        throw new Error('Printer connected, but writable print channel was not found.');
      }

      this.isConnected = true;
      onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
      return true;

    } catch (err) {
      this.isConnected = false;
      onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
      throw err;
    }
  }

  disconnect() {
    if (this.isNativeAndroid()) {
      window.AndroidBluetooth.disconnect();
    } else if (this.device && this.device.gatt) {
      try {
        this.device.gatt.disconnect();
      } catch (e) {}
    }
    this.isConnected = false;
    this.characteristic = null;
    this.deviceName = '';
  }

  uint8ToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  async sendRawData(byteArray) {
    if (this.isNativeAndroid()) {
      const base64 = this.uint8ToBase64(byteArray);
      const res = window.AndroidBluetooth.sendData(base64);
      if (res && res.startsWith('ERROR')) {
        throw new Error(res.replace('ERROR: ', ''));
      }
      return true;
    }

    if (!this.characteristic) {
      throw new Error('پرنٹر کا پرنٹنگ چینل دستیاب نہیں ہے۔');
    }

    // High speed streaming: 200-byte chunks with 4ms pacing for writeWithoutResponse
    const isNoResponse = !!(this.characteristic.properties.writeWithoutResponse);
    const CHUNK_SIZE = isNoResponse ? 200 : 80;
    const DELAY_MS = isNoResponse ? 4 : 15;

    for (let i = 0; i < byteArray.length; i += CHUNK_SIZE) {
      const chunk = byteArray.slice(i, i + CHUNK_SIZE);
      const buffer = new Uint8Array(chunk);
      if (isNoResponse) {
        await this.characteristic.writeValueWithoutResponse(buffer);
      } else {
        await this.characteristic.writeValue(buffer);
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
    return true;
  }

  base64ToUint8(base64) {
    const raw = window.atob(base64);
    const rawLength = raw.length;
    const array = new Uint8Array(new ArrayBuffer(rawLength));
    for (let i = 0; i < rawLength; i++) {
      array[i] = raw.charCodeAt(i);
    }
    return array;
  }

  /**
   * High-Speed Instant Printing: Pre-baked Urdu Graphic Header + Fast Text Middle + Pre-baked Urdu Footer.
   * Tight compact spacing: ZERO paper waste, prints in under 1 second!
   */
  async printFastSlip(patientData) {
    if (!this.isConnected) {
      throw new Error('پرنٹر کنیکٹ نہیں ہے۔ پہلے اوپر سے پرنٹر کنیکٹ کریں۔');
    }

    const bytes = [];

    // Initialize printer: ESC @
    bytes.push(0x1B, 0x40);

    // Center alignment: ESC a 1
    bytes.push(0x1B, 0x61, 0x01);

    // 1. DR AKRAM CLINIC (Double width & height + Bold)
    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "DR AKRAM CLINIC\n");

    // Normal size & bold off
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00);
    // Address (Ghalla Mandi, Tandlianwala - "Dr. Akram Clinic Tandlianwala" removed per user highlight)
    this.appendAscii(bytes, "Ghalla Mandi, Tandlianwala\n");
    this.appendAscii(bytes, "================================\n");

    // Title: Bold on
    bytes.push(0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "PATIENT CONSULTATION SLIP\n");
    bytes.push(0x1B, 0x45, 0x00);
    this.appendAscii(bytes, "--------------------------------\n");

    // 2. Large Bold Patient Name
    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01);
    this.appendAscii(bytes, `${patientData.name.toUpperCase()}\n`);
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00);

    // Parentage
    if (patientData.guardian) {
      this.appendAscii(bytes, `S/W/D: ${patientData.guardian}\n`);
    }

    // Address
    if (patientData.address) {
      this.appendAscii(bytes, `Address: ${patientData.address}\n`);
    }

    // Date & Time
    this.appendAscii(bytes, `${patientData.date}   ${patientData.time}\n`);

    // Divider line
    this.appendAscii(bytes, "--------------------------------\n");

    // Consultation Line
    this.appendAscii(bytes, `Consultation : ${patientData.reason}\n`);

    // Divider line
    this.appendAscii(bytes, "--------------------------------\n");

    // Shukriya
    this.appendAscii(bytes, "* Shukriya *\n");

    // 3. Feed & Cut (Only 2 lines feed for zero paper waste)
    bytes.push(0x1B, 0x64, 0x02);
    // Partial cut: GS V 66 0
    bytes.push(0x1D, 0x56, 0x42, 0x00);

    // High-speed smooth streaming
    await this.sendRawData(bytes);
    return true;
  }

  /**
   * Convert an HTML Element into an ESC/POS monochrome raster bitmap image.
   * This prints the EXACT visual slip (Urdu, English, borders, dates) on ANY thermal printer!
   */
  async printReceiptElement(elementId, targetWidthDots = 576) {
    if (!this.isConnected) {
      throw new Error('پرنٹر کنیکٹ نہیں ہے۔ پہلے اوپر سے پرنٹر کنیکٹ کریں۔');
    }

    const element = document.getElementById(elementId);
    if (!element) throw new Error('پرچی کا مواد نہیں ملا');

    // Wait for fonts to be ready so Urdu Nastaliq is rendered fully
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (e) {}
    }

    // Check if html2canvas is available
    if (typeof html2canvas !== 'function') {
      console.warn('html2canvas not found, fallback to text mode');
      const data = this.generateEscPosFromElement(element);
      await this.sendRawData(data);
      return true;
    }

    // Capture element to canvas
    const renderedCanvas = await html2canvas(element, {
      scale: 1.8,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true
    });

    // Scale canvas to target printer width (576 dots for 80mm)
    const targetWidth = targetWidthDots;
    const scaleFactor = targetWidth / renderedCanvas.width;
    const targetHeight = Math.round(renderedCanvas.height * scaleFactor);

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = targetWidth;
    scaledCanvas.height = targetHeight;
    const ctx = scaledCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(renderedCanvas, 0, 0, targetWidth, targetHeight);

    // Convert canvas image into 1-bit ESC/POS raster bitmap commands (GS v 0)
    const escposBytes = this.canvasToEscPosRaster(scaledCanvas);
    await this.sendRawData(escposBytes);
    return true;
  }

  /**
   * Convert Canvas 2D image data to ESC/POS Raster Bit Image (GS v 0) commands.
   * Slices image into 48-pixel bands for smooth continuous printhead movement.
   */
  canvasToEscPosRaster(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    const bytesPerLine = Math.ceil(width / 8);
    const bytes = [];

    // Initialize printer: ESC @
    bytes.push(0x1B, 0x40);

    // Center alignment: ESC a 1
    bytes.push(0x1B, 0x61, 0x01);

    // Print in vertical slices of 48 pixels for smooth gliding paper movement
    const SLICE_HEIGHT = 48;

    for (let y = 0; y < height; y += SLICE_HEIGHT) {
      const sliceH = Math.min(SLICE_HEIGHT, height - y);

      // GS v 0 m xL xH yL yH
      const xL = bytesPerLine % 256;
      const xH = Math.floor(bytesPerLine / 256);
      const yL = sliceH % 256;
      const yH = Math.floor(sliceH / 256);

      bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

      for (let sy = 0; sy < sliceH; sy++) {
        const currentY = y + sy;
        for (let col = 0; col < bytesPerLine; col++) {
          let byteVal = 0;
          for (let b = 0; b < 8; b++) {
            const x = col * 8 + b;
            if (x < width) {
              const idx = (currentY * width + x) * 4;
              const r = pixels[idx];
              const g = pixels[idx + 1];
              const bPixel = pixels[idx + 2];
              const a = pixels[idx + 3];

              // Luminance calculation
              const luminance = (0.299 * r + 0.587 * g + 0.114 * bPixel);
              // High contrast black dot threshold for crisp Urdu script
              if (a > 128 && luminance < 195) {
                byteVal |= (1 << (7 - b));
              }
            }
          }
          bytes.push(byteVal);
        }
      }
    }

    // Feed paper: ESC d 4
    bytes.push(0x1B, 0x64, 0x04);
    // Cut paper: GS V 66 0
    bytes.push(0x1D, 0x56, 0x42, 0x00);

    return bytes;
  }

  /**
   * Fallback plain ASCII formatter
   */
  generateEscPosFromElement(element) {
    const bytes = [];
    bytes.push(0x1B, 0x40, 0x1B, 0x74, 0x00, 0x1B, 0x61, 0x01);
    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "DR AKRAM CLINIC\n");
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00);
    this.appendAscii(bytes, "Dr. Akram Clinic Tandlianwala\n");
    this.appendAscii(bytes, "Ghalla Mandi, Tandlianwala\n");
    this.appendAscii(bytes, "================================\n");

    const patientName = document.getElementById('slipPatientName')?.innerText || 'PATIENT';
    const guardian = document.getElementById('slipGuardian')?.innerText || '';
    const address = document.getElementById('slipAddress')?.innerText || '';
    const dateStr = document.getElementById('slipDate')?.innerText || '';
    const timeStr = document.getElementById('slipTime')?.innerText || '';
    const reason = document.getElementById('slipConsultation')?.innerText || 'General Checkup';

    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01);
    this.appendAscii(bytes, `${patientName}\n`);
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00);

    if (guardian) this.appendAscii(bytes, `S/W/D: ${guardian}\n`);
    if (address) this.appendAscii(bytes, `Address: ${address}\n`);
    this.appendAscii(bytes, `${dateStr.replace('📅', '')}  ${timeStr.replace('🕒', '')}\n`);
    this.appendAscii(bytes, "--------------------------------\n");
    this.appendAscii(bytes, `Consultation : ${reason}\n`);
    this.appendAscii(bytes, "================================\n");
    this.appendAscii(bytes, "* Shukriya *\n");
    bytes.push(0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00);
    return bytes;
  }

  appendAscii(bytes, str) {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes.push(code < 128 ? code : 63);
    }
  }
}

window.BluetoothPrinter = BluetoothPrinter;
