package net.happeningnow.widget

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

/**
 * "Set up here": choose a town, news topics and a watchlist in the app, for
 * people who do not use the website. The choices stay on the phone; Catalog
 * turns them into the same settings the site would have sent.
 */
class ManualSetupActivity : Activity() {
    private var place: Catalog.Place? = null
    private lateinit var column: Column
    private lateinit var placeField: EditText
    private lateinit var placeStatus: TextView
    private lateinit var results: LinearLayout
    private lateinit var celsius: CheckBox
    private lateinit var topicList: LinearLayout
    private lateinit var symbolsField: EditText
    private lateinit var save: Button
    private val topicBoxes = mutableListOf<Pair<String, CheckBox>>()

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        // Start from what the widget already has, whichever way it got there.
        val cfg = Store.config(this)
        val had = cfg.optString("place")
        if (cfg.has("lat") && had.isNotEmpty()) {
            val state = had.substringAfterLast(", ", "").takeIf { it in Catalog.STATES }.orEmpty()
            place = Catalog.Place(had.substringBefore(","), state, if (state.isEmpty()) had.substringAfter(", ", "") else Catalog.STATES[state].orEmpty(),
                cfg.getDouble("lat"), cfg.getDouble("lon"))
        }
        val hadTopics = Store.categories(this).map { it.optString("id") }.toSet()
        val hadSymbols = cfg.getJSONArray("symbols").let { s -> (0 until s.length()).joinToString(", ") { s.getString(it) } }

        column = Column(this)
        column.title("Set up here")
        column.note("Choose what the widget shows. Your choices stay on this phone.")

        column.heading("Your town")
        placeField = column.field("ZIP code or town, e.g. 49201 or Jackson MI")
        column.button("Find") { find() }
        results = column.group()
        placeStatus = column.note("", 15f, R.color.text)
        celsius = column.check("Show temperatures in °C", cfg.optString("tempUnit") == "celsius")

        column.heading("News")
        column.note("National and world news are always included, and local and state news where the site covers your town. Add any topics you like:")
        topicList = column.group()
        val loading = column.note("Loading topics…", into = topicList)

        column.heading("Watchlist")
        symbolsField = column.field("Symbols, e.g. AAPL, MSFT, BTC-USD", hadSymbols)
        column.note("Up to 20, separated by commas. Leave empty for no watchlist.")

        save = column.button("Save and update the widget") { save() }
        column.show()
        showPlace()

        thread {
            val topics = runCatching { Catalog.topics() }.getOrNull()
            runOnUiThread {
                topicList.removeView(loading)
                if (topics == null) column.note("Couldn't load the topic list. Check your connection and open this screen again.", into = topicList)
                else for (t in topics) topicBoxes += t.id to column.check(t.title, t.id in hadTopics, into = topicList)
            }
        }
    }

    private fun showPlace() {
        placeStatus.text = place?.let { "Town: ${it.label}" } ?: "No town chosen. Without one the widget shows no weather or local news."
    }

    private fun find() {
        val query = placeField.text.toString().trim()
        if (query.isEmpty()) return
        results.removeAllViews()
        column.note("Searching…", into = results)
        thread {
            val found = runCatching { Catalog.findPlaces(query) }.getOrDefault(emptyList())
            runOnUiThread {
                results.removeAllViews()
                if (found.isEmpty()) column.note("Nothing found for “$query”. Try a ZIP code, or a town with its state.", into = results)
                for (p in found) column.button(listOf(p.city, p.region).filter { it.isNotEmpty() }.joinToString(", "), into = results) {
                    place = p
                    results.removeAllViews()
                    showPlace()
                }
            }
        }
    }

    private fun save() {
        val symbols = symbolsField.text.toString().split(Regex("[,\\s]+"))
            .map { it.trim().uppercase() }.filter { Regex("[A-Z0-9.^=-]{1,12}").matches(it) }.distinct().take(20)
        val topics = topicBoxes.filter { it.second.isChecked }.map { it.first }
        save.isEnabled = false
        save.text = "Saving…"
        thread {
            val config = runCatching { Store.sanitize(Catalog.build(place, topics, symbols, celsius.isChecked)) }.getOrNull()
            runOnUiThread {
                if (config == null) {
                    save.isEnabled = true
                    save.text = "Save and update the widget"
                    Toast.makeText(this, "Couldn't save. Check your connection and try again.", Toast.LENGTH_LONG).show()
                } else {
                    Store.saveConfig(this, config)
                    Widgets.updateAll(this)
                    RefreshJob.schedule(this)
                    Toast.makeText(this, "Saved. The widget is updating.", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }
}
