package mn.pinecone.dusal;

import android.content.Context;
import android.widget.RemoteViews;

// «Үлдсэн хэмжээ» (2×2, see DrinkWidget): see-through blue water in a black card. Under a doctor's limit the
// water is what is left of it and goes down as the day goes on; for a goal it is what has been drunk and
// goes up. A green, amber or red word says how it stands and a line under it what to do.
public class LimitWidget extends DrinkWidget {

    @Override
    RemoteViews build(Context context, Day d) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_limit);
        int left = d.goal - d.drunk;
        float full = d.limit ? Math.max(0, left) / (float) d.goal : Math.min(1f, d.drunk / (float) d.goal);
        views.setInt(R.id.widget_water, "setImageLevel", Math.round(full * 10000));
        views.setTextViewText(R.id.widget_title, d.limit ? "Эмчийн хязгаар" : "Үлдсэн ус");
        views.setTextViewText(R.id.widget_big, d.over() ? "+" + litres(-left) : litres(Math.max(0, left)));
        views.setTextViewText(R.id.widget_unit, d.over() ? "л хэтэрсэн" : d.limit ? "л үлдсэн" : "л дутуу");
        views.setTextViewText(R.id.widget_status, d.stage.say);
        views.setTextColor(R.id.widget_status, statusColor(context, d.stage));
        String line;
        if (d.stage == Stage.LIMIT_OVER) line = "Өнөөдөр дахиж уухгүй";
        else if (d.stage == Stage.LIMIT_NEAR) line = "Бага бага балгаарай";
        else if (d.limit) line = "Хязгаар " + ml(d.goal) + " мл";
        else if (left <= 0) line = "Сайн байна!";
        else line = "Нийт " + ml(d.goal) + " мл-ээс";
        views.setTextViewText(R.id.widget_line, line);
        return views;
    }
}
