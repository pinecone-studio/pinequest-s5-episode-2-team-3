package mn.pinecone.dusal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

// Asks the server what to tell this phone about the rest of the family (GET /api/bases/{base}/alerts,
// rules in shared/family.ts familyAlerts) and shows each one once: a family member under a doctor's
// limit who passed it, is close to it, or has gone hours without a drink logged.
public class FamilyAlertWorker extends Worker {
    private static final String CHANNEL = "dusal-family";

    public FamilyAlertWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = FamilyAlertsPlugin.prefs(context);
        String api = prefs.getString("api", null), base = prefs.getString("base", null), member = prefs.getString("member", null);
        if (api == null || base == null || member == null) return Result.success();
        Calendar now = Calendar.getInstance();
        String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now.getTime());
        // As JavaScript's getTimezoneOffset: minutes to add to local time for UTC.
        int offset = -TimeZone.getDefault().getOffset(now.getTimeInMillis()) / 60000;
        try {
            String url = api + "/api/bases/" + URLEncoder.encode(base, "UTF-8") + "/alerts?day=" + day
                + "&hour=" + now.get(Calendar.HOUR_OF_DAY) + "&offset=" + offset + "&me=" + URLEncoder.encode(member, "UTF-8");
            JSONArray alerts = new JSONObject(get(url)).getJSONArray("alerts");
            // Keys said before, today's only (each key starts with the day).
            Set<String> said = new HashSet<>();
            for (String key : prefs.getStringSet("said", new HashSet<>())) if (key.startsWith(day)) said.add(key);
            for (int i = 0; i < alerts.length(); i++) {
                JSONObject alert = alerts.getJSONObject(i);
                String key = alert.getString("key");
                if (said.add(key)) show(context, key, alert.getString("kind"), alert.getString("title"), alert.getString("body"));
            }
            prefs.edit().putStringSet("said", said).apply();
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    private static String get(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        try {
            if (connection.getResponseCode() != 200) throw new Exception("HTTP " + connection.getResponseCode());
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return body.toString();
        } finally {
            connection.disconnect();
        }
    }

    private static void show(Context context, String key, String kind, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Гэр бүлийн анхааруулга", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Эмчийн хязгаартай гэр бүлийн гишүүн хязгаараа давах, ойртох, удаан ус уугаагүй үед");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, key.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        int face = "over".equals(kind) ? R.drawable.notif_face_crying : R.drawable.notif_face_worried;
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_drop)
            .setColor(0xFF4A90E2)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), face))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(context).notify(key.hashCode(), notification.build());
        } catch (SecurityException e) {
            // Notifications not allowed: nothing to show.
        }
    }
}
