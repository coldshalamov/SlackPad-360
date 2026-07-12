using SlackPad.Host.Contracts;

namespace SlackPad.Host.Core;

/// <summary>
/// Produces truthful LEFT/RIGHT button state for outgoing ContactFrames.
///
/// Why not use the adapter's HID button? The Precision Touchpad HID report
/// exposes only a single report-level "Button 1" (see
/// <c>TouchpadRawInputAdapter.ReadButton1</c>) — it fires for a physical click
/// but cannot say whether Windows resolved it to a LEFT or a RIGHT click (the OS
/// synthesizes L/R from click-zone + settings at the mouse layer, below HID). A
/// WebView2 child window also swallows the WM_*BUTTON* messages that would carry
/// that split. So the host samples <c>GetAsyncKeyState(VK_LBUTTON/VK_RBUTTON)</c>
/// on the batch timer and maps:
///   primary   = left mouse button down,
///   secondary = right mouse button down.
///
/// The HID Button-1 bit is intentionally DISCARDED rather than OR-ed in: OR-ing
/// would set <c>primary</c> true on a right-click-zone press (HID Button 1 is
/// set, LMB is not), reporting a left kick the player never made.
/// </summary>
public static class HostButtonMerge
{
    public static ContactFrameButtons Merge(bool leftDown, bool rightDown) => new()
    {
        Primary = leftDown,
        Secondary = rightDown,
        Auxiliary = false,
    };
}
