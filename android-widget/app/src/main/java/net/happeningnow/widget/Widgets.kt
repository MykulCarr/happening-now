package net.happeningnow.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle

const val ACTION_PREV = "net.happeningnow.widget.PREV"
const val ACTION_NEXT = "net.happeningnow.widget.NEXT"
const val ACTION_REFRESH = "net.happeningnow.widget.REFRESH"

/**
 * The three widget sizes are the same widget with different layouts, so all
 * the behaviour lives here and each size is an empty subclass (Android needs
 * one class per entry in the widget picker).
 */
abstract class BaseWidget : AppWidgetProvider() {

    // Called when a widget is added and then every 30 minutes: draw what we
    // have straight away, and fetch fresh data in the background.
    override fun onUpdate(c: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { mgr.updateAppWidget(it, Render.build(c, javaClass, it)) }
        RefreshJob.schedule(c)
    }

    // Resized: the large widget fits a different number of rows.
    override fun onAppWidgetOptionsChanged(c: Context, mgr: AppWidgetManager, id: Int, options: Bundle) {
        mgr.updateAppWidget(id, Render.build(c, javaClass, id))
    }

    override fun onReceive(c: Context, intent: Intent) {
        when (intent.action) {
            ACTION_PREV, ACTION_NEXT -> {
                Store.stepCategory(c, if (intent.action == ACTION_NEXT) 1 else -1)
                Widgets.updateAll(c) // pre-cached headlines appear at once
                if (RefreshJob.nearbyNewsIsStale(c)) RefreshJob.schedule(c, full = false) // top up the pre-cache
            }
            ACTION_REFRESH -> RefreshJob.schedule(c)
            else -> super.onReceive(c, intent)
        }
    }
}

class LargeWidget : BaseWidget()
class MediumWidget : BaseWidget()
class SmallWidget : BaseWidget()

object Widgets {
    val ALL = listOf(LargeWidget::class.java, MediumWidget::class.java, SmallWidget::class.java)

    /** Redraw every placed widget from the cache. */
    fun updateAll(c: Context) {
        val mgr = AppWidgetManager.getInstance(c)
        for (cls in ALL) for (id in mgr.getAppWidgetIds(ComponentName(c, cls))) {
            mgr.updateAppWidget(id, Render.build(c, cls, id))
        }
    }
}
