package mn.pinecone.dusal;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Opens another app by its package (Galaxy Wearable for linking a watch, watch-connect.ts); when it is
// not installed, its Play Store page opens instead. The packages are listed under <queries>.
@CapacitorPlugin(name = "AppLaunch")
public class AppLaunchPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null) {
            call.reject("No package");
            return;
        }
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        boolean installed = launch != null;
        Intent intent = installed ? launch : new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            call.reject("Could not open " + pkg);
            return;
        }
        JSObject result = new JSObject();
        result.put("installed", installed);
        call.resolve(result);
    }
}
