package rw.baho.ims;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Let people pinch with two fingers to zoom in and out on every screen
        // (Android WebViews have zoom off by default). No +/- buttons on screen.
        WebSettings settings = bridge.getWebView().getSettings();
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
    }
}
