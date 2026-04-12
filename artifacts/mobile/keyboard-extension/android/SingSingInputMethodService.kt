package com.singsing.keyboard

import android.content.Intent
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.view.inputmethod.InputConnection
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL

class SingSingInputMethodService : InputMethodService() {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val apiBase = "https://singsing-production.up.railway.app"

    private lateinit var searchInput: EditText
    private lateinit var resultsContainer: LinearLayout
    private lateinit var suggestionsButton: Button
    private lateinit var clipsButton: Button

    override fun onCreateInputView(): View {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dipToPx(320)
            )
            setBackgroundColor(0xFFEDE7DB.toInt()) // card color
            setPadding(dipToPx(8), dipToPx(8), dipToPx(8), dipToPx(8))
        }

        val headerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        searchInput = EditText(this).apply {
            hint = "Paroles, artiste..."
            textSize = 13f
            setBackgroundColor(0xFFF5F0E8.toInt())
            setPadding(dipToPx(10), dipToPx(8), dipToPx(10), dipToPx(8))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnEditorActionListener { _, _, _ ->
                performSearch(text.toString())
                true
            }
        }
        headerLayout.addView(searchInput)

        val closeButton = Button(this).apply {
            text = "✕"
            textSize = 16f
            layoutParams = LinearLayout.LayoutParams(dipToPx(40), LinearLayout.LayoutParams.WRAP_CONTENT)
            setOnClickListener { requestHideSelf(0) }
        }
        headerLayout.addView(closeButton)
        layout.addView(headerLayout)

        val divider = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dipToPx(1)
            ).also { it.topMargin = dipToPx(4); it.bottomMargin = dipToPx(4) }
            setBackgroundColor(0xFFD6CCBC.toInt())
        }
        layout.addView(divider)

        val scrollView = android.widget.ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
            )
        }

        resultsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        scrollView.addView(resultsContainer)
        layout.addView(scrollView)

        val footerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        suggestionsButton = Button(this).apply {
            text = "⚡ Suggestions IA"
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { openSingSingApp("reply") }
        }
        footerLayout.addView(suggestionsButton)

        clipsButton = Button(this).apply {
            text = "📁 Mes clips"
            textSize = 12f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { openSingSingApp("") }
        }
        footerLayout.addView(clipsButton)
        layout.addView(footerLayout)

        return layout
    }

    private fun performSearch(query: String) {
        if (query.isBlank()) return

        scope.launch {
            resultsContainer.removeAllViews()

            val loadingText = TextView(this@SingSingInputMethodService).apply {
                text = "Recherche..."
                textSize = 13f
                setPadding(dipToPx(8), dipToPx(16), dipToPx(8), dipToPx(16))
                setTextColor(0xFF8A7E6D.toInt())
            }
            resultsContainer.addView(loadingText)

            try {
                val results = withContext(Dispatchers.IO) {
                    val encoded = java.net.URLEncoder.encode(query, "UTF-8")
                    val response = URL("$apiBase/api/songs/search?q=$encoded").readText()
                    val json = JSONObject(response)
                    val arr = json.getJSONArray("results")
                    (0 until minOf(arr.length(), 5)).map { arr.getJSONObject(it) }
                }

                resultsContainer.removeAllViews()

                results.forEach { song ->
                    val title = song.optString("trackName", "")
                    val artist = song.optString("artistName", "")
                    val trackId = song.optInt("trackId", 0)

                    val row = LinearLayout(this@SingSingInputMethodService).apply {
                        orientation = LinearLayout.HORIZONTAL
                        setPadding(dipToPx(6), dipToPx(10), dipToPx(6), dipToPx(10))
                        setOnClickListener { openSingSingApp("editor?trackId=$trackId") }
                    }

                    val songInfo = TextView(this@SingSingInputMethodService).apply {
                        text = "🎵 $title\n   $artist"
                        textSize = 14f
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                        setTextColor(0xFF2C2418.toInt())
                    }
                    row.addView(songInfo)

                    val clipBtn = Button(this@SingSingInputMethodService).apply {
                        text = "CLIP →"
                        textSize = 10f
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        )
                        setOnClickListener { openSingSingApp("editor?trackId=$trackId") }
                    }
                    row.addView(clipBtn)
                    resultsContainer.addView(row)
                }
            } catch (e: Exception) {
                resultsContainer.removeAllViews()
                val errorText = TextView(this@SingSingInputMethodService).apply {
                    text = "Erreur de recherche"
                    textSize = 13f
                    setPadding(dipToPx(8), dipToPx(16), dipToPx(8), dipToPx(16))
                    setTextColor(0xFFD94A3D.toInt())
                }
                resultsContainer.addView(errorText)
            }
        }
    }

    private fun openSingSingApp(path: String) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("singsing://$path")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            val webIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("https://singsing-production.up.railway.app/$path")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(webIntent)
        }
    }

    private fun dipToPx(dp: Int): Int {
        return (dp * resources.displayMetrics.density).toInt()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
