
package com.hazeljane.chatterbox;

import android.os.Bundle;
import android.webkit.WebView;
import android.os.Build;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.content.Context;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable Chrome DevTools for development
        WebView.setWebContentsDebuggingEnabled(true);

        // Create Chatterbox notification channel
        createNotificationChannel();
    }

    private void createNotificationChannel() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

            String channelId = "chatterbox_messages";

            NotificationManager notificationManager =
                    (NotificationManager) getSystemService(
                            Context.NOTIFICATION_SERVICE
                    );

            Uri soundUri = Uri.parse(
                    "android.resource://" + getPackageName()
                            + "/" + getPackageName() + ":raw/chatterbox_notification"
            );

            AudioAttributes audioAttributes =
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .build();

            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "Chatterbox Messages",
                    NotificationManager.IMPORTANCE_HIGH
            );

            channel.setDescription("New chat message notifications");
            channel.setSound(soundUri, audioAttributes);

            notificationManager.createNotificationChannel(channel);
        }
    }
}
