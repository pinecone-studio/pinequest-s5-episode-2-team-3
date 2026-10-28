package mn.pinecone.dusal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.os.Build;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

// Home screen widget in the style of health apps: a plain card with one big number and a progress bar.
// Colour is used only on the bar and a dot before the bottom line. For a goal the bar fills toward it and
// turns amber, then red, as the day runs on without enough water; under a doctor's limit the number is
// what is left of it, the bar turns amber at 80% and red once it is passed. The line under the bar is the next drinking time, or a few words.
// The widget works this out itself from the clock and what the app last reported (WidgetPlugin), every
// 30 minutes, so it changes even while the app stays closed. Tapping it opens the app.
public class DrinkWidget extends AppWidgetProvider {

    static final String PREFS = "dusal_widget";

    // Colour roles (res/values/widget_colors.xml, dark in values-night): the accent, a warning, past the limit.
    static final int ACCENT = R.color.widget_accent, WARN = R.color.widget_warn, OVER = R.color.widget_over;

    // One look per moment of the day: the bar's colour role and the words under it.
    enum Stage {
        MORNING(ACCENT, "Ус уух цаг уу?"),
        ON_TRACK(ACCENT, "Хэвийн явж байна"),
        THIRSTY(WARN, "Цангаж байна…"),
        LATE(WARN, "Ус уух цаг боллоо!"),
        DRY(OVER, "Ширгэж байна…"),
        SAVE(OVER, "Streak-ээ авраарай!"),
        LAST(OVER, "Сүүлийн боломж!"),
        DONE(ACCENT, "Зорилт биеллээ 🎉"),
        RESET(ACCENT, "Дахин эхэлье"),
        LIMIT(ACCENT, ""),
        LIMIT_NEAR(WARN, "Хязгаарт ойртлоо"),
        LIMIT_OVER(OVER, "Усны хэмжээ хэтэрсэн");

        final int color;
        final String say;

        Stage(int color, String say) {
            this.color = color;
            this.say = say;
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
            if (p.length == 2 && p[0].compareTo(now) >= 0) return "Дараа " + p[0] + " · " + p[1] + " мл";
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
        boolean over = limit && drunk > goal;
        views.setProgressBar(R.id.widget_bar, 1000, over ? 1000 : Math.round(Math.min(1f, drunk / (float) goal) * 1000), false);
        // The bar is the accent from the layout; a warning recolours it (Android 12+ can do that on a widget).
        if (s.color != ACCENT && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(R.id.widget_bar, "setProgressTintList", ColorStateList.valueOf(context.getColor(s.color)));
        }
        if (over) {
            views.setTextViewText(R.id.widget_big, "+" + ml(drunk - goal));
            views.setTextViewText(R.id.widget_unit, "мл хэтэрсэн");
        } else if (limit) {
            // What is left of the limit is what matters through the day.
            views.setTextViewText(R.id.widget_big, ml(goal - drunk));
            views.setTextViewText(R.id.widget_unit, "мл үлдсэн");
        } else {
            views.setTextViewText(R.id.widget_big, ml(drunk));
            views.setTextViewText(R.id.widget_unit, "/ " + ml(goal) + " мл");
        }
        views.setViewVisibility(R.id.widget_streak, !limit && streak > 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_streak, "🔥 " + streak);
        // Nothing more to drink is suggested once a limit is reached or the goal is met.
        String next = s == Stage.DONE || (limit && drunk >= goal) ? null : next(sameDay ? prefs.getString("next", "") : "");
        String line = next != null ? next : !s.say.isEmpty() ? s.say : ml(drunk) + " / " + ml(goal) + " мл";
        // The words stay in the text colour; a small dot in the stage's colour carries the warning.
        SpannableString text = new SpannableString("● " + line);
        text.setSpan(new ForegroundColorSpan(context.getColor(s.color)), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        views.setTextViewText(R.id.widget_line, text);

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
            context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }
}
