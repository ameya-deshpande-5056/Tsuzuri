package io.github.ameyadeshpande.tsuzuri

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var activeWebView: WebView? = null
  private var cachedTop: Float = 0f
  private var cachedBottom: Float = 0f
  private var cachedLeft: Float = 0f
  private var cachedRight: Float = 0f

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

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

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    activeWebView = webView

    // Expose Javascript Interface so webview can query insets synchronously on startup
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun getInsets(): String {
        return """{"top":$cachedTop,"bottom":$cachedBottom,"left":$cachedLeft,"right":$cachedRight}"""
      }
    }, "TsuzuriSafeAreaBridge")

    applyInsetsToWebView()
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
