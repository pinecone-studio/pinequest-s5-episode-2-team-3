package mn.pinecone.dusal;

import android.os.Bundle;
import android.util.DisplayMetrics;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppIconPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(ScaleWatchPlugin.class);
        registerPlugin(AppLaunchPlugin.class);
        registerPlugin(FamilyAlertsPlugin.class);
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
        fitWideScreen();
    }

    // A wide screen (a small tablet such as the HSD-215: 847 dp across) would get the computer layout, the
    // phone-sized frame in the middle with the rest left empty. There the pages are scaled so the short side
    // is a phone's width (PHONE_DP) and the app fills the screen; phones keep their own scale.
    private static final int PHONE_DP = 430, WIDE_DP = 560;

    private void fitWideScreen() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int shortPx = Math.min(metrics.widthPixels, metrics.heightPixels);
        if (shortPx / metrics.density <= WIDE_DP) return;
        getBridge().getWebView().setInitialScale(Math.round(shortPx * 100f / PHONE_DP));
    }

    // While the app is on screen its own Bluetooth link handles the base's drinks (ScaleWatchService).
    @Override
    public void onResume() {
        super.onResume();
        ScaleWatchService.appVisible = true;
    }

    @Override
    public void onPause() {
        ScaleWatchService.appVisible = false;
        super.onPause();
    }
}
