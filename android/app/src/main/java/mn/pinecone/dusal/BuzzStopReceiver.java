package mn.pinecone.dusal;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// «Унтраах» on a past-the-limit notice (ScaleWatchService.notifyDrink), or the notice swiped away: the buzz and
// the sound stop (Buzz.stop), and the notice goes.
public class BuzzStopReceiver extends BroadcastReceiver {
    static final String EXTRA_ID = "id";

    @Override
    public void onReceive(Context context, Intent intent) {
        Buzz.stop(context);
        int id = intent.getIntExtra(EXTRA_ID, 0);
        if (id != 0) context.getSystemService(NotificationManager.class).cancel(id);
    }
}
