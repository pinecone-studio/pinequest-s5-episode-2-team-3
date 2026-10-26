package mn.pinecone.dusal;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Bridge between the web app and DrinkWidget (see src/widget.ts).
@CapacitorPlugin(name = "DusalWidget")
public class WidgetPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(DrinkWidget.PREFS, Context.MODE_PRIVATE);
    }

    // Today's total from the log, the goal, whether it is a doctor's limit, and how the drop looks:
    // mood (Default, Worried, Sad, Crying), streak in days and the nudge under it.
    @PluginMethod
    public void update(PluginCall call) {
        Integer drunk = call.getInt("drunk");
        Integer goal = call.getInt("goal");
        String day = call.getString("day");
        if (drunk == null || goal == null || day == null) {
            call.reject("drunk, goal and day are required");
            return;
        }
        prefs().edit()
            .putInt("drunk", drunk)
            .putInt("goal", goal)
            .putString("mode", call.getString("mode", "goal"))
            .putString("day", day)
            .putString("mood", call.getString("mood", "Default"))
            .putInt("streak", call.getInt("streak", 0))
            .putString("message", call.getString("message", ""))
            .apply();
        DrinkWidget.refreshAll(getContext());
        call.resolve();
    }

    // Cups added on the widget that the log does not have yet. They stay until clearPending.
    @PluginMethod
    public void pending(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("drinks", new JSArray(prefs().getString("pending", "[]")));
        } catch (JSONException e) {
            result.put("drinks", new JSArray());
        }
        call.resolve(result);
    }

    // Called once the app has saved these drinks; anything added on the widget meanwhile stays.
    @PluginMethod
    public void clearPending(PluginCall call) {
        JSArray ids = call.getArray("ids");
        Set<String> saved = new HashSet<>();
        try {
            if (ids != null) saved.addAll(ids.<String>toList());
            JSONArray before = new JSONArray(prefs().getString("pending", "[]"));
            JSONArray after = new JSONArray();
            for (int i = 0; i < before.length(); i++) {
                JSONObject drink = before.getJSONObject(i);
                if (!saved.contains(drink.optString("id"))) after.put(drink);
            }
            prefs().edit().putString("pending", after.toString()).apply();
            call.resolve();
        } catch (JSONException e) {
            call.reject("Could not read the widget's pending drinks", e);
        }
    }
}
