package mn.pinecone.dusal;

import android.content.Context;
import android.widget.RemoteViews;

// «Гурван хэмжүүр» (4×1, see DrinkWidget): three 270° gauges for today's share of the goal or limit, the
// streak out of a week, and goal days in the last seven. A gauge's full sweep is 1000 of its 1333.
public class GaugeWidget extends DrinkWidget {

    @Override
    RemoteViews build(Context context, Day d) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_gauges);
        float today = Math.min(1f, d.drunk / (float) d.goal);
        views.setProgressBar(R.id.widget_gauge1, 1333, Math.round(today * 1000), false);
        views.setTextViewText(R.id.widget_value1, Math.round(d.drunk * 100f / d.goal) + "%");
        views.setProgressBar(R.id.widget_gauge2, 1333, Math.round(Math.min(7, d.streak) / 7f * 1000), false);
        views.setTextViewText(R.id.widget_value2, d.limit ? "—" : String.valueOf(d.streak));
        views.setProgressBar(R.id.widget_gauge3, 1333, Math.round(Math.min(7, d.week) / 7f * 1000), false);
        views.setTextViewText(R.id.widget_value3, d.week + "/7");
        return views;
    }
}
