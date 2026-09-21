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

public class AndroidBluetoothBridge {
    private static final String TAG = "AndroidBluetoothBridge";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final Activity activity;
    private BluetoothSocket currentSocket = null;
    private OutputStream outputStream = null;
    private String connectedDeviceName = null;
    private String connectedDeviceAddress = null;

    public AndroidBluetoothBridge(Activity activity) {
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    @JavascriptInterface
    public void requestBluetoothPermission() {
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
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
        disconnect();

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            return "ERROR: Bluetooth is not supported on this device";
        }
        if (!adapter.isEnabled()) {
            return "ERROR: Bluetooth is turned off. Please turn on Bluetooth in phone settings.";
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestBluetoothPermission();
                return "ERROR: Bluetooth permission not granted. Please allow Bluetooth permission.";
            }
        }

        try {
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

            // Attempt 1: Standard SPP UUID
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (Exception e) {
                lastException = e;
                Log.w(TAG, "Standard SPP failed, trying fallback reflection...", e);
                try {
                    if (socket != null) socket.close();
                } catch (Exception ignored) {}
                socket = null;
            }

            // Attempt 2: Reflection createRfcommSocket(1)
            if (socket == null) {
                try {
                    Method m = device.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                    socket = (BluetoothSocket) m.invoke(device, 1);
                    socket.connect();
                } catch (Exception e) {
                    lastException = e;
                    Log.e(TAG, "Reflection RFCOMM failed", e);
                    try {
                        if (socket != null) socket.close();
                    } catch (Exception ignored) {}
                    socket = null;
                }
            }

            if (socket == null) {
                return "ERROR: Could not connect to printer. (" + (lastException != null ? lastException.getMessage() : "Check printer power") + ")";
            }

            this.currentSocket = socket;
            this.outputStream = socket.getOutputStream();
            this.connectedDeviceName = name;
            this.connectedDeviceAddress = address;

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
        if (outputStream == null || currentSocket == null || !currentSocket.isConnected()) {
            return "ERROR: Printer is not connected";
        }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.NO_WRAP);
            // Write in 1KB chunks with tiny 15ms sleep to avoid printer buffer overflow
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

    @JavascriptInterface
    public boolean isConnected() {
        return currentSocket != null && currentSocket.isConnected();
    }

    @JavascriptInterface
    public String getConnectedDeviceName() {
        return connectedDeviceName != null ? connectedDeviceName : "";
    }

    @JavascriptInterface
    public void disconnect() {
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
