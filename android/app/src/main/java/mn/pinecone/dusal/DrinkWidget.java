package mn.pinecone.dusal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

// Home screen widget, Duolingo style: a square with the streak, a few words and the water drop.
// As the day goes on without enough water the colour moves from teal through blue and purple to
// red and the drop gets sadder. The widget works this out itself from the clock and what the app
// last reported (WidgetPlugin), every 30 minutes, so it changes even while the app stays closed.
// Tapping it opens the app.
public class DrinkWidget extends AppWidgetProvider {

    static final String PREFS = "dusal_widget";

    // One look per moment of the day: background, the drop's face, the words, and the "!" on the streak.
    enum Stage {
        MORNING(R.drawable.widget_bg_morning, R.drawable.notif_face_happy, "Ус уух цаг уу?", false),
        ON_TRACK(R.drawable.widget_bg_ontrack, R.drawable.notif_face_happy, "Нэг аяга уух уу?", false),
        THIRSTY(R.drawable.widget_bg_thirsty, R.drawable.notif_face_worried, "Цангаж байна…", false),
        LATE(R.drawable.widget_bg_late, R.drawable.notif_face_worried, "Ус уух цаг боллоо!", false),
        DRY(R.drawable.widget_bg_dry, R.drawable.notif_face_sad, "Ширгэж байна…", false),
        SAVE(R.drawable.widget_bg_save, R.drawable.notif_face_sad, "Streak-ээ авраарай!", true),
        LAST(R.drawable.widget_bg_last, R.drawable.notif_face_crying, "Сүүлийн боломж!", true),
        DONE(R.drawable.widget_bg_done, R.drawable.notif_face_happy, "Гайхалтай! Биеллээ", false),
        RESET(R.drawable.widget_bg_reset, R.drawable.notif_face_crying, "Дахин эхэлье", false),
        LIMIT(R.drawable.widget_bg_limit, R.drawable.notif_face_happy, "", false),
        LIMIT_NEAR(R.drawable.widget_bg_limit_near, R.drawable.notif_face_worried, "", false),
        LIMIT_OVER(R.drawable.widget_bg_limit_over, R.drawable.notif_face_crying, "", false);

        final int background;
        final int face;
        final String say;
        final boolean alert;

        Stage(int background, int face, String say, boolean alert) {
            this.background = background;
            this.face = face;
            this.say = say;
            this.alert = alert;
        }
    }

    // The waking day the goal is spread over, as in the app's reminders: 08:00 to 22:00.
    static final int DAY_START = 8;
    static final int DAY_END = 22;

    // Under a doctor's limit there is nothing to chase, only how much of it is left: calm, careful from
    // 80% of it, and a stop once it is passed. Otherwise: goal met → done;
    // a streak that broke yesterday → start again; late evening → save the streak; then by how far
    // behind the even pace through the waking day the person is.
    static Stage stage(int drunk, int goal, boolean limit, int streak, boolean broke, int hour) {
        if (limit) return drunk > goal ? Stage.LIMIT_OVER : drunk * 10 >= goal * 8 ? Stage.LIMIT_NEAR : Stage.LIMIT;
        if (drunk >= goal) return Stage.DONE;
        if (streak == 0 && broke) return Stage.RESET;
        if (hour >= DAY_END) return Stage.LAST;
        if (hour >= 20) return Stage.SAVE;
        if (hour >= 18 && drunk < goal * 3 / 4) return Stage.DRY;
        double passed = Math.max(0, Math.min(1, (hour - DAY_START) / (double) (DAY_END - DAY_START)));
        boolean behind = goal * passed - drunk > goal / 4.0;
        if (behind) return hour >= 15 ? Stage.LATE : Stage.THIRSTY;
        return hour < 11 ? Stage.MORNING : Stage.ON_TRACK;
    }

    static String ml(int value) { return String.format(Locale.US, "%,d", value); }

    // Today's coming drinking times as the app sent them ("08:00=300,12:00=300"): the first one not yet
    // passed, so the line moves on through the day even while the app stays closed.
    static String next(String times) {
        String now = new SimpleDateFormat("HH:mm", Locale.US).format(new Date());
        for (String slot : times.split(",")) {
            String[] p = slot.split("=");
            if (p.length == 2 && p[0].compareTo(now) >= 0) return "Дараагийн: " + p[0] + " · " + p[1] + " мл";
        }
        return null;
    }

    // A drink the base counted while the app was closed (ScaleWatchService), so the widget does not wait for the app.
    static void addDrunk(Context context, int amount) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean sameDay = today().equals(prefs.getString("day", ""));
        prefs.edit().putString("day", today()).putInt("drunk", (sameDay ? prefs.getInt("drunk", 0) : 0) + amount).apply();
        if (!sameDay) prefs.edit().remove("next").apply();
        refreshAll(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = views(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    // The same "YYYY-MM-DD" in local time that the app uses (dayKey in src/data.ts).
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DrinkWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = views(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews views(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // A day the app has not reported yet starts from zero water.
        boolean sameDay = today().equals(prefs.getString("day", ""));
        int drunk = sameDay ? prefs.getInt("drunk", 0) : 0;
        int goal = Math.max(1, prefs.getInt("goal", 2000));
        boolean limit = "limit".equals(prefs.getString("mode", "goal"));
        int streak = prefs.getInt("streak", 0);
        boolean broke = sameDay && prefs.getBoolean("broke", false);
        Stage s = stage(drunk, goal, limit, streak, broke, Calendar.getInstance().get(Calendar.HOUR_OF_DAY));

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_drink);
        views.setInt(R.id.widget_root, "setBackgroundResource", s.background);
        views.setImageViewResource(R.id.widget_face, s.face);
        views.setViewVisibility(R.id.widget_alert, s.alert && streak > 0 ? View.VISIBLE : View.GONE);
        if (limit && drunk > goal) {
            views.setTextViewText(R.id.widget_streak, "!");
            views.setTextViewText(R.id.widget_say, "+" + ml(drunk - goal) + " мл хэтэрлээ");
        } else if (limit) {
            // The big number is what is left of the limit; that is what matters through the day.
            views.setTextViewText(R.id.widget_streak, ml(goal - drunk));
            views.setTextViewText(R.id.widget_say, "мл үлдсэн · " + ml(goal) + " хүртэл");
        } else {
            views.setTextViewText(R.id.widget_streak, String.valueOf(streak));
            views.setTextViewText(R.id.widget_say, s.say);
        }
        // Nothing more to drink is suggested once a limit is reached or the goal is met.
        String next = s == Stage.LIMIT_OVER || s == Stage.DONE || (limit && drunk >= goal) ? null : next(sameDay ? prefs.getString("next", "") : "");
        views.setViewVisibility(R.id.widget_next, next == null ? View.GONE : View.VISIBLE);
        if (next != null) views.setTextViewText(R.id.widget_next, next);

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
            context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }
}
