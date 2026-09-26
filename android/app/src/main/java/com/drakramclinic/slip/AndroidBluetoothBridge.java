package com.drakramclinic.slip;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class AndroidBluetoothBridge {
    private static final String TAG = "AndroidBluetoothBridge";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private static volatile AndroidBluetoothBridge instance;

    private Activity activity;
    private final Object socketLock = new Object();
    private BluetoothSocket currentSocket = null;
    private OutputStream outputStream = null;
    private String connectedDeviceName = null;
    private String connectedDeviceAddress = null;
    private ScheduledExecutorService heartbeatScheduler = null;

    public static synchronized AndroidBluetoothBridge getInstance(Activity activity) {
        if (instance == null) {
            instance = new AndroidBluetoothBridge(activity);
        } else if (activity != null) {
            instance.setActivity(activity);
        }
        return instance;
    }

    public AndroidBluetoothBridge(Activity activity) {
        this.activity = activity;
    }

    public synchronized void setActivity(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    @JavascriptInterface
    public boolean isBluetoothEnabled() {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        return adapter != null && adapter.isEnabled();
    }

    @JavascriptInterface
    public boolean hasBluetoothPermission() {
        if (activity == null) return true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    @JavascriptInterface
    public void requestBluetoothPermission() {
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                ActivityCompat.requestPermissions(activity, new String[]{
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN,
                    Manifest.permission.ACCESS_FINE_LOCATION
                }, 101);
            }
        });
    }

    @JavascriptInterface
    public void openBluetoothSettings() {
        if (activity == null) return;
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open bluetooth settings", e);
        }
    }

    @JavascriptInterface
    public String getBondedDevices() {
        JSONArray array = new JSONArray();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            return array.toString();
        }

        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestBluetoothPermission();
                return array.toString();
            }
        }

        try {
            Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
            if (pairedDevices != null) {
                for (BluetoothDevice device : pairedDevices) {
                    JSONObject obj = new JSONObject();
                    String name = device.getName();
                    if (name == null || name.isEmpty()) {
                        name = "Thermal Printer (" + device.getAddress() + ")";
                    }
                    obj.put("name", name);
                    obj.put("address", device.getAddress());
                    array.put(obj);
                }
            }
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException in getBondedDevices", se);
            requestBluetoothPermission();
        } catch (Exception e) {
            Log.e(TAG, "Error in getBondedDevices", e);
        }
        return array.toString();
    }

    @JavascriptInterface
    public String connect(String address) {
        if (address == null || address.trim().isEmpty()) {
            return "ERROR: Invalid printer address";
        }
        address = address.trim();

        // 1. Guard against unnecessary reconnects on page refresh or repeat clicks
        synchronized (socketLock) {
            if (currentSocket != null && currentSocket.isConnected() && address.equalsIgnoreCase(connectedDeviceAddress)) {
                Log.i(TAG, "Device already connected: " + address);
                return "OK:" + (connectedDeviceName != null ? connectedDeviceName : address);
            }
        }

        // 2. Disconnect previous connection cleanly and give thermal printer module 400ms to reset
        disconnect();
        try {
            Thread.sleep(400);
        } catch (InterruptedException ignored) {}

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            return "ERROR: Bluetooth is not supported on this device";
        }
        if (!adapter.isEnabled()) {
            return "ERROR: Bluetooth is turned off. Please turn on Bluetooth in phone settings.";
        }

        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestBluetoothPermission();
                return "ERROR: Bluetooth permission not granted. Please allow Bluetooth permission.";
            }
        }

        try {
            // Cancel discovery to free up Bluetooth bandwidth
            try {
                adapter.cancelDiscovery();
            } catch (Exception ignored) {}

            BluetoothDevice device = adapter.getRemoteDevice(address);
            String name = device.getName();
            if (name == null || name.isEmpty()) {
                name = address;
            }

            BluetoothSocket socket = null;
            Exception lastException = null;

            // Strategy 1: Insecure RFCOMM with SPP UUID (Standard for POS thermal receipt printers)
            try {
                socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
                Log.i(TAG, "Connected via createInsecureRfcommSocketToServiceRecord");
            } catch (Exception e) {
                lastException = e;
                Log.w(TAG, "Insecure SPP failed: " + e.getMessage() + ", trying secure SPP...");
                closeQuietly(socket);
                socket = null;
                try { Thread.sleep(150); } catch (InterruptedException ignored) {}
            }

            // Strategy 2: Standard Secure SPP UUID
            if (socket == null) {
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                    Log.i(TAG, "Connected via createRfcommSocketToServiceRecord");
                } catch (Exception e) {
                    lastException = e;
                    Log.w(TAG, "Secure SPP failed: " + e.getMessage() + ", trying fallback reflection channel 1...");
                    closeQuietly(socket);
                    socket = null;
                    try { Thread.sleep(150); } catch (InterruptedException ignored) {}
                }
            }

            // Strategy 3: Insecure reflection RFCOMM channel 1
            if (socket == null) {
                try {
                    Method m = device.getClass().getMethod("createInsecureRfcommSocket", new Class[]{int.class});
                    socket = (BluetoothSocket) m.invoke(device, 1);
                    if (socket != null) {
                        socket.connect();
                        Log.i(TAG, "Connected via reflection createInsecureRfcommSocket(1)");
                    }
                } catch (Exception e) {
                    lastException = e;
                    Log.w(TAG, "Reflection insecure RFCOMM failed: " + e.getMessage());
                    closeQuietly(socket);
                    socket = null;
                    try { Thread.sleep(150); } catch (InterruptedException ignored) {}
                }
            }

            // Strategy 4: Standard reflection RFCOMM channel 1
            if (socket == null) {
                try {
                    Method m = device.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                    socket = (BluetoothSocket) m.invoke(device, 1);
                    if (socket != null) {
                        socket.connect();
                        Log.i(TAG, "Connected via reflection createRfcommSocket(1)");
                    }
                } catch (Exception e) {
                    lastException = e;
                    Log.e(TAG, "Reflection RFCOMM failed", e);
                    closeQuietly(socket);
                    socket = null;
                }
            }

            if (socket == null) {
                return "ERROR: Could not connect to printer. (" + (lastException != null ? lastException.getMessage() : "Check printer power") + ")";
            }

            synchronized (socketLock) {
                this.currentSocket = socket;
                this.outputStream = socket.getOutputStream();
                this.connectedDeviceName = name;
                this.connectedDeviceAddress = address;
            }

            // Start heartbeat watchdog to keep connection alive
            startHeartbeat();

            return "OK:" + name;
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException in connect", se);
            requestBluetoothPermission();
            return "ERROR: Bluetooth permission required";
        } catch (Exception e) {
            Log.e(TAG, "Connection error", e);
            disconnect();
            return "ERROR: " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String sendData(String base64Data) {
        synchronized (socketLock) {
            if (outputStream == null || currentSocket == null || !currentSocket.isConnected()) {
                return "ERROR: Printer is not connected";
            }

            try {
                byte[] bytes = Base64.decode(base64Data, Base64.NO_WRAP);
                // Write in 1KB chunks with 15ms pacing to avoid printer buffer overflow
                int chunkSize = 1024;
                for (int i = 0; i < bytes.length; i += chunkSize) {
                    int len = Math.min(chunkSize, bytes.length - i);
                    outputStream.write(bytes, i, len);
                    outputStream.flush();
                    try {
                        Thread.sleep(15);
                    } catch (InterruptedException ignored) {}
                }
                outputStream.flush();
                return "OK";
            } catch (Exception e) {
                Log.e(TAG, "Write error", e);
                disconnect();
                return "ERROR: " + e.getMessage();
            }
        }
    }

    @JavascriptInterface
    public boolean isConnected() {
        synchronized (socketLock) {
            return currentSocket != null && currentSocket.isConnected();
        }
    }

    @JavascriptInterface
    public String getConnectedDeviceName() {
        synchronized (socketLock) {
            return connectedDeviceName != null ? connectedDeviceName : "";
        }
    }

    @JavascriptInterface
    public String getConnectedDeviceAddress() {
        synchronized (socketLock) {
            return connectedDeviceAddress != null ? connectedDeviceAddress : "";
        }
    }

    @JavascriptInterface
    public void disconnect() {
        stopHeartbeat();
        disconnectInternal();
    }

    private void disconnectInternal() {
        synchronized (socketLock) {
            try {
                if (outputStream != null) {
                    outputStream.flush();
                    outputStream.close();
                }
            } catch (Exception ignored) {}

            try {
                if (currentSocket != null) {
                    currentSocket.close();
                }
            } catch (Exception ignored) {}

            outputStream = null;
            currentSocket = null;
            connectedDeviceName = null;
            connectedDeviceAddress = null;
        }
    }

    private void closeQuietly(BluetoothSocket socket) {
        if (socket != null) {
            try {
                socket.close();
            } catch (Exception ignored) {}
        }
    }

    /**
     * Periodic Keep-Alive Heartbeat Watchdog.
     * Thermal printers drop Bluetooth RFCOMM connections if idle for 2-3 minutes.
     * Sending ESC/POS Real-Time Status Inquiry (0x10, 0x04, 0x01) keeps the Bluetooth link active
     * without printing anything or advancing paper.
     */
    private void startHeartbeat() {
        stopHeartbeat();
        try {
            heartbeatScheduler = Executors.newSingleThreadScheduledExecutor();
            heartbeatScheduler.scheduleWithFixedDelay(() -> {
                synchronized (socketLock) {
                    if (currentSocket != null && currentSocket.isConnected() && outputStream != null) {
                        try {
                            // DLE EOT 1 (0x10, 0x04, 0x01): Transmit printer status in real-time
                            outputStream.write(new byte[]{0x10, 0x04, 0x01});
                            outputStream.flush();
                            Log.d(TAG, "Heartbeat keep-alive ping sent");
                        } catch (Exception e) {
                            Log.w(TAG, "Heartbeat ping warning: " + e.getMessage());
                            if (currentSocket == null || !currentSocket.isConnected()) {
                                disconnectInternal();
                            }
                        }
                    }
                }
            }, 25, 25, TimeUnit.SECONDS);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start heartbeat scheduler", e);
        }
    }

    private void stopHeartbeat() {
        if (heartbeatScheduler != null) {
            try {
                heartbeatScheduler.shutdownNow();
            } catch (Exception ignored) {}
            heartbeatScheduler = null;
        }
    }
}
