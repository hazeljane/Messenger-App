package com.hazeljane.chatterbox;

import android.os.Bundle;
import android.webkit.WebView;
import android.os.Build;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {

    private static final String EVENT_INCOMING_CALL =
            "chatterboxIncomingCallAction";

    private static final String TAG = "ChatterboxCalls";

    @Override
    public void onCreate(Bundle savedInstanceState) {

        // Register the custom Capacitor plugin before initializing the bridge.
        registerPlugin(IncomingCallBridge.class);

        super.onCreate(savedInstanceState);

        // Enable WebView debugging during development only.
        WebView.setWebContentsDebuggingEnabled(true);

        createNotificationChannel();
        IncomingCallNotifications.createChannel(this);

        // Handle Answer, Decline, or Open when Android creates the activity.
        handleIncomingCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {

        super.onNewIntent(intent);

        setIntent(intent);

        // Handle notification actions when the activity already exists.
        handleIncomingCallIntent(intent);
    }

    private void handleIncomingCallIntent(Intent intent) {

        if (intent == null) {
            return;
        }

        String action = intent.getStringExtra(
                IncomingCallNotifications.EXTRA_CALL_ACTION
        );

        String callId = intent.getStringExtra(
                IncomingCallNotifications.EXTRA_CALL_ID
        );

        if (action == null ||
                callId == null ||
                callId.trim().isEmpty()) {
            return;
        }

        String callerName = intent.getStringExtra(
                IncomingCallNotifications.EXTRA_CALLER_NAME
        );

        String callType = intent.getStringExtra(
                IncomingCallNotifications.EXTRA_CALL_TYPE
        );

        try {

            // Build the action data.
            JSObject data = new JSObject();

            data.put("action", action);
            data.put("callId", callId);
            data.put(
                    "callerName",
                    callerName == null ? "Someone" : callerName
            );
            data.put(
                    "callType",
                    callType == null ? "audio" : callType
            );

            // IMPORTANT:
            // Save the action before notifying JavaScript.
            // This protects cold-start notification actions.
            IncomingCallBridge.savePendingAction(this, data);

            // Forward the action to the React application.
            getBridge().triggerWindowJSEvent(
                    EVENT_INCOMING_CALL,
                    data.toString()
            );

            // Dismiss the Android notification after saving the action.
            IncomingCallNotifications.dismiss(this, callId);

            // Remove the extras only after the action was saved.
            intent.removeExtra(
                    IncomingCallNotifications.EXTRA_CALL_ACTION
            );

            intent.removeExtra(
                    IncomingCallNotifications.EXTRA_CALL_ID
            );

        } catch (Exception exception) {

            Log.e(
                    TAG,
                    "Unable to process incoming call action",
                    exception
            );

            // Keep the original intent extras if processing fails.
        }
    }

    private void createNotificationChannel() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

            String channelId = "chatterbox_messages";

            NotificationManager notificationManager =
                    (NotificationManager) getSystemService(
                            Context.NOTIFICATION_SERVICE
                    );

            Uri soundUri = Uri.parse(
                    "android.resource://" +
                    getPackageName() +
                    "/" +
                    R.raw.chatterbox_notification
            );

            AudioAttributes audioAttributes =
                    new AudioAttributes.Builder()
                            .setUsage(
                                    AudioAttributes.USAGE_NOTIFICATION
                            )
                            .build();

            NotificationChannel channel =
                    new NotificationChannel(
                            channelId,
                            "Chatterbox Messages",
                            NotificationManager.IMPORTANCE_HIGH
                    );

            channel.setDescription(
                    "New chat message notifications"
            );

            channel.setSound(soundUri, audioAttributes);

            notificationManager.createNotificationChannel(channel);
        }
    }
}