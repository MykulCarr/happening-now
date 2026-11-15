package net.happeningnow.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything the widget remembers, in one private preferences file:
 *  - config: the settings the Today page sent (place, categories, watchlist)
 *  - cache:  the last data fetched, so the widget can redraw instantly
 *  - cat:    which news category is showing
 */
object Store {
    private fun prefs(c: Context) = c.getSharedPreferences("hn", Context.MODE_PRIVATE)

    // Used until settings arrive from the site: headlines only, no location.
    private const val DEFAULT_CONFIG = """{"place":"","symbols":[],"cats":[
      {"id":"national","label":"NATIONAL","feeds":[
        {"name":"NPR","rss":"https://feeds.npr.org/1001/rss.xml"},
        {"name":"CBS News","rss":"https://www.cbsnews.com/latest/rss/main"}]},
      {"id":"international","label":"INTERNATIONAL","feeds":[
        {"name":"DW","rss":"https://rss.dw.com/rdf/rss-en-all"},
        {"name":"The Guardian","rss":"https://www.theguardian.com/world/rss"}]}]}"""

    /**
     * This install's private pairing code, made once. The site remembers it
     * and puts it in every settings link, which is how we tell our own links
     * (applied straight away) from anyone else's (asked about first).
     */
    fun pairingCode(c: Context): String {
        prefs(c).getString("code", null)?.let { return it }
        val bytes = ByteArray(16).also { java.security.SecureRandom().nextBytes(it) }
        val code = bytes.joinToString("") { "%02x".format(it) }
        prefs(c).edit().putString("code", code).commit()
        return code
    }

    // ---- updates -------------------------------------------------------------
    // The app is installed from the site, not a store, so nothing updates it
    // for us: RefreshJob asks the site once a day what the newest version is.
    fun latestCheckedAt(c: Context) = prefs(c).getLong("latestAt", 0)

    fun setLatest(c: Context, code: Long, name: String) {
        prefs(c).edit().putLong("latestCode", code).putString("latestName", name)
            .putLong("latestAt", System.currentTimeMillis()).commit()
    }

    /** The newer version's name when the site offers one, else null. */
    fun updateAvailable(c: Context): String? {
        val installed = c.packageManager.getPackageInfo(c.packageName, 0).longVersionCode
        return if (prefs(c).getLong("latestCode", 0) > installed) prefs(c).getString("latestName", "") else null
    }

    // ---- refresh status ------------------------------------------------------
    // Set when the refresh button is tapped, cleared when the refresh ends, so
    // a tap is always acknowledged. Ignored after two minutes in case the
    // refresh was killed before it could clear it.
    fun setStatus(c: Context, text: String?) {
        prefs(c).edit().putString("status", text).putLong("statusAt", System.currentTimeMillis()).commit()
    }

    fun status(c: Context): String? =
        prefs(c).getString("status", null)?.takeIf { System.currentTimeMillis() - prefs(c).getLong("statusAt", 0) < 2 * 60 * 1000L }

    fun isSetUp(c: Context) = prefs(c).contains("config")

    fun config(c: Context) = JSONObject(prefs(c).getString("config", null) ?: DEFAULT_CONFIG)

    /**
     * Copy only the fields we understand out of a settings link, with limits.
     * The link can be opened by any app or web page, so nothing in it is
     * trusted: feeds must be https, and sizes are capped. Returns null if it
     * holds no usable category.
     */
    fun sanitize(raw: JSONObject): JSONObject? {
        fun text(o: JSONObject, key: String) = o.optString(key).take(80)
        val cats = JSONArray()
        val rawCats = raw.optJSONArray("cats") ?: return null
        for (i in 0 until minOf(rawCats.length(), 40)) {
            val rc = rawCats.optJSONObject(i) ?: continue
            val feeds = JSONArray()
            val rawFeeds = rc.optJSONArray("feeds") ?: continue
            for (k in 0 until minOf(rawFeeds.length(), 8)) {
                val rf = rawFeeds.optJSONObject(k) ?: continue
                val rss = rf.optString("rss")
                if (rss.startsWith("https://") && rss.length < 500) {
                    feeds.put(JSONObject().put("name", text(rf, "name")).put("rss", rss))
                }
            }
            if (feeds.length() > 0 && text(rc, "id").isNotEmpty()) {
                cats.put(JSONObject().put("id", text(rc, "id")).put("label", text(rc, "label")).put("feeds", feeds))
            }
        }
        if (cats.length() == 0) return null

        val symbols = JSONArray()
        val rawSymbols = raw.optJSONArray("symbols") ?: JSONArray()
        for (i in 0 until minOf(rawSymbols.length(), 20)) {
            val s = rawSymbols.optString(i)
            if (Regex("[A-Za-z0-9.^=-]{1,12}").matches(s)) symbols.put(s.uppercase())
        }

        val out = JSONObject().put("cats", cats).put("symbols", symbols)
            .put("place", text(raw, "place")).put("cat", text(raw, "cat"))
            .put("tempUnit", if (raw.optString("tempUnit") == "celsius") "celsius" else "fahrenheit")
        val lat = raw.optDouble("lat"); val lon = raw.optDouble("lon")
        if (lat in -90.0..90.0 && lon in -180.0..180.0) out.put("lat", lat).put("lon", lon)
        return out
    }

    /** Replace the settings. Old cached data belonged to the old settings, so it goes. */
    fun saveConfig(c: Context, config: JSONObject) {
        val cats = config.getJSONArray("cats")
        val start = (0 until cats.length()).firstOrNull { cats.getJSONObject(it).optString("id") == config.optString("cat") } ?: 0
        prefs(c).edit().putString("config", config.toString()).remove("cache").putInt("cat", start).commit()
    }

    fun cache(c: Context) = JSONObject(prefs(c).getString("cache", "{}")!!)

    /** Read-change-write under a lock: two refresh jobs can finish at once. */
    @Synchronized
    fun updateCache(c: Context, change: (JSONObject) -> Unit) {
        val cache = cache(c)
        change(cache)
        prefs(c).edit().putString("cache", cache.toString()).commit()
    }

    fun categories(c: Context): List<JSONObject> {
        val cats = config(c).getJSONArray("cats")
        return (0 until cats.length()).map { cats.getJSONObject(it) }
    }

    fun categoryIndex(c: Context) = prefs(c).getInt("cat", 0).coerceIn(0, categories(c).size - 1)

    fun currentCategory(c: Context) = categories(c)[categoryIndex(c)]

    /** Move to the next/previous category, wrapping round at either end. */
    fun stepCategory(c: Context, by: Int) {
        val n = categories(c).size
        prefs(c).edit().putInt("cat", (categoryIndex(c) + by + n) % n).commit()
    }

    /** Cached headlines for one category: { at, items:[{source,title,url,t}] } or null. */
    fun news(c: Context, categoryId: String): JSONObject? =
        cache(c).optJSONObject("news")?.optJSONObject(categoryId)
}
