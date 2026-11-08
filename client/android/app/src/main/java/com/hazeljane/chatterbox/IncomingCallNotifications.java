package com.hazeljane.chatterbox;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.RemoteMessage;

public final class IncomingCallNotifications {

    public static final String CHANNEL_ID = "chatterbox_incoming_calls";

    public static final String ACTION_OPEN =
            "com.hazeljane.chatterbox.OPEN_INCOMING_CALL";

    public static final String ACTION_ANSWER =
            "com.hazeljane.chatterbox.ANSWER_CALL";

    public static final String ACTION_DECLINE =
            "com.hazeljane.chatterbox.DECLINE_CALL";

    public static final String EXTRA_CALL_ID = "callId";
    public static final String EXTRA_CALLER_NAME = "callerName";
    public static final String EXTRA_CALL_TYPE = "callType";
    public static final String EXTRA_CALL_ACTION = "callAction";

    private IncomingCallNotifications() {}

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager =
                    (NotificationManager) context.getSystemService(
                            Context.NOTIFICATION_SERVICE
                    );

            if (manager == null) return;

            Uri ringtone = RingtoneManager.getDefaultUri(
                    RingtoneManager.TYPE_RINGTONE
            );

            AudioAttributes audioAttributes =
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();

            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Incoming Calls",
                    NotificationManager.IMPORTANCE_HIGH
            );

            channel.setDescription("Incoming Chatterbox audio and video calls");
            channel.enableVibration(true);
            channel.setVibrationPattern(
                    new long[]{0, 500, 300, 500}
            );
            channel.setSound(ringtone, audioAttributes);
            channel.setLockscreenVisibility(
                    android.app.Notification.VISIBILITY_PUBLIC
            );

            manager.createNotificationChannel(channel);
        }
    }
public static void show(
        Context context,
        RemoteMessage remoteMessage
) {
    if (remoteMessage == null) return;

    show(
            context,
            remoteMessage.getData().get("callId"),
            remoteMessage.getData().get("callerName"),
            remoteMessage.getData().get("callType")
    );
}

public static void show(
        Context context,
        String callId,
        String callerName,
        String callType
) {
    if (callId == null || callId.trim().isEmpty()) return;

    if (callerName == null || callerName.trim().isEmpty()) {
        callerName = "Someone";
    }

    boolean videoCall = "video".equalsIgnoreCase(callType);

    String callDescription = videoCall
            ? "Incoming video call"
            : "Incoming audio call";

    createChannel(context);

    Intent openIntent = createIntent(
            context, ACTION_OPEN, callId, callerName, callType
    );

    PendingIntent openPendingIntent = PendingIntent.getActivity(
            context,
            notificationId(callId),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Intent answerIntent = createIntent(
            context, ACTION_ANSWER, callId, callerName, callType
    );

    PendingIntent answerPendingIntent = PendingIntent.getActivity(
            context,
            notificationId(callId) + 1,
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Intent declineIntent = createIntent(
            context, ACTION_DECLINE, callId, callerName, callType
    );

    PendingIntent declinePendingIntent = PendingIntent.getActivity(
            context,
            notificationId(callId) + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(callerName)
                    .setContentText(callDescription)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setContentIntent(openPendingIntent)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setTimeoutAfter(45000)
                    .addAction(
                            android.R.drawable.sym_action_call,
                            "Answer",
                            answerPendingIntent
                    )
                    .addAction(
                            android.R.drawable.ic_menu_close_clear_cancel,
                            "Decline",
                            declinePendingIntent
                    );

    try {
        NotificationManagerCompat.from(context).notify(
                notificationId(callId),
                builder.build()
        );
    } catch (SecurityException exception) {
        android.util.Log.e(
                "ChatterboxCalls",
                "Notification permission is not granted",
                exception
        );
    }
}

    public static void dismiss(Context context, String callId) {
        if (callId == null || callId.trim().isEmpty()) return;

        NotificationManagerCompat.from(context).cancel(
                notificationId(callId)
        );
    }

    private static Intent createIntent(
            Context context,
            String action,
            String callId,
            String callerName,
            String callType
    ) {
        Intent intent = new Intent(context, MainActivity.class);

        intent.setAction(action);
        intent.putExtra(EXTRA_CALL_ID, callId);
        intent.putExtra(EXTRA_CALLER_NAME, callerName);
        intent.putExtra(EXTRA_CALL_TYPE, callType);
        intent.putExtra(EXTRA_CALL_ACTION, action);

        intent.addFlags(
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        );

        return intent;
    }

    private static int notificationId(String callId) {
        int id = callId.hashCode() & 0x7fffffff;
        return id == 0 ? 1 : id;
    }
}