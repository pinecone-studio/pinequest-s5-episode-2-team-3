package mn.pinecone.dusal;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;

// Swaps the launcher icon between the water drop's moods by enabling one <activity-alias> from
// AndroidManifest.xml (IconDefault, IconWorried, IconSad, IconCrying) and disabling the others.
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    private static final String[] MOODS = { "Default", "Worried", "Sad", "Crying" };

    @PluginMethod
    public void set(PluginCall call) {
        String mood = call.getString("mood", "Default");
        if (!Arrays.asList(MOODS).contains(mood)) {
            call.reject("Unknown mood: " + mood);
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        String prefix = MainActivity.class.getPackage().getName() + ".Icon";
        if (isOn(pm, new ComponentName(pkg, prefix + mood), mood)) {
            call.resolve();
            return;
        }
        // Enable the new icon before disabling the old one so the launcher is never left without an entry.
        pm.setComponentEnabledSetting(
            new ComponentName(pkg, prefix + mood),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        );
        for (String other : MOODS) {
            if (other.equals(mood)) continue;
            pm.setComponentEnabledSetting(
                new ComponentName(pkg, prefix + other),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
        }
        call.resolve();
    }

    // Only IconDefault is enabled in the manifest, so "default state" means on for it and off for the rest.
    private boolean isOn(PackageManager pm, ComponentName alias, String mood) {
        int state = pm.getComponentEnabledSetting(alias);
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return mood.equals("Default");
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }
}
