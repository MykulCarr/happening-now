package net.happeningnow.widget

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Opening happening-now.net pages in the right place. The reader's settings
 * live in Chrome's storage (the installed Happening Now app is a Chrome
 * "WebAPK"), so a site link must go there — if the phone's default browser is
 * something else, it would open a copy of the site that knows none of them.
 */
object Site {
    fun intent(c: Context, url: String): Intent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val handlers = c.packageManager.queryIntentActivities(intent, 0).map { it.activityInfo.packageName }
        // The installed site app first, then Chrome; otherwise let the phone choose.
        val target = handlers.firstOrNull { it.startsWith("org.chromium.webapk") }
            ?: handlers.firstOrNull { it == "com.android.chrome" }
        if (target != null) intent.setPackage(target)
        return intent
    }

    /**
     * Where any link from the widget opens: our own pages in the site app, a
     * story in the reader screen, or in the browser if that option is on.
     */
    fun open(c: Context, url: String): Intent = when {
        url.startsWith(Fetch.SITE) -> intent(c, url)
        Store.flag(c, "browserLinks") -> Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        else -> Intent(c, ReaderActivity::class.java).setData(Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
