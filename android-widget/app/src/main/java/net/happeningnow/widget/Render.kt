package net.happeningnow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Draws a widget from what is in the Store — it never touches the network, so
 * it is instant. A home-screen widget is described as a RemoteViews: a layout
 * file plus a list of "put this text there / on tap do that" instructions the
 * launcher carries out for us.
 */
object Render {
    private const val FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

    fun build(c: Context, cls: Class<*>, widgetId: Int): RemoteViews = when (cls) {
        LargeWidget::class.java -> large(c, widgetId)
        MediumWidget::class.java -> medium(c)
        else -> small(c)
    }

    // ---- taps ---------------------------------------------------------------
    // Site links open in the installed Happening Now app when there is one.
    private fun open(c: Context, url: String): PendingIntent {
        val safe = if (url.startsWith("https://") || url.startsWith("http://")) url else Fetch.SITE
        // Our own pages go to the installed site app; articles to the default browser.
        val intent = if (safe.startsWith(Fetch.SITE)) Site.intent(c, safe)
            else Intent(Intent.ACTION_VIEW, Uri.parse(safe)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(c, 0, intent, FLAGS)
    }

    private fun openSetup(c: Context) =
        PendingIntent.getActivity(c, 0, Intent(c, SetupActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), FLAGS)

    private fun action(c: Context, action: String) =
        PendingIntent.getBroadcast(c, 0, Intent(c, LargeWidget::class.java).setAction(action), FLAGS)

    // ---- shared pieces ------------------------------------------------------
    private fun deg(d: Double) = "${Math.round(d)}°"

    private fun ago(ms: Long): String {
        val m = ms / 60000
        return when {
            m < 60 -> "${maxOf(1, m)}m"
            m < 24 * 60 -> "${m / 60}h"
            else -> "${m / (24 * 60)}d"
        }
    }

    private fun sourceAndAge(item: org.json.JSONObject): String {
        val t = item.optLong("t")
        return item.optString("source") + if (t > 0) " · ${ago(System.currentTimeMillis() - t)}" else ""
    }

    // Same wording and icons as the website (common-weather.js), keyed by the
    // WMO weather code Open-Meteo returns.
    private fun describe(code: Int) = when (code) {
        0 -> "Clear"; 1 -> "Mostly clear"; 2 -> "Partly cloudy"; 3 -> "Overcast"
        45 -> "Fog"; 48 -> "Rime fog"
        51 -> "Light drizzle"; 53 -> "Drizzle"; 55 -> "Heavy drizzle"
        61 -> "Light rain"; 63 -> "Rain"; 65 -> "Heavy rain"
        71 -> "Light snow"; 73 -> "Snow"; 75 -> "Heavy snow"
        80 -> "Rain showers"; 81 -> "Showers"; 82 -> "Violent showers"
        95 -> "Thunderstorm"
        else -> ""
    }

    private fun icon(code: Int) = when (code) {
        0, 1 -> "☀️"; 2 -> "⛅"; 3, 45, 48 -> "☁️"
        in 51..55, in 80..82 -> "🌦️"
        in 61..65 -> "🌧️"; in 71..75 -> "❄️"; 95 -> "⛈️"
        else -> "🌤️"
    }

    /** Fill the place / conditions / temperature fields every layout has. */
    private fun weather(c: Context, v: RemoteViews, tapTarget: Int) {
        val place = Store.config(c).optString("place").replace(", US-", ", ") // older links said "US-MI"
        val w = Store.cache(c).optJSONObject("weather")
        v.setTextViewText(R.id.place, place.ifEmpty { "Tap to set up" })
        v.setTextViewText(R.id.cond, if (w != null) describe(w.optInt("code")) else if (place.isEmpty()) "" else "Loading…")
        v.setTextViewText(R.id.icon, if (w != null) icon(w.optInt("code")) else "")
        v.setTextViewText(R.id.temp, if (w != null) deg(w.optDouble("temp")) else "--")
        v.setTextViewText(R.id.hilo, if (w != null) "${deg(w.optDouble("hi"))} / ${deg(w.optDouble("lo"))}" else "")
        v.setOnClickPendingIntent(tapTarget, if (place.isEmpty()) openSetup(c) else open(c, "${Fetch.SITE}/weather"))
    }

    // ---- the three sizes ----------------------------------------------------
    private fun small(c: Context) = RemoteViews(c.packageName, R.layout.widget_small).also { weather(c, it, R.id.root) }

    private fun medium(c: Context): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_medium)
        weather(c, v, R.id.weather)
        v.setOnClickPendingIntent(R.id.clock, open(c, "${Fetch.SITE}/widget?w=all"))

        val category = Store.currentCategory(c)
        val top = Store.news(c, category.optString("id"))?.optJSONArray("items")?.optJSONObject(0)
        v.setTextViewText(R.id.meta, category.optString("label") + if (top != null) " · ${sourceAndAge(top)}" else "")
        v.setTextViewText(R.id.title, top?.optString("title") ?: "Loading headlines…")
        v.setOnClickPendingIntent(R.id.story, open(c, top?.optString("url") ?: Fetch.SITE))
        return v
    }

    private fun large(c: Context, widgetId: Int): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_large)
        val cache = Store.cache(c)
        weather(c, v, R.id.weather)
        v.setOnClickPendingIntent(R.id.clock, open(c, "${Fetch.SITE}/widget?w=all"))

        // Category switcher
        val categories = Store.categories(c)
        val index = Store.categoryIndex(c)
        val category = categories[index]
        // Labels arrive as "LOCAL · JACKSON, MI": the strip shows the short
        // name, and the place goes on the line underneath.
        val n = categories.size
        fun short(step: Int) = categories[(index + step + n * 2) % n].optString("label").substringBefore(" · ")
        v.setTextViewText(R.id.cat, short(0))
        v.setTextViewText(R.id.cat_m1, if (n >= 2) short(-1) else "")
        v.setTextViewText(R.id.cat_p1, if (n >= 2) short(1) else "")
        v.setTextViewText(R.id.cat_m2, if (n >= 5) short(-2) else "") // fewer than five would repeat names
        v.setTextViewText(R.id.cat_p2, if (n >= 5) short(2) else "")
        v.setTextViewText(R.id.catpos, category.optString("label").substringAfter(" · ", "${index + 1} of $n"))
        for (id in intArrayOf(R.id.prev, R.id.cat_m1, R.id.cat_m2)) v.setOnClickPendingIntent(id, action(c, ACTION_PREV))
        for (id in intArrayOf(R.id.next, R.id.cat_p1, R.id.cat_p2)) v.setOnClickPendingIntent(id, action(c, ACTION_NEXT))
        v.setOnClickPendingIntent(R.id.cat, open(c, "${Fetch.SITE}/"))

        // How many rows fit depends on how tall the widget was dragged. Heights
        // are in dp; 0 means the launcher didn't say, so assume a full page.
        val height = AppWidgetManager.getInstance(c).getAppWidgetOptions(widgetId)
            .getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
        val quotes = cache.optJSONArray("quotes")
        val quoteRows = minOf(quotes?.length() ?: 0, when { height == 0 || height >= 520 -> 5; height >= 400 -> 3; else -> 0 })
        // Everything that isn't a headline (clock, weather, switcher, footer,
        // padding) is about 250dp, plus the watchlist; a two-line headline
        // needs about 58dp.
        val fixedHeight = 250 + if (quoteRows > 0) 36 + quoteRows * 24 else 0
        val headlineRows = if (height == 0) 6 else ((height - fixedHeight) / 58).coerceIn(1, 10)

        // Headlines: each row has weight 1, so they spread evenly down the space.
        v.removeAllViews(R.id.headlines)
        val items = Store.news(c, category.optString("id"))?.optJSONArray("items")
        if (items == null || items.length() == 0) {
            val row = RemoteViews(c.packageName, R.layout.row_headline)
            row.setTextViewText(R.id.title, "Loading headlines…")
            v.addView(R.id.headlines, row)
        } else for (k in 0 until minOf(headlineRows, items.length())) {
            val item = items.getJSONObject(k)
            val row = RemoteViews(c.packageName, R.layout.row_headline)
            row.setTextViewText(R.id.meta, sourceAndAge(item))
            row.setTextViewText(R.id.title, item.optString("title"))
            row.setOnClickPendingIntent(R.id.row, open(c, item.optString("url")))
            v.addView(R.id.headlines, row)
        }

        // Watchlist
        v.removeAllViews(R.id.quotes)
        v.setViewVisibility(R.id.watch, if (quoteRows > 0) View.VISIBLE else View.GONE)
        for (k in 0 until quoteRows) {
            val q = quotes!!.getJSONObject(k)
            val pct = q.optDouble("pct")
            val flat = Math.abs(pct) < 0.005
            val row = RemoteViews(c.packageName, R.layout.row_quote)
            row.setTextViewText(R.id.sym, q.optString("sym"))
            row.setTextViewText(R.id.price, String.format(Locale.US, "%,.2f", q.optDouble("price")))
            row.setTextViewText(R.id.move, (if (flat) "" else if (pct > 0) "▲ " else "▼ ") + String.format(Locale.US, "%.2f%%", Math.abs(pct)))
            row.setTextColor(R.id.move, c.getColor(if (flat) R.color.muted else if (pct > 0) R.color.up else R.color.down))
            v.addView(R.id.quotes, row)
        }
        v.setOnClickPendingIntent(R.id.watch, open(c, "${Fetch.SITE}/stocks"))

        // Footer
        val updatedAt = cache.optLong("updatedAt")
        v.setTextViewText(R.id.updated,
            if (updatedAt > 0) "News and stocks updated ${SimpleDateFormat("h:mm a", Locale.US).format(Date(updatedAt))}"
            else "Not updated yet")
        v.setOnClickPendingIntent(R.id.refresh, action(c, ACTION_REFRESH))
        return v
    }
}
