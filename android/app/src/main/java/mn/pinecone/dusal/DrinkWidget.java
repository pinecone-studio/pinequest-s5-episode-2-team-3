package mn.pinecone.dusal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Home screen widget, Duolingo style: the water drop's face (the same mood as the launcher icon),
// the streak, a short nudge, today's water against the goal (or the doctor's limit) and a "+250 мл"
// button. The app writes all of it through WidgetPlugin. A tap on the button is kept here as a pending
// drink with its own ID until the app opens and moves it into the log, so it is never lost or doubled.
public class DrinkWidget extends AppWidgetProvider {

    static final String PREFS = "dusal_widget";
    static final String ACTION_ADD = "mn.pinecone.dusal.WIDGET_ADD";
    static final int CUP_ML = 250;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = views(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_ADD.equals(intent.getAction())) {
            addCup(context);
            refreshAll(context);
        }
    }

    // The same "YYYY-MM-DD" in local time that the app uses (dayKey in src/data.ts).
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    // What the app last reported for today; after midnight the widget starts again from zero.
    static int drunkToday(SharedPreferences prefs) {
        return today().equals(prefs.getString("day", "")) ? prefs.getInt("drunk", 0) : 0;
    }

    private static void addCup(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray pending;
        try {
            pending = new JSONArray(prefs.getString("pending", "[]"));
        } catch (JSONException e) {
            pending = new JSONArray();
        }
        try {
            JSONObject drink = new JSONObject();
            drink.put("id", UUID.randomUUID().toString());
            drink.put("ml", CUP_ML);
            drink.put("at", System.currentTimeMillis());
            pending.put(drink);
        } catch (JSONException e) {
            return;
        }
        // Shown straight away, with a cheer and a happy drop; the app's next report replaces it with the
        // real total, mood and nudge from the log. Yesterday's mood never carries into a new day.
        prefs.edit()
            .putString("pending", pending.toString())
            .putString("day", today())
            .putInt("drunk", drunkToday(prefs) + CUP_ML)
            .putString("mood", "Default")
            .putString("message", "+" + CUP_ML + " мл нэмлээ! 💧")
            .apply();
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DrinkWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = views(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    // The drop faces the reminders already use (res/drawable-nodpi/notif_face_*.png).
    private static int face(String mood) {
        switch (mood) {
            case "Worried": return R.drawable.notif_face_worried;
            case "Sad": return R.drawable.notif_face_sad;
            case "Crying": return R.drawable.notif_face_crying;
            default: return R.drawable.notif_face_happy;
        }
    }

    private static RemoteViews views(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int drunk = drunkToday(prefs);
        int goal = Math.max(1, prefs.getInt("goal", 2000));
        boolean limit = "limit".equals(prefs.getString("mode", "goal"));
        NumberFormat n = NumberFormat.getIntegerInstance(Locale.US);

        // A new day the app has not reported yet starts fresh and cheerful.
        boolean fresh = !today().equals(prefs.getString("day", ""));
        String mood = fresh ? "Default" : prefs.getString("mood", "Default");
        int streak = prefs.getInt("streak", 0);
        String message = fresh ? "Шинэ өдөр! Эхний аягаа уугаарай" : prefs.getString("message", "Ус уухаа бүү мартаарай");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_drink);
        views.setImageViewResource(R.id.widget_face, face(mood));
        views.setTextViewText(R.id.widget_streak, streak > 0 ? "🔥 " + streak : "");
        views.setTextViewText(R.id.widget_message, message);
        views.setTextViewText(R.id.widget_amount, n.format(drunk) + " / " + n.format(goal) + (limit ? " мл хязгаар" : " мл"));
        views.setProgressBar(R.id.widget_progress, 100, Math.min(100, drunk * 100 / goal), false);

        Intent add = new Intent(context, DrinkWidget.class).setAction(ACTION_ADD);
        views.setOnClickPendingIntent(R.id.widget_add, PendingIntent.getBroadcast(
            context, 0, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
            context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }
}
