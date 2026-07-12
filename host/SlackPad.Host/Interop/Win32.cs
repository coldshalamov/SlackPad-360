using System.Runtime.InteropServices;

namespace SlackPad.Host.Interop;

[StructLayout(LayoutKind.Sequential)]
internal struct RawInputDevice
{
    public ushort UsagePage;
    public ushort Usage;
    public uint Flags;
    public IntPtr Target;
}

[StructLayout(LayoutKind.Sequential)]
internal struct RawInputHeader
{
    public uint Type;
    public uint Size;
    public IntPtr Device;
    public IntPtr WParam;
}

[StructLayout(LayoutKind.Sequential)]
internal struct RawHidHeader
{
    public uint SizeHid;
    public uint Count;
    // BYTE bRawData[1] follows.
}

[StructLayout(LayoutKind.Sequential)]
internal struct Point
{
    public int X;
    public int Y;
}

[StructLayout(LayoutKind.Sequential)]
internal struct Rect
{
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;

    public readonly int Width => Right - Left;
    public readonly int Height => Bottom - Top;
}

/// <summary>POINTER_INFO (winuser.h). Read via GetPointerFrameTouchpadInfo.</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct PointerInfo
{
    public uint PointerType;
    public uint PointerId;
    public uint FrameId;
    public uint PointerFlags;
    public IntPtr SourceDevice;
    public IntPtr HwndTarget;
    public Point PtPixelLocation;
    public Point PtHimetricLocation;
    public Point PtPixelLocationRaw;
    public Point PtHimetricLocationRaw;
    public uint DwTime;
    public uint HistoryCount;
    public int InputData;
    public uint DwKeyStates;
    public ulong PerformanceCount;
    public int ButtonChangeType;
}

/// <summary>POINTER_TOUCHPAD_INFO (Win11 winuser.h).</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct PointerTouchpadInfo
{
    public PointerInfo PointerInfo;
    public Rect RcContact;
    public Rect RcContactRaw;
    public uint Orientation;
    public uint Pressure;
}

internal static class Win32
{
    // Window messages.
    public const int WM_INPUT = 0x00FF;
    public const int WM_POINTERUPDATE = 0x0245;
    public const int WM_POINTERDOWN = 0x0246;
    public const int WM_POINTERUP = 0x0247;
    public const int WM_POINTERENTER = 0x0249;
    public const int WM_POINTERLEAVE = 0x024A;

    // Raw input.
    public const uint RID_INPUT = 0x10000003;
    public const uint RIDI_PREPARSEDDATA = 0x20000005;
    public const uint RIDI_DEVICENAME = 0x20000007;
    public const uint RIM_TYPEMOUSE = 0;
    public const uint RIM_TYPEKEYBOARD = 1;
    public const uint RIM_TYPEHID = 2;
    public const uint RIDEV_INPUTSINK = 0x00000100;
    public const uint RIDEV_REMOVE = 0x00000001;

    // Precision touchpad digitizer collection.
    public const ushort HidUsagePageDigitizer = 0x0D;
    public const ushort HidUsageTouchpad = 0x05;

    // Pointer input types.
    public const uint PT_TOUCHPAD = 5;

    // POINTER_FLAGS bits.
    public const uint POINTER_FLAG_INCONTACT = 0x00000004;
    public const uint POINTER_FLAG_FIRSTBUTTON = 0x00000010;
    public const uint POINTER_FLAG_CONFIDENCE = 0x00000400;
    public const uint POINTER_FLAG_PRIMARY = 0x00002000;
    public const uint POINTER_FLAG_UP = 0x00040000;

    // Virtual-key codes (GetAsyncKeyState). LMB/RMB reflect the OS-synthesized
    // left/right button state — the only place truthful L vs R lives, since the
    // raw HID report exposes only report-level Button 1. F11 drives fullscreen.
    public const int VK_LBUTTON = 0x01;
    public const int VK_RBUTTON = 0x02;
    public const int VK_F11 = 0x7A;

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    /// <summary>True while the given virtual key is currently pressed (high-order bit set).</summary>
    public static bool IsKeyDown(int vKey) => (GetAsyncKeyState(vKey) & 0x8000) != 0;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterRawInputDevices(
        [In] RawInputDevice[] rawInputDevices,
        uint numDevices,
        uint size);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetRawInputData(
        IntPtr rawInput,
        uint command,
        IntPtr data,
        ref uint size,
        uint sizeHeader);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "GetRawInputDeviceInfoW")]
    public static extern uint GetRawInputDeviceInfo(
        IntPtr device,
        uint command,
        IntPtr data,
        ref uint size);

    // Pointer APIs (Win11 for touchpad). RegisterTouchpadCapableWindow may be absent on
    // older builds -> callers probe availability and degrade gracefully.
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterTouchpadCapableWindow(IntPtr hwnd, bool fRegister);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetPointerType(uint pointerId, out uint pointerType);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetPointerFrameTouchpadInfo(
        uint pointerId,
        ref uint pointerCount,
        [In, Out] PointerTouchpadInfo[]? touchpadInfo);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetPointerDeviceRects(
        IntPtr device,
        out Rect pointerDeviceRect,
        out Rect displayRect);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern IntPtr GetModuleHandle(string? moduleName);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern IntPtr GetProcAddress(IntPtr module, string procName);

    public static ushort LoWord(IntPtr value) => (ushort)((ulong)value & 0xFFFF);

    /// <summary>Probe whether a user32 export exists (for graceful degradation).</summary>
    public static bool User32HasExport(string procName)
    {
        IntPtr module = GetModuleHandle("user32.dll");
        if (module == IntPtr.Zero)
        {
            return false;
        }
        return GetProcAddress(module, procName) != IntPtr.Zero;
    }
}
