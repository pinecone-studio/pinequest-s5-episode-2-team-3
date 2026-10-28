package mn.pinecone.dusal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppIconPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(ScaleWatchPlugin.class);
        registerPlugin(AppLaunchPlugin.class);
        super.onCreate(savedInstanceState);
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
