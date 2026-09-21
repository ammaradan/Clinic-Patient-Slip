/**
 * ESC/POS & Web Bluetooth Printer Driver
 * Specifically built for 80mm Thermal Receipt Printers (POS-80 / Bluetooth / Mobile)
 */

class BluetoothPrinter {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.deviceName = '';

    // Standard BLE UUIDs used by 80mm thermal receipt printers
    this.POS_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb'
    ];
  }

  isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  async connect(onStatusChange) {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported on this browser. Use Chrome on Android or system print.');
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

      for (const serviceUuid of this.POS_SERVICES) {
        try {
          const service = await this.server.getPrimaryService(serviceUuid);
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              break;
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
              if (char.properties.write || char.properties.writeWithoutResponse) {
                this.characteristic = char;
                break;
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

  async printReceiptElement(elementId) {
    if (!this.isConnected || !this.characteristic) {
      return false;
    }

    const element = document.getElementById(elementId);
    if (!element) return false;

    const data = this.generateEscPosFromElement(element);
    await this.sendRawData(data);
    return true;
  }

  async sendRawData(byteArray) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < byteArray.length; i += CHUNK_SIZE) {
      const chunk = byteArray.slice(i, i + CHUNK_SIZE);
      const buffer = new Uint8Array(chunk);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(buffer);
      } else {
        await this.characteristic.writeValue(buffer);
      }
      await new Promise(r => setTimeout(r, 20));
    }
  }

  generateEscPosFromElement(element) {
    const bytes = [];
    
    // ESC @ : Initialize printer
    bytes.push(0x1B, 0x40);
    // ESC t 0 : Standard code page
    bytes.push(0x1B, 0x74, 0x00);
    // Centered: ESC a 1
    bytes.push(0x1B, 0x61, 0x01);

    // Double-Height & Double-Width for Clinic Name
    bytes.push(0x1D, 0x21, 0x11);
    this.appendAscii(bytes, "DR AKRAM CLINIC\n");

    // Reset size: GS ! 0x00
    bytes.push(0x1D, 0x21, 0x00);
    this.appendAscii(bytes, "Dr. Akram Clinic Tandlianwala\n");
    this.appendAscii(bytes, "Ghalla Mandi, Tandlianwala\n");
    this.appendAscii(bytes, "================================\n");

    // Slip Title
    bytes.push(0x1B, 0x45, 0x01); // Bold on
    this.appendAscii(bytes, "PATIENT CONSULTATION SLIP\n");
    bytes.push(0x1B, 0x45, 0x00); // Bold off
    this.appendAscii(bytes, "--------------------------------\n");

    const patientName = document.getElementById('slipPatientName')?.innerText || 'PATIENT';
    const guardian = document.getElementById('slipGuardian')?.innerText || '';
    const address = document.getElementById('slipAddress')?.innerText || '';
    const dateStr = document.getElementById('slipDate')?.innerText || '';
    const timeStr = document.getElementById('slipTime')?.innerText || '';
    const reason = document.getElementById('slipConsultation')?.innerText || 'General Checkup';

    // Patient Name (Large)
    bytes.push(0x1D, 0x21, 0x11); // Double size
    bytes.push(0x1B, 0x45, 0x01); // Bold
    this.appendAscii(bytes, `${patientName}\n`);
    bytes.push(0x1D, 0x21, 0x00); // Normal size
    bytes.push(0x1B, 0x45, 0x00); // Bold off

    if (guardian) {
      this.appendAscii(bytes, `S/W/D: ${guardian}\n`);
    }
    if (address) {
      this.appendAscii(bytes, `Address: ${address}\n`);
    }

    this.appendAscii(bytes, `${dateStr.replace('📅', '')}  ${timeStr.replace('🕒', '')}\n`);
    this.appendAscii(bytes, "--------------------------------\n");

    // Consultation detail
    bytes.push(0x1B, 0x61, 0x00); // Left align
    this.appendAscii(bytes, `Consultation : ${reason}\n`);
    this.appendAscii(bytes, "--------------------------------\n");

    // Centered Footer (Concise)
    bytes.push(0x1B, 0x61, 0x01);
    bytes.push(0x1B, 0x45, 0x01);
    this.appendAscii(bytes, "* Shukriya *\n");
    bytes.push(0x1B, 0x45, 0x00);

    // Feed paper and cut (GS V 66 0)
    bytes.push(0x0A, 0x0A, 0x0A);
    bytes.push(0x1D, 0x56, 0x42, 0x00);

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
