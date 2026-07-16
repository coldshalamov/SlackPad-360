using System.Runtime.InteropServices;
using System.Windows.Forms;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using SlackPad.Host.Interop;

namespace SlackPad.Host.Adapters;

/// <summary>
/// P0-B (production-ranking primary). Registers the Precision Touchpad digitizer collection
/// (UsagePage 0x0D / Usage 0x05) for raw input, parses HID reports via hid.dll preparsed data,
/// reassembles multi-report (hybrid) frames, normalizes X/Y to [0,1] from each value cap's
/// logical range, and emits ContactFrame v1.
/// </summary>
internal sealed class TouchpadRawInputAdapter : IContactAdapter
{
    private sealed class DeviceInfo
    {
        public IntPtr Preparsed;
        public ushort[] FingerCollections = Array.Empty<ushort>();
        public int XLogicalMin;
        public int XLogicalMax = 1;
        public int YLogicalMin;
        public int YLogicalMax = 1;
        public double? PhysicalAspectRatio;
        public string DeviceId = "";
        public bool SawConfidenceUsage; // learned at runtime to distinguish palm from no-confidence-format
        public readonly HidReportAssembler Assembler = new();
    }

    private readonly Dictionary<IntPtr, DeviceInfo> _devices = new();
    private readonly RawInputContactFrameFactory _frameFactory = new();
    private IntPtr _hwnd;

    public string AdapterTag => "raw";
    public string SessionTag => "P0-B";
    public bool Supported { get; private set; } = true;
    public string StatusMessage { get; private set; } = "Raw Input adapter idle.";
    public string? DeviceId { get; private set; }

    public event Action<ContactFrame>? FrameReady;

    public void Start(IntPtr hwnd)
    {
        _hwnd = hwnd;
        var rid = new RawInputDevice[1];
        rid[0].UsagePage = Win32.HidUsagePageDigitizer;
        rid[0].Usage = Win32.HidUsageTouchpad;
        rid[0].Flags = Win32.RIDEV_INPUTSINK; // receive even when not foreground
        rid[0].Target = hwnd;

        bool ok = Win32.RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf<RawInputDevice>());
        if (!ok)
        {
            Supported = false;
            int err = Marshal.GetLastWin32Error();
            StatusMessage = $"RegisterRawInputDevices failed (Win32 {err}). No PTP digitizer?";
        }
        else
        {
            StatusMessage = "Raw Input registered (0x0D/0x05, INPUTSINK).";
        }
    }

    public void Stop()
    {
        if (_hwnd == IntPtr.Zero)
        {
            return;
        }
        var rid = new RawInputDevice[1];
        rid[0].UsagePage = Win32.HidUsagePageDigitizer;
        rid[0].Usage = Win32.HidUsageTouchpad;
        rid[0].Flags = Win32.RIDEV_REMOVE;
        rid[0].Target = IntPtr.Zero;
        Win32.RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf<RawInputDevice>());
        _hwnd = IntPtr.Zero;
    }

    public bool ProcessMessage(ref Message m)
    {
        if (m.Msg != Win32.WM_INPUT)
        {
            return false;
        }

        try
        {
            HandleRawInput(m.LParam);
        }
        catch
        {
            // A malformed report must never crash the spike.
        }
        return false; // let DefWindowProc run too (RawInput WM_INPUT should be passed on)
    }

    private void HandleRawInput(IntPtr hRawInput)
    {
        uint size = 0;
        uint headerSize = (uint)Marshal.SizeOf<RawInputHeader>();
        if (Win32.GetRawInputData(hRawInput, Win32.RID_INPUT, IntPtr.Zero, ref size, headerSize) != 0 || size == 0)
        {
            return;
        }

        byte[] buffer = new byte[size];
        var handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        try
        {
            IntPtr basePtr = handle.AddrOfPinnedObject();
            uint copied = Win32.GetRawInputData(hRawInput, Win32.RID_INPUT, basePtr, ref size, headerSize);
            if (copied == unchecked((uint)-1) || copied == 0)
            {
                return;
            }

            var header = Marshal.PtrToStructure<RawInputHeader>(basePtr);
            if (header.Type != Win32.RIM_TYPEHID)
            {
                return;
            }

            var dev = GetOrBuildDevice(header.Device);
            if (dev == null || dev.FingerCollections.Length == 0)
            {
                return;
            }

            IntPtr hidPtr = basePtr + (int)headerSize;
            var rawHid = Marshal.PtrToStructure<RawHidHeader>(hidPtr);
            int rawHidHeaderSize = Marshal.SizeOf<RawHidHeader>();
            IntPtr dataPtr = hidPtr + rawHidHeaderSize;

            for (int r = 0; r < rawHid.Count; r++)
            {
                double observedPerfMs = PerfClock.NowMs();
                int reportLen = (int)rawHid.SizeHid;
                byte[] report = new byte[reportLen];
                Marshal.Copy(dataPtr + r * reportLen, report, 0, reportLen);
                var parsed = ParseReport(dev, report);
                if (parsed == null)
                {
                    continue;
                }

                foreach (var logical in dev.Assembler.Process(parsed))
                {
                    Emit(dev, logical, observedPerfMs);
                }
            }
        }
        finally
        {
            handle.Free();
        }
    }

    private HidReport? ParseReport(DeviceInfo dev, byte[] report)
    {
        uint len = (uint)report.Length;

        var hidReport = new HidReport();

        if (HidNative.HidP_GetUsageValue(HidpReportType.Input, HidNative.UsagePageDigitizer, 0,
                HidNative.UsageScanTime, out uint scanTime, dev.Preparsed, report, len) == HidNative.HidpStatusSuccess)
        {
            hidReport.ScanTime = scanTime;
        }

        if (HidNative.HidP_GetUsageValue(HidpReportType.Input, HidNative.UsagePageDigitizer, 0,
                HidNative.UsageContactCount, out uint contactCount, dev.Preparsed, report, len) == HidNative.HidpStatusSuccess)
        {
            hidReport.ContactCount = (int)contactCount;
        }

        hidReport.Primary = ReadButton1(dev, report, len);

        foreach (ushort fc in dev.FingerCollections)
        {
            var contact = ParseFinger(dev, fc, report, len);
            if (contact.HasValue)
            {
                hidReport.Contacts.Add(contact.Value);
            }
        }

        return hidReport;
    }

    private bool ReadButton1(DeviceInfo dev, byte[] report, uint len)
    {
        var usages = new ushort[32];
        uint count = (uint)usages.Length;
        int status = HidNative.HidP_GetUsages(HidpReportType.Input, HidNative.UsagePageButton, 0,
            usages, ref count, dev.Preparsed, report, len);
        if (status != HidNative.HidpStatusSuccess)
        {
            return false;
        }
        for (int i = 0; i < count; i++)
        {
            if (usages[i] == HidNative.UsageButton1)
            {
                return true;
            }
        }
        return false;
    }

    private HidContact? ParseFinger(DeviceInfo dev, ushort fc, byte[] report, uint len)
    {
        var usages = new ushort[16];
        uint count = (uint)usages.Length;
        bool tip = false;
        bool confFound = false;
        if (HidNative.HidP_GetUsages(HidpReportType.Input, HidNative.UsagePageDigitizer, fc,
                usages, ref count, dev.Preparsed, report, len) == HidNative.HidpStatusSuccess)
        {
            for (int i = 0; i < count; i++)
            {
                if (usages[i] == HidNative.UsageTipSwitch)
                {
                    tip = true;
                }
                else if (usages[i] == HidNative.UsageConfidence)
                {
                    confFound = true;
                }
            }
        }

        if (confFound)
        {
            dev.SawConfidenceUsage = true;
        }

        // Only tip-on contacts are emitted; lifts are represented downstream by absence.
        if (!tip)
        {
            return null;
        }

        HidNative.HidP_GetUsageValue(HidpReportType.Input, HidNative.UsagePageDigitizer, fc,
            HidNative.UsageContactId, out uint contactId, dev.Preparsed, report, len);
        HidNative.HidP_GetUsageValue(HidpReportType.Input, HidNative.UsagePageGenericDesktop, fc,
            HidNative.UsageX, out uint xRaw, dev.Preparsed, report, len);
        HidNative.HidP_GetUsageValue(HidpReportType.Input, HidNative.UsagePageGenericDesktop, fc,
            HidNative.UsageY, out uint yRaw, dev.Preparsed, report, len);

        // Confidence: if the device is known to report a confidence usage but this finger
        // lacks it, treat as a palm; otherwise assume confident.
        bool confidence = confFound || !dev.SawConfidenceUsage;

        double x = Normalize((int)xRaw, dev.XLogicalMin, dev.XLogicalMax);
        double y = Normalize((int)yRaw, dev.YLogicalMin, dev.YLogicalMax);

        return new HidContact((int)contactId, true, x, y, confidence);
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

    private void Emit(DeviceInfo dev, LogicalContactFrame logical, double observedPerfMs)
    {
        ContactFrame frame = _frameFactory.Build(
            dev.DeviceId,
            logical,
            observedPerfMs,
            dev.PhysicalAspectRatio);

        DeviceId = dev.DeviceId;
        FrameReady?.Invoke(frame);
    }

    private DeviceInfo? GetOrBuildDevice(IntPtr hDevice)
    {
        if (hDevice == IntPtr.Zero)
        {
            return null;
        }
        if (_devices.TryGetValue(hDevice, out var existing))
        {
            return existing;
        }

        var info = BuildDevice(hDevice);
        if (info != null)
        {
            _devices[hDevice] = info;
        }
        return info;
    }

    private DeviceInfo? BuildDevice(IntPtr hDevice)
    {
        // Preparsed data.
        uint size = 0;
        if (Win32.GetRawInputDeviceInfo(hDevice, Win32.RIDI_PREPARSEDDATA, IntPtr.Zero, ref size) != 0 || size == 0)
        {
            return null;
        }
        IntPtr preparsed = Marshal.AllocHGlobal((int)size);
        if (Win32.GetRawInputDeviceInfo(hDevice, Win32.RIDI_PREPARSEDDATA, preparsed, ref size) == unchecked((uint)-1))
        {
            Marshal.FreeHGlobal(preparsed);
            return null;
        }

        if (HidNative.HidP_GetCaps(preparsed, out HidpCaps caps) != HidNative.HidpStatusSuccess)
        {
            Marshal.FreeHGlobal(preparsed);
            return null;
        }

        var info = new DeviceInfo { Preparsed = preparsed };

        // Value caps -> logical ranges plus physical trackpad aspect. Keeping
        // X/Y as schema-normalized [0,1] while carrying the physical ratio in
        // metadata lets gameplay undo unit-square distortion without changing
        // the replay/input contract.
        double? xPhysicalSpan = null;
        double? yPhysicalSpan = null;
        uint? xUnits = null;
        uint? yUnits = null;
        if (caps.NumberInputValueCaps > 0)
        {
            ushort valueCapsLen = caps.NumberInputValueCaps;
            var valueCaps = new HidpValueCaps[valueCapsLen];
            if (HidNative.HidP_GetValueCaps(HidpReportType.Input, valueCaps, ref valueCapsLen, preparsed)
                == HidNative.HidpStatusSuccess)
            {
                for (int i = 0; i < valueCapsLen; i++)
                {
                    var vc = valueCaps[i];
                    if (vc.UsagePage == HidNative.UsagePageGenericDesktop && vc.Usage == HidNative.UsageX)
                    {
                        info.XLogicalMin = vc.LogicalMin;
                        info.XLogicalMax = vc.LogicalMax != 0 ? vc.LogicalMax : info.XLogicalMax;
                        xPhysicalSpan ??= PhysicalSpan(vc);
                        xUnits ??= vc.Units;
                    }
                    else if (vc.UsagePage == HidNative.UsagePageGenericDesktop && vc.Usage == HidNative.UsageY)
                    {
                        info.YLogicalMin = vc.LogicalMin;
                        info.YLogicalMax = vc.LogicalMax != 0 ? vc.LogicalMax : info.YLogicalMax;
                        yPhysicalSpan ??= PhysicalSpan(vc);
                        yUnits ??= vc.Units;
                    }
                }
            }
        }
        if (xPhysicalSpan is > 0 && yPhysicalSpan is > 0 && xUnits == yUnits)
        {
            double aspect = xPhysicalSpan.Value / yPhysicalSpan.Value;
            if (double.IsFinite(aspect) && aspect is >= 0.25 and <= 4.0)
            {
                info.PhysicalAspectRatio = aspect;
            }
        }

        // Link collection nodes -> finger collection indices.
        var fingers = new List<ushort>();
        if (caps.NumberLinkCollectionNodes > 0)
        {
            uint nodeCount = caps.NumberLinkCollectionNodes;
            var nodes = new HidpLinkCollectionNode[nodeCount];
            if (HidNative.HidP_GetLinkCollectionNodes(nodes, ref nodeCount, preparsed) == HidNative.HidpStatusSuccess)
            {
                for (ushort i = 0; i < nodeCount; i++)
                {
                    if (nodes[i].LinkUsagePage == HidNative.UsagePageDigitizer && nodes[i].LinkUsage == HidNative.UsageFinger)
                    {
                        fingers.Add(i);
                    }
                }
            }
        }
        info.FingerCollections = fingers.ToArray();

        info.DeviceId = ReadDeviceName(hDevice);

        return info;
    }

    private static double? PhysicalSpan(HidpValueCaps cap)
    {
        long rawSpan = Math.Abs((long)cap.PhysicalMax - cap.PhysicalMin);
        if (rawSpan == 0)
        {
            return null;
        }

        // HID unit exponent is a signed four-bit decimal exponent.
        int exponent = (int)(cap.UnitsExp & 0x0F);
        if (exponent > 7)
        {
            exponent -= 16;
        }
        double span = rawSpan * Math.Pow(10, exponent);
        return double.IsFinite(span) && span > 0 ? span : null;
    }

    private static string ReadDeviceName(IntPtr hDevice)
    {
        uint charCount = 0;
        if (Win32.GetRawInputDeviceInfo(hDevice, Win32.RIDI_DEVICENAME, IntPtr.Zero, ref charCount) != 0 || charCount == 0)
        {
            return $"device-{hDevice.ToInt64():x}";
        }
        IntPtr buf = Marshal.AllocHGlobal((int)charCount * 2);
        try
        {
            if (Win32.GetRawInputDeviceInfo(hDevice, Win32.RIDI_DEVICENAME, buf, ref charCount) == unchecked((uint)-1))
            {
                return $"device-{hDevice.ToInt64():x}";
            }
            return Marshal.PtrToStringUni(buf) ?? $"device-{hDevice.ToInt64():x}";
        }
        finally
        {
            Marshal.FreeHGlobal(buf);
        }
    }

    public void Dispose()
    {
        Stop();
        foreach (var dev in _devices.Values)
        {
            if (dev.Preparsed != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(dev.Preparsed);
            }
        }
        _devices.Clear();
    }
}
