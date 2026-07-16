using System.Diagnostics;
using System.Runtime.InteropServices;
using SlackPad.Host.Adapters;
using SlackPad.Host.Bridge;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using SlackPad.Host.Interop;

namespace SlackPad.Host.Ui;

/// <summary>
/// Game mode: the built SlackPad game full-window in WebView2, fed REAL trackpad
/// ContactFrames. This is what play.bat launches — the owner double-clicks and
/// skates with their fingers.
///
/// The host owns HID→ContactFrame only (architecture §2): the Raw Input adapter
/// (primary; pointer is a degraded fallback) assembles frames on the form handle,
/// the batch timer stamps truthful LEFT/RIGHT button state onto them (see
/// <see cref="HostButtonMerge"/>) and posts <c>contactBatch</c> envelopes to the
/// page, which pushes them through the same InputHub the DEV PAD uses. No gameplay
/// logic lives here.
/// </summary>
internal sealed class GameForm : Form
{
    private static readonly Color Bg = Color.FromArgb(11, 13, 16);
    private static readonly Color Fg = Color.FromArgb(222, 228, 236);

    private readonly TouchpadRawInputAdapter _rawAdapter = new();
    private readonly TouchpadPointerAdapter _pointerAdapter = new();
    private IContactAdapter _activeAdapter;
    private readonly WebViewBridge _bridge = new();

    // ~125 Hz UI tick: drain assembled frames into a contactBatch and sample the
    // click/Ctrl/F11 keys (GetAsyncKeyState is a poll, not a message).
    private readonly System.Windows.Forms.Timer _batchTimer = new() { Interval = 8 };
    private readonly HostButtonFramePump _buttonPump = new();
    private bool _inputActive;

    private readonly bool _devTools;
    private Label _messageLabel = null!;

    // F11 fullscreen toggle (rising-edge detected on the batch timer).
    private bool _f11WasDown;
    private bool _isFullscreen;
    private FormBorderStyle _savedBorder;
    private FormWindowState _savedState;
    private Rectangle _savedBounds;

    public GameForm(bool devTools)
    {
        _devTools = devTools;
        _activeAdapter = _rawAdapter;

        Text = "SlackPad 360";
        ClientSize = new Size(1280, 800);
        MinimumSize = new Size(720, 480);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Bg;
        ForeColor = Fg;

        BuildLayout();

        _rawAdapter.FrameReady += OnFrame;
        _pointerAdapter.FrameReady += OnFrame;
        _batchTimer.Tick += OnTick;
    }

    private void BuildLayout()
    {
        _bridge.Control.Dock = DockStyle.Fill;

        _messageLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Fg,
            BackColor = Bg,
            Font = new Font(FontFamily.GenericSansSerif, 13f),
            Visible = false,
        };

        // WebView first (bottom of z-order), message overlay second so BringToFront wins.
        Controls.Add(_bridge.Control);
        Controls.Add(_messageLabel);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        _ = StartAsync();
    }

    private async Task StartAsync()
    {
        string? dist = GameDistResolver.Resolve();
        if (dist == null)
        {
            ShowMessage(
                "SlackPad 360 — game build not found.\n\n" +
                "Run play.bat to build the game first, then relaunch.\n" +
                "(looked for GameDist next to the app and packages\\game\\dist)");
            return;
        }

        // Real input starts immediately on the FORM handle. RIDEV_INPUTSINK is why
        // WM_INPUT keeps reaching this WndProc after the WebView2 child takes focus.
        _activeAdapter.Start(Handle);
        if (!_activeAdapter.Supported)
        {
            // Raw digitizer unavailable — try the Win11 pointer co-path (degraded;
            // usually will not fire under the focused WebView2 child, documented).
            _activeAdapter.Stop();
            _activeAdapter = _pointerAdapter;
            _activeAdapter.Start(Handle);
        }
        _batchTimer.Start();

        var hostInfo = new HostInfoEnvelope
        {
            Payload = new HostInfoPayload
            {
                Os = RuntimeInformation.OSDescription,
                Machine = Environment.MachineName,
                Adapter = _activeAdapter.AdapterTag,
                QpcFreq = PerfClock.Frequency,
                HostVersion = "game",
            },
        };

        await _bridge.InitializeGameAsync(hostInfo, dist, _devTools);

        if (!_bridge.Available)
        {
            _batchTimer.Stop();
            MessageBox.Show(
                this,
                "SlackPad 360 needs the Microsoft Edge WebView2 Runtime.\n\n" +
                "It ships with Windows 11 and current Windows 10, but appears to be\n" +
                "missing or disabled here. Install the Evergreen runtime from:\n" +
                "https://developer.microsoft.com/microsoft-edge/webview2/\n\n" +
                "then launch SlackPad again.",
                "WebView2 Runtime required",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            Close();
            return;
        }

        _bridge.PageMessage += OnPageMessage;
    }

    private void ShowMessage(string text)
    {
        _messageLabel.Text = text;
        _messageLabel.Visible = true;
        _messageLabel.BringToFront();
    }

    protected override void WndProc(ref Message m)
    {
        if (_activeAdapter.ProcessMessage(ref m))
        {
            return; // consumed (e.g. WM_POINTER) — skip DefWindowProc mouse-wheel conversion
        }
        base.WndProc(ref m);
    }

    private void OnFrame(ContactFrame frame)
    {
        // RIDEV_INPUTSINK intentionally delivers WM_INPUT while this form is in
        // the background. Those reports are observability noise, not gameplay.
        if (!_inputActive)
        {
            return;
        }
        _buttonPump.Enqueue(frame);
    }

    private void OnTick(object? sender, EventArgs e)
    {
        // Do not poll or drain global button state while inactive. Activation
        // explicitly consumes that epoch before foreground streaming resumes.
        if (!_inputActive)
        {
            return;
        }

        // F11 → fullscreen, rising-edge + only when we are the foreground window
        // (GetAsyncKeyState is global, so gate it or a background F11 flips us).
        bool f11 = Win32.IsKeyDown(Win32.VK_F11);
        if (f11 && !_f11WasDown && Win32.GetForegroundWindow() == Handle)
        {
            ToggleFullscreen();
        }
        _f11WasDown = f11;

        // Do not drain contacts before the WebView2 bridge is ready: a player
        // who already has two fingers planted at startup still needs that first
        // cached snapshot to reach the page once it finishes loading.
        if (!_bridge.Available)
        {
            return;
        }

        // Truthful L/R comes from the OS-synthesized button state. The low bit
        // retains a short completed click between timer ticks, so a player can
        // pop while holding perfectly still without waiting for a new HID frame.
        short lmbState = Win32.GetAsyncKeyState(Win32.VK_LBUTTON);
        short rmbState = Win32.GetAsyncKeyState(Win32.VK_RBUTTON);
        short ctrlState = Win32.GetAsyncKeyState(Win32.VK_CONTROL);
        bool auxiliaryDown = Win32.GetForegroundWindow() == Handle && Win32.IsKeyDown(ctrlState);
        var frames = _buttonPump.Drain(
            new HostButtonSample(
                Win32.IsKeyDown(lmbState),
                Win32.IsKeyDown(rmbState),
                Win32.WasPressedSinceLastRead(lmbState),
                Win32.WasPressedSinceLastRead(rmbState),
                auxiliaryDown),
            PerfClock.NowMs());

        if (frames.Count > 0)
        {
            var batch = new ContactBatchEnvelope
            {
                Source = "hardware",
                HostTPerfMs = PerfClock.NowMs(),
                Frames = new List<ContactFrame>(frames),
            };
            _bridge.PostContactBatch(batch);
        }
    }

    private void ToggleFullscreen()
    {
        if (_isFullscreen)
        {
            FormBorderStyle = _savedBorder;
            WindowState = _savedState;
            if (_savedState == FormWindowState.Normal)
            {
                Bounds = _savedBounds;
            }
            _isFullscreen = false;
        }
        else
        {
            _savedBorder = FormBorderStyle;
            _savedState = WindowState;
            _savedBounds = Bounds;
            FormBorderStyle = FormBorderStyle.None;
            // Re-apply Maximized from Normal so a borderless window covers the
            // taskbar rather than staying inside the old work area.
            WindowState = FormWindowState.Normal;
            WindowState = FormWindowState.Maximized;
            _isFullscreen = true;
        }
    }

    private void OnPageMessage(PageToHostMessage msg)
    {
        switch (msg.Type)
        {
            case "quit":
                Close();
                break;
            case "ready":
            case "settings":
            case "requestCalib":
                Trace.WriteLine($"[GameForm] page->host: {msg.Type}");
                break;
            case "exportControlTrace":
                ExportControlTrace(msg);
                break;
        }
    }

    private void ExportControlTrace(PageToHostMessage msg)
    {
        try
        {
            if (msg.Payload is null ||
                !msg.Payload.TryGetValue("trace", out object? rawTrace) ||
                rawTrace is not System.Text.Json.JsonElement trace)
            {
                throw new InvalidDataException("Missing trace payload.");
            }
            string? label = null;
            if (msg.Payload.TryGetValue("label", out object? rawLabel) &&
                rawLabel is System.Text.Json.JsonElement labelElement &&
                labelElement.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                label = labelElement.GetString();
            }
            // Sprint 02 S5: target 'corpus' lands the trace in the repo's
            // testdata/traces (labeled deterministic test inputs) when the
            // host runs from a checkout; otherwise fall back to Documents.
            bool corpus = msg.Payload.TryGetValue("target", out object? rawTarget) &&
                rawTarget is System.Text.Json.JsonElement targetElement &&
                targetElement.ValueKind == System.Text.Json.JsonValueKind.String &&
                targetElement.GetString() == "corpus";
            string documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            string root = Path.Combine(documents, "SlackPad 360", "traces");
            if (corpus)
            {
                root = RepoPaths.FindCorpusTracesRoot(AppContext.BaseDirectory) ?? root;
            }
            string path = ControlTraceExporter.Export(root, trace, label, DateTimeOffset.Now, corpus);
            Trace.WriteLine($"[GameForm] saved control trace: {path}");
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException or UnauthorizedAccessException)
        {
            Trace.WriteLine($"[GameForm] control trace export failed: {ex.Message}");
        }
    }

    protected override void OnActivated(EventArgs e)
    {
        // Keep both adapter callbacks and the timer closed while base handlers
        // run, then consume/reset the complete native input epoch before the
        // page is told it may accept hardware again.
        _inputActive = false;
        base.OnActivated(e);
        short lmbState = Win32.GetAsyncKeyState(Win32.VK_LBUTTON);
        short rmbState = Win32.GetAsyncKeyState(Win32.VK_RBUTTON);
        short ctrlState = Win32.GetAsyncKeyState(Win32.VK_CONTROL);
        _buttonPump.ResetForFocusGain(new HostButtonSample(
            Win32.IsKeyDown(lmbState),
            Win32.IsKeyDown(rmbState),
            Win32.WasPressedSinceLastRead(lmbState),
            Win32.WasPressedSinceLastRead(rmbState),
            Win32.IsKeyDown(ctrlState)));
        _f11WasDown = Win32.IsKeyDown(Win32.VK_F11);
        _inputActive = true;
        _bridge.PostFocus(true);
    }

    protected override void OnDeactivate(EventArgs e)
    {
        // Close the INPUTSINK path before any event handler can re-enter the UI
        // loop, then forget everything retained from the foreground epoch.
        _inputActive = false;
        _buttonPump.ResetForFocusLoss();
        base.OnDeactivate(e);
        _bridge.PostFocus(false);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        _batchTimer.Stop();
        _rawAdapter.Dispose();
        _pointerAdapter.Dispose();
        _bridge.Dispose();
    }
}
