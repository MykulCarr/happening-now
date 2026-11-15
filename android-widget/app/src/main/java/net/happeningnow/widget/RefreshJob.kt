package net.happeningnow.widget

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.PersistableBundle
import android.util.Log
import kotlin.concurrent.thread

/**
 * Fetches fresh data in the background and redraws the widgets. Run through
 * Android's job scheduler so it waits for a network connection and is allowed
 * the time slow feeds need (a widget's own update callback is not).
 *
 * Two kinds: a full refresh (weather, watchlist, current category) and a
 * category-only one, used when you flip to a category not fetched recently.
 */
class RefreshJob : JobService() {

    override fun onStartJob(params: JobParameters): Boolean {
        thread {
            try { refresh(this, params.extras.getString("cat")) }
            catch (e: Exception) { Log.w("HNWidget", "refresh failed", e) }
            Widgets.updateAll(this)
            jobFinished(params, false)
        }
        return true // still working, on the thread above
    }

    override fun onStopJob(params: JobParameters) = false

    companion object {
        private const val STALE_MS = 20 * 60 * 1000L

        fun schedule(c: Context, onlyCategory: String? = null) {
            val extras = PersistableBundle()
            if (onlyCategory != null) extras.putString("cat", onlyCategory)
            // Fixed ids: scheduling again replaces a pending job rather than queueing another.
            val job = JobInfo.Builder(if (onlyCategory == null) 1 else 2, ComponentName(c, RefreshJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setExtras(extras)
                .build()
            c.getSystemService(JobScheduler::class.java).schedule(job)
        }

        /** True when the showing category has no headlines newer than 20 minutes. */
        fun currentNewsIsStale(c: Context): Boolean {
            val at = Store.news(c, Store.currentCategory(c).optString("id"))?.optLong("at") ?: 0
            return System.currentTimeMillis() - at > STALE_MS
        }

        private fun refresh(c: Context, onlyCategory: String?) {
            val cfg = Store.config(c)
            val category = Store.categories(c).firstOrNull { it.optString("id") == onlyCategory } ?: Store.currentCategory(c)
            val full = onlyCategory == null

            // Each piece may fail on its own; a failure keeps the old cached value.
            val news = runCatching { Fetch.headlines(category) }.getOrNull()
            val weather = if (full) runCatching { Fetch.weather(cfg) }.getOrNull() else null
            val quotes = if (full) runCatching { Fetch.quotes(cfg.getJSONArray("symbols")) }.getOrNull() else null

            val now = System.currentTimeMillis()
            Store.updateCache(c) { cache ->
                if (news != null && news.length() > 0) {
                    val all = cache.optJSONObject("news") ?: org.json.JSONObject().also { cache.put("news", it) }
                    all.put(category.optString("id"), org.json.JSONObject().put("at", now).put("items", news))
                }
                if (weather != null) cache.put("weather", weather)
                if (quotes != null) cache.put("quotes", quotes)
                if (full && (news != null || weather != null || quotes != null)) cache.put("updatedAt", now)
            }
        }
    }
}
