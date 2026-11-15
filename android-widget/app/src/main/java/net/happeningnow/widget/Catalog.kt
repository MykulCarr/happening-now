package net.happeningnow.widget

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/**
 * Setting the widget up without the website. The choices are made in
 * ManualSetupActivity; this turns them into the same settings the site would
 * have sent, using the site's own public catalogs (the files behind its
 * source pickers), so a stranger gets the same curated, free-to-read outlets.
 *
 * Everything here is a network read; call from a background thread.
 */
object Catalog {
    class Place(val city: String, val state: String, val region: String, val lat: Double, val lon: Double) {
        /** "Jackson, MI" in the US, "Lyon, Auvergne-Rhône-Alpes" elsewhere. */
        val label get() = listOf(city, state.ifEmpty { region }).filter { it.isNotEmpty() }.joinToString(", ")
    }

    class Topic(val id: String, val label: String, val title: String)

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun json(url: String) = JSONObject(Fetch.getText(url))

    /**
     * Places matching a ZIP code or a town name ("Jackson", "Jackson MI").
     * ZIPs go to zippopotam.us and names to Open-Meteo's geocoder: the same
     * two services the website uses for the same job.
     */
    fun findPlaces(query: String): List<Place> {
        val q = query.trim()
        if (Regex("\\d{5}").matches(q)) {
            val place = json("https://api.zippopotam.us/us/$q").getJSONArray("places").getJSONObject(0)
            val state = place.optString("state abbreviation")
            return listOf(Place(place.optString("place name"), state, STATES[state].orEmpty(),
                place.getString("latitude").toDouble(), place.getString("longitude").toDouble()))
        }
        // "Jackson MI" / "Jackson, MI": search the town, keep that state's matches.
        val words = q.split(Regex("[,\\s]+")).filter { it.isNotEmpty() }
        val wantState = words.lastOrNull()?.uppercase()?.takeIf { words.size > 1 && it in STATES }
        val name = if (wantState != null) words.dropLast(1).joinToString(" ") else q
        val results = json("https://geocoding-api.open-meteo.com/v1/search?name=${enc(name)}&count=10&language=en&format=json")
            .optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).map { results.getJSONObject(it) }.map { r ->
            val region = r.optString("admin1")
            val state = if (r.optString("country_code") == "US") STATES.entries.firstOrNull { it.value == region }?.key.orEmpty() else ""
            Place(r.optString("name"), state, if (state.isEmpty()) listOf(region, r.optString("country")).filter { it.isNotEmpty() }.joinToString(", ") else region,
                r.getDouble("latitude"), r.getDouble("longitude"))
        }.filter { wantState == null || it.state == wantState }.take(5)
    }

    /** Every topic the site offers, in the site's order. */
    fun topics(): List<Topic> {
        val all = json("${Fetch.SITE}/data/topic-sources.json").getJSONObject("topics")
        return all.keys().asSequence().map { id ->
            val t = all.getJSONObject(id)
            Topic(id, t.optString("label", id.uppercase()), t.optString("title", t.optString("label", id)))
        }.toList()
    }

    /**
     * The settings for these choices, in the shape Store.sanitize expects.
     * National and international are always there (the site's default outlets);
     * local and regional appear when the place is somewhere the site covers.
     */
    fun build(place: Place?, topicIds: List<String>, symbols: List<String>, celsius: Boolean): JSONObject {
        val cats = JSONArray()
        fun add(id: String, label: String, entries: List<JSONObject>) {
            val feeds = JSONArray()
            entries.distinctBy { it.optString("rss").lowercase() }.take(8).forEach {
                feeds.put(JSONObject().put("name", it.optString("name").substringBefore(" (").trim()).put("rss", it.optString("rss")))
            }
            if (feeds.length() > 0) cats.put(JSONObject().put("id", id).put("label", label).put("feeds", feeds))
        }
        fun entries(block: JSONObject?): List<JSONObject> {
            val list = block?.optJSONArray("entries") ?: return emptyList()
            return (0 until list.length()).map { list.getJSONObject(it) }
        }

        if (place != null && place.state.isNotEmpty()) {
            val state = json("${Fetch.SITE}/data/local-stations.json").getJSONObject("states").optJSONObject(place.state)
            if (state != null) {
                val statewide = entries(state.optJSONObject("_state"))
                // The town's own outlets first, then statewide ones, as on the site.
                add("local", "LOCAL · ${place.label.uppercase()}", entries(state.optJSONObject(place.city.lowercase())) + statewide)
                add("regional", "REGIONAL · ${STATES[place.state].orEmpty().uppercase()}", statewide)
            }
        }

        val sources = json("${Fetch.SITE}/data/news-sources.json").getJSONArray("sources")
        val defaults = (0 until sources.length()).map { sources.getJSONObject(it) }.filter { it.optBoolean("default") }
        add("national", "NATIONAL", defaults.filter { it.optString("scope") == "national" })
        add("international", "INTERNATIONAL", defaults.filter { it.optString("scope") == "international" })

        if (topicIds.isNotEmpty()) {
            val all = json("${Fetch.SITE}/data/topic-sources.json").getJSONObject("topics")
            for (id in topicIds) all.optJSONObject(id)?.let { add(id, it.optString("label", id.uppercase()), entries(it)) }
        }

        val out = JSONObject()
            .put("source", "app")
            .put("cats", cats)
            .put("cat", "national")
            .put("symbols", JSONArray(symbols))
            .put("tempUnit", if (celsius) "celsius" else "fahrenheit")
            .put("place", place?.label.orEmpty())
        if (place != null) out.put("lat", place.lat).put("lon", place.lon)
        return out
    }

    /** US states and DC, for matching "MI" in a search and labelling regional news. */
    val STATES = mapOf(
        "AL" to "Alabama", "AK" to "Alaska", "AZ" to "Arizona", "AR" to "Arkansas", "CA" to "California",
        "CO" to "Colorado", "CT" to "Connecticut", "DE" to "Delaware", "DC" to "District of Columbia",
        "FL" to "Florida", "GA" to "Georgia", "HI" to "Hawaii", "ID" to "Idaho", "IL" to "Illinois",
        "IN" to "Indiana", "IA" to "Iowa", "KS" to "Kansas", "KY" to "Kentucky", "LA" to "Louisiana",
        "ME" to "Maine", "MD" to "Maryland", "MA" to "Massachusetts", "MI" to "Michigan", "MN" to "Minnesota",
        "MS" to "Mississippi", "MO" to "Missouri", "MT" to "Montana", "NE" to "Nebraska", "NV" to "Nevada",
        "NH" to "New Hampshire", "NJ" to "New Jersey", "NM" to "New Mexico", "NY" to "New York",
        "NC" to "North Carolina", "ND" to "North Dakota", "OH" to "Ohio", "OK" to "Oklahoma", "OR" to "Oregon",
        "PA" to "Pennsylvania", "RI" to "Rhode Island", "SC" to "South Carolina", "SD" to "South Dakota",
        "TN" to "Tennessee", "TX" to "Texas", "UT" to "Utah", "VT" to "Vermont", "VA" to "Virginia",
        "WA" to "Washington", "WV" to "West Virginia", "WI" to "Wisconsin", "WY" to "Wyoming",
    )
}
