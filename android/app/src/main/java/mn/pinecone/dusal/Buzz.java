package mn.pinecone.dusal;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

// The strongest buzz the phone has, for the amount notices (near, past the goal or limit): four long
// pulses at full strength. Only past the goal or limit, an urgent tone too (res/raw/sos_alert.wav: Mixkit's
// "Urgent simple tone loop", 9.5 s, made mono 22 kHz with afconvert); close to it the phone only buzzes. A
// notification channel only sets the pattern, at the phone's own (often soft) strength; this sets the
// strength too. Both go as an alarm, so they come at the alarm's volume, also with the phone on silent.
final class Buzz {
    // ms off, on, off, on...; the same as BUZZ in src/native-reminders.ts.
    static final long[] PATTERN = { 0, 1000, 300, 1000, 300, 1000, 300, 1500 };

    private static MediaPlayer playing;
    // The buzzer grows louder with every 10 ml past the goal or limit: 10 ml past is soft, 160 ml and
    // more at full volume.
    private static final float SOFTEST = 0.25f, PER_10_ML = 0.05f;
    // Each time it also starts nearly silent and swells to that loudness over RAMP_MS, in RAMP_STEPS.
    private static final float RAMP_FROM = 0.05f;
    private static final int RAMP_MS = 3000, RAMP_STEPS = 20;
    private static final Handler ramp = new Handler(Looper.getMainLooper());

    static float loudness(int overMl) {
        return Math.min(1f, SOFTEST + PER_10_ML * (Math.max(10, overMl) / 10 - 1));
    }

    private Buzz() {}

    // `overMl`: how far past the goal or limit today now is, for the loudness; 0 when close to it (a buzz, no sound).
    static void strong(Context context, int overMl) {
        Vibrator vibrator = vibrator(context);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        AudioAttributes alarm = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int[] amplitudes = new int[PATTERN.length];
            for (int i = 1; i < amplitudes.length; i += 2) amplitudes[i] = 255;
            vibrator.vibrate(VibrationEffect.createWaveform(PATTERN, amplitudes, -1), alarm);
        } else {
            vibrator.vibrate(PATTERN, -1, alarm);
        }
        if (overMl > 0) ring(context, alarm, loudness(overMl));
    }

    // «Унтраах»: on the notice (BuzzStopReceiver) or in the app (ScaleWatchPlugin.stopBuzz).
    static synchronized void stop(Context context) {
        Vibrator vibrator = vibrator(context);
        if (vibrator != null) vibrator.cancel();
        ramp.removeCallbacksAndMessages(null);
        if (playing != null) { playing.release(); playing = null; }
    }

    private static Vibrator vibrator(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? context.getSystemService(VibratorManager.class).getDefaultVibrator()
            : (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    // A new alert cuts the one still playing.
    private static synchronized void ring(Context context, AudioAttributes alarm, float volume) {
        ramp.removeCallbacksAndMessages(null);
        if (playing != null) { playing.release(); playing = null; }
        MediaPlayer player = new MediaPlayer();
        try {
            player.setAudioAttributes(alarm);
            player.setDataSource(context, Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.sos_alert));
            player.prepare();
        } catch (java.io.IOException | RuntimeException e) {
            player.release();
            return;
        }
        player.setOnCompletionListener(done -> {
            synchronized (Buzz.class) { if (playing == done) playing = null; }
            done.release();
        });
        float from = Math.min(RAMP_FROM, volume);
        player.setVolume(from, from);
        playing = player;
        player.start();
        for (int step = 1; step <= RAMP_STEPS; step++) {
            float level = from + (volume - from) * step / RAMP_STEPS;
            ramp.postDelayed(() -> {
                synchronized (Buzz.class) { if (playing == player) player.setVolume(level, level); }
            }, (long) RAMP_MS * step / RAMP_STEPS);
        }
    }
}
