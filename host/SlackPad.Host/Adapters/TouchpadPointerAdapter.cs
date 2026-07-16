using System.Diagnostics;
using System.Windows.Forms;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using SlackPad.Host.Interop;

namespace SlackPad.Host.Adapters;

/// <summary>
/// P0-A (degraded Win11 fallback; raw HID remains primary). Registers the window as
/// touchpad-capable, handles WM_POINTER* messages, and reads whole touchpad frames. On
/// WM_POINTERUPDATE it recovers coalesced history when the OS export is available. Contacts
/// are normalized from HIMETRIC locations (NOT pixel, which freezes at gesture start) against
/// the physical device rect. Degrades gracefully when Win11 touchpad-pointer APIs are absent.
/// </summary>
internal sealed class TouchpadPointerAdapter : IContactAdapter
{
    private const uint MaxNativePointers = 32;
    private const uint MaxHistoryEntries = 64;
    private const int MaxFrameIdsPerDevice = 128;
    private const int MaxRememberedDevices = 16;

    private sealed class RecentPointerFrames
    {
        private readonly Queue<uint> _order = new(MaxFrameIdsPerDevice);
        private readonly HashSet<uint> _ids = new();

        public bool Remember(uint frameId)
        {
            if (!_ids.Add(frameId))
            {
                return false;
            }

            _order.Enqueue(frameId);
            if (_order.Count > MaxFrameIdsPerDevice)
            {
                _ids.Remove(_order.Dequeue());
            }
            return true;
        }
    }

    private readonly record struct DeviceGeometry(Rect Rect, double? PhysicalAspectRatio);

    private readonly Dictionary<IntPtr, DeviceGeometry> _deviceGeometry = new();
    private readonly Dictionary<IntPtr, RecentPointerFrames> _recentFramesByDevice = new();
    private readonly Queue<IntPtr> _rememberedDeviceOrder = new(MaxRememberedDevices);
    private IntPtr _hwnd;
    private long _frameId;
    private bool _registered;
    private bool _historySupported;

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
            _historySupported = _registered &&
                Win32.User32HasExport("GetPointerFrameTouchpadInfoHistory");
            Supported = _registered;
            StatusMessage = _registered
                ? _historySupported
                    ? "Degraded pointer fallback registered (WM_POINTER; coalesced history enabled)."
                    : "Degraded pointer fallback registered (WM_POINTER; current frames only)."
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
        _historySupported = false;
        _hwnd = IntPtr.Zero;
        _deviceGeometry.Clear();
        _recentFramesByDevice.Clear();
        _rememberedDeviceOrder.Clear();
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
            HandleTouchpadFrame(pointerId, includeHistory: m.Msg == Win32.WM_POINTERUPDATE);
        }
        catch
        {
            // Never crash the spike on a pointer parse failure.
        }
        return true; // consumed; do not let DefWindowProc convert to mouse wheel
    }

    private void HandleTouchpadFrame(uint pointerId, bool includeHistory)
    {
        if (includeHistory && _historySupported)
        {
            try
            {
                if (TryReadHistory(pointerId, out PointerTouchpadInfo[] history,
                    out int historyEntries, out int historyPointers))
                {
                    EmitFrames(history, historyEntries, historyPointers);
                    return;
                }
            }
            catch (EntryPointNotFoundException)
            {
                // The documented Win11 export is not present on every servicing build.
                _historySupported = false;
                StatusMessage = "Degraded pointer fallback registered (history unavailable; current frames only).";
            }
        }

        if (TryReadCurrentFrame(pointerId, out PointerTouchpadInfo[] current, out int pointerCount))
        {
            EmitFrames(current, entryCount: 1, pointerCount);
        }
    }

    private static bool TryReadHistory(
        uint pointerId,
        out PointerTouchpadInfo[] infos,
        out int entryCount,
        out int pointerCount)
    {
        infos = Array.Empty<PointerTouchpadInfo>();
        entryCount = 0;
        pointerCount = 0;

        uint availableEntries = 0;
        uint availablePointers = 0;
        if (!Win32.GetPointerFrameTouchpadInfoHistory(
                pointerId, ref availableEntries, ref availablePointers, null) ||
            availableEntries == 0 || availablePointers == 0 ||
            availablePointers > MaxNativePointers)
        {
            return false;
        }

        uint entryCapacity = Math.Min(availableEntries, MaxHistoryEntries);
        uint pointerCapacity = availablePointers;
        infos = new PointerTouchpadInfo[checked((int)(entryCapacity * pointerCapacity))];

        uint writtenEntries = entryCapacity;
        uint writtenPointers = pointerCapacity;
        if (!Win32.GetPointerFrameTouchpadInfoHistory(
                pointerId, ref writtenEntries, ref writtenPointers, infos) ||
            writtenPointers != pointerCapacity)
        {
            infos = Array.Empty<PointerTouchpadInfo>();
            return false;
        }

        entryCount = (int)Math.Min(writtenEntries, entryCapacity);
        pointerCount = (int)pointerCapacity;
        return entryCount > 0;
    }

    private static bool TryReadCurrentFrame(
        uint pointerId,
        out PointerTouchpadInfo[] infos,
        out int pointerCount)
    {
        infos = Array.Empty<PointerTouchpadInfo>();
        pointerCount = 0;

        uint count = 0;
        if (!Win32.GetPointerFrameTouchpadInfo(pointerId, ref count, null) ||
            count == 0 || count > MaxNativePointers)
        {
            return false;
        }

        infos = new PointerTouchpadInfo[count];
        if (!Win32.GetPointerFrameTouchpadInfo(pointerId, ref count, infos))
        {
            infos = Array.Empty<PointerTouchpadInfo>();
            return false;
        }

        pointerCount = Math.Min((int)count, infos.Length);
        return pointerCount > 0;
    }

    private void EmitFrames(
        PointerTouchpadInfo[] infos,
        int entryCount,
        int pointerCount)
    {
        if (entryCount <= 0 || pointerCount <= 0)
        {
            return;
        }

        long observedQpc = Stopwatch.GetTimestamp();
        double observedPerfMs = PerfClock.NowMs();

        for (int chronologicalIndex = 0; chronologicalIndex < entryCount; chronologicalIndex++)
        {
            int row = ChronologicalHistoryRow(entryCount, chronologicalIndex);
            int offset = checked(row * pointerCount);
            if (offset < 0 || offset + pointerCount > infos.Length)
            {
                continue;
            }

            // One ContactFrame per Windows pointer frame. A WM_POINTER message arrives for
            // each pointer, and overlapping history windows can replay several older frames.
            PointerInfo first = infos[offset].PointerInfo;
            if (!ShouldEmitPointerFrame(first.SourceDevice, first.FrameId))
            {
                continue;
            }

            EmitFrame(infos, offset, pointerCount, observedQpc, observedPerfMs);
        }
    }

    private bool ShouldEmitPointerFrame(IntPtr sourceDevice, uint pointerFrameId)
    {
        if (!_recentFramesByDevice.TryGetValue(sourceDevice, out RecentPointerFrames? recent))
        {
            while (_recentFramesByDevice.Count >= MaxRememberedDevices &&
                _rememberedDeviceOrder.TryDequeue(out IntPtr oldestDevice))
            {
                if (_recentFramesByDevice.Remove(oldestDevice))
                {
                    break;
                }
            }

            recent = new RecentPointerFrames();
            _recentFramesByDevice[sourceDevice] = recent;
            _rememberedDeviceOrder.Enqueue(sourceDevice);
        }

        return recent.Remember(pointerFrameId);
    }

    private void EmitFrame(
        PointerTouchpadInfo[] infos,
        int offset,
        int pointerCount,
        long observedQpc,
        double observedPerfMs)
    {

        var contacts = new List<Contact>();
        bool primary = false;
        string? deviceId = null;
        double? physicalAspectRatio = null;

        for (int i = 0; i < pointerCount && contacts.Count < 5; i++)
        {
            var pi = infos[offset + i].PointerInfo;
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

            DeviceGeometry geometry = GetDeviceGeometry(pi.SourceDevice);
            double x = Normalize(pi.PtHimetricLocation.X, geometry.Rect.Left, geometry.Rect.Right);
            double y = Normalize(pi.PtHimetricLocation.Y, geometry.Rect.Top, geometry.Rect.Bottom);
            deviceId = $"pointer-{pi.SourceDevice.ToInt64():x}";
            physicalAspectRatio = geometry.PhysicalAspectRatio;

            contacts.Add(new Contact
            {
                Id = (int)pi.PointerId,
                Tip = true,
                X = x,
                Y = y,
                Confidence = HasPointerConfidence(pi.PointerFlags),
            });
        }

        // Preserve device identity and geometry on lift-only frames as well.
        PointerInfo first = infos[offset].PointerInfo;
        if (deviceId is null)
        {
            DeviceGeometry geometry = GetDeviceGeometry(first.SourceDevice);
            deviceId = $"pointer-{first.SourceDevice.ToInt64():x}";
            physicalAspectRatio = geometry.PhysicalAspectRatio;
        }
        DeviceId = deviceId;

        var frame = new ContactFrame
        {
            FrameId = _frameId++,
            TPerfMs = MapPerformanceCountToPerfMs(
                first.PerformanceCount,
                observedQpc,
                observedPerfMs,
                Stopwatch.Frequency),
            TScanUs = null,
            Source = "hardware",
            Contacts = contacts,
            Buttons = new ContactFrameButtons { Primary = primary },
            Meta = new ContactFrameMeta
            {
                DeviceId = deviceId,
                ContactCountRaw = pointerCount,
                PhysicalAspectRatio = physicalAspectRatio,
                Adapter = "pointer",
            },
        };

        FrameReady?.Invoke(frame);
    }

    private DeviceGeometry GetDeviceGeometry(IntPtr device)
    {
        if (_deviceGeometry.TryGetValue(device, out DeviceGeometry cached))
        {
            return cached;
        }
        Rect rect = default;
        double? aspectRatio = null;
        if (Win32.GetPointerDeviceRects(device, out var deviceRect, out _) &&
            deviceRect.Width > 0 && deviceRect.Height > 0)
        {
            rect = deviceRect;
            aspectRatio = PhysicalAspectRatio(deviceRect.Width, deviceRect.Height);
        }
        else
        {
            rect = new Rect { Left = 0, Top = 0, Right = 1, Bottom = 1 };
        }
        var geometry = new DeviceGeometry(rect, aspectRatio);
        _deviceGeometry[device] = geometry;
        return geometry;
    }

    internal static bool HasPointerConfidence(uint pointerFlags) =>
        (pointerFlags & Win32.POINTER_FLAG_CONFIDENCE) != 0;

    internal static double MapPerformanceCountToPerfMs(
        ulong performanceCount,
        long observedQpc,
        double observedPerfMs,
        long qpcFrequency)
    {
        if (performanceCount == 0 || performanceCount > long.MaxValue ||
            qpcFrequency <= 0 || (long)performanceCount > observedQpc)
        {
            return observedPerfMs;
        }

        double ageMs = (observedQpc - (long)performanceCount) * 1000.0 / qpcFrequency;
        double mapped = observedPerfMs - ageMs;
        return double.IsFinite(mapped) ? mapped : observedPerfMs;
    }

    internal static int ChronologicalHistoryRow(int entryCount, int chronologicalIndex) =>
        entryCount - 1 - chronologicalIndex;

    internal static double PhysicalAspectRatio(int width, int height)
    {
        double absoluteWidth = Math.Abs((double)width);
        double absoluteHeight = Math.Abs((double)height);
        return absoluteWidth > 0 && absoluteHeight > 0
            ? Math.Clamp(absoluteWidth / absoluteHeight, 0.25, 4.0)
            : 1.0;
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
