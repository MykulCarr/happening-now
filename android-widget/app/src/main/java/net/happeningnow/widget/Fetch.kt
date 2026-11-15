package net.happeningnow.widget

import android.text.Html
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.time.OffsetDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Collections
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Network reads. The same sources the website uses: Open-Meteo for weather,
 * and happening-now.net's own Worker for feeds and quotes — so publishers see
 * the Worker, never this phone. Call from a background thread only.
 */
object Fetch {
    const val SITE = "https://happening-now.net"

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("User-Agent", "happening-now-widget/1.0 (Android)") // identify honestly
        try {
            if (conn.responseCode != 200) throw IOException("HTTP ${conn.responseCode} for $url")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** { temp, code, hi, lo } for the saved location, or null if none is set. */
    fun weather(cfg: JSONObject): JSONObject? {
        if (!cfg.has("lat")) return null
        val d = JSONObject(get(
            "https://api.open-meteo.com/v1/forecast?latitude=${cfg.getDouble("lat")}&longitude=${cfg.getDouble("lon")}" +
                "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min" +
                "&forecast_days=1&temperature_unit=${cfg.optString("tempUnit", "fahrenheit")}&timezone=auto"))
        val now = d.getJSONObject("current")
        val day = d.getJSONObject("daily")
        return JSONObject()
            .put("temp", now.getDouble("temperature_2m"))
            .put("code", now.getInt("weather_code"))
            .put("hi", day.getJSONArray("temperature_2m_max").getDouble(0))
            .put("lo", day.getJSONArray("temperature_2m_min").getDouble(0))
    }

    /** What the site currently offers for download: { versionCode, versionName }. */
    fun latestVersion() = JSONObject(get("$SITE/assets/widget-app/version.json"))

    /** [{ sym, price, pct }] in watchlist order; symbols with no quote are skipped. */
    fun quotes(symbols: JSONArray): JSONArray {
        val out = JSONArray()
        if (symbols.length() == 0) return out
        val list = (0 until symbols.length()).map { symbols.getString(it) }
        val quotes = JSONObject(get("$SITE/v1/stocks/quotes?symbols=${enc(list.joinToString(","))}")).getJSONObject("quotes")
        for (sym in list) {
            val q = quotes.optJSONObject(sym) ?: continue
            if (q.has("price")) out.put(JSONObject().put("sym", sym).put("price", q.getDouble("price")).put("pct", q.optDouble("changePercent", 0.0)))
        }
        return out
    }

    /**
     * The newest headlines across one category's feeds, newest first:
     * [{ source, title, url, t }]. Feeds are read in parallel; one that fails
     * is skipped. Empty if every feed failed.
     */
    fun headlines(category: JSONObject): JSONArray {
        val feeds = category.getJSONArray("feeds")
        val all = Collections.synchronizedList(mutableListOf<JSONObject>())
        (0 until feeds.length()).map { i ->
            thread {
                try {
                    val feed = feeds.getJSONObject(i)
                    all.addAll(parseFeed(get("$SITE/v1/rss/raw?url=${enc(feed.getString("rss"))}"), feed.optString("name")))
                } catch (_: Exception) { /* a dead feed just contributes nothing */ }
            }
        }.forEach { it.join() }

        val out = JSONArray()
        all.distinctBy { it.getString("title") }.sortedByDescending { it.getLong("t") }.take(12).forEach { out.put(it) }
        return out
    }

    // ---- feed parsing -------------------------------------------------------
    // Done with patterns rather than an XML parser on purpose: real feeds are
    // often not well-formed (a bare & in a title), and a strict parser throws
    // away the whole feed for one bad character. RSS uses <item>, Atom <entry>.
    private val OPTS = setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE)
    private val ITEM = Regex("<(item|entry)[\\s>].*?</\\1\\s*>", OPTS)
    private val LINK_HREF = Regex("<link[^>]*href=[\"']([^\"']+)[\"']", OPTS)
    private val ENTITY = Regex("&(#\\d+|#x[0-9a-f]+|[a-z]+);", RegexOption.IGNORE_CASE)

    private fun tag(block: String, name: String) =
        Regex("<$name(?:\\s[^>]*)?>(.*?)</$name\\s*>", OPTS).find(block)?.groupValues?.get(1)

    /** Strip CDATA and markup, decode entities (twice: some feeds double-encode). */
    private fun clean(raw: String): String {
        var s = raw.replace("<![CDATA[", "").replace("]]>", "")
        repeat(2) { if (it == 0 || ENTITY.containsMatchIn(s)) s = Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY).toString() }
        return s.replace(Regex("\\s+"), " ").trim()
    }

    private fun parseFeed(xml: String, source: String): List<JSONObject> =
        ITEM.findAll(xml).take(12).mapNotNull { m ->
            val block = m.value
            val title = tag(block, "title")?.let(::clean).orEmpty()
            val link = tag(block, "link")?.let(::clean)?.takeIf { it.startsWith("http") }
                ?: LINK_HREF.find(block)?.groupValues?.get(1)?.let(::clean).orEmpty()
            val date = tag(block, "pubDate") ?: tag(block, "updated") ?: tag(block, "published") ?: tag(block, "dc:date")
            if (title.isEmpty() || !link.startsWith("http")) null
            else JSONObject().put("source", source).put("title", title).put("url", link).put("t", parseDate(date))
        }.toList()

    /** Feed dates come in two families (RFC 822 and ISO 8601); 0 when unreadable. */
    private fun parseDate(raw: String?): Long {
        val s = raw?.let(::clean).orEmpty()
        if (s.isEmpty()) return 0
        try { return OffsetDateTime.parse(s).toInstant().toEpochMilli() } catch (_: Exception) {}
        try { return ZonedDateTime.parse(s, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() } catch (_: Exception) {}
        try { return SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US).parse(s)!!.time } catch (_: Exception) {}
        return 0
    }
}
