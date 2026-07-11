using System.Globalization;
using System.Runtime.InteropServices;
using SlackPad.Host.Adapters;
using SlackPad.Host.Bridge;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using SlackPad.Host.Interop;

namespace SlackPad.Host.Ui;

/// <summary>
/// M1 dual-adapter P0 hardware spike window. Paints live contacts, records ContactFrame JSONL
/// traces, computes live G1 metrics, and drives the T1–T11 gesture script. Owns HID→ContactFrame
/// only; no gameplay logic.
/// </summary>
internal sealed class SpikeForm : Form
{
    private static readonly Color Bg = Color.FromArgb(14, 16, 19);
    private static readonly Color Panel2 = Color.FromArgb(22, 25, 30);
    private static readonly Color Fg = Color.FromArgb(222, 228, 236);
    private static readonly Color Accent = Color.FromArgb(88, 196, 255);
    private static readonly Color Danger = Color.FromArgb(230, 96, 96);

    private static readonly string[] GestureScript =
    {
        "T1  Single finger plant/hold/lift (10s) — stable ID, tip edges",
        "T2  Dual free plant hold (>=60s) — two IDs, no OS pan",
        "T3  Dual plant + slow translate/steer (20s) — continuous motion",
        "T4  Dual plant + slow rotate (20s) — segment angle changes",
        "T5  Staggered lifts L then R (10x) — independent tip-up",
        "T6  Simultaneous dual lift (10x) — both tip-up same frame +-1",
        "T7  Click while one contact (20x) — primary edge, 1 tip",
        "T8  Click while two contacts (20x) — primary edge, 2 tips",
        "T9  Click with zero contacts (10x) — edge or none",
        "T10 Fast dual re-plant after lift (20x) — ID reassignment logged",
        "T11 OS gesture bait / two-finger scroll (30s) — window keeps focus",
    };

    private readonly TouchpadRawInputAdapter _rawAdapter = new();
    private readonly TouchpadPointerAdapter _pointerAdapter = new();
    private IContactAdapter _activeAdapter;
    private readonly WebViewBridge _bridge = new();

    private readonly ContactPanel _contactPanel = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 8 };

    private RadioButton _rawRadio = null!;
    private RadioButton _pointerRadio = null!;
    private Button _recordButton = null!;
    private Button _clickButton = null!;
    private Button _webViewButton = null!;
    private Label _clickLabel = null!;
    private Label _metricsLabel = null!;
    private Label _adapterStatusLabel = null!;
    private Label _webViewStatusLabel = null!;
    private Label _focusLabel = null!;
    private CheckedListBox _checklist = null!;
    private Panel _webViewHost = null!;

    // recording / metrics state
    private bool _recording;
    private TraceWriter? _writer;
    private readonly List<ContactFrame> _recordedFrames = new();
    private readonly List<ContactFrame> _rollingFrames = new();
    private readonly List<ContactFrame> _pendingBatch = new();
    private int _attemptedClicks;
    private int _osHijackEvents;
    private int _tickCounter;
    private string _lastSavedInfo = "";

    public SpikeForm()
    {
        _activeAdapter = _rawAdapter;

        Text = "SlackPad 360 — M1 Dual-Adapter Input Spike";
        Width = 1200;
        Height = 760;
        BackColor = Bg;
        ForeColor = Fg;
        Font = new Font(FontFamily.GenericSansSerif, 9f);
        DoubleBuffered = true;

        BuildLayout();

        _rawAdapter.FrameReady += OnFrame;
        _pointerAdapter.FrameReady += OnFrame;

        _timer.Tick += OnTick;
    }

    private void BuildLayout()
    {
        _webViewHost = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 220,
            BackColor = Panel2,
            Visible = false,
            Padding = new Padding(2),
        };
        _webViewHost.Controls.Add(_bridge.Control);

        var side = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            Width = 380,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = Panel2,
            Padding = new Padding(12),
        };

        side.Controls.Add(Header("Adapter (production ranking: Raw primary)"));
        _rawRadio = new RadioButton { Text = "Raw Input  (P0-B, primary)", Checked = true, ForeColor = Fg, AutoSize = true };
        _pointerRadio = new RadioButton { Text = "Win11 Pointer  (P0-A, co-spike)", ForeColor = Fg, AutoSize = true };
        _rawRadio.CheckedChanged += OnAdapterChanged;
        _pointerRadio.CheckedChanged += OnAdapterChanged;
        side.Controls.Add(_rawRadio);
        side.Controls.Add(_pointerRadio);

        _adapterStatusLabel = Note("Adapter: (starting)");
        side.Controls.Add(_adapterStatusLabel);

        side.Controls.Add(Spacer());
        _recordButton = Btn("Start Recording", OnRecordClicked, Accent);
        side.Controls.Add(_recordButton);

        _clickButton = Btn("Register Click Attempt (+1)", OnClickAttempt, Color.FromArgb(60, 66, 76));
        side.Controls.Add(_clickButton);
        _clickLabel = Note("Click attempts: 0");
        side.Controls.Add(_clickLabel);

        _focusLabel = Note("Focus: OK   OS hijack events: 0");
        side.Controls.Add(_focusLabel);

        side.Controls.Add(Spacer());
        side.Controls.Add(Header("Live G1 metrics"));
        _metricsLabel = new Label
        {
            AutoSize = false,
            Width = 344,
            Height = 190,
            ForeColor = Fg,
            Font = new Font(FontFamily.GenericMonospace, 8.5f),
            Text = "(no frames yet)",
        };
        side.Controls.Add(_metricsLabel);

        side.Controls.Add(Spacer());
        side.Controls.Add(Header("T1–T11 gesture script"));
        _checklist = new CheckedListBox
        {
            Width = 344,
            Height = 200,
            BackColor = Bg,
            ForeColor = Fg,
            BorderStyle = BorderStyle.FixedSingle,
            CheckOnClick = true,
            IntegralHeight = false,
        };
        _checklist.Items.AddRange(GestureScript);
        side.Controls.Add(_checklist);

        side.Controls.Add(Spacer());
        _webViewButton = Btn("Toggle WebView2 pane", OnToggleWebView, Color.FromArgb(60, 66, 76));
        side.Controls.Add(_webViewButton);
        _webViewStatusLabel = Note("WebView2: initializing…");
        side.Controls.Add(_webViewStatusLabel);

        Controls.Add(_contactPanel);
        Controls.Add(side);
        Controls.Add(_webViewHost);
    }

    private static Label Header(string text) => new()
    {
        Text = text,
        AutoSize = true,
        ForeColor = Color.FromArgb(150, 200, 240),
        Font = new Font(FontFamily.GenericSansSerif, 9.5f, FontStyle.Bold),
        Margin = new Padding(0, 8, 0, 4),
    };

    private static Label Note(string text) => new()
    {
        Text = text,
        AutoSize = true,
        ForeColor = Color.FromArgb(180, 188, 198),
        Margin = new Padding(0, 4, 0, 2),
    };

    private static Label Spacer() => new() { Text = "", Height = 6, AutoSize = false, Width = 10 };

    private Button Btn(string text, EventHandler onClick, Color back)
    {
        var b = new Button
        {
            Text = text,
            Width = 344,
            Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = back,
            ForeColor = Color.White,
            Margin = new Padding(0, 4, 0, 4),
        };
        b.FlatAppearance.BorderSize = 0;
        b.Click += onClick;
        return b;
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        _activeAdapter.Start(Handle);
        UpdateAdapterStatus();
        _timer.Start();

        var hostInfo = new HostInfoEnvelope
        {
            Payload = new HostInfoPayload
            {
                Os = RuntimeInformation.OSDescription,
                Machine = Environment.MachineName,
                Adapter = _activeAdapter.AdapterTag,
                QpcFreq = PerfClock.Frequency,
                HostVersion = "M1-spike",
            },
        };
        _ = InitWebViewAsync(hostInfo);
    }

    private async Task InitWebViewAsync(HostInfoEnvelope hostInfo)
    {
        await _bridge.InitializeAsync(hostInfo);
        _bridge.PageMessage += OnPageMessage;
        _webViewStatusLabel.Text = "WebView2: " + _bridge.StatusMessage;
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
                _webViewStatusLabel.Text = $"WebView2 page msg: {msg.Type}";
                break;
        }
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
        _contactPanel.SetFrame(frame);

        _rollingFrames.Add(frame);
        if (_rollingFrames.Count > 1200)
        {
            _rollingFrames.RemoveRange(0, _rollingFrames.Count - 1200);
        }

        if (_recording)
        {
            _recordedFrames.Add(frame);
            _writer?.Write(frame);
        }

        _pendingBatch.Add(frame);
        if (_pendingBatch.Count > 256)
        {
            _pendingBatch.RemoveRange(0, _pendingBatch.Count - 256);
        }
    }

    private void OnTick(object? sender, EventArgs e)
    {
        _contactPanel.Invalidate();

        if (_bridge.Available && _pendingBatch.Count > 0)
        {
            var batch = new ContactBatchEnvelope
            {
                Source = "hardware",
                HostTPerfMs = PerfClock.NowMs(),
                Frames = new List<ContactFrame>(_pendingBatch),
            };
            _bridge.PostContactBatch(batch);
            _pendingBatch.Clear();
        }

        if (++_tickCounter % 30 == 0)
        {
            UpdateMetricsLabel();
        }
    }

    private void UpdateMetricsLabel()
    {
        var source = _recording ? _recordedFrames : _rollingFrames;
        var m = MetricsEngine.Compute(source, _attemptedClicks, _osHijackEvents);
        _metricsLabel.Text =
            $"frames          {m.FrameCount}\n" +
            $"dualPlantStableS {m.DualPlantStableS,7:0.00}\n" +
            $"idThrashRate     {m.IdThrashRate,7:0.00} /min\n" +
            $"liftIndependent  {m.LiftIndependentFraction,7:0.00} ({m.LiftEdges} edges)\n" +
            $"clickEdges       {m.ClickEdges} / {m.AttemptedClicks} = {m.ClickEdgeDetectRate,4:0.00}\n" +
            $"frameDt p50/p95  {m.FrameDtP50Ms:0.0} / {m.FrameDtP95Ms:0.0} ms\n" +
            $"gapFrames        {m.GapFrames}\n" +
            $"osHijackEvents   {m.OsHijackEvents}\n" +
            $"--> status       {m.Status.ToUpperInvariant()}\n" +
            (_lastSavedInfo.Length > 0 ? "\n" + _lastSavedInfo : "");
    }

    private void OnAdapterChanged(object? sender, EventArgs e)
    {
        if (sender is RadioButton { Checked: false })
        {
            return;
        }
        if (_recording)
        {
            // Do not switch adapters mid-recording; revert the radio.
            _rawRadio.CheckedChanged -= OnAdapterChanged;
            _pointerRadio.CheckedChanged -= OnAdapterChanged;
            _rawRadio.Checked = _activeAdapter == _rawAdapter;
            _pointerRadio.Checked = _activeAdapter == _pointerAdapter;
            _rawRadio.CheckedChanged += OnAdapterChanged;
            _pointerRadio.CheckedChanged += OnAdapterChanged;
            return;
        }

        var selected = _rawRadio.Checked ? (IContactAdapter)_rawAdapter : _pointerAdapter;
        if (selected == _activeAdapter)
        {
            return;
        }
        _activeAdapter.Stop();
        _activeAdapter = selected;
        _activeAdapter.Start(Handle);
        _rollingFrames.Clear();
        UpdateAdapterStatus();
    }

    private void UpdateAdapterStatus()
    {
        string support = _activeAdapter.Supported ? "supported" : "DEGRADED";
        _adapterStatusLabel.Text = $"Adapter {_activeAdapter.AdapterTag} [{support}]\n{_activeAdapter.StatusMessage}";
        _adapterStatusLabel.ForeColor = _activeAdapter.Supported ? Color.FromArgb(150, 220, 160) : Danger;
    }

    private void OnRecordClicked(object? sender, EventArgs e)
    {
        if (_recording)
        {
            StopRecording();
        }
        else
        {
            StartRecording();
        }
    }

    private void StartRecording()
    {
        try
        {
            string tracesDir = Path.Combine(EvidenceDir(), "traces");
            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            string tracePath = Path.Combine(tracesDir, $"{_activeAdapter.SessionTag}-{stamp}.jsonl");

            var header = new SessionHeader
            {
                Machine = Environment.MachineName,
                Os = RuntimeInformation.OSDescription,
                Adapter = _activeAdapter.SessionTag,
                StartedAt = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                QpcFreq = PerfClock.Frequency,
            };
            _writer = TraceWriter.Start(tracePath, header);

            _recordedFrames.Clear();
            _attemptedClicks = 0;
            _osHijackEvents = 0;
            _clickLabel.Text = "Click attempts: 0";
            _focusLabel.Text = "Focus: OK   OS hijack events: 0";
            _lastSavedInfo = "";
            _recording = true;

            _recordButton.Text = "Stop Recording  (writes metrics.json)";
            _recordButton.BackColor = Danger;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Could not start recording:\n{ex.Message}", "Recording error",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void StopRecording()
    {
        _recording = false;
        _recordButton.Text = "Start Recording";
        _recordButton.BackColor = Accent;

        string tracePath = _writer?.FilePath ?? "";
        _writer?.Dispose();
        _writer = null;

        if (_recordedFrames.Count == 0)
        {
            _lastSavedInfo = "No frames recorded — metrics.json NOT written (never fabricate evidence).";
            UpdateMetricsLabel();
            return;
        }

        var metrics = MetricsEngine.Compute(_recordedFrames, _attemptedClicks, _osHijackEvents);
        string metricsPath = Path.Combine(EvidenceDir(), "metrics.json");
        string traceArtifact = "traces/" + Path.GetFileName(tracePath);
        try
        {
            G1Report.Write(metricsPath, metrics, _activeAdapter.AdapterTag, new[] { traceArtifact });
            _lastSavedInfo =
                $"SAVED  status={metrics.Status}\n{_recordedFrames.Count} frames -> {traceArtifact}\nmetrics.json written.";
        }
        catch (Exception ex)
        {
            _lastSavedInfo = $"Trace saved but metrics.json failed: {ex.Message}";
        }
        UpdateMetricsLabel();
    }

    private void OnClickAttempt(object? sender, EventArgs e)
    {
        _attemptedClicks++;
        _clickLabel.Text = $"Click attempts: {_attemptedClicks}";
    }

    private void OnToggleWebView(object? sender, EventArgs e)
    {
        _webViewHost.Visible = !_webViewHost.Visible;
    }

    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        if (_recording)
        {
            _osHijackEvents++;
            _focusLabel.Text = $"Focus: LOST   OS hijack events: {_osHijackEvents}";
            _focusLabel.ForeColor = Danger;
        }
        _bridge.PostFocus(false);
    }

    protected override void OnActivated(EventArgs e)
    {
        base.OnActivated(e);
        if (_focusLabel != null)
        {
            _focusLabel.ForeColor = Color.FromArgb(180, 188, 198);
            if (!_recording)
            {
                _focusLabel.Text = $"Focus: OK   OS hijack events: {_osHijackEvents}";
            }
        }
        _bridge.PostFocus(true);
    }

    /// <summary>Resolve preproduction/evidence/impl/m1-g1 by walking up to the repo root.</summary>
    private static string EvidenceDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 10 && dir != null; i++)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "preproduction")))
            {
                return Path.Combine(dir.FullName, "preproduction", "evidence", "impl", "m1-g1");
            }
            dir = dir.Parent;
        }
        // Fallback: alongside the executable (still never inside package sources).
        return Path.Combine(AppContext.BaseDirectory, "m1-g1-evidence");
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        _timer.Stop();
        if (_recording)
        {
            StopRecording();
        }
        _rawAdapter.Dispose();
        _pointerAdapter.Dispose();
        _bridge.Dispose();
    }
}
