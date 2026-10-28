package mn.pinecone.dusal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Keeps the Bluetooth link to the smart base while the app is closed, so a drink shows up as a
// notification right away. While the app is on screen the web app's own link (src/scale.ts) saves and
// confirms drinks and this service only stays connected. In the background it keeps each drink here,
// confirms it to the base (which then offers the next one) and the app adds them to the log when it
// opens (ScaleWatchPlugin.takeDrinks). The UUIDs and bytes match firmware/firmware.ino.
public class ScaleWatchService extends Service {

    static final String PREFS = "dusal-scale-watch";
    private static final UUID SERVICE = UUID.fromString("d05a1000-6c2b-4b8e-9f3a-2f1e0c7a5b01");
    private static final UUID DRINK = UUID.fromString("d05a1002-6c2b-4b8e-9f3a-2f1e0c7a5b01");
    private static final UUID ACK = UUID.fromString("d05a1003-6c2b-4b8e-9f3a-2f1e0c7a5b01");
    private static final UUID ID = UUID.fromString("d05a1004-6c2b-4b8e-9f3a-2f1e0c7a5b01");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final String LINK_CHANNEL = "dusal-scale-link";
    private static final String DRINK_CHANNEL = "dusal-scale-drink";
    private static final int LINK_ID = 5100;
    private static final int SEEN_MAX = 64;

    // Set by MainActivity: true while the app is on screen.
    static volatile boolean appVisible = false;

    private BluetoothGatt gatt;
    private String baseId = "";
    // Android runs one GATT operation at a time; each waits for its callback before the next starts.
    private final ArrayDeque<Runnable> ops = new ArrayDeque<>();
    private boolean busy = false;

    static void start(Context context, String address) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("address", address).apply();
        androidx.core.content.ContextCompat.startForegroundService(context, new Intent(context, ScaleWatchService.class));
    }

    static void stop(Context context) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("address").apply();
        context.stopService(new Intent(context, ScaleWatchService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel link = new NotificationChannel(LINK_CHANNEL, "Суурьтай холболт", NotificationManager.IMPORTANCE_MIN);
            link.setShowBadge(false);
            manager.createNotificationChannel(link);
            manager.createNotificationChannel(new NotificationChannel(DRINK_CHANNEL, "Суурийн уулт", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE : 0;
        try {
            ServiceCompat.startForeground(this, LINK_ID, linkNotification("Суурийг хайж байна…"), type);
        } catch (RuntimeException e) {
            // No Bluetooth permission (or not allowed to start now): nothing to watch.
            stopSelf();
            return START_NOT_STICKY;
        }
        String address = getSharedPreferences(PREFS, MODE_PRIVATE).getString("address", null);
        if (address == null) { stopSelf(); return START_NOT_STICKY; }
        if (gatt == null) connect(address);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (gatt != null) {
            try { gatt.close(); } catch (SecurityException ignored) { }
            gatt = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void connect(String address) {
        BluetoothAdapter adapter = ((BluetoothManager) getSystemService(BLUETOOTH_SERVICE)).getAdapter();
        if (adapter == null) { stopSelf(); return; }
        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            // autoConnect: Android reconnects by itself whenever the base comes back in range.
            gatt = device.connectGatt(this, true, callback, BluetoothDevice.TRANSPORT_LE);
        } catch (SecurityException | IllegalArgumentException e) {
            stopSelf();
        }
    }

    private Notification linkNotification(String text) {
        return new NotificationCompat.Builder(this, LINK_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_drop)
            .setColor(0xFF4A90E2)
            .setContentTitle("Дусал суурь")
            .setContentText(text)
            .setContentIntent(openApp())
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }

    private void showLink(String text) {
        getSystemService(NotificationManager.class).notify(LINK_ID, linkNotification(text));
    }

    private PendingIntent openApp() {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // ---------- GATT ----------

    private void queue(Runnable op) {
        ops.add(op);
        if (!busy) next();
    }

    private void next() {
        Runnable op = ops.poll();
        busy = op != null;
        if (op == null) return;
        try { op.run(); } catch (SecurityException e) { next(); }
    }

    private BluetoothGattCharacteristic characteristic(UUID uuid) {
        BluetoothGattService service = gatt == null ? null : gatt.getService(SERVICE);
        return service == null ? null : service.getCharacteristic(uuid);
    }

    @SuppressWarnings("deprecation")
    private void read(UUID uuid) {
        queue(() -> {
            BluetoothGattCharacteristic c = characteristic(uuid);
            if (c == null || !gatt.readCharacteristic(c)) next();
        });
    }

    @SuppressWarnings("deprecation")
    private void subscribe(UUID uuid) {
        queue(() -> {
            BluetoothGattCharacteristic c = characteristic(uuid);
            BluetoothGattDescriptor d = c == null ? null : c.getDescriptor(CCCD);
            if (d == null || !gatt.setCharacteristicNotification(c, true)) { next(); return; }
            byte[] on = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
            boolean sent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) sent = gatt.writeDescriptor(d, on) == BluetoothGatt.GATT_SUCCESS;
            else { d.setValue(on); sent = gatt.writeDescriptor(d); }
            if (!sent) next();
        });
    }

    @SuppressWarnings("deprecation")
    private void write(UUID uuid, byte[] value) {
        queue(() -> {
            BluetoothGattCharacteristic c = characteristic(uuid);
            if (c == null) { next(); return; }
            int type = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
            boolean sent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) sent = gatt.writeCharacteristic(c, value, type) == BluetoothGatt.GATT_SUCCESS;
            else { c.setWriteType(type); c.setValue(value); sent = gatt.writeCharacteristic(c); }
            if (!sent) next();
        });
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                showLink("Суурьтай холбогдсон");
                try { if (!g.discoverServices()) g.disconnect(); } catch (SecurityException ignored) { }
            } else if (state == BluetoothProfile.STATE_DISCONNECTED) {
                ops.clear();
                busy = false;
                showLink("Суурийг хайж байна…");
                // With autoConnect the same object connects again once the base is back.
                try { g.connect(); } catch (SecurityException ignored) { }
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            read(ID);
            subscribe(DRINK);
            // A drink already waiting is notified again only after a few seconds; take it now.
            read(DRINK);
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) received(c.getUuid(), value);
            next();
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) received(c.getUuid(), c.getValue());
            next();
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            received(c.getUuid(), value);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            received(c.getUuid(), c.getValue());
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) { next(); }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) { next(); }
    };

    // ---------- Drinks ----------

    private void received(UUID uuid, byte[] value) {
        if (value == null) return;
        if (ID.equals(uuid)) { baseId = new String(value, StandardCharsets.US_ASCII).trim(); return; }
        // On screen, the app's own link saves and confirms the drink.
        if (!DRINK.equals(uuid) || value.length < 14 || appVisible || baseId.isEmpty()) return;
        ByteBuffer b = ByteBuffer.wrap(value).order(ByteOrder.LITTLE_ENDIAN);
        long boot = b.getInt(0) & 0xFFFFFFFFL, n = b.getInt(4) & 0xFFFFFFFFL;
        int amount = b.getShort(8) & 0xFFFF;
        long ago = b.getInt(10) & 0xFFFFFFFFL;
        String id = baseId + "-e-" + boot + "-" + n;
        // A drink is confirmed only once it is kept here; a resend of one already kept is just confirmed again.
        if (keep(this, baseId, id, boot, n, amount, ago == 0xFFFFFFFFL ? -1 : ago)) notifyDrink(id, amount);
        write(ACK, ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putInt((int) boot).putInt((int) n).array());
    }

    // False when this drink was kept before.
    // Static, so it shares one lock with take().
    private static synchronized boolean keep(Context context, String baseId, String id, long boot, long n, int amount, long secondsAgo) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONArray seen = new JSONArray(prefs.getString("seen", "[]"));
            for (int i = 0; i < seen.length(); i++) if (id.equals(seen.getString(i))) return false;
            JSONArray drinks = new JSONArray(prefs.getString("drinks", "[]"));
            drinks.put(new JSONObject()
                .put("baseId", baseId).put("boot", boot).put("n", n).put("amountMl", amount)
                .put("secondsAgo", secondsAgo).put("receivedAt", System.currentTimeMillis()));
            seen.put(id);
            while (seen.length() > SEEN_MAX) seen.remove(0);
            prefs.edit().putString("drinks", drinks.toString()).putString("seen", seen.toString()).commit();
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    // Today's total as the app last reported it (ScaleWatchPlugin.setDay), plus this drink. Under a doctor's
    // limit the notification says how much is left, warns when it is nearly used up and when it is passed.
    private void notifyDrink(String id, int amount) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        int drunk = (today.equals(prefs.getString("day", null)) ? prefs.getInt("drunk", 0) : 0) + amount;
        prefs.edit().putString("day", today).putInt("drunk", drunk).apply();
        int goal = prefs.getInt("goal", 0);
        boolean limit = "limit".equals(prefs.getString("mode", "goal"));
        String title = "💧 " + amount + " мл ус уулаа", text, face = "notif_face_happy";
        if (goal <= 0) text = "Суурь бүртгэлээ. Апп нээхэд өнөөдрийн дүнд нэмэгдэнэ.";
        else if (limit && drunk > goal) {
            title = "⚠️ Эмчийн хязгаараас хэтэрлээ";
            text = "Өнөөдөр " + ml(drunk) + " / " + ml(goal) + " мл. Өнөөдөр дахиж уухаас зайлсхийгээрэй.";
            face = "notif_face_crying";
        } else if (limit && drunk * 10 >= goal * 8) {
            text = "Хязгаараас ердөө " + ml(goal - drunk) + " мл үлдлээ. Бага бага балгаарай.";
            face = "notif_face_worried";
        } else if (limit) text = "Хязгаараас " + ml(goal - drunk) + " мл үлдлээ · өнөөдөр " + ml(drunk) + " / " + ml(goal) + " мл.";
        else if (drunk >= goal) text = "Өдрийн зорилт биеллээ: " + ml(drunk) + " / " + ml(goal) + " мл.";
        else text = "Өнөөдөр " + ml(drunk) + " / " + ml(goal) + " мл · дахиад " + ml(goal - drunk) + " мл.";
        Notification notification = new NotificationCompat.Builder(this, DRINK_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_drop)
            .setColor(0xFF4A90E2)
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(getResources(), getResources().getIdentifier(face, "drawable", getPackageName())))
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .build();
        try { getSystemService(NotificationManager.class).notify(id.hashCode(), notification); } catch (SecurityException ignored) { }
    }

    private static String ml(int value) { return String.format(java.util.Locale.US, "%,d", value); }

    static void setDay(Context context, String day, int drunk, int goal, String mode) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString("day", day).putInt("drunk", drunk).putInt("goal", goal).putString("mode", mode).apply();
    }

    // The kept drinks, handed to the app once, then forgotten here.
    static synchronized JSONArray take(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray drinks;
        try { drinks = new JSONArray(prefs.getString("drinks", "[]")); } catch (JSONException e) { drinks = new JSONArray(); }
        prefs.edit().remove("drinks").commit();
        return drinks;
    }
}
