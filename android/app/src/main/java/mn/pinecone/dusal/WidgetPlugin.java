package mn.pinecone.dusal;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bridge between the web app and the home screen widgets (DrinkWidget and its kinds, see src/widget.ts).
@CapacitorPlugin(name = "DusalWidget")
public class WidgetPlugin extends Plugin {

    // Today's total from the log, the goal, whether it is a doctor's limit, the streak, whether the streak
    // broke yesterday, how many drinks, today's drinks by name, goal days in the last seven and yesterday's
    // total up to this hour. The widgets
    // pick their words and colours from these and the clock.
    @PluginMethod
    public void update(PluginCall call) {
        Integer drunk = call.getInt("drunk");
        Integer goal = call.getInt("goal");
        String day = call.getString("day");
        if (drunk == null || goal == null || day == null) {
            call.reject("drunk, goal and day are required");
            return;
        }
        getContext().getSharedPreferences(DrinkWidget.PREFS, Context.MODE_PRIVATE).edit()
            .putInt("drunk", drunk)
            .putInt("goal", goal)
            .putString("mode", call.getString("mode", "goal"))
            .putString("day", day)
            .putInt("streak", call.getInt("streak", 0))
            .putBoolean("broke", call.getBoolean("broke", false))
            .putInt("count", call.getInt("count", 0))
            .putString("kinds", call.getString("kinds", ""))
            .putInt("week", call.getInt("week", 0))
            .putInt("yesterday", call.getInt("yesterday", -1))
            .apply();
        DrinkWidget.refreshAll(getContext());
        call.resolve();
    }

    // How many Дусал widgets are on the home screen now, of any kind: the last onboarding step waits for one.
    @PluginMethod
    public void placed(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        int count = 0;
        for (Class<?> widget : new Class<?>[] { DrinkWidget.class, LimitWidget.class, RingWidget.class, MixWidget.class, GaugeWidget.class }) {
            count += manager.getAppWidgetIds(new ComponentName(getContext(), widget)).length;
        }
        JSObject result = new JSObject();
        result.put("count", count);
        call.resolve(result);
    }

    // Puts a widget on the home screen from the app (src/widgets-view.ts): the launcher asks the person to
    // place it. { pinned: false } where the launcher cannot, so the app shows the steps to do it by hand.
    @PluginMethod
    public void pin(PluginCall call) {
        Class<?> widget;
        switch (call.getString("kind", "")) {
            case "water": widget = DrinkWidget.class; break;
            case "left": widget = LimitWidget.class; break;
            case "ring": widget = RingWidget.class; break;
            case "mix": widget = MixWidget.class; break;
            case "gauges": widget = GaugeWidget.class; break;
            default: call.reject("unknown widget"); return;
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        boolean pinned = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported()
            && manager.requestPinAppWidget(new ComponentName(getContext(), widget), null, null);
        JSObject result = new JSObject();
        result.put("pinned", pinned);
        call.resolve(result);
    }
}
