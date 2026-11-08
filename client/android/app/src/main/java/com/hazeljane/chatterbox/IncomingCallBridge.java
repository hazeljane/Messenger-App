
package com.hazeljane.chatterbox;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

@CapacitorPlugin(name = "IncomingCallBridge")
public class IncomingCallBridge extends Plugin {

    private static final String PREFS_NAME =
            "chatterbox_incoming_call";

    private static final String KEY_PENDING_ACTION =
            "pending_action";

    public static void savePendingAction(
            Context context,
            JSObject data
    ) {
        SharedPreferences preferences =
                context.getSharedPreferences(
                        PREFS_NAME,
                        Context.MODE_PRIVATE
                );

        preferences.edit()
                .putString(KEY_PENDING_ACTION, data.toString())
                .apply();
    }

    @PluginMethod
    public void getPendingAction(PluginCall call) {
        SharedPreferences preferences =
                getContext().getSharedPreferences(
                        PREFS_NAME,
                        Context.MODE_PRIVATE
                );

        String savedAction = preferences.getString(
                KEY_PENDING_ACTION,
                null
        );

        if (savedAction == null) {
            call.resolve(new JSObject());
            return;
        }

        try {
            call.resolve(new JSObject(savedAction));
        } catch (JSONException exception) {
            call.reject(
                    "Could not read the saved incoming call action.",
                    exception
            );
        }
    }

    @PluginMethod
    public void clearPendingAction(PluginCall call) {
        SharedPreferences preferences =
                getContext().getSharedPreferences(
                        PREFS_NAME,
                        Context.MODE_PRIVATE
                );

        preferences.edit()
                .remove(KEY_PENDING_ACTION)
                .apply();

        call.resolve();
    }
}
