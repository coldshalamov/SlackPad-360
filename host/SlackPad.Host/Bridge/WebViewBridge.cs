using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using SlackPad.Host.Contracts;

namespace SlackPad.Host.Bridge;

/// <summary>
/// Optional WebView2 transport. Initializes the Evergreen runtime, loads the built game page
/// when present (else about:blank), posts host→page envelopes, and dispatches validated
/// page→host messages. Degrades gracefully (adapters + traces still work) when the runtime
/// is missing.
/// </summary>
internal sealed class WebViewBridge : IDisposable
{
    /// <summary>Virtual host the game dist is mapped to in game mode.</summary>
    private const string GameVirtualHost = "slackpad.game";

    /// <summary>Origin the game is served from (SetVirtualHostNameToFolderMapping).</summary>
    private const string GameOrigin = "https://slackpad.game";

    private readonly WebView2 _webView;
    private string _pageOrigin = "about:blank";
    private bool _coreReady;
    private bool _gameMode;

    public WebView2 Control => _webView;
    public bool Available { get; private set; }
    public string StatusMessage { get; private set; } = "WebView2 not initialized.";

    /// <summary>Raised (UI thread) for a validated page→host message.</summary>
    public event Action<PageToHostMessage>? PageMessage;

    public WebViewBridge()
    {
        _webView = new WebView2 { Dock = System.Windows.Forms.DockStyle.Fill };
    }

    public async Task InitializeAsync(HostInfoEnvelope hostInfo)
    {
        try
        {
            string userData = Path.Combine(Path.GetTempPath(), "SlackPadHostWebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, userData, null);
            await _webView.EnsureCoreWebView2Async(env);

            _coreReady = true;
            Available = true;

            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            string? gameIndex = FindGameIndex();
            if (gameIndex != null)
            {
                var uri = new Uri(gameIndex);
                _pageOrigin = uri.AbsoluteUri;
                _webView.CoreWebView2.Navigate(uri.AbsoluteUri);
                StatusMessage = "WebView2 ready; game page loaded.";
            }
            else
            {
                _pageOrigin = "about:blank";
                _webView.CoreWebView2.Navigate("about:blank");
                StatusMessage = "WebView2 ready; no game dist, showing about:blank.";
            }

            _webView.CoreWebView2.NavigationCompleted += (_, _) => PostHostInfo(hostInfo);
        }
        catch (Exception ex)
        {
            Available = false;
            _coreReady = false;
            StatusMessage = $"WebView2 unavailable (Evergreen runtime missing?): {ex.GetType().Name}.";
        }
    }

    /// <summary>
    /// Game-mode init: map the built dist folder to the <c>slackpad.game</c> virtual
    /// host and load it full-window. Uses an https origin (not file://) so the page
    /// runs in a secure context and the origin check is exact. Locks down pinch zoom,
    /// swipe-nav, context menus, and (unless requested) dev tools. Degrades to
    /// <see cref="Available"/> = false when the Evergreen runtime is missing.
    /// </summary>
    public async Task InitializeGameAsync(HostInfoEnvelope hostInfo, string gameDistFolder, bool enableDevTools)
    {
        try
        {
            string userData = Path.Combine(Path.GetTempPath(), "SlackPadHostWebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, userData, null);
            await _webView.EnsureCoreWebView2Async(env);

            _coreReady = true;
            Available = true;
            _gameMode = true;

            var s = _webView.CoreWebView2.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsPinchZoomEnabled = false;        // trackpad pinch must not zoom the page
            s.IsSwipeNavigationEnabled = false;  // no two-finger back/forward swipe
            s.IsZoomControlEnabled = false;      // ctrl+wheel / ctrl+/- zoom off
            s.AreDevToolsEnabled = enableDevTools;

            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            _webView.CoreWebView2.NavigationCompleted += (_, _) => PostHostInfo(hostInfo);

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                GameVirtualHost, gameDistFolder, CoreWebView2HostResourceAccessKind.Allow);

            _pageOrigin = GameOrigin;
            _webView.CoreWebView2.Navigate(GameOrigin + "/index.html");
            StatusMessage = $"WebView2 ready; game mapped to {GameOrigin} from {gameDistFolder}.";
        }
        catch (Exception ex)
        {
            Available = false;
            _coreReady = false;
            StatusMessage = $"WebView2 unavailable (Evergreen runtime missing?): {ex.GetType().Name}.";
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Origin validation (architecture §7): trust only the page we navigated to.
        string source = e.Source ?? string.Empty;
        if (!IsTrustedOrigin(source))
        {
            return;
        }

        try
        {
            string json = e.WebMessageAsJson;
            var msg = JsonSerializer.Deserialize<PageToHostMessage>(json, ContactFrameJson.Options);
            if (msg is { V: 1, Type: not null } &&
                msg.Type is "ready" or "quit" or "settings" or "requestCalib")
            {
                PageMessage?.Invoke(msg);
            }
        }
        catch (JsonException)
        {
            // ignore malformed page messages
        }
    }

    private bool IsTrustedOrigin(string source)
    {
        if (string.IsNullOrEmpty(source))
        {
            return false;
        }
        if (_gameMode)
        {
            // Exact host match — https://slackpad.game only. A StartsWith check
            // would also accept https://slackpad.game.evil.com/.
            return Uri.TryCreate(source, UriKind.Absolute, out var uri) &&
                   uri.Scheme == Uri.UriSchemeHttps &&
                   string.Equals(uri.Host, GameVirtualHost, StringComparison.OrdinalIgnoreCase);
        }
        if (_pageOrigin == "about:blank")
        {
            return source == "about:blank";
        }
        return source.StartsWith(_pageOrigin, StringComparison.OrdinalIgnoreCase) ||
               source.StartsWith("file://", StringComparison.OrdinalIgnoreCase);
    }

    public void PostHostInfo(HostInfoEnvelope hostInfo) => Post(hostInfo);

    public void PostContactBatch(ContactBatchEnvelope batch)
    {
        if (batch.Frames.Count == 0)
        {
            return;
        }
        Post(batch);
    }

    public void PostFocus(bool focused) =>
        Post(new FocusEnvelope { Payload = new FocusPayload { Focused = focused } });

    private void Post(object envelope)
    {
        if (!_coreReady)
        {
            return;
        }
        try
        {
            string json = JsonSerializer.Serialize(envelope, ContactFrameJson.Options);
            _webView.CoreWebView2.PostWebMessageAsJson(json);
        }
        catch
        {
            // page not ready / navigating — drop this batch
        }
    }

    /// <summary>Walk up from the executable to find packages/game/dist/index.html.</summary>
    private static string? FindGameIndex()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 8 && dir != null; i++)
        {
            string candidate = Path.Combine(dir.FullName, "packages", "game", "dist", "index.html");
            if (File.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        return null;
    }

    public void Dispose() => _webView.Dispose();
}
