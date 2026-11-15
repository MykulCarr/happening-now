package net.happeningnow.widget

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.os.PersistableBundle
import android.util.Log
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Fetches fresh data in the background and redraws the widgets. Run through
 * Android's job scheduler so it waits for a network connection and is allowed
 * the time slow feeds need (a widget's own update callback is not).
 *
 * Headlines are pre-cached beyond the category on screen so flipping is
 * instant: the two neighbours always, and on Wi-Fi every category. On mobile
 * data it stops at the neighbours — fourteen categories every half hour
 * would be real data use.
 *
 * Two kinds of run: "full" (weather + watchlist + headlines, every 30 min or
 * on the refresh button) and news-only (after a flip, to top up the cache).
 */
class RefreshJob : JobService() {

    override fun onStartJob(params: JobParameters): Boolean {
        thread {
            try { refresh(this, full = params.extras.getInt("full") == 1) }
            catch (e: Exception) { Log.w("HNWidget", "refresh failed", e) }
            Store.setStatus(this, null)
            Widgets.updateAll(this)
            jobFinished(params, false)
        }
        return true // still working, on the thread above
    }

    override fun onStopJob(params: JobParameters) = false

    companion object {
        private const val STALE_MS = 20 * 60 * 1000L
        private const val FAR_STALE_MS = 3 * 60 * 60 * 1000L

        fun schedule(c: Context, full: Boolean = true) {
            val extras = PersistableBundle().apply { putInt("full", if (full) 1 else 0) }
            // Fixed ids: scheduling again replaces a pending job rather than queueing another.
            val job = JobInfo.Builder(if (full) 1 else 2, ComponentName(c, RefreshJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setExtras(extras)
                .build()
            c.getSystemService(JobScheduler::class.java).schedule(job)
        }

        private fun isStale(c: Context, categoryId: String) =
            System.currentTimeMillis() - (Store.news(c, categoryId)?.optLong("at") ?: 0) > STALE_MS

        /** True when the category on screen, or one beside it, needs fetching. */
        fun nearbyNewsIsStale(c: Context) = fetchOrder(c, reach = 1).any { isStale(c, it.optString("id")) }

        /** The category on screen first, then outwards on both sides, `reach` steps each way. */
        private fun fetchOrder(c: Context, reach: Int): List<JSONObject> {
            val cats = Store.categories(c)
            val at = Store.categoryIndex(c)
            val order = linkedSetOf(at)
            for (d in 1..minOf(reach, cats.size / 2)) {
                order += (at + d) % cats.size
                order += (at - d + cats.size) % cats.size
            }
            return order.map { cats[it] }
        }

        private fun refresh(c: Context, full: Boolean) {
            val cfg = Store.config(c)
            val now = System.currentTimeMillis()

            // Each piece may fail on its own; a failure keeps the old cached value.
            fun fetchNews(category: JSONObject) {
                val news = runCatching { Fetch.headlines(category) }.getOrNull() ?: return
                if (news.length() == 0) return
                Store.updateCache(c) { cache ->
                    val all = cache.optJSONObject("news") ?: JSONObject().also { cache.put("news", it) }
                    all.put(category.optString("id"), JSONObject().put("at", System.currentTimeMillis()).put("items", news))
                }
            }

            // 1. What's on screen, shown as soon as it lands.
            val current = Store.currentCategory(c)
            if (full || isStale(c, current.optString("id"))) fetchNews(current)
            if (full) {
                val weather = runCatching { Fetch.weather(cfg) }.getOrNull()
                val quotes = runCatching { Fetch.quotes(cfg.getJSONArray("symbols")) }.getOrNull()
                Store.updateCache(c) { cache ->
                    if (weather != null) cache.put("weather", weather)
                    if (quotes != null) cache.put("quotes", quotes)
                    cache.put("updatedAt", now)
                }
            }
            Widgets.updateAll(c)

            // Once a day, see whether the site has a newer version of this app.
            if (full && now - Store.latestCheckedAt(c) > 24 * 60 * 60 * 1000L) runCatching {
                val latest = Fetch.latestVersion()
                Store.setLatest(c, latest.getLong("versionCode"), latest.optString("versionName"))
            }

            // 2. Pre-cache the rest, nearest first, one category at a time.
            val metered = c.getSystemService(ConnectivityManager::class.java).isActiveNetworkMetered
            // The two neighbours keep the 20-minute rule; categories further away
            // (unmetered networks only) are refreshed every three hours. With up
            // to eight sources each, doing them all every half hour would be a
            // lot of requests for headlines nobody is looking at.
            fetchOrder(c, reach = if (metered) 1 else Int.MAX_VALUE).drop(1).forEachIndexed { k, category ->
                val age = System.currentTimeMillis() - (Store.news(c, category.optString("id"))?.optLong("at") ?: 0)
                if (age > if (k < 2) STALE_MS else FAR_STALE_MS) fetchNews(category)
            }
        }
    }
}
