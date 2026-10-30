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

    // Today's total and the goal or doctor's limit, for the text of the next drink's notification.
    @PluginMethod
    public void setDay(PluginCall call) {
        String day = call.getString("day");
        Integer drunk = call.getInt("drunk"), goal = call.getInt("goal");
        if (day == null || drunk == null || goal == null) { call.reject("day, drunk and goal are required"); return; }
        ScaleWatchService.setDay(getContext(), day, drunk, goal, call.getString("mode", "goal"));
        call.resolve();
    }

    // The amount notices on screen: the strongest buzz and a loud sound (Buzz.java), which navigator.vibrate is not.
    @PluginMethod
    public void buzz(PluginCall call) {
        Buzz.strong(getContext(), call.getInt("overMl", 0));
        call.resolve();
    }

    // «Унтраах» on the app's notice: the buzz and the sound stop.
    @PluginMethod
    public void stopBuzz(PluginCall call) {
        Buzz.stop(getContext());
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
