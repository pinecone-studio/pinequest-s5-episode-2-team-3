package mn.pinecone.dusal;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// «PDF татах» on the nurse's report (src/nurse.ts). The app's WebView ignores window.print(), so the
// page sends its own HTML with the styles inlined; a WebView of its own lays it out and Android's print
// dialog opens on A4, where «Save as PDF» keeps it as a file.
@CapacitorPlugin(name = "DusalPrint")
public class PrintPlugin extends Plugin {
    // Held until the print job has its document, or the WebView is collected before it lays out.
    private WebView printing;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String name = call.getString("name", "Дусал");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getContext());
            view.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView page, String url) {
                    PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    PrintAttributes attributes = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
                    manager.print(name, page.createPrintDocumentAdapter(name), attributes);
                    printing = null;
                    call.resolve();
                }
            });
            printing = view;
            view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }
}
