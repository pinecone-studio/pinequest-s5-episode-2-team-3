package mn.pinecone.dusal;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.TimeUnit;

// The family alerts (src/family-alerts.ts): which family this phone is in and who it is, kept for
// FamilyAlertWorker, which asks the server every 15 minutes, app open or not. checkNow asks at once
// (the app does after each family report); stop is for leaving the family.
@CapacitorPlugin(name = "DusalFamilyAlerts")
public class FamilyAlertsPlugin extends Plugin {
    static final String PREFS = "dusal-family-alerts";
    private static final String PERIODIC = "dusal-family-alerts";
    private static final String NOW = "dusal-family-alerts-now";

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String api = call.getString("api"), base = call.getString("base"), member = call.getString("member");
        if (api == null || base == null || member == null) {
            call.reject("api, base and member are needed");
            return;
        }
        prefs(getContext()).edit().putString("api", api).putString("base", base).putString("member", member).apply();
        PeriodicWorkRequest every = new PeriodicWorkRequest.Builder(FamilyAlertWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(online()).build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, every);
        call.resolve();
    }

    @PluginMethod
    public void checkNow(PluginCall call) {
        if (prefs(getContext()).getString("base", null) != null) {
            OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(FamilyAlertWorker.class).setConstraints(online()).build();
            WorkManager.getInstance(getContext()).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, once);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(PERIODIC);
        prefs(getContext()).edit().clear().apply();
        call.resolve();
    }
}
