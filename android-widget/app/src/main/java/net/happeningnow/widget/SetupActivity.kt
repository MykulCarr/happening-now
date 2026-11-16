package net.happeningnow.widget

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * The app's main screen, reached from its icon or the widget's gear. Three jobs:
 *  1. Choose what the widget shows: here in the app (ManualSetupActivity), or
 *     by bringing settings over from happening-now.net.
 *  2. Put a widget on the home screen.
 *  3. Receive the settings link the site sends back.
 *
 * Site settings travel phone-to-phone inside that link; no server sees them.
 */
class SetupActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        val column = Column(this)
        column.title(getString(R.string.app_name))
        status = column.note("", 15f)

        // Installed from the site rather than a store, so updating is a
        // download: the page it opens has the newest version.
        Store.updateAvailable(this)?.let { version ->
            column.button("Download version $version") { startActivity(Site.intent(this, "${Fetch.SITE}/android")) }
            column.note("A newer version of this app is on the site. Installing it over this one keeps your settings.")
        }

        column.heading("What the widget shows")
        column.button("Set up here") { startActivity(Intent(this, ManualSetupActivity::class.java)) }
        column.note("Choose your town, news topics and watchlist in this app. No website needed.")

        // The scheme tells the page which build to send back to (beta or real).
        column.button("Use my happening-now.net settings") {
            startActivity(Site.intent(this, "${Fetch.SITE}/widget?w=all&send=${getString(R.string.scheme)}&k=${Store.pairingCode(this)}"))
        }
        column.note("Already use the site on this phone? This opens it: tap “Send to phone widget” there. Afterwards the site offers to update the widget whenever you change something.")

        column.heading("Add a widget")
        column.button("Full page: time, weather, news, watchlist") { pin(LargeWidget::class.java) }
        column.button("Medium: time, weather, top stories") { pin(MediumWidget::class.java) }
        column.button("Small: time and weather") { pin(SmallWidget::class.java) }
        column.note("Or long-press your home screen, choose Widgets, and find this app. Any widget can be resized afterwards.")

        // Each takes effect at once, and applies to every widget from this app.
        column.heading("Options")
        fun option(label: String, key: String) =
            column.check(label, Store.flag(this, key)).setOnCheckedChangeListener { _, on ->
                Store.setFlag(this, key, on)
                Widgets.updateAll(this)
            }
        option("Open stories in my browser, not in the reader", "browserLinks")
        option("Hide the watchlist", "hideWatch")
        option("See-through background", "clearBg")
        option("Refresh every hour instead of every half hour", "hourly")
        option("Save data: only fetch the news category on screen", "saveData")
        column.note("The watchlist and the forecast also fold away on the widget itself: tap the small arrow beside each.")

        column.show()
        showStatus()
        receive(intent)
    }

    // The app was already open when the settings link arrived.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        receive(intent)
    }

    private fun showStatus() {
        val cfg = Store.config(this)
        status.text = when {
            !Store.isSetUp(this) -> "Not set up yet. Until then the widget shows national headlines and no weather."
            cfg.optString("source") == "app" -> "Set up in this app: ${describe(cfg)}"
            else -> "Using your happening-now.net settings: ${describe(cfg)}"
        }
    }

    private fun describe(cfg: JSONObject) =
        "${cfg.optString("place").ifEmpty { "no location" }} · ${cfg.getJSONArray("cats").length()} news categories · ${cfg.getJSONArray("symbols").length()} stocks"

    /** A settings link looks like scheme://setup?k=<pairing code>&d=<base64 of the settings JSON>. */
    private fun receive(intent: Intent) {
        val packed = intent.data?.takeIf { intent.action == Intent.ACTION_VIEW }?.getQueryParameter("d") ?: return
        val config = try {
            Store.sanitize(JSONObject(String(Base64.decode(packed, Base64.URL_SAFE), Charsets.UTF_8)))
        } catch (_: Exception) { null }
        if (config == null) {
            Toast.makeText(this, "Couldn't read those settings.", Toast.LENGTH_LONG).show()
            return
        }
        fun apply() {
            Store.saveConfig(this, config)
            Widgets.updateAll(this)
            RefreshJob.schedule(this)
            showStatus()
        }
        // A link carrying our pairing code came from the site we paired with:
        // apply it and step out of the way, back to wherever the tap was made.
        if (intent.data?.getQueryParameter("k") == Store.pairingCode(this)) {
            apply()
            Toast.makeText(this, "Widget updated", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        // Anything else: ask first. Any app or web page can open this link, so
        // a link alone must never silently replace what the widget shows.
        AlertDialog.Builder(this)
            .setTitle("Use these settings?")
            .setMessage(describe(config))
            .setPositiveButton("Use them") { _, _ -> apply() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun pin(widget: Class<*>) {
        val mgr = getSystemService(AppWidgetManager::class.java)
        if (mgr.isRequestPinAppWidgetSupported) mgr.requestPinAppWidget(ComponentName(this, widget), null, null)
        else Toast.makeText(this, "Long-press your home screen and choose Widgets.", Toast.LENGTH_LONG).show()
    }
}
