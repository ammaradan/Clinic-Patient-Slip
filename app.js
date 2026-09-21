/**
 * Dr. Akram Clinic - Patient Consultation Slip Application Logic
 * Clean, fast, mobile-first without token numbers or clutter
 */

document.addEventListener('DOMContentLoaded', () => {
  let lastPrintedData = null;
  const btPrinter = new BluetoothPrinter();

  // --- DOM Elements ---
  const patientNameInput = document.getElementById('patientName');
  const guardianNameInput = document.getElementById('guardianName');
  const patientAddressInput = document.getElementById('patientAddress');
  const consultationReasonInput = document.getElementById('consultationReason');
  const btnPrintSlip = document.getElementById('btnPrintSlip');
  const btnReprintLast = document.getElementById('btnReprintLast');
  const btnClearForm = document.getElementById('btnClearForm');
  const btnConnectBt = document.getElementById('btnConnectBt');
  const btStatusText = document.getElementById('btStatusText');
  const toast = document.getElementById('toast');

  // Preview elements
  const slipPatientName = document.getElementById('slipPatientName');
  const slipGuardian = document.getElementById('slipGuardian');
  const slipAddress = document.getElementById('slipAddress');
  const slipDate = document.getElementById('slipDate');
  const slipTime = document.getElementById('slipTime');
  const slipConsultation = document.getElementById('slipConsultation');
  const tagButtons = document.querySelectorAll('.tag-btn');

  // --- Real-time Clock for Slip ---
  function updateDateTime() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, '0');

    slipDate.textContent = `📅 ${yyyy}-${mm}-${dd}`;
    slipTime.textContent = `🕒 ${formattedHours}:${minutes} ${ampm}`;
  }

  // --- Live Preview Synchronization ---
  function syncLivePreview() {
    const nameVal = patientNameInput.value.trim();
    slipPatientName.textContent = nameVal ? nameVal.toUpperCase() : 'AAAA';

    const guardianVal = guardianNameInput.value.trim();
    slipGuardian.textContent = guardianVal || 'Muhammad Ali';

    const addrVal = patientAddressInput.value.trim();
    slipAddress.textContent = addrVal || 'Ghalla Mandi, Tandlianwala';

    const reasonVal = consultationReasonInput.value.trim();
    slipConsultation.textContent = reasonVal || 'General Checkup';
  }

  // --- Toast Notifications ---
  let toastTimeout = null;
  function showToast(msg, duration = 3000) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // --- Quick Symptoms Tags ---
  tagButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tagButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      consultationReasonInput.value = btn.getAttribute('data-val');
      syncLivePreview();
    });
  });

  // --- Form Input Listeners ---
  [patientNameInput, guardianNameInput, patientAddressInput, consultationReasonInput].forEach(inp => {
    inp.addEventListener('input', syncLivePreview);
  });

  // --- Clear Form ---
  btnClearForm.addEventListener('click', () => {
    patientNameInput.value = '';
    guardianNameInput.value = '';
    patientAddressInput.value = '';
    consultationReasonInput.value = 'General Checkup';
    tagButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-val') === 'General Checkup'));
    syncLivePreview();
    patientNameInput.focus();
    showToast('فارم صاف کر دیا گیا');
  });

  // --- Bluetooth Device Modal Elements (Native Android) ---
  const btDeviceModal = document.getElementById('btDeviceModal');
  const btModalBackdrop = document.getElementById('btModalBackdrop');
  const btModalClose = document.getElementById('btModalClose');
  const btDeviceList = document.getElementById('btDeviceList');
  const btNoDevices = document.getElementById('btNoDevices');
  const btDeviceLoading = document.getElementById('btDeviceLoading');
  const btnOpenBtSettings = document.getElementById('btnOpenBtSettings');

  function openBtModal() {
    if (btDeviceModal) {
      btDeviceModal.classList.remove('hidden');
      refreshBondedDevices();
    }
  }

  function closeBtModal() {
    if (btDeviceModal) {
      btDeviceModal.classList.add('hidden');
      if (btDeviceLoading) btDeviceLoading.classList.add('hidden');
    }
  }

  if (btModalBackdrop) btModalBackdrop.addEventListener('click', closeBtModal);
  if (btModalClose) btModalClose.addEventListener('click', closeBtModal);
  if (btnOpenBtSettings) {
    btnOpenBtSettings.addEventListener('click', () => {
      btPrinter.openSettings();
    });
  }

  function refreshBondedDevices() {
    if (!btDeviceList) return;
    btDeviceList.innerHTML = '';
    if (btDeviceLoading) btDeviceLoading.classList.add('hidden');

    const devices = btPrinter.getBondedDevices();
    if (!devices || devices.length === 0) {
      if (btNoDevices) btNoDevices.classList.remove('hidden');
      return;
    }

    if (btNoDevices) btNoDevices.classList.add('hidden');
    const lastAddr = localStorage.getItem('last_printer_address');

    devices.forEach(dev => {
      const item = document.createElement('div');
      item.className = 'bt-device-item';
      const isLast = (dev.address === lastAddr);

      item.innerHTML = `
        <div class="bt-device-info">
          <span style="font-size: 20px;">🖨️</span>
          <div>
            <div class="bt-device-name">${dev.name}</div>
            <div class="bt-device-address">${dev.address}</div>
          </div>
        </div>
        ${isLast ? '<span class="bt-device-badge">آخری استعمال شدہ</span>' : '<span style="font-size: 11px; color:#0f3d32; font-weight:700;">کنیکٹ کریں ➜</span>'}
      `;

      item.addEventListener('click', async () => {
        if (btDeviceLoading) btDeviceLoading.classList.remove('hidden');
        try {
          await btPrinter.connectNative(dev.address, dev.name, (status, isConnected) => {
            btStatusText.textContent = `Bluetooth: ${status}`;
            btnConnectBt.className = `bt-status-btn ${isConnected ? 'connected' : 'disconnected'}`;
          });
          closeBtModal();
          showToast(`پرنٹر ${dev.name} کامیابی سے کنیکٹ ہو گیا!`);
        } catch (err) {
          if (btDeviceLoading) btDeviceLoading.classList.add('hidden');
          showToast(`کنکشن ناکام: ${err.message}`);
        }
      });

      btDeviceList.appendChild(item);
    });
  }

  // --- Bluetooth Connection Button Handling ---
  btnConnectBt.addEventListener('click', async () => {
    if (btPrinter.isConnected) {
      if (confirm('Bluetooth پرنٹر پہلے سے کنیکٹ ہے، کیا ڈسکنیکٹ کرنا چاہتے ہیں؟')) {
        btPrinter.disconnect();
        btStatusText.textContent = 'Bluetooth Printer: Disconnected (Tap to Connect)';
        btnConnectBt.className = 'bt-status-btn disconnected';
        showToast('پرنٹر ڈسکنیکٹ کر دیا گیا');
      }
      return;
    }

    // 1. If running inside Android APK with Native Bluetooth Bridge
    if (btPrinter.isNativeAndroid()) {
      openBtModal();
      return;
    }

    // 2. If running inside Chrome browser with Web Bluetooth
    if (btPrinter.isWebBluetooth()) {
      try {
        await btPrinter.connectWeb((status, isConnected) => {
          btStatusText.textContent = `Bluetooth: ${status}`;
          btnConnectBt.className = `bt-status-btn ${isConnected ? 'connected' : 'disconnected'}`;
        });
        showToast('پرنٹر کنیکٹ ہو گیا! Ready to print.');
      } catch (err) {
        console.warn('Bluetooth connect error:', err);
        if (err.name !== 'NotFoundError') {
          showToast('Bluetooth Connection Failed: ' + err.message);
        }
      }
      return;
    }

    // 3. Fallback if neither is available
    showToast('اس براؤزر میں بلوٹوتھ سپورٹ نہیں ہے۔ آپ ایپ یا گوگل کروم استعمال کریں۔');
  });

  // --- Issue & Print Action ---
  async function handlePrint(isReprint = false) {
    let name = patientNameInput.value.trim();
    let guardian = guardianNameInput.value.trim();
    let address = patientAddressInput.value.trim();
    const reason = consultationReasonInput.value.trim() || 'General Checkup';

    if (isReprint && lastPrintedData) {
      name = lastPrintedData.name;
      guardian = lastPrintedData.guardian;
      address = lastPrintedData.address;
      slipPatientName.textContent = name.toUpperCase();
      slipGuardian.textContent = guardian;
      slipAddress.textContent = address;
      slipConsultation.textContent = lastPrintedData.reason;
    } else {
      // Validate mandatory fields specified in user audio
      if (!name) {
        showToast('⚠️ برائے مہربانی مریض کا نام درج کریں (Patient Name required)');
        patientNameInput.focus();
        return;
      }
      if (!guardian) {
        showToast('⚠️ برائے مہربانی S/W/D درج کریں (Parentage required)');
        guardianNameInput.focus();
        return;
      }
      if (!address) {
        showToast('⚠️ برائے مہربانی پتہ / رہائش درج کریں (Address required)');
        patientAddressInput.focus();
        return;
      }

      // Update date/time right before print
      updateDateTime();

      // Save for reprint
      lastPrintedData = {
        name,
        guardian,
        address,
        reason
      };
    }

    // Try direct high-speed Bluetooth printing if connected
    let printedViaBluetooth = false;
    if (btPrinter.isConnected) {
      showToast('Bluetooth پرنٹر پر تیز پرنٹ بھیجا جا رہا ہے...');
      const dateStr = slipDate.textContent.replace('📅', '').trim();
      const timeStr = slipTime.textContent.replace('🕒', '').trim();
      const patientData = {
        name,
        guardian,
        address,
        reason,
        date: dateStr,
        time: timeStr
      };

      try {
        printedViaBluetooth = await btPrinter.printFastSlip(patientData);
      } catch (err) {
        console.warn('Fast print failed, trying element print:', err);
        try {
          printedViaBluetooth = await btPrinter.printReceiptElement('printableSlip');
        } catch (e2) {
          console.error('All bluetooth print methods failed:', e2);
          showToast('Bluetooth Print Failed: ' + e2.message);
        }
      }
    }

    // If Bluetooth is not connected, use standard mobile/system print
    if (!printedViaBluetooth) {
      window.print();
    }

    if (!isReprint) {
      showToast('پرچی پرنٹ ہو گئی!');
      
      // Reset form inputs for next walk-in / patient immediately
      patientNameInput.value = '';
      guardianNameInput.value = '';
      patientAddressInput.value = '';
      consultationReasonInput.value = 'General Checkup';
      tagButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-val') === 'General Checkup'));

      syncLivePreview();
      patientNameInput.focus();
    } else {
      showToast('آخری پرچی دوبارہ پرنٹ ہو گئی! (Reprinted)');
    }
  }

  btnPrintSlip.addEventListener('click', () => handlePrint(false));

  btnReprintLast.addEventListener('click', () => {
    if (!lastPrintedData) {
      showToast('کوئی آخری پرچی محفوظ نہیں ہے۔ (No previous slip to reprint)');
      return;
    }
    handlePrint(true);
  });

  // Keyboard shortcut: Press Ctrl+Enter or Cmd+Enter to print quickly
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handlePrint(false);
    }
  });

  // Initial setup
  updateDateTime();
  syncLivePreview();
  setInterval(updateDateTime, 30000); // refresh time every 30s
});
