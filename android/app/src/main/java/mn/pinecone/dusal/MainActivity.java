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
        fitTablet();
    }

    // The pages are laid out for a phone (about 430 CSS px wide). On a tablet they would sit small in the
    // middle, so the WebView is zoomed until that width fills the screen's shorter side: everything grows
    // with it, text, buttons and pictures alike. Phones are left as they are.
    private static final int PHONE_CSS_PX = 430;
    private void fitTablet() {
        if (getResources().getConfiguration().smallestScreenWidthDp < 560) return;
        DisplayMetrics m = getResources().getDisplayMetrics();
        int shortSide = Math.min(m.widthPixels, m.heightPixels);
        getBridge().getWebView().setInitialScale(shortSide * 100 / PHONE_CSS_PX);
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
