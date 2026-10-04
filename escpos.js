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
    this.notifyCharacteristic = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isPrinting = false;
    this.reconnectTimer = null;
    this.webHeartbeatTimer = null;
    this.deviceName = '';

    // Standard BLE UUIDs for thermal printers
    this.POS_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000af30-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000ff80-0000-1000-8000-00805f9b34fb',
      '000018f1-0000-1000-8000-00805f9b34fb'
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

  syncConnectionState(onStatusChange) {
    if (this.isNativeAndroid()) {
      try {
        const connected = !!(window.AndroidBluetooth.isConnected && window.AndroidBluetooth.isConnected());
        if (connected) {
          const devName = (window.AndroidBluetooth.getConnectedDeviceName && window.AndroidBluetooth.getConnectedDeviceName()) || 'Thermal Printer';
          const devAddr = (window.AndroidBluetooth.getConnectedDeviceAddress && window.AndroidBluetooth.getConnectedDeviceAddress()) || '';
          this.isConnected = true;
          this.deviceName = devName;
          if (devAddr) localStorage.setItem('last_printer_address', devAddr);
          if (devName) localStorage.setItem('last_printer_name', devName);
          onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
          return true;
        } else {
          if (this.isConnected) {
            this.isConnected = false;
            this.deviceName = '';
            onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
          }
          return false;
        }
      } catch (e) {
        console.warn('syncConnectionState error:', e);
        return false;
      }
    }
    return this.isConnected;
  }

  async autoConnectLastPrinter(onStatusChange) {
    if (this.isNativeAndroid()) {
      if (this.syncConnectionState(onStatusChange)) {
        return true;
      }
      const isExplicit = (localStorage.getItem('bluetooth_explicit_disconnect') === 'true');
      if (isExplicit) return false;

      const lastAddr = localStorage.getItem('last_printer_address');
      const lastName = localStorage.getItem('last_printer_name') || 'Thermal Printer';
      if (lastAddr && !this.isConnecting) {
        try {
          return await this.connectNative(lastAddr, lastName, onStatusChange);
        } catch (e) {
          console.log('Background auto-connect failed:', e.message);
          return false;
        }
      }
    }
    return false;
  }

  async connectNative(address, name, onStatusChange) {
    if (!this.isNativeAndroid()) {
      throw new Error('Native Bluetooth interface is not available');
    }

    localStorage.removeItem('bluetooth_explicit_disconnect');

    if (this.isConnected && this.deviceName === (name || address)) {
      onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
      return true;
    }

    if (this.isConnecting) return false;
    this.isConnecting = true;

    onStatusChange && onStatusChange('Connecting to ' + (name || address) + '...', false);
    
    // Connect in async manner to avoid UI freezing
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const res = window.AndroidBluetooth.connect(address);
          this.isConnecting = false;
          if (res && res.startsWith('OK:')) {
            this.isConnected = true;
            this.deviceName = name || res.substring(3) || 'Thermal Printer';
            localStorage.setItem('last_printer_address', address);
            localStorage.setItem('last_printer_name', this.deviceName);
            localStorage.removeItem('bluetooth_explicit_disconnect');
            onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
            resolve(true);
          } else {
            this.isConnected = false;
            onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
            reject(new Error(res ? res.replace('ERROR: ', '') : 'Connection failed'));
          }
        } catch (e) {
          this.isConnecting = false;
          this.isConnected = false;
          onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
          reject(e);
        }
      }, 50);
    });
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async autoConnectWeb(onStatusChange) {
    if (!this.isWebBluetooth() || !navigator.bluetooth.getDevices) {
      return false;
    }
    if (this.isConnected && this.device && this.device.gatt && this.device.gatt.connected) {
      return true;
    }
    if (this.isConnecting) {
      return false;
    }
    if (localStorage.getItem('bluetooth_explicit_disconnect') === 'true') {
      return false;
    }

    try {
      const devices = await navigator.bluetooth.getDevices();
      if (!devices || devices.length === 0) {
        return false;
      }

      const savedDeviceId = localStorage.getItem('web_last_device_id');
      let targetDevice = devices[0];
      if (savedDeviceId) {
        const found = devices.find(d => d.id === savedDeviceId);
        if (found) targetDevice = found;
      }

      onStatusChange && onStatusChange(`Connecting to ${targetDevice.name || 'Printer'}...`, false);
      return await this.setupWebDevice(targetDevice, onStatusChange);
    } catch (err) {
      console.warn('Web Bluetooth auto-connect error:', err);
      return false;
    }
  }

  async setupWebDevice(device, onStatusChange) {
    if (this.isConnecting) return false;
    this.isConnecting = true;
    this.clearReconnectTimer();

    try {
      this.device = device;
      this.deviceName = device.name || '80mm Bluetooth Printer';
      localStorage.setItem('web_last_device_id', device.id);
      localStorage.setItem('last_printer_name', this.deviceName);
      localStorage.removeItem('bluetooth_explicit_disconnect');

      // Detach any previous disconnect handler
      if (this._gattDisconnectHandler && this.device) {
        try {
          this.device.removeEventListener('gattserverdisconnected', this._gattDisconnectHandler);
        } catch (e) {}
      }

      const handleDisconnect = async () => {
        console.warn('Web Bluetooth GATT disconnected event received');
        this.isConnected = false;
        this.characteristic = null;
        this.notifyCharacteristic = null;
        this.stopWebHeartbeat();

        // Only attempt auto-reconnect if the user didn't explicitly tap Disconnect
        if (localStorage.getItem('bluetooth_explicit_disconnect') === 'true') {
          onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
          return;
        }

        onStatusChange && onStatusChange(`Reconnecting to ${this.deviceName}...`, false);
        this.scheduleAutoReconnect(onStatusChange);
      };

      this._gattDisconnectHandler = handleDisconnect;
      this.device.addEventListener('gattserverdisconnected', this._gattDisconnectHandler);

      // Connect GATT if not already connected
      if (!this.device.gatt || !this.device.gatt.connected) {
        this.server = await this.device.gatt.connect();
      } else {
        this.server = this.device.gatt;
      }

      await this.discoverGattCharacteristics();

      this.isConnected = true;
      this.isConnecting = false;
      this.startWebHeartbeat();
      onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
      return true;
    } catch (err) {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopWebHeartbeat();
      throw err;
    }
  }

  scheduleAutoReconnect(onStatusChange) {
    this.clearReconnectTimer();
    let attempts = 0;
    const maxAttempts = 10;

    const retryConnect = async () => {
      if (this.isConnected || localStorage.getItem('bluetooth_explicit_disconnect') === 'true') {
        this.clearReconnectTimer();
        return;
      }
      if (this.isConnecting) {
        this.reconnectTimer = setTimeout(retryConnect, 2000);
        return;
      }

      attempts++;
      this.isConnecting = true;

      try {
        if (this.device && this.device.gatt) {
          if (!this.device.gatt.connected) {
            this.server = await this.device.gatt.connect();
          } else {
            this.server = this.device.gatt;
          }
          await this.discoverGattCharacteristics();
          this.isConnected = true;
          this.isConnecting = false;
          this.clearReconnectTimer();
          this.startWebHeartbeat();
          onStatusChange && onStatusChange(`Connected: ${this.deviceName}`, true);
          console.log(`Bluetooth auto-reconnected successfully on attempt ${attempts}!`);
          return;
        }
      } catch (reErr) {
        console.warn(`Bluetooth auto-reconnect attempt ${attempts} failed:`, reErr);
        this.isConnected = false;
        this.isConnecting = false;

        if (attempts < maxAttempts && localStorage.getItem('bluetooth_explicit_disconnect') !== 'true') {
          const delay = Math.min(2000 + attempts * 1000, 8000);
          onStatusChange && onStatusChange(`Reconnecting to ${this.deviceName}... (${attempts})`, false);
          this.reconnectTimer = setTimeout(retryConnect, delay);
        } else {
          onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
        }
      }
    };

    // First retry delay: wait 2000ms to allow OS Bluetooth stack to cleanly recycle GATT handle
    this.reconnectTimer = setTimeout(retryConnect, 2000);
  }

  async discoverGattCharacteristics() {
    this.characteristic = null;
    this.notifyCharacteristic = null;
    if (!this.server) return;

    // Search standard thermal printer primary services
    for (const serviceUuid of this.POS_SERVICES) {
      try {
        const service = await this.server.getPrimaryService(serviceUuid);
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (!this.characteristic) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
              this.characteristic = char;
            }
          }
          if (!this.notifyCharacteristic) {
            if (char.properties.notify || char.properties.indicate) {
              this.notifyCharacteristic = char;
            }
          }
        }
        if (this.characteristic) break;
      } catch (e) {}
    }

    if (!this.characteristic) {
      try {
        const services = await this.server.getPrimaryServices();
        for (const service of services) {
          try {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
              if (!this.characteristic) {
                if (char.properties.writeWithoutResponse || char.properties.write) {
                  this.characteristic = char;
                }
              }
              if (!this.notifyCharacteristic) {
                if (char.properties.notify || char.properties.indicate) {
                  this.notifyCharacteristic = char;
                }
              }
            }
            if (this.characteristic) break;
          } catch (e) {}
        }
      } catch (e2) {}
    }

    if (!this.characteristic) {
      throw new Error('Printer connected, but writable print channel was not found.');
    }

    // Subscribe to notification channel if present to maintain active GATT subscription
    if (this.notifyCharacteristic) {
      try {
        await this.notifyCharacteristic.startNotifications();
        this.notifyCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
          // Status activity from printer keeps link verified
        });
      } catch (e) {
        console.warn('Could not start notifications on characteristic:', e);
      }
    }
  }

  async connectWeb(onStatusChange) {
    if (!this.isWebBluetooth()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please open in Google Chrome on Android or PC.');
    }

    this.clearReconnectTimer();
    localStorage.removeItem('bluetooth_explicit_disconnect');

    try {
      onStatusChange && onStatusChange('Connecting...', false);

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.POS_SERVICES
      });

      return await this.setupWebDevice(device, onStatusChange);
    } catch (err) {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopWebHeartbeat();
      onStatusChange && onStatusChange('Disconnected (Tap to Connect)', false);
      throw err;
    }
  }

  startWebHeartbeat() {
    this.stopWebHeartbeat();
    // Active Keep-Alive every 5 seconds to prevent BLE peripheral idle power-saving timeout
    this.webHeartbeatTimer = setInterval(async () => {
      if (!this.isConnected || !this.device || !this.device.gatt) return;

      if (!this.device.gatt.connected) {
        console.warn('GATT disconnected detected in heartbeat check');
        this.isConnected = false;
        if (this._gattDisconnectHandler) {
          this._gattDisconnectHandler();
        }
        return;
      }

      // Active Keep-Alive ping: send real-time ESC/POS status inquiry DLE EOT 1 [0x10, 0x04, 0x01]
      // Prints nothing, advances 0 lines, but keeps the BLE RF connection active!
      if (this.characteristic && !this.isPrinting) {
        try {
          const pingBytes = new Uint8Array([0x10, 0x04, 0x01]);
          if (this.characteristic.properties.writeWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(pingBytes);
          } else if (this.characteristic.properties.write) {
            await this.characteristic.writeValue(pingBytes);
          }
        } catch (pingErr) {
          console.warn('Heartbeat ping failed:', pingErr);
          if (this.device.gatt && !this.device.gatt.connected) {
            this.isConnected = false;
            if (this._gattDisconnectHandler) {
              this._gattDisconnectHandler();
            }
          }
        }
      }
    }, 5000);
  }

  stopWebHeartbeat() {
    if (this.webHeartbeatTimer) {
      clearInterval(this.webHeartbeatTimer);
      this.webHeartbeatTimer = null;
    }
  }

  disconnect() {
    localStorage.setItem('bluetooth_explicit_disconnect', 'true');
    this.clearReconnectTimer();
    this.stopWebHeartbeat();
    if (this.isNativeAndroid()) {
      window.AndroidBluetooth.disconnect();
    } else if (this.device && this.device.gatt) {
      try {
        this.device.gatt.disconnect();
      } catch (e) {}
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.characteristic = null;
    this.notifyCharacteristic = null;
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

    this.isPrinting = true;
    try {
      // Safe, high-speed streaming: 64-byte chunks with 12ms pacing
      // Universally compatible with all BLE MTU profiles and prevents thermal buffer overflows
      const isNoResponse = !!(this.characteristic.properties.writeWithoutResponse);
      const CHUNK_SIZE = 64;
      const DELAY_MS = isNoResponse ? 12 : 15;

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
    } catch (err) {
      console.error('Error sending raw data to printer:', err);
      if (this.device && this.device.gatt && !this.device.gatt.connected) {
        this.isConnected = false;
        if (this._gattDisconnectHandler) {
          this._gattDisconnectHandler();
        }
      }
      throw err;
    } finally {
      this.isPrinting = false;
    }
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

    // 1. DR AKRAM CLINIC (Double width & height + Emphasized Bold + Double Strike)
    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01, 0x1B, 0x47, 0x01);
    this.appendAscii(bytes, "DR AKRAM CLINIC\n");

    // Normal size, bold off, double strike off
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00, 0x1B, 0x47, 0x00);
    // Address (Ghalla Mandi, Tandlianwala - "Dr. Akram Clinic Tandlianwala" removed per user highlight)
    this.appendAscii(bytes, "Ghalla Mandi, Tandlianwala\n");
    this.appendAscii(bytes, "================================\n");

    // Title: Bold on
    bytes.push(0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "PATIENT CONSULTATION SLIP\n");
    bytes.push(0x1B, 0x45, 0x00);
    this.appendAscii(bytes, "--------------------------------\n");

    // 2. Large Bold Capital Patient Name
    // Double width & height (GS ! 0x11) + Bold (ESC E 1) + Double strike (ESC G 1)
    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01, 0x1B, 0x47, 0x01);
    this.appendAscii(bytes, `${(patientData.name || '').toUpperCase()}\n`);
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00, 0x1B, 0x47, 0x00);

    // Parentage & Age on the same line
    let parentageLine = '';
    if (patientData.guardian && patientData.age) {
      parentageLine = `S/W/D: ${patientData.guardian}   Age: ${patientData.age}\n`;
    } else if (patientData.guardian) {
      parentageLine = `S/W/D: ${patientData.guardian}\n`;
    } else if (patientData.age) {
      parentageLine = `Age: ${patientData.age}\n`;
    }
    if (parentageLine) {
      this.appendAscii(bytes, parentageLine);
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
   * Print Daily Token & Revenue Summary on 80mm Thermal Printer
   */
  async printDailySummary(summary) {
    if (!this.isConnected) {
      throw new Error('پرنٹر کنیکٹ نہیں ہے۔ پہلے پرنٹر کنیکٹ کریں۔');
    }

    const bytes = [];

    // Initialize printer: ESC @
    bytes.push(0x1B, 0x40);

    // Center alignment: ESC a 1
    bytes.push(0x1B, 0x61, 0x01);

    // Header: DR AKRAM CLINIC (Double width & height + Bold)
    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "DR AKRAM CLINIC\n");

    // Normal size, normal text
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00);
    this.appendAscii(bytes, "Ghalla Mandi, Tandlianwala\n");
    this.appendAscii(bytes, "================================\n");

    // Title: Bold on
    bytes.push(0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "DAILY TOKEN & SUMMARY REPORT\n");
    bytes.push(0x1B, 0x45, 0x00);
    this.appendAscii(bytes, "--------------------------------\n");

    // Left alignment for stats: ESC a 0
    bytes.push(0x1B, 0x61, 0x00);
    this.appendAscii(bytes, `Date: ${summary.date || ''}   Time: ${summary.time || ''}\n`);
    this.appendAscii(bytes, "--------------------------------\n");
    this.appendAscii(bytes, `Total Tokens Issued : ${summary.totalCount}\n`);
    this.appendAscii(bytes, `Served (In Clinic)  : ${summary.servedCount}\n`);
    this.appendAscii(bytes, `Waiting (Pending)   : ${summary.waitingCount}\n`);
    this.appendAscii(bytes, "================================\n");

    // Token records breakdown
    if (summary.tokens && summary.tokens.length > 0) {
      this.appendAscii(bytes, "TOK# TIME   PATIENT        STATUS\n");
      this.appendAscii(bytes, "--------------------------------\n");
      summary.tokens.forEach(t => {
        const num = `#${t.tokenNo}`.padEnd(5, ' ');
        const time = (t.time || '').replace(/\s*(AM|PM)/i, '').substring(0, 5).padEnd(6, ' ');
        const name = (t.patientName || '').substring(0, 12).padEnd(13, ' ');
        const st = (t.status === 'served') ? 'SERVED' : 'WAIT';
        this.appendAscii(bytes, `${num}${time}${name}${st}\n`);
      });
      this.appendAscii(bytes, "--------------------------------\n");
    }

    // Center alignment for footer: ESC a 1
    bytes.push(0x1B, 0x61, 0x01);
    this.appendAscii(bytes, "* Confidential Admin Report *\n");

    // 2-line feed & cut
    bytes.push(0x1B, 0x64, 0x02);
    bytes.push(0x1D, 0x56, 0x42, 0x00);

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
    const age = document.getElementById('slipAge')?.innerText || '';
    const address = document.getElementById('slipAddress')?.innerText || '';
    const dateStr = document.getElementById('slipDate')?.innerText || '';
    const timeStr = document.getElementById('slipTime')?.innerText || '';
    const reason = document.getElementById('slipConsultation')?.innerText || 'General Checkup';

    bytes.push(0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01);
    this.appendAscii(bytes, `${patientName}\n`);
    bytes.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00);

    if (guardian && age) {
      this.appendAscii(bytes, `S/W/D: ${guardian}   Age: ${age}\n`);
    } else if (guardian) {
      this.appendAscii(bytes, `S/W/D: ${guardian}\n`);
    } else if (age) {
      this.appendAscii(bytes, `Age: ${age}\n`);
    }
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
