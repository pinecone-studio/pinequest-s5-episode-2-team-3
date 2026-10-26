package mn.pinecone.dusal;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bridge between the web app and DrinkWidget (see src/widget.ts).
@CapacitorPlugin(name = "DusalWidget")
public class WidgetPlugin extends Plugin {

    // Today's total from the log, the goal, whether it is a doctor's limit, the streak, and whether
    // the streak broke yesterday. The widget picks its colour and face from these and the clock.
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
            .apply();
        DrinkWidget.refreshAll(getContext());
        call.resolve();
    }
}
