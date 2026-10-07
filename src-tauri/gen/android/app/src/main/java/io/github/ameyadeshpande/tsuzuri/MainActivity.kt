package io.github.ameyadeshpande.tsuzuri

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var activeWebView: WebView? = null
  private var cachedTop: Float = 0f
  private var cachedBottom: Float = 0f
  private var cachedLeft: Float = 0f
  private var cachedRight: Float = 0f

  private data class PendingDocument(
    val fileName: String,
    val content: String,
    val uri: String
  )

  private var pendingDoc: PendingDocument? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleIntent(intent)

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, windowInsets ->
      val insets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val density = resources.displayMetrics.density
      cachedTop = insets.top / density
      cachedBottom = insets.bottom / density
      cachedLeft = insets.left / density
      cachedRight = insets.right / density

      applyInsetsToWebView()
      windowInsets
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    if (intent == null) return
    val action = intent.action ?: return
    if (action != Intent.ACTION_VIEW && action != Intent.ACTION_EDIT && action != Intent.ACTION_SEND) {
      return
    }

    val uri: Uri? = intent.data
      ?: if (intent.clipData != null && intent.clipData!!.itemCount > 0) intent.clipData!!.getItemAt(0).uri else null
      ?: (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)

    if (uri != null) {
      readUriAndDispatch(uri)
    }
  }

  private fun readContentFromUri(uri: Uri): Pair<String, String>? {
    return try {
      if (uri.scheme == "content") {
        try {
          val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
          contentResolver.takePersistableUriPermission(uri, flags)
        } catch (_: Exception) {}

        val fileName = resolveFileName(uri)
        val content = contentResolver.openInputStream(uri)?.use { stream ->
          stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } ?: return null
        Pair(fileName, content)
      } else if (uri.scheme == "file" || uri.scheme == null) {
        val path = uri.path ?: uri.toString()
        val file = java.io.File(path)
        if (file.exists()) {
          val content = file.readText(Charsets.UTF_8)
          Pair(file.name, content)
        } else {
          null
        }
      } else {
        null
      }
    } catch (e: Exception) {
      e.printStackTrace()
      null
    }
  }

  private fun readUriAndDispatch(uri: Uri) {
    val result = readContentFromUri(uri) ?: return
    pendingDoc = PendingDocument(result.first, result.second, uri.toString())
    dispatchPendingDocument()
  }

  private fun resolveFileName(uri: Uri): String {
    var name: String? = null
    if (uri.scheme == "content") {
      try {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0) {
              name = cursor.getString(idx)
            }
          }
        }
      } catch (_: Exception) {}
    }
    if (name.isNullOrBlank()) {
      name = uri.lastPathSegment
    }
    if (!name.isNullOrBlank()) {
      name = Uri.decode(name)
      if (name.contains('/')) {
        name = name.substringAfterLast('/')
      }
    }
    return if (!name.isNullOrBlank()) name else "document.md"
  }

  private fun dispatchPendingDocument() {
    val doc = pendingDoc ?: return
    val webView = activeWebView ?: return

    val json = JSONObject().apply {
      put("fileName", doc.fileName)
      put("content", doc.content)
      put("uri", doc.uri)
    }.toString()

    webView.post {
      val js = """
        (function() {
          if (window.__tsuzuri_open_document) {
            window.__tsuzuri_open_document($json);
          } else {
            window.__tsuzuri_pending_doc = $json;
          }
        })();
      """.trimIndent()
      webView.evaluateJavascript(js, null)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    activeWebView = webView

    val bridge = object {
      @JavascriptInterface
      fun getInsets(): String {
        return """{"top":$cachedTop,"bottom":$cachedBottom,"left":$cachedLeft,"right":$cachedRight}"""
      }

      @JavascriptInterface
      fun getPendingDocument(): String? {
        val doc = pendingDoc ?: return null
        pendingDoc = null
        return JSONObject().apply {
          put("fileName", doc.fileName)
          put("content", doc.content)
          put("uri", doc.uri)
        }.toString()
      }

      @JavascriptInterface
      fun readDocument(uriString: String): String? {
        val uri = Uri.parse(uriString)
        val result = readContentFromUri(uri) ?: return null
        return JSONObject().apply {
          put("fileName", result.first)
          put("content", result.second)
          put("uri", uriString)
        }.toString()
      }

      @JavascriptInterface
      fun saveDocument(uriString: String, content: String): Boolean {
        return try {
          val uri = Uri.parse(uriString)
          if (uri.scheme == "content") {
            val stream = try {
              contentResolver.openOutputStream(uri, "wt")
            } catch (_: Exception) {
              contentResolver.openOutputStream(uri)
            }
            stream?.use { s ->
              s.bufferedWriter(Charsets.UTF_8).use { it.write(content) }
            }
            stream != null
          } else if (uri.scheme == "file" || uri.scheme == null) {
            val path = uri.path ?: uriString
            val file = java.io.File(path)
            file.parentFile?.mkdirs()
            file.writeText(content, Charsets.UTF_8)
            true
          } else {
            false
          }
        } catch (e: Exception) {
          e.printStackTrace()
          false
        }
      }
    }

    webView.addJavascriptInterface(bridge, "TsuzuriBridge")
    webView.addJavascriptInterface(bridge, "TsuzuriSafeAreaBridge")

    applyInsetsToWebView()
    dispatchPendingDocument()
  }

  private fun applyInsetsToWebView() {
    activeWebView?.post {
      val js = """
        (function() {
          var r = document.documentElement;
          if (r) {
            r.style.setProperty('--safe-area-top', '${cachedTop}px');
            r.style.setProperty('--safe-area-bottom', '${cachedBottom}px');
            r.style.setProperty('--safe-area-left', '${cachedLeft}px');
            r.style.setProperty('--safe-area-right', '${cachedRight}px');
          }
        })();
      """.trimIndent()
      activeWebView?.evaluateJavascript(js, null)
    }
  }
}
