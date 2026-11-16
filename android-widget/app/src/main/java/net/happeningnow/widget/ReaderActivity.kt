package net.happeningnow.widget

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Reads a story without leaving for the browser: a bar (close, whose site
 * this is, open in browser) over the phone's built-in web view.
 *
 * A home-screen widget cannot hold a web page, so this screen is the nearest
 * thing: one tap on a headline, one tap (or Back) to return to the widget.
 *
 * The page comes straight from the publisher, exactly as it would in a
 * browser; nothing passes through happening-now.net. The web view is kept
 * narrow on purpose: web links only, no access to files, no new windows.
 */
class ReaderActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        val url = intent.dataString.orEmpty()
        if (!isWeb(url)) { finish(); return }

        val dp = resources.displayMetrics.density
        fun barButton(label: String, describe: String, onTap: () -> Unit) = TextView(this).apply {
            text = label; textSize = 15f; gravity = Gravity.CENTER; contentDescription = describe
            setTextColor(getColor(R.color.text)); setPadding((14 * dp).toInt(), 0, (14 * dp).toInt(), 0)
            minWidth = (48 * dp).toInt() // a finger-sized target
            setOnClickListener { onTap() }
        }
        val host = TextView(this).apply {
            textSize = 13f; maxLines = 1; gravity = Gravity.CENTER_VERTICAL
            setTextColor(getColor(R.color.muted))
        }
        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }

        web = WebView(this).apply {
            settings.javaScriptEnabled = true   // most news sites show nothing without it
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportMultipleWindows(false)
            webViewClient = object : WebViewClient() {
                // Web links stay here; anything else (app links, intent: links) is refused.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                    !isWeb(request.url.toString())

                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                    host.text = Uri.parse(url).host.orEmpty().removePrefix("www.")
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, percent: Int) {
                    progress.progress = percent
                    progress.visibility = if (percent >= 100) View.INVISIBLE else View.VISIBLE
                }
            }
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(barButton("✕", "Close") { finish() }, ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT)
            addView(host, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
            addView(barButton("Open in browser", "Open in browser") {
                // The page being read now, which may not be the one first opened.
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(web.url ?: url))) }
            }, ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            fitsSystemWindows = true // keep clear of the status and navigation bars
            setBackgroundColor(getColor(R.color.card))
            addView(bar, ViewGroup.LayoutParams.MATCH_PARENT, (48 * dp).toInt())
            addView(progress, ViewGroup.LayoutParams.MATCH_PARENT, (3 * dp).toInt())
            addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        })
        web.loadUrl(url)
    }

    // Back steps through the pages read here, then returns to the home screen.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else finish()
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    companion object {
        fun isWeb(url: String) = url.startsWith("https://") || url.startsWith("http://")
    }
}
