package mn.pinecone.dusal;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

// Bridge between src/scale.ts and ScaleWatchService: watch the base while the app is closed.
@CapacitorPlugin(name = "DusalScaleWatch")
public class ScaleWatchPlugin extends Plugin {

    // The base's Bluetooth address, as the web app's Bluetooth plugin calls it (deviceId).
    @PluginMethod
    public void start(PluginCall call) {
        String address = call.getString("address");
        if (address == null) { call.reject("address is required"); return; }
        try {
            ScaleWatchService.start(getContext(), address);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("could not start watching the base", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        ScaleWatchService.stop(getContext());
        call.resolve();
    }

    // Drinks the service kept while the app was closed: { drinks: [{ baseId, boot, n, amountMl, secondsAgo, receivedAt }] }.
    @PluginMethod
    public void takeDrinks(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("drinks", new JSArray(ScaleWatchService.take(getContext()).toString()));
            call.resolve(result);
        } catch (JSONException e) {
            call.reject("could not read the kept drinks", e);
        }
    }
}
