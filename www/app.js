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

    slipDate.textContent = `${dd}-${mm}-${yyyy}`;
    slipTime.textContent = `${formattedHours}:${minutes} ${ampm}`;
  }

  // --- Live Preview Synchronization ---
  function syncLivePreview() {
    const nameVal = patientNameInput.value.trim().toUpperCase();
    slipPatientName.textContent = nameVal || 'ADANN';

    const guardianVal = guardianNameInput.value.trim();
    slipGuardian.textContent = guardianVal || 'Ashraf';

    const addrVal = patientAddressInput.value.trim();
    slipAddress.textContent = addrVal || 'Tandla';

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
  patientNameInput.addEventListener('input', () => {
    const start = patientNameInput.selectionStart;
    const end = patientNameInput.selectionEnd;
    patientNameInput.value = patientNameInput.value.toUpperCase();
    if (start !== null && end !== null) {
      patientNameInput.setSelectionRange(start, end);
    }
  });

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

  function updateBtUI(status, isConnected) {
    if (btStatusText) {
      btStatusText.textContent = `Bluetooth: ${status}`;
    }
    if (btnConnectBt) {
      btnConnectBt.className = `bt-status-btn ${isConnected ? 'connected' : 'disconnected'}`;
    }
  }

  // --- Bluetooth Connection Button Handling ---
  btnConnectBt.addEventListener('click', async () => {
    if (btPrinter.isNativeAndroid()) {
      btPrinter.syncConnectionState(updateBtUI);
    }

    if (btPrinter.isConnected) {
      if (confirm(`Bluetooth پرنٹر (${btPrinter.deviceName || 'Thermal Printer'}) پہلے سے کنیکٹ ہے، کیا ڈسکنیکٹ کرنا چاہتے ہیں؟`)) {
        btPrinter.disconnect();
        updateBtUI('Disconnected (Tap to Connect)', false);
        showToast('پرنٹر ڈسکنیکٹ کر دیا گیا');
      }
      return;
    }

    localStorage.removeItem('bluetooth_explicit_disconnect');

    // 1. If running inside Android APK with Native Bluetooth Bridge
    if (btPrinter.isNativeAndroid()) {
      openBtModal();
      return;
    }

    // 2. If running inside Chrome browser with Web Bluetooth
    if (btPrinter.isWebBluetooth()) {
      try {
        await btPrinter.connectWeb(updateBtUI);
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

  // ==========================================================================
  // TOKEN RECORDS STORAGE & ADMIN ENGINE (Offline-First)
  // ==========================================================================
  const RECORDS_STORAGE_KEY = 'dr_akram_token_records_v2';
  const DEFAULT_ADMIN_PIN = '26627';

  function getAdminPin() {
    return localStorage.getItem('admin_custom_pin') || DEFAULT_ADMIN_PIN;
  }

  function setAdminPin(newPin) {
    localStorage.setItem('admin_custom_pin', newPin);
  }

  function getTodayDateString(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy}`;
  }

  function getAllRecords() {
    try {
      const data = localStorage.getItem(RECORDS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to read records:', e);
      return [];
    }
  }

  function saveAllRecords(records) {
    try {
      localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('Failed to save records:', e);
    }
  }

  function addTokenRecord(patientData) {
    const records = getAllRecords();
    const targetDate = patientData.date || getTodayDateString();
    
    // Calculate today's sequential token number
    const todayRecords = records.filter(r => r.date === targetDate);
    const nextTokenNo = todayRecords.length + 1;

    // Calculate consultation fee (Rs. 1000 for Urgent, Rs. 500 for General Checkup)
    const isUrgent = (patientData.reason || '').toLowerCase().includes('urgent');
    const defaultAmount = isUrgent ? 1000 : 500;

    const newRecord = {
      id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      tokenNo: nextTokenNo,
      date: targetDate,
      time: patientData.time || slipTime.textContent.trim(),
      patientName: patientData.name.toUpperCase(),
      guardian: patientData.guardian,
      address: patientData.address,
      reason: patientData.reason || 'General Checkup',
      amount: defaultAmount,
      status: 'waiting', // 'waiting' or 'served'
      timestamp: Date.now()
    };

    records.push(newRecord);
    saveAllRecords(records);
    return newRecord;
  }

  // --- Issue & Print Action ---
  async function handlePrint(isReprint = false) {
    let name = patientNameInput.value.trim().toUpperCase();
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

      // Record this token slip in Daily Records (Offline storage)
      const dateStr = slipDate.textContent.replace(/[📅🕒]/g, '').trim();
      const timeStr = slipTime.textContent.replace(/[📅🕒]/g, '').trim();
      addTokenRecord({
        name,
        guardian,
        address,
        reason,
        date: dateStr,
        time: timeStr
      });
    }

    // Check and sync Bluetooth connection before printing
    if (!btPrinter.isConnected && btPrinter.isNativeAndroid()) {
      btPrinter.syncConnectionState(updateBtUI);
    }

    // Try direct high-speed Bluetooth printing if connected
    let printedViaBluetooth = false;
    if (btPrinter.isConnected) {
      showToast('Bluetooth پرنٹر پر تیز پرنٹ بھیجا جا رہا ہے...');
      const dateStr = slipDate.textContent.replace(/[📅🕒]/g, '').trim();
      const timeStr = slipTime.textContent.replace(/[📅🕒]/g, '').trim();
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
      showToast('پرچی پرنٹ ہو گئی اور ریکارڈ میں درج ہو گئی!');
      
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

  // ==========================================================================
  // ADMIN AUTHENTICATION (PASSWORD: 26627)
  // ==========================================================================
  const btnOpenAdminAuth = document.getElementById('btnOpenAdminAuth');
  const adminAuthModal = document.getElementById('adminAuthModal');
  const adminAuthBackdrop = document.getElementById('adminAuthBackdrop');
  const btnCancelAuth = document.getElementById('btnCancelAuth');
  const adminPinInput = document.getElementById('adminPinInput');
  const adminPinError = document.getElementById('adminPinError');
  const adminAuthForm = document.getElementById('adminAuthForm');

  // Keypad elements
  const pinKeys = document.querySelectorAll('.pin-key[data-num]');
  const btnPinClear = document.getElementById('btnPinClear');
  const btnPinBackspace = document.getElementById('btnPinBackspace');

  function openAdminAuthModal() {
    if (!adminAuthModal) return;
    adminPinInput.value = '';
    if (adminPinError) adminPinError.classList.add('hidden');
    adminAuthModal.classList.remove('hidden');
    setTimeout(() => adminPinInput.focus(), 150);
  }

  function closeAdminAuthModal() {
    if (!adminAuthModal) return;
    adminAuthModal.classList.add('hidden');
    adminPinInput.value = '';
    if (adminPinError) adminPinError.classList.add('hidden');
  }

  if (btnOpenAdminAuth) {
    btnOpenAdminAuth.addEventListener('click', openAdminAuthModal);
  }
  if (adminAuthBackdrop) {
    adminAuthBackdrop.addEventListener('click', closeAdminAuthModal);
  }
  if (btnCancelAuth) {
    btnCancelAuth.addEventListener('click', closeAdminAuthModal);
  }

  // Keypad actions
  pinKeys.forEach(key => {
    key.addEventListener('click', () => {
      const num = key.getAttribute('data-num');
      if (adminPinInput.value.length < 8) {
        adminPinInput.value += num;
        if (adminPinError) adminPinError.classList.add('hidden');
      }
    });
  });

  if (btnPinClear) {
    btnPinClear.addEventListener('click', () => {
      adminPinInput.value = '';
      if (adminPinError) adminPinError.classList.add('hidden');
    });
  }

  if (btnPinBackspace) {
    btnPinBackspace.addEventListener('click', () => {
      adminPinInput.value = adminPinInput.value.slice(0, -1);
    });
  }

  function verifyAdminPin() {
    const entered = adminPinInput.value.trim();
    if (entered === getAdminPin()) {
      closeAdminAuthModal();
      openAdminRecordsModal();
    } else {
      if (adminPinError) {
        adminPinError.classList.remove('hidden');
      }
      adminPinInput.value = '';
      adminPinInput.focus();
    }
  }

  if (adminAuthForm) {
    adminAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      verifyAdminPin();
    });
  }

  // ==========================================================================
  // CHANGE ADMIN PIN MODAL
  // ==========================================================================
  const btnOpenChangePin = document.getElementById('btnOpenChangePin');
  const changePinModal = document.getElementById('changePinModal');
  const changePinBackdrop = document.getElementById('changePinBackdrop');
  const btnCancelChangePin = document.getElementById('btnCancelChangePin');
  const currentPinInput = document.getElementById('currentPinInput');
  const newPinInput = document.getElementById('newPinInput');
  const confirmPinInput = document.getElementById('confirmPinInput');
  const changePinError = document.getElementById('changePinError');
  const changePinForm = document.getElementById('changePinForm');

  function openChangePinModal() {
    if (!changePinModal) return;
    currentPinInput.value = '';
    newPinInput.value = '';
    confirmPinInput.value = '';
    if (changePinError) changePinError.classList.add('hidden');
    changePinModal.classList.remove('hidden');
    setTimeout(() => currentPinInput.focus(), 150);
  }

  function closeChangePinModal() {
    if (!changePinModal) return;
    changePinModal.classList.add('hidden');
    currentPinInput.value = '';
    newPinInput.value = '';
    confirmPinInput.value = '';
    if (changePinError) changePinError.classList.add('hidden');
  }

  if (btnOpenChangePin) btnOpenChangePin.addEventListener('click', openChangePinModal);
  if (changePinBackdrop) changePinBackdrop.addEventListener('click', closeChangePinModal);
  if (btnCancelChangePin) btnCancelChangePin.addEventListener('click', closeChangePinModal);

  function showChangePinError(msg) {
    if (changePinError) {
      changePinError.textContent = '⚠️ ' + msg;
      changePinError.classList.remove('hidden');
    }
  }

  if (changePinForm) {
    changePinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const curr = currentPinInput.value.trim();
      const next = newPinInput.value.trim();
      const conf = confirmPinInput.value.trim();

      if (curr !== getAdminPin()) {
        showChangePinError('موجودہ پاس ورڈ درست نہیں ہے۔');
        currentPinInput.focus();
        return;
      }
      if (!next || next.length < 4) {
        showChangePinError('نیا پاس ورڈ کم از کم 4 ہندسوں پر مشتمل ہونا چاہیے۔');
        newPinInput.focus();
        return;
      }
      if (next !== conf) {
        showChangePinError('نئے پاس ورڈ کی تصدیق مماثل نہیں ہے۔');
        confirmPinInput.focus();
        return;
      }

      setAdminPin(next);
      closeChangePinModal();
      showToast('✅ ایڈمن پاس ورڈ کامیابی سے تبدیل ہو گیا!', 3000);
    });
  }

  // ==========================================================================
  // ADMIN DASHBOARD & TOKEN RECORDS INTERACTION
  // ==========================================================================
  const adminRecordsModal = document.getElementById('adminRecordsModal');
  const adminRecordsBackdrop = document.getElementById('adminRecordsBackdrop');
  const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
  const btnLockAdmin = document.getElementById('btnLockAdmin');
  const btnDateToday = document.getElementById('btnDateToday');
  const btnDateYesterday = document.getElementById('btnDateYesterday');
  const adminDatePicker = document.getElementById('adminDatePicker');
  const statusFilterBtns = document.querySelectorAll('.status-filter-btn');
  const adminSearchInput = document.getElementById('adminSearchInput');
  const btnClearDayData = document.getElementById('btnClearDayData');
  const btnPrintDailySummary = document.getElementById('btnPrintDailySummary');
  const btnExportCsv = document.getElementById('btnExportCsv');

  // KPI elements
  const statTotalTokens = document.getElementById('statTotalTokens');
  const statServedTokens = document.getElementById('statServedTokens');
  const statWaitingTokens = document.getElementById('statWaitingTokens');
  const statTotalFee = document.getElementById('statTotalFee');
  const countFilterAll = document.getElementById('countFilterAll');
  const countFilterWaiting = document.getElementById('countFilterWaiting');
  const countFilterServed = document.getElementById('countFilterServed');
  const recordsTableBody = document.getElementById('recordsTableBody');
  const recordsEmptyState = document.getElementById('recordsEmptyState');
  const recordsTableWrapper = document.getElementById('recordsTableWrapper');
  const selectedDateDisplay = document.getElementById('selectedDateDisplay');
  const selectedTotalDisplay = document.getElementById('selectedTotalDisplay');

  let currentSelectedDate = getTodayDateString();
  let currentStatusFilter = 'all';

  function openAdminRecordsModal() {
    if (!adminRecordsModal) return;
    currentSelectedDate = getTodayDateString();
    currentStatusFilter = 'all';

    // Set today button active
    if (btnDateToday) btnDateToday.classList.add('active');
    if (btnDateYesterday) btnDateYesterday.classList.remove('active');

    // Sync input date
    if (adminDatePicker) {
      const now = new Date();
      adminDatePicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    if (adminSearchInput) adminSearchInput.value = '';

    statusFilterBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === 'all'));

    adminRecordsModal.classList.remove('hidden');
    renderAdminDashboard();
  }

  function closeAdminRecordsModal() {
    if (!adminRecordsModal) return;
    adminRecordsModal.classList.add('hidden');
  }

  if (btnCloseAdminModal) btnCloseAdminModal.addEventListener('click', closeAdminRecordsModal);
  if (btnLockAdmin) btnLockAdmin.addEventListener('click', () => {
    closeAdminRecordsModal();
    showToast('ایڈمن سیشن لاک کر دیا گیا');
  });
  if (adminRecordsBackdrop) adminRecordsBackdrop.addEventListener('click', closeAdminRecordsModal);

  // Date switchers
  if (btnDateToday) {
    btnDateToday.addEventListener('click', () => {
      btnDateToday.classList.add('active');
      if (btnDateYesterday) btnDateYesterday.classList.remove('active');
      currentSelectedDate = getTodayDateString();
      const now = new Date();
      if (adminDatePicker) adminDatePicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      renderAdminDashboard();
    });
  }

  if (btnDateYesterday) {
    btnDateYesterday.addEventListener('click', () => {
      btnDateYesterday.classList.add('active');
      if (btnDateToday) btnDateToday.classList.remove('active');
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      currentSelectedDate = getTodayDateString(yest);
      if (adminDatePicker) adminDatePicker.value = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
      renderAdminDashboard();
    });
  }

  if (adminDatePicker) {
    adminDatePicker.addEventListener('change', () => {
      if (!adminDatePicker.value) return;
      const [yyyy, mm, dd] = adminDatePicker.value.split('-');
      currentSelectedDate = `${dd}-${mm}-${yyyy}`;
      if (btnDateToday) btnDateToday.classList.toggle('active', currentSelectedDate === getTodayDateString());
      if (btnDateYesterday) btnDateYesterday.classList.remove('active');
      renderAdminDashboard();
    });
  }

  // Filter Buttons
  statusFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      statusFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatusFilter = btn.getAttribute('data-filter');
      renderAdminDashboard();
    });
  });

  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', renderAdminDashboard);
  }

  // Reprint a specific token from history with its EXACT original date and time
  async function reprintSpecificToken(rec) {
    if (!rec) return;

    const patientData = {
      name: (rec.patientName || '').toUpperCase(),
      guardian: rec.guardian || '',
      address: rec.address || '',
      reason: rec.reason || 'General Checkup',
      date: rec.date, // STRICTLY PRESERVE ORIGINAL RECORDED DATE
      time: rec.time  // STRICTLY PRESERVE ORIGINAL RECORDED TIME
    };

    if (!btPrinter.isConnected && btPrinter.isNativeAndroid()) {
      btPrinter.syncConnectionState(updateBtUI);
    }

    let printedViaBluetooth = false;
    if (btPrinter.isConnected) {
      showToast(`Bluetooth پر ٹوکن #${rec.tokenNo} کا اصل پرنٹ بھیجا جا رہا ہے...`);
      try {
        printedViaBluetooth = await btPrinter.printFastSlip(patientData);
      } catch (err) {
        console.warn('Fast print failed, trying element print:', err);
        try {
          slipPatientName.textContent = patientData.name;
          slipGuardian.textContent = patientData.guardian;
          slipAddress.textContent = patientData.address;
          slipConsultation.textContent = patientData.reason;
          slipDate.textContent = patientData.date;
          slipTime.textContent = patientData.time;
          printedViaBluetooth = await btPrinter.printReceiptElement('printableSlip');
        } catch (e2) {
          console.error('All bluetooth print methods failed:', e2);
          showToast('Bluetooth Print Failed: ' + e2.message);
        }
      }
    }

    if (!printedViaBluetooth) {
      slipPatientName.textContent = patientData.name;
      slipGuardian.textContent = patientData.guardian;
      slipAddress.textContent = patientData.address;
      slipConsultation.textContent = patientData.reason;
      slipDate.textContent = patientData.date;
      slipTime.textContent = patientData.time;
      window.print();
    }

    showToast(`ٹوکن #${rec.tokenNo} (${rec.patientName}) اصل تاریخ (${rec.date}) اور وقت (${rec.time}) پر پرنٹ ہو گیا!`, 3500);
  }

  function renderAdminDashboard() {
    const allRecords = getAllRecords();
    const dayRecords = allRecords.filter(r => r.date === currentSelectedDate);

    // Compute stats for the day
    const totalCount = dayRecords.length;
    const servedCount = dayRecords.filter(r => r.status === 'served').length;
    const waitingCount = dayRecords.filter(r => r.status === 'waiting').length;
    const totalFee = dayRecords.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    // Update KPI UI
    if (statTotalTokens) statTotalTokens.textContent = totalCount;
    if (statServedTokens) statServedTokens.textContent = servedCount;
    if (statWaitingTokens) statWaitingTokens.textContent = waitingCount;
    if (statTotalFee) statTotalFee.textContent = `Rs. ${totalFee.toLocaleString()}`;

    if (countFilterAll) countFilterAll.textContent = totalCount;
    if (countFilterWaiting) countFilterWaiting.textContent = waitingCount;
    if (countFilterServed) countFilterServed.textContent = servedCount;

    if (selectedDateDisplay) selectedDateDisplay.textContent = currentSelectedDate;
    if (selectedTotalDisplay) selectedTotalDisplay.textContent = totalCount;

    // Filter by status & search
    const searchQuery = (adminSearchInput ? adminSearchInput.value.trim().toLowerCase() : '');
    let filteredRecords = dayRecords;

    if (currentStatusFilter !== 'all') {
      filteredRecords = filteredRecords.filter(r => r.status === currentStatusFilter);
    }

    if (searchQuery) {
      filteredRecords = filteredRecords.filter(r => {
        return (
          (r.patientName || '').toLowerCase().includes(searchQuery) ||
          (r.guardian || '').toLowerCase().includes(searchQuery) ||
          (r.address || '').toLowerCase().includes(searchQuery) ||
          String(r.tokenNo || '').includes(searchQuery)
        );
      });
    }

    // Sort by tokenNo descending or ascending (default ascending: 1, 2, 3...)
    filteredRecords.sort((a, b) => a.tokenNo - b.tokenNo);

    // Render Table Rows
    if (!recordsTableBody) return;
    recordsTableBody.innerHTML = '';

    if (filteredRecords.length === 0) {
      if (recordsTableWrapper) recordsTableWrapper.classList.add('hidden');
      if (recordsEmptyState) recordsEmptyState.classList.remove('hidden');
      return;
    }

    if (recordsTableWrapper) recordsTableWrapper.classList.remove('hidden');
    if (recordsEmptyState) recordsEmptyState.classList.add('hidden');

    filteredRecords.forEach(rec => {
      const tr = document.createElement('tr');
      const isUrgent = (rec.reason || '').toLowerCase().includes('urgent');

      tr.innerHTML = `
        <td><span class="tok-badge">#${rec.tokenNo}</span></td>
        <td style="white-space: nowrap; font-size: 12px; color: #64748b;">${rec.time}</td>
        <td><strong class="patient-cell-name">${rec.patientName}</strong></td>
        <td>${rec.guardian || '-'}</td>
        <td style="max-width: 140px; font-size: 12px;">${rec.address || '-'}</td>
        <td><span class="reason-tag-sm ${isUrgent ? 'urgent' : ''}">${rec.reason}</span></td>
        <td>
          <span style="font-weight: 700; color: #15803d;">Rs. ${Number(rec.amount || 0).toLocaleString()}</span>
        </td>
        <td>
          <button type="button" class="btn-status-toggle ${rec.status}" data-id="${rec.id}">
            ${rec.status === 'served' ? '✅ اندر آ گیا (Served)' : '⏳ زیرِ انتظار (Waiting)'}
          </button>
        </td>
        <td style="white-space: nowrap;">
          <button type="button" class="btn-reprint-record" data-id="${rec.id}" title="یہ پرچی اصل تاریخ (${rec.date}) اور وقت (${rec.time}) کے ساتھ دوبارہ پرنٹ کریں">
            🖨️ پرنٹ
          </button>
          <button type="button" class="btn-del-record" data-id="${rec.id}" title="ریکارڈ ڈیلیٹ کریں">
            🗑️
          </button>
        </td>
      `;

      // Status toggle button listener
      const toggleBtn = tr.querySelector('.btn-status-toggle');
      toggleBtn.addEventListener('click', () => {
        const records = getAllRecords();
        const item = records.find(r => r.id === rec.id);
        if (item) {
          item.status = (item.status === 'served') ? 'waiting' : 'served';
          saveAllRecords(records);
          renderAdminDashboard();
          showToast(item.status === 'served' ? `ٹوکن #${item.tokenNo} اندر آ گیا (Served)!` : `ٹوکن #${item.tokenNo} واپس زیرِ انتظار!`, 2000);
        }
      });

      // Reprint record button listener
      const reprintBtn = tr.querySelector('.btn-reprint-record');
      if (reprintBtn) {
        reprintBtn.addEventListener('click', () => {
          reprintSpecificToken(rec);
        });
      }

      // Delete record button listener
      const delBtn = tr.querySelector('.btn-del-record');
      delBtn.addEventListener('click', () => {
        if (confirm(`کیا آپ ٹوکن #${rec.tokenNo} (${rec.patientName}) کا ریکارڈ ڈیلیٹ کرنا چاہتے ہیں؟`)) {
          let records = getAllRecords();
          records = records.filter(r => r.id !== rec.id);
          saveAllRecords(records);
          renderAdminDashboard();
          showToast('ریکارڈ ڈیلیٹ کر دیا گیا');
        }
      });

      recordsTableBody.appendChild(tr);
    });
  }

  // Clear Day Data
  if (btnClearDayData) {
    btnClearDayData.addEventListener('click', () => {
      const allRecords = getAllRecords();
      const count = allRecords.filter(r => r.date === currentSelectedDate).length;
      if (count === 0) {
        showToast('اس تاریخ کا پہلے سے کوئی ریکارڈ موجود نہیں ہے۔');
        return;
      }

      if (confirm(`⚠️ کیا آپ تاریخ ${currentSelectedDate} کے تمام ${count} ٹوکن ریکارڈز مکمل ڈیلیٹ کرنا چاہتے ہیں؟ یہ عمل واپس نہیں ہو سکتا۔`)) {
        const remaining = allRecords.filter(r => r.date !== currentSelectedDate);
        saveAllRecords(remaining);
        renderAdminDashboard();
        showToast(`تاریخ ${currentSelectedDate} کا تمام ڈیٹا صاف کر دیا گیا!`);
      }
    });
  }

  // Print Daily Summary on 80mm Bluetooth Thermal Printer
  if (btnPrintDailySummary) {
    btnPrintDailySummary.addEventListener('click', async () => {
      if (!btPrinter.isConnected) {
        showToast('⚠️ بلوٹوتھ پرنٹر کنیکٹ نہیں ہے۔ پہلے پرنٹر کنیکٹ کریں۔');
        return;
      }

      const allRecords = getAllRecords();
      const dayRecords = allRecords.filter(r => r.date === currentSelectedDate);
      if (dayRecords.length === 0) {
        showToast('اس تاریخ کا کوئی ٹوکن ریکارڈ نہیں ہے');
        return;
      }

      const totalCount = dayRecords.length;
      const servedCount = dayRecords.filter(r => r.status === 'served').length;
      const waitingCount = dayRecords.filter(r => r.status === 'waiting').length;
      const totalAmount = dayRecords.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

      const now = new Date();
      const summaryData = {
        date: currentSelectedDate,
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        totalCount,
        servedCount,
        waitingCount,
        totalAmount,
        tokens: dayRecords
      };

      try {
        showToast('بلوٹوتھ پرنٹر پر روزانہ سمری پرنٹ کی جا رہی ہے...');
        await btPrinter.printDailySummary(summaryData);
        showToast('روزانہ سمری رپورٹ کامیابی سے پرنٹ ہو گئی!');
      } catch (e) {
        console.error('Print summary failed:', e);
        showToast('پرنٹ ناکام: ' + e.message);
      }
    });
  }

  // Export Day Data as CSV (Compatible with Microsoft Excel)
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const allRecords = getAllRecords();
      const dayRecords = allRecords.filter(r => r.date === currentSelectedDate);
      if (dayRecords.length === 0) {
        showToast('ایکسپورٹ کے لیے کوئی ریکارڈ موجود نہیں ہے۔');
        return;
      }

      // Add UTF-8 BOM so Excel opens Urdu/Arabic properly
      let csv = '\uFEFF';
      csv += 'Token No,Date,Time,Patient Name,Parentage (S/W/D),Address,Reason,Fee (Rs.),Status\n';

      dayRecords.forEach(r => {
        const row = [
          r.tokenNo,
          `"${r.date}"`,
          `"${r.time}"`,
          `"${(r.patientName || '').replace(/"/g, '""')}"`,
          `"${(r.guardian || '').replace(/"/g, '""')}"`,
          `"${(r.address || '').replace(/"/g, '""')}"`,
          `"${(r.reason || '').replace(/"/g, '""')}"`,
          r.amount || 0,
          `"${r.status === 'served' ? 'Served' : 'Waiting'}"`
        ];
        csv += row.join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Dr_Akram_Clinic_Records_${currentSelectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('ایکسل فائل ڈاؤن لوڈ ہو گئی!');
    });
  }

  // ==========================================================================
  // AUTOMATIC BLUETOOTH RECONNECT & STARTUP SYNC
  // ==========================================================================
  function initBluetoothConnection() {
    if (btPrinter.isNativeAndroid()) {
      // 1. Check if already connected in Android bridge (e.g. after page refresh)
      const isAlreadyConnected = btPrinter.syncConnectionState(updateBtUI);
      if (isAlreadyConnected) {
        console.log('Bluetooth session restored from native bridge:', btPrinter.deviceName);
      } else {
        // 2. Auto-reconnect to last paired printer unless user tapped Disconnect
        const lastAddr = localStorage.getItem('last_printer_address');
        if (lastAddr && localStorage.getItem('bluetooth_explicit_disconnect') !== 'true') {
          updateBtUI('Auto-connecting...', false);
          btPrinter.autoConnectLastPrinter(updateBtUI).then(success => {
            if (success) {
              showToast(`پرنٹر ${btPrinter.deviceName} خود بخود کنیکٹ ہو گیا!`, 2500);
            } else {
              updateBtUI('Disconnected (Tap to Connect)', false);
            }
          });
        }
      }

      // 3. Continuously sync connection state every 3 seconds to keep UI accurate
      setInterval(() => {
        btPrinter.syncConnectionState(updateBtUI);
      }, 3000);
    } else if (btPrinter.isWebBluetooth()) {
      // Chrome Web Bluetooth Auto Reconnect on page reload
      if (localStorage.getItem('bluetooth_explicit_disconnect') !== 'true') {
        btPrinter.autoConnectWeb(updateBtUI).then(success => {
          if (success) {
            showToast(`پرنٹر ${btPrinter.deviceName} خود بخود کنیکٹ ہو گیا!`, 2500);
          }
        });
      }
    }
  }

  // Auto-check connection when browser tab or screen becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!btPrinter.isConnected && localStorage.getItem('bluetooth_explicit_disconnect') !== 'true') {
        initBluetoothConnection();
      }
    }
  });

  // Initial setup
  updateDateTime();
  syncLivePreview();
  initBluetoothConnection();
  setInterval(updateDateTime, 30000); // refresh time every 30s
});

