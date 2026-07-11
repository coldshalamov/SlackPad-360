using System.Windows.Forms;
using SlackPad.Host.Contracts;

namespace SlackPad.Host.Adapters;

/// <summary>
/// A ContactFrame source. Adapters own HID/pointer parsing only — no gameplay, board pose,
/// or trick logic (architecture §2). Win32 message handling is funnelled through
/// <see cref="ProcessMessage"/> which the host form calls from its WndProc.
/// </summary>
internal interface IContactAdapter : IDisposable
{
    /// <summary>Adapter tag written into meta.adapter and metrics.json: "raw" or "pointer".</summary>
    string AdapterTag { get; }

    /// <summary>Session-header adapter label: "P0-B" (raw) or "P0-A" (pointer).</summary>
    string SessionTag { get; }

    /// <summary>False when the platform lacks the required API (e.g. no RegisterTouchpadCapableWindow).</summary>
    bool Supported { get; }

    /// <summary>Human-readable capability / status line for the UI.</summary>
    string StatusMessage { get; }

    /// <summary>Best-known device identifier for meta.deviceId (may be null until first frame).</summary>
    string? DeviceId { get; }

    /// <summary>Raised on the UI thread for every assembled ContactFrame.</summary>
    event Action<ContactFrame>? FrameReady;

    /// <summary>Register for input against the given window handle.</summary>
    void Start(IntPtr hwnd);

    /// <summary>Unregister.</summary>
    void Stop();

    /// <summary>
    /// Handle a Win32 message from the host WndProc. Returns true if the message was consumed.
    /// </summary>
    bool ProcessMessage(ref Message m);
}
