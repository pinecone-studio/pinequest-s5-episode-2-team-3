package mn.pinecone.dusal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

// Home screen widgets to pick from in the launcher, all in the One UI style: «Өнөөдрийн ус» (this class, 2×2,
// a deep-indigo score card), «Үлдсэн хэмжээ» (LimitWidget, 2×2, water in a black card), «Цагираг» (RingWidget,
// 2×2, a blue ring), «Ундааны задаргаа» (MixWidget, 4×2, a stacked bar) and «Гурван хэмжүүр» (GaugeWidget,
// 4×1, green gauges in a black pill). All draw from what the app last reported (WidgetPlugin) and the clock,
// every 30 minutes, so they change even while the app stays closed; drinks from the base are added as they
// come (ScaleWatchService). Tapping one opens the app.
public class DrinkWidget extends AppWidgetProvider {

    static final String PREFS = "dusal_widget";

    // One look per moment of the day: whether it is a warning, and a few words for it.
    enum Stage {
        MORNING(false, "Ус уух цаг уу?"),
        ON_TRACK(false, "Хэвийн"),
        THIRSTY(true, "Цангаж байна"),
        LATE(true, "Хоцорч байна"),
        DRY(true, "Ширгэж байна"),
        SAVE(true, "Streak-ээ авраарай"),
        LAST(true, "Сүүлийн боломж"),
        DONE(false, "Биеллээ 🎉"),
        RESET(false, "Дахин эхэлье"),
        LIMIT(false, "Хэвийн"),
        LIMIT_NEAR(true, "Ойртлоо"),
        LIMIT_OVER(true, "Хэтэрсэн");

        final boolean warn;
        final String say;

        Stage(boolean warn, String say) {
            this.warn = warn;
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

    // What the app reported, read once per drawing. A day the app has not reported yet starts from zero.
    static class Day {
        int drunk, goal, streak, count, week;
        // Drunk yesterday up to this time of day, for the change badge; -1 when not known.
        int yesterday;
        boolean limit;
        Stage stage;
        // Today's drinks by name, largest first, at most three ("Ус", 900).
        final List<String> names = new ArrayList<>();
        final List<Integer> amounts = new ArrayList<>();

        Day(Context context) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean sameDay = today().equals(prefs.getString("day", ""));
            drunk = sameDay ? prefs.getInt("drunk", 0) : 0;
            goal = Math.max(1, prefs.getInt("goal", 2000));
            limit = "limit".equals(prefs.getString("mode", "goal"));
            streak = prefs.getInt("streak", 0);
            count = sameDay ? prefs.getInt("count", 0) : 0;
            week = prefs.getInt("week", 0);
            yesterday = sameDay ? prefs.getInt("yesterday", -1) : -1;
            stage = stage(drunk, goal, limit, streak, sameDay && prefs.getBoolean("broke", false),
                Calendar.getInstance().get(Calendar.HOUR_OF_DAY));
            if (!sameDay) return;
            for (String kind : prefs.getString("kinds", "").split("\\|")) {
                String[] p = kind.split(":");
                if (p.length != 2 || names.size() == 3) continue;
                try { amounts.add(Integer.parseInt(p[1])); names.add(p[0]); } catch (NumberFormatException ignored) { }
            }
        }

        boolean over() { return limit && drunk > goal; }
    }

    static String ml(int value) { return String.format(Locale.US, "%,d", value); }

    // Litres with one decimal, for the big numbers: 1200 → "1.2".
    static String litres(int ml) { return String.format(Locale.US, "%.1f", ml / 1000f); }

    // The colour of a status word: red past a limit, amber for any other warning, green once the goal is met.
    static int statusColor(Context context, Stage s) {
        if (s == Stage.LIMIT_OVER) return context.getColor(R.color.widget_red);
        if (s.warn) return context.getColor(R.color.widget_amber);
        return context.getColor(s == Stage.DONE || s == Stage.LIMIT ? R.color.widget_green : R.color.widget_white);
    }

    // «Өнөөдрийн ус»: how many times, the litres with the change from yesterday at this hour, and a status word.
    RemoteViews build(Context context, Day d) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_drink);
        views.setTextViewText(R.id.widget_count, d.count + " удаа");
        views.setTextViewText(R.id.widget_big, litres(d.drunk));
        boolean known = d.yesterday >= 0;
        show(views, R.id.widget_badge, known);
        show(views, R.id.widget_delta, known);
        if (known) {
            views.setImageViewResource(R.id.widget_arrow, d.drunk >= d.yesterday ? R.drawable.ic_w_up : R.drawable.ic_w_down);
            views.setTextViewText(R.id.widget_delta, litres(Math.abs(d.drunk - d.yesterday)));
        }
        views.setTextViewText(R.id.widget_status, d.stage.say);
        views.setTextColor(R.id.widget_status, statusColor(context, d.stage));
        return views;
    }

    // A drink the base counted while the app was closed (ScaleWatchService), so the widgets do not wait for the app.
    static void addDrunk(Context context, int amount) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean sameDay = today().equals(prefs.getString("day", ""));
        // The base only weighs water: it goes to «Ус» in the drinks widget.
        StringBuilder kinds = new StringBuilder();
        boolean added = false;
        for (String kind : sameDay ? prefs.getString("kinds", "").split("\\|") : new String[0]) {
            String[] p = kind.split(":");
            if (p.length != 2) continue;
            int value;
            try { value = Integer.parseInt(p[1]) + (p[0].equals("Ус") ? amount : 0); } catch (NumberFormatException e) { continue; }
            added |= p[0].equals("Ус");
            kinds.append(kinds.length() > 0 ? "|" : "").append(p[0]).append(':').append(value);
        }
        if (!added) kinds.insert(0, "Ус:" + amount + (kinds.length() > 0 ? "|" : ""));
        prefs.edit()
            .putString("day", today())
            .putInt("drunk", (sameDay ? prefs.getInt("drunk", 0) : 0) + amount)
            .putInt("count", (sameDay ? prefs.getInt("count", 0) : 0) + 1)
            .putString("kinds", kinds.toString())
            .apply();
        refreshAll(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = withTap(context, build(context, new Day(context)));
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    // The same "YYYY-MM-DD" in local time that the app uses (dayKey in src/data.ts).
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        Day d = new Day(context);
        for (DrinkWidget widget : new DrinkWidget[] { new DrinkWidget(), new LimitWidget(), new RingWidget(), new MixWidget(), new GaugeWidget() }) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, widget.getClass()));
            if (ids.length == 0) continue;
            RemoteViews views = withTap(context, widget.build(context, d));
            for (int id : ids) manager.updateAppWidget(id, views);
        }
    }

    // A word or line led by a small dot in a colour, for the drinks widget's legend.
    static CharSequence dotted(int color, String text) {
        SpannableString s = new SpannableString("● " + text);
        s.setSpan(new ForegroundColorSpan(color), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    static void show(RemoteViews views, int id, boolean visible) {
        views.setViewVisibility(id, visible ? View.VISIBLE : View.GONE);
    }

    private static RemoteViews withTap(Context context, RemoteViews views) {
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
            context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }
}
