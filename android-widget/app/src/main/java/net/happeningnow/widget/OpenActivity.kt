package net.happeningnow.widget

import android.app.Activity
import android.os.Bundle

/**
 * An invisible stepping stone for taps on rows of the scrolling headline list.
 *
 * A scrolling list in a widget cannot give each row its own tap action: all
 * rows share one, and each row only fills in its link. Android also requires
 * that shared action to name one of our own screens. So the list points here,
 * and this opens the link and closes at once.
 */
class OpenActivity : Activity() {
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        val url = intent.dataString.orEmpty()
        if (ReaderActivity.isWeb(url)) runCatching { startActivity(Site.open(this, url)) }
        finish()
    }
}
