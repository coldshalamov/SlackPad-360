using System.Windows.Forms;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using SlackPad.Host.Interop;

namespace SlackPad.Host.Adapters;

/// <summary>
/// P0-A (Win11 co-spike). Registers the window as touchpad-capable, handles WM_POINTER*
/// messages, and reads the whole touchpad frame via GetPointerFrameTouchpadInfo. Normalizes
/// each contact from its HIMETRIC location (NOT pixel — pixel freezes at gesture start)
/// against the device rect from GetPointerDeviceRects. Degrades gracefully when the Win11
/// touchpad-pointer APIs are unavailable.
/// </summary>
internal sealed class TouchpadPointerAdapter : IContactAdapter
{
    private readonly Dictionary<IntPtr, Rect> _deviceRects = new();
    private IntPtr _hwnd;
    private long _frameId;
    private uint _lastPointerFrameId = uint.MaxValue;
    private bool _registered;

    public string AdapterTag => "pointer";
    public string SessionTag => "P0-A";
    public bool Supported { get; private set; }
    public string StatusMessage { get; private set; } = "Pointer adapter idle.";
    public string? DeviceId { get; private set; }

    public event Action<ContactFrame>? FrameReady;

    public void Start(IntPtr hwnd)
    {
        _hwnd = hwnd;

        if (!Win32.User32HasExport("RegisterTouchpadCapableWindow"))
        {
            Supported = false;
            StatusMessage = "RegisterTouchpadCapableWindow unavailable (needs Windows 11). Pointer path degraded.";
            return;
        }

        try
        {
            _registered = Win32.RegisterTouchpadCapableWindow(hwnd, true);
            Supported = _registered;
            StatusMessage = _registered
                ? "Registered touchpad-capable window (WM_POINTER)."
                : "RegisterTouchpadCapableWindow returned false.";
        }
        catch (EntryPointNotFoundException)
        {
            Supported = false;
            StatusMessage = "RegisterTouchpadCapableWindow entry point missing. Pointer path degraded.";
        }
    }

    public void Stop()
    {
        if (_registered && _hwnd != IntPtr.Zero)
        {
            try
            {
                Win32.RegisterTouchpadCapableWindow(_hwnd, false);
            }
            catch (EntryPointNotFoundException)
            {
                // best-effort
            }
        }
        _registered = false;
        _hwnd = IntPtr.Zero;
    }

    public bool ProcessMessage(ref Message m)
    {
        if (!Supported)
        {
            return false;
        }

        switch (m.Msg)
        {
            case Win32.WM_POINTERDOWN:
            case Win32.WM_POINTERUPDATE:
            case Win32.WM_POINTERUP:
                break;
            default:
                return false;
        }

        try
        {
            uint pointerId = Win32.LoWord(m.WParam);
            if (Win32.GetPointerType(pointerId, out uint type) && type != Win32.PT_TOUCHPAD)
            {
                return false;
            }
            HandleTouchpadFrame(pointerId);
        }
        catch
        {
            // Never crash the spike on a pointer parse failure.
        }
        return true; // consumed; do not let DefWindowProc convert to mouse wheel
    }

    private void HandleTouchpadFrame(uint pointerId)
    {
        uint count = 0;
        if (!Win32.GetPointerFrameTouchpadInfo(pointerId, ref count, null) || count == 0)
        {
            return;
        }

        var infos = new PointerTouchpadInfo[count];
        if (!Win32.GetPointerFrameTouchpadInfo(pointerId, ref count, infos))
        {
            return;
        }

        // Dedupe: one ContactFrame per pointer-frame id.
        uint frameId = infos[0].PointerInfo.FrameId;
        if (frameId == _lastPointerFrameId)
        {
            return;
        }
        _lastPointerFrameId = frameId;

        var contacts = new List<Contact>();
        bool primary = false;

        for (int i = 0; i < count && contacts.Count < 5; i++)
        {
            var pi = infos[i].PointerInfo;
            bool inContact = (pi.PointerFlags & Win32.POINTER_FLAG_INCONTACT) != 0;
            bool up = (pi.PointerFlags & Win32.POINTER_FLAG_UP) != 0;
            if ((pi.PointerFlags & Win32.POINTER_FLAG_FIRSTBUTTON) != 0)
            {
                primary = true;
            }

            // Only tip-on contacts; lifts show downstream as absence.
            if (!inContact || up)
            {
                continue;
            }

            Rect rect = GetDeviceRect(pi.SourceDevice);
            double x = Normalize(pi.PtHimetricLocation.X, rect.Left, rect.Right);
            double y = Normalize(pi.PtHimetricLocation.Y, rect.Top, rect.Bottom);
            DeviceId = $"pointer-{pi.SourceDevice.ToInt64():x}";

            contacts.Add(new Contact
            {
                Id = (int)pi.PointerId,
                Tip = true,
                X = x,
                Y = y,
                Confidence = true,
            });
        }

        var frame = new ContactFrame
        {
            FrameId = _frameId++,
            TPerfMs = PerfClock.NowMs(),
            TScanUs = null,
            Source = "hardware",
            Contacts = contacts,
            Buttons = new ContactFrameButtons { Primary = primary },
            Meta = new ContactFrameMeta
            {
                DeviceId = DeviceId,
                ContactCountRaw = (int)count,
                Adapter = "pointer",
            },
        };

        FrameReady?.Invoke(frame);
    }

    private Rect GetDeviceRect(IntPtr device)
    {
        if (_deviceRects.TryGetValue(device, out var cached))
        {
            return cached;
        }
        Rect rect = default;
        if (Win32.GetPointerDeviceRects(device, out var deviceRect, out _) &&
            deviceRect.Width > 0 && deviceRect.Height > 0)
        {
            rect = deviceRect;
        }
        else
        {
            rect = new Rect { Left = 0, Top = 0, Right = 1, Bottom = 1 };
        }
        _deviceRects[device] = rect;
        return rect;
    }

    internal static double Normalize(int value, int min, int max)
    {
        if (max <= min)
        {
            return 0.0;
        }
        double n = (double)(value - min) / (max - min);
        return Math.Clamp(n, 0.0, 1.0);
    }

    public void Dispose()
    {
        Stop();
    }
}
