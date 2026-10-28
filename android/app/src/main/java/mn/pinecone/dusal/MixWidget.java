package mn.pinecone.dusal;

import android.content.Context;
import android.widget.RemoteViews;

// «Ундааны задаргаа» (4×2, see DrinkWidget): today's top three drinks with their ml, the total, and a
// stacked bar of them against the goal or limit (the rest of it in grey).
public class MixWidget extends DrinkWidget {

    private static final int[] LINES = { R.id.widget_kind1, R.id.widget_kind2, R.id.widget_kind3 };
    private static final int[] COLORS = { R.color.widget_blue, R.color.widget_cyan, R.color.widget_bar_green };

    @Override
    RemoteViews build(Context context, Day d) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mix);
        float scale = Math.max(d.goal, d.drunk);
        int sum = 0;
        int[] upTo = new int[3];
        for (int i = 0; i < 3; i++) {
            boolean has = i < d.names.size();
            show(views, LINES[i], has || i == 0);
            if (has) {
                views.setTextViewText(LINES[i], dotted(context.getColor(COLORS[i]), d.names.get(i) + "  " + ml(d.amounts.get(i)) + " мл"));
                sum += d.amounts.get(i);
            }
            upTo[i] = Math.round(Math.min(1f, sum / scale) * 1000);
        }
        if (d.names.isEmpty()) views.setTextViewText(R.id.widget_kind1, "Өнөөдөр хараахан уугаагүй");
        views.setTextViewText(R.id.widget_big, ml(d.drunk));
        views.setTextViewText(R.id.widget_unit, "мл / " + ml(d.goal));
        views.setProgressBar(R.id.widget_seg_front, 1000, upTo[0], false);
        views.setInt(R.id.widget_seg_front, "setSecondaryProgress", upTo[1]);
        views.setProgressBar(R.id.widget_seg_back, 1000, upTo[2], false);
        return views;
    }
}
