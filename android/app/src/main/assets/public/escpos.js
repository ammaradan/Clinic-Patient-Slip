/**
 * ESC/POS & Web Bluetooth Printer Driver with Raster Bitmap (Graphics) Support
 * Enables 100% accurate printing of Urdu Nastaliq text, borders, and symbols
 * on ANY 80mm / 58mm Thermal Bluetooth Receipt Printer.
 */

class BluetoothPrinter {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.deviceName = '';

    // Standard BLE UUIDs used by 80mm/58mm thermal receipt printers
    this.POS_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb', // Very common POS service
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART
      '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 BLE module
      '0000ff00-0000-1000-8000-00805f9b34fb'
    ];
  }

  isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  async connect(onStatusChange) {
    if (!this.isSupported()) {
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

  /**
   * Convert an HTML Element into an ESC/POS monochrome raster bitmap image.
   * This prints the EXACT visual slip (Urdu, English, borders, dates) on ANY thermal printer!
   */
  async printReceiptElement(elementId, targetWidthDots = 576) {
    if (!this.isConnected || !this.characteristic) {
      return false;
    }

    const element = document.getElementById(elementId);
    if (!element) return false;

    // Check if html2canvas is available
    if (typeof html2canvas !== 'function') {
      console.warn('html2canvas not found, fallback to text mode');
      const data = this.generateEscPosFromElement(element);
      await this.sendRawData(data);
      return true;
    }

    // Capture element to canvas
    const renderedCanvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true
    });

    // Scale canvas to exact printer width (576 dots for 80mm printers, 72 bytes/line)
    const scaledWidth = targetWidthDots;
    const scaledHeight = Math.round((renderedCanvas.height / renderedCanvas.width) * scaledWidth);

    const printCanvas = document.createElement('canvas');
    printCanvas.width = scaledWidth;
    printCanvas.height = scaledHeight;
    const ctx = printCanvas.getContext('2d');
    
    // Fill pure white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, scaledWidth, scaledHeight);
    
    // Draw high quality rendered image
    ctx.drawImage(renderedCanvas, 0, 0, scaledWidth, scaledHeight);

    const imgData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
    const rasterCommands = this.canvasToEscPosRaster(imgData, scaledWidth, scaledHeight);

    // Send chunks over Bluetooth
    await this.sendRawData(rasterCommands);
    return true;
  }

  /**
   * Convert ImageData into ESC/POS GS v 0 raster bit image commands
   * Sliced into 24-dot strips to prevent printer buffer overflow.
   */
  canvasToEscPosRaster(imgData, width, height) {
    const bytes = [];
    const pixels = imgData.data;

    // Initialize printer: ESC @
    bytes.push(0x1B, 0x40);
    // Align center: ESC a 1
    bytes.push(0x1B, 0x61, 0x01);

    const widthInBytes = Math.ceil(width / 8);
    const SLICE_HEIGHT = 24; // 24 dots per vertical slice

    for (let y = 0; y < height; y += SLICE_HEIGHT) {
      const sliceH = Math.min(SLICE_HEIGHT, height - y);

      // GS v 0 0 xL xH yL yH
      const xL = widthInBytes & 0xFF;
      const xH = (widthInBytes >> 8) & 0xFF;
      const yL = sliceH & 0xFF;
      const yH = (sliceH >> 8) & 0xFF;

      bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

      for (let row = 0; row < sliceH; row++) {
        const currentY = y + row;
        for (let col = 0; col < widthInBytes; col++) {
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
              // Black dot if dark enough
              if (a > 128 && luminance < 185) {
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
