package mn.pinecone.dusal;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;

// Health Connect opens this when the user asks why Dusal wants their health data. It shows the
// privacy page that ships with the web assets (public/privacypolicy.html).
public class HealthRationaleActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView view = new WebView(this);
        view.loadUrl("file:///android_asset/public/privacypolicy.html");
        setContentView(view);
    }
}
