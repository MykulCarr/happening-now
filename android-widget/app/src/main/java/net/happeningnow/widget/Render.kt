package net.happeningnow.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.os.Build
import android.provider.AlarmClock
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

    // What a tap does, in full:
    //   HAPPENING NOW!          opens the website
    //   the time                opens the phone's clock app
    //   the date                opens the phone's calendar app
    //   weather panel           opens the weather page
    //   the arrow on it         folds / unfolds the forecast
    //   a weather warning       opens the weather page
    //   a neighbouring category, or an arrow    switches category
    //   a headline              opens the article
    //   watchlist header        folds / unfolds the watchlist
    //   a watchlist row         opens the Markets page
    //   gear                    widget settings (the only way in)
    //   refresh arrow           refresh
    //   everything else         nothing, on purpose (see noop)

    /**
     * A tap that does nothing, set on the widget's background. Without it some
     * launchers treat a tap on any part of a widget that has no action of its
     * own as "open the app", which sent stray taps to the settings screen.
     */
    private fun noop(c: Context) =
        PendingIntent.getBroadcast(c, 0, Intent(c, LargeWidget::class.java).setAction("net.happeningnow.widget.NOOP"), FLAGS)

    // The phone's own clock app: found by asking who shows alarms, then opened
    // the way its icon would open it (asking for the alarm screen directly
    // needs a permission; this does not).
    private fun openClock(c: Context): PendingIntent {
        val clockApp = c.packageManager.resolveActivity(Intent(AlarmClock.ACTION_SHOW_ALARMS), 0)?.activityInfo?.packageName
        val intent = clockApp?.let { c.packageManager.getLaunchIntentForPackage(it) } ?: Intent(AlarmClock.ACTION_SHOW_ALARMS)
        return PendingIntent.getActivity(c, 2, intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), FLAGS)
    }

    // Whichever app the phone uses as its calendar.
    private fun openCalendar(c: Context) = PendingIntent.getActivity(c, 3,
        Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), FLAGS)

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

    private fun icon(code: Int, day: Boolean) = when (code) {
        0, 1 -> if (day) R.drawable.ic_clear else R.drawable.ic_clear_night
        2 -> if (day) R.drawable.ic_partly else R.drawable.ic_partly_night
        3 -> R.drawable.ic_cloud
        45, 48 -> R.drawable.ic_fog
        in 51..55 -> R.drawable.ic_drizzle
        in 61..65, in 80..82 -> R.drawable.ic_rain
        in 71..75 -> R.drawable.ic_snow
        95 -> R.drawable.ic_storm
        else -> if (day) R.drawable.ic_partly else R.drawable.ic_partly_night
    }

    // Anything older than this is called out as old rather than shown as current.
    private const val STALE_MS = 2 * 60 * 60 * 1000L

    /** "6:10 AM" today, "Sat 6:10 AM" otherwise. */
    private fun stamp(time: Long): String {
        val sameDay = SimpleDateFormat("yyyyMMdd", Locale.US).let { it.format(Date(time)) == it.format(Date()) }
        return SimpleDateFormat(if (sameDay) "h:mm a" else "EEE h:mm a", Locale.US).format(Date(time))
    }

    /** Fill the place / conditions / temperature fields every layout has. */
    private fun weather(c: Context, v: RemoteViews, tapTarget: Int) {
        val place = Store.config(c).optString("place").replace(", US-", ", ") // older links said "US-MI"
        val w = Store.cache(c).optJSONObject("weather")
        v.setTextViewText(R.id.place, place.ifEmpty { "Tap to set up" })
        val fetched = w?.optLong("at") ?: 0
        v.setTextViewText(R.id.cond, when {
            w == null -> if (place.isEmpty()) "" else "Loading…"
            fetched > 0 && System.currentTimeMillis() - fetched > STALE_MS -> "${describe(w.optInt("code"))} · as of ${stamp(fetched)}"
            else -> describe(w.optInt("code"))
        })
        v.setImageViewResource(R.id.icon, if (w != null) icon(w.optInt("code"), w.optBoolean("day", true)) else 0)
        v.setTextViewText(R.id.temp, if (w != null) deg(w.optDouble("temp")) else "--")
        v.setTextViewText(R.id.hilo, if (w != null) "${deg(w.optDouble("hi"))} / ${deg(w.optDouble("lo"))}" else "")
        v.setOnClickPendingIntent(tapTarget, if (place.isEmpty()) openSetup(c) else open(c, "${Fetch.SITE}/weather"))
    }

    /**
     * Fill a scrolling list with headlines (Android 12+). Rows of a scrolling
     * list share one tap action and each only supplies its link, so the
     * shared action is OpenActivity, which opens whatever link it is handed.
     */
    private fun fillList(c: Context, v: RemoteViews, listId: Int, items: org.json.JSONArray, prefix: String) {
        if (Build.VERSION.SDK_INT < 31) return
        val rows = RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1)
        for (k in 0 until items.length()) {
            val item = items.getJSONObject(k)
            val url = item.optString("url")
            val row = RemoteViews(c.packageName, R.layout.row_headline_list)
            row.setTextViewText(R.id.meta, prefix + sourceAndAge(item))
            row.setTextViewText(R.id.index, "${k + 1}/${items.length()}") // the reader's place in the list
            row.setTextViewText(R.id.title, item.optString("title"))
            row.setOnClickFillInIntent(R.id.row, Intent().setData(Uri.parse(url)))
            rows.addItem(url.hashCode().toLong(), row) // a stable id keeps the scroll position across refreshes
        }
        v.setRemoteAdapter(listId, rows.build())
        v.setPendingIntentTemplate(listId, PendingIntent.getActivity(
            c, 1, Intent(c, OpenActivity::class.java),
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)) // mutable: each row fills in its link
    }

    /** The warning banner above the weather panel; hidden when there is no active alert. */
    private fun alertBanner(c: Context, v: RemoteViews) {
        val alert = Store.cache(c).optString("alert")
        v.setViewVisibility(R.id.alert, if (alert.isEmpty()) View.GONE else View.VISIBLE)
        v.setTextViewText(R.id.alert, "⚠ $alert")
        v.setOnClickPendingIntent(R.id.alert, open(c, "${Fetch.SITE}/weather"))
    }

    /** The "see-through background" option. The strip's edge fades are an opaque
     *  colour that only matches a solid card, so they step aside with it. */
    private fun background(c: Context, v: RemoteViews) {
        val clear = Store.flag(c, "clearBg")
        v.setInt(R.id.root, "setBackgroundResource", if (clear) R.drawable.widget_bg_clear else R.drawable.widget_bg)
        for (id in intArrayOf(R.id.fade_l, R.id.fade_r)) v.setViewVisibility(id, if (clear) View.INVISIBLE else View.VISIBLE)
    }

    // ---- the three sizes ----------------------------------------------------
    private fun small(c: Context) = RemoteViews(c.packageName, R.layout.widget_small).also { weather(c, it, R.id.root); background(c, it) }

    private fun medium(c: Context): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_medium)
        weather(c, v, R.id.weather)
        alertBanner(c, v)
        background(c, v)
        v.setOnClickPendingIntent(R.id.root, noop(c))
        v.setOnClickPendingIntent(R.id.brand, open(c, "${Fetch.SITE}/"))
        v.setOnClickPendingIntent(R.id.time, openClock(c))
        v.setOnClickPendingIntent(R.id.date, openCalendar(c))

        val category = Store.currentCategory(c)
        val top = Store.news(c, category.optString("id"))?.optJSONArray("items")?.optJSONObject(0)
        v.setTextViewText(R.id.meta, category.optString("label") + if (top != null) " · ${sourceAndAge(top)}" else "")
        v.setTextViewText(R.id.title, top?.optString("title") ?: "Loading headlines…")
        v.setOnClickPendingIntent(R.id.story, open(c, top?.optString("url") ?: Fetch.SITE))

        // Android 12+: scroll through the category's stories instead of one.
        val items = Store.news(c, category.optString("id"))?.optJSONArray("items")
        val scroll = Build.VERSION.SDK_INT >= 31 && items != null && items.length() > 1
        v.setViewVisibility(R.id.story, if (scroll) View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.story_list, if (scroll) View.VISIBLE else View.GONE)
        if (scroll) fillList(c, v, R.id.story_list, items!!, prefix = category.optString("label").substringBefore(" · ") + " · ")
        return v
    }

    private fun large(c: Context, widgetId: Int): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_large)
        val cache = Store.cache(c)
        weather(c, v, R.id.weather)
        alertBanner(c, v)
        background(c, v)
        v.setOnClickPendingIntent(R.id.root, noop(c))
        v.setOnClickPendingIntent(R.id.brand, open(c, "${Fetch.SITE}/"))
        v.setOnClickPendingIntent(R.id.time, openClock(c))
        v.setOnClickPendingIntent(R.id.date, openCalendar(c))

        // Forecast: folded away by default; the arrow on the weather panel opens it.
        val forecast = cache.optJSONObject("weather")
        val hours = forecast?.optJSONArray("hours")
        val days = forecast?.optJSONArray("days")
        val canForecast = hours != null && hours.length() > 0
        val forecastOpen = canForecast && Store.flag(c, "forecastOpen")
        v.setViewVisibility(R.id.wx_toggle, if (canForecast) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.wx_toggle, if (forecastOpen) "▴" else "▾")
        v.setOnClickPendingIntent(R.id.wx_toggle, action(c, ACTION_FORECAST))
        v.setViewVisibility(R.id.forecast, if (forecastOpen) View.VISIBLE else View.GONE)
        v.removeAllViews(R.id.hours)
        v.removeAllViews(R.id.days)
        if (forecastOpen) {
            fun cell(top: String, code: Int, day: Boolean, bottom: String) =
                RemoteViews(c.packageName, R.layout.cell_forecast).apply {
                    setTextViewText(R.id.cell_top, top)
                    setImageViewResource(R.id.cell_icon, icon(code, day))
                    setTextViewText(R.id.cell_bottom, bottom)
                }
            for (k in 0 until hours!!.length()) hours.getJSONObject(k).let {
                v.addView(R.id.hours, cell(it.optString("t"), it.optInt("code"), it.optBoolean("day", true), deg(it.optDouble("temp"))))
            }
            for (k in 0 until (days?.length() ?: 0)) days!!.getJSONObject(k).let {
                v.addView(R.id.days, cell(it.optString("name"), it.optInt("code"), true, "${deg(it.optDouble("hi"))} / ${deg(it.optDouble("lo"))}"))
            }
        }

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
        // Under the strip: where local/regional news is from, how many stories
        // this category holds, and which category of how many this is.
        val where = category.optString("label").substringAfter(" · ", "")
        val count = Store.news(c, category.optString("id"))?.optJSONArray("items")?.length() ?: 0
        val stories = if (count > 0) "$count ${if (count == 1) "story" else "stories"}" else ""
        v.setTextViewText(R.id.catpos, listOf(where, stories, if (where.isEmpty()) "${index + 1} of $n" else "")
            .filter { it.isNotEmpty() }.joinToString(" · "))
        for (id in intArrayOf(R.id.prev, R.id.cat_m1, R.id.cat_m2)) v.setOnClickPendingIntent(id, action(c, ACTION_PREV))
        for (id in intArrayOf(R.id.next, R.id.cat_p1, R.id.cat_p2)) v.setOnClickPendingIntent(id, action(c, ACTION_NEXT))

        // How many rows fit depends on how tall the widget was dragged. Heights
        // are in dp; 0 means the launcher didn't say, so assume a full page.
        val height = AppWidgetManager.getInstance(c).getAppWidgetOptions(widgetId)
            .getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
        val quotes = cache.optJSONArray("quotes")
        // How many watchlist rows the height allows; none shown while it is folded.
        val fitRows = if (Store.flag(c, "hideWatch")) 0
            else minOf(quotes?.length() ?: 0, when { height == 0 || height >= 520 -> 5; height >= 400 -> 3; else -> 0 })
        val collapsed = Store.watchCollapsed(c)
        val quoteRows = if (collapsed) 0 else fitRows
        // Everything that isn't a headline (clock, weather, switcher, footer,
        // padding) is about 250dp, plus the watchlist; a two-line headline
        // needs about 58dp.
        val fixedHeight = 250 + (if (forecastOpen) 150 else 0) + when { fitRows == 0 -> 0; collapsed -> 44; else -> 36 + quoteRows * 24 }
        val headlineRows = if (height == 0) 6 else ((height - fixedHeight) / 58).coerceIn(1, 10)

        // Headlines. When they all fit, each row has weight 1 and they spread
        // evenly down the space. When there are more than fit, Android 12+
        // gets a scrolling list; older phones show as many as fit.
        v.removeAllViews(R.id.headlines)
        val items = Store.news(c, category.optString("id"))?.optJSONArray("items")
        val scroll = Build.VERSION.SDK_INT >= 31 && items != null && items.length() > headlineRows
        v.setViewVisibility(R.id.headlines, if (scroll) View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.headlines_list, if (scroll) View.VISIBLE else View.GONE)
        if (scroll) {
            fillList(c, v, R.id.headlines_list, items!!, prefix = "")
        } else if (items == null || items.length() == 0) {
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
        v.setViewVisibility(R.id.watch, if (fitRows > 0) View.VISIBLE else View.GONE)
        v.setViewVisibility(R.id.quotes, if (collapsed) View.GONE else View.VISIBLE)
        v.setTextViewText(R.id.watch_toggle, if (collapsed) "▸" else "▾")
        v.setContentDescription(R.id.watch_head, if (collapsed) "Watchlist, folded. Tap to open." else "Watchlist. Tap to fold.")
        v.setOnClickPendingIntent(R.id.watch_head, action(c, ACTION_WATCH))
        // Folded, the header line carries each symbol's move in its colour.
        val summary = SpannableStringBuilder()
        if (collapsed) for (k in 0 until (quotes?.length() ?: 0)) {
            val q = quotes!!.getJSONObject(k)
            val pct = q.optDouble("pct")
            val flat = Math.abs(pct) < 0.005
            if (k > 0) summary.append("    ")
            summary.append(q.optString("sym")).append(" ")
            val from = summary.length
            summary.append((if (flat) "" else if (pct > 0) "▲" else "▼") + String.format(Locale.US, "%.2f%%", Math.abs(pct)))
            summary.setSpan(ForegroundColorSpan(c.getColor(if (flat) R.color.muted else if (pct > 0) R.color.up else R.color.down)),
                from, summary.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        v.setTextViewText(R.id.watch_summary, summary)
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
        v.setOnClickPendingIntent(R.id.quotes, open(c, "${Fetch.SITE}/markets")) // the rows; the header folds

        // Footer
        val updatedAt = cache.optLong("updatedAt")
        val newer = Store.updateAvailable(c)
        val status = Store.status(c)
        val stale = updatedAt > 0 && System.currentTimeMillis() - updatedAt > STALE_MS
        v.setTextViewText(R.id.updated, when {
            status != null -> status
            newer != null -> "Version $newer is available · tap ⚙"
            stale -> "Out of date · last updated ${stamp(updatedAt)} · tap ↻"
            updatedAt > 0 -> "News and stocks updated ${stamp(updatedAt)}"
            else -> "Not updated yet"
        })
        v.setTextColor(R.id.updated, c.getColor(if (stale && status == null) R.color.down else R.color.muted))
        v.setOnClickPendingIntent(R.id.refresh, action(c, ACTION_REFRESH))
        v.setOnClickPendingIntent(R.id.settings, openSetup(c))
        return v
    }
}
