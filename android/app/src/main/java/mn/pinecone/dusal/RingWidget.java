package mn.pinecone.dusal;

import android.content.Context;
import android.widget.RemoteViews;

// «Цагираг» (2×2, see DrinkWidget): a black card with a blue ring that fills toward the goal or limit, the
// number inside (what is left under a limit), and the day's words under it, a warning in its colour.
public class RingWidget extends DrinkWidget {

    @Override
    RemoteViews build(Context context, Day d) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_ring);
        views.setProgressBar(R.id.widget_ring, 1000, d.over() ? 1000 : Math.round(Math.min(1f, d.drunk / (float) d.goal) * 1000), false);
        if (d.over()) {
            views.setTextViewText(R.id.widget_big, "+" + litres(d.drunk - d.goal));
            views.setTextViewText(R.id.widget_unit, "л хэтэрсэн");
        } else if (d.limit) {
            views.setTextViewText(R.id.widget_big, litres(d.goal - d.drunk));
            views.setTextViewText(R.id.widget_unit, "л үлдсэн");
        } else {
            views.setTextViewText(R.id.widget_big, litres(d.drunk));
            views.setTextViewText(R.id.widget_unit, "/ " + litres(d.goal) + " л");
        }
        String say = d.stage == Stage.LIMIT ? "Хязгаар " + ml(d.goal) + " мл" : d.stage == Stage.LIMIT_OVER ? "Усны хэмжээ хэтэрсэн" : d.stage.say;
        views.setTextViewText(R.id.widget_line, say);
        views.setTextColor(R.id.widget_line, statusColor(context, d.stage));
        return views;
    }
}
