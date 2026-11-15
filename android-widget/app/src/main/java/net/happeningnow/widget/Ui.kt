package net.happeningnow.widget

import android.app.Activity
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * A plain scrolling column of text, buttons and fields in the widget's colours.
 * Both of the app's screens are this and nothing more, so it is built in code
 * rather than in layout files.
 */
class Column(private val activity: Activity) {
    private val pad = (20 * activity.resources.displayMetrics.density).toInt()
    private val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(pad, pad * 2, pad, pad * 2)
    }

    private fun <T : android.view.View> T.addTo(parent: LinearLayout): T {
        parent.addView(this, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        return this
    }

    fun note(text: String, size: Float = 13f, color: Int = R.color.muted, into: LinearLayout = root) =
        TextView(activity).apply {
            this.text = text; textSize = size; setTextColor(activity.getColor(color)); setPadding(0, 0, 0, pad)
        }.addTo(into)

    fun title(text: String) = note(text, 24f, R.color.text)

    fun heading(text: String) = note(text, 17f, R.color.text).apply { setPadding(0, pad / 2, 0, pad / 3) }

    fun button(label: String, into: LinearLayout = root, onTap: () -> Unit) =
        Button(activity).apply { text = label; isAllCaps = false; setOnClickListener { onTap() } }.addTo(into)

    fun field(hint: String, value: String = "") =
        EditText(activity).apply {
            this.hint = hint; setText(value); setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setTextColor(activity.getColor(R.color.text)); setHintTextColor(activity.getColor(R.color.faint))
        }.addTo(root)

    fun check(label: String, checked: Boolean, into: LinearLayout = root) =
        CheckBox(activity).apply {
            text = label; isChecked = checked; textSize = 15f; setTextColor(activity.getColor(R.color.text))
            minHeight = (48 * activity.resources.displayMetrics.density).toInt() // a finger-sized target
        }.addTo(into)

    /** An empty block to fill in later (search results, the topic list). */
    fun group() = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }.addTo(root)

    fun show() {
        val background = activity.getColor(R.color.card)
        activity.setContentView(ScrollView(activity).apply { addView(root); setBackgroundColor(background) })
    }
}
