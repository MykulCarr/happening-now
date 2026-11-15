package net.happeningnow.widget

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * The app's one screen. Two jobs:
 *  1. Fetch your settings: opens the Today page, whose "Send to phone widget"
 *     button links back here with the settings packed into the link.
 *  2. Put a widget on the home screen.
 *
 * The settings travel phone-to-phone inside that link — no server sees them.
 */
class SetupActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(getColor(R.color.card))
        }
        fun note(s: String, size: Float, color: Int) = TextView(this).apply {
            text = s; textSize = size; setTextColor(getColor(color)); setPadding(0, 0, 0, pad)
        }.also { column.addView(it) }
        fun button(label: String, onTap: () -> Unit) = Button(this).apply {
            text = label; isAllCaps = false; setOnClickListener { onTap() }
        }.also { column.addView(it, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT) }

        note(getString(R.string.app_name), 24f, R.color.text)
        status = note("", 15f, R.color.muted)

        // Installed from the site rather than a store, so updating is a
        // download: the page it opens has the newest version.
        Store.updateAvailable(this)?.let { version ->
            button("Download version $version") { startActivity(Site.intent(this, "${Fetch.SITE}/android")) }
            note("A newer version of this app is on the site. Installing it over this one keeps your settings.", 13f, R.color.muted)
        }

        // The scheme tells the page which build to send back to (beta or real).
        button("1 · Get my settings from happening-now.net") {
            startActivity(Site.intent(this, "${Fetch.SITE}/widget?w=all&send=${getString(R.string.scheme)}&k=${Store.pairingCode(this)}"))
        }
        note("Opens the Today page. Tap “Send to phone widget” there. Do it again whenever you change your location, categories or watchlist on the site.", 13f, R.color.muted)

        // The widget only mirrors the site: the watchlist, categories and
        // location are changed there, then sent again with button 1.
        button("Change my settings on the site") { startActivity(Site.intent(this, "${Fetch.SITE}/settings")) }
        note("The widget shows what this phone's copy of the site has. Change it there, then tap button 1 again to send it over.", 13f, R.color.muted)

        button("2 · Add the full-page Today widget") { pin(LargeWidget::class.java) }
        button("Add the medium widget (time, weather, top story)") { pin(MediumWidget::class.java) }
        button("Add the small widget (time and weather)") { pin(SmallWidget::class.java) }
        note("Or long-press your home screen, choose Widgets, and find this app. Any widget can be resized afterwards.", 13f, R.color.muted)

        setContentView(ScrollView(this).apply { addView(column); setBackgroundColor(getColor(R.color.card)) })
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
        status.text = if (!Store.isSetUp(this)) "Not set up yet. Until then the widget shows national headlines and no weather."
        else "Using: ${describe(cfg)}"
    }

    private fun describe(cfg: JSONObject) =
        "${cfg.optString("place").ifEmpty { "no location" }} · ${cfg.getJSONArray("cats").length()} news categories · ${cfg.getJSONArray("symbols").length()} stocks"

    /** A settings link looks like scheme://setup?d=<base64 of the settings JSON>. */
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
