package com.drakramclinic.slip;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BluetoothPrinterPlugin")
public class BluetoothPrinterPlugin extends Plugin {
    @Override
    public void load() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(
                new AndroidBluetoothBridge(getActivity()),
                "AndroidBluetooth"
            );
        }
        super.load();
    }
}
