
package com.hazeljane.chatterbox;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class IncomingCallReceiver extends BroadcastReceiver {

    public static final String ACTION_INCOMING_CALL =
            "com.hazeljane.chatterbox.INCOMING_CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String callId = intent.getStringExtra("callId");
        String callerName = intent.getStringExtra("callerName");
        String callType = intent.getStringExtra("callType");

        IncomingCallNotifications.show(
                context,
                callId,
                callerName,
                callType
        );
    }
}
