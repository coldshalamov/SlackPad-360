namespace SlackPad.Host;

/// <summary>
/// M0 build-smoke shell. M1 replaces this with the dual-adapter spike window
/// (Raw Input HID 0x0D/0x05 primary + Win11 pointer co-spike) emitting
/// ContactFrame v1 batches into WebView2.
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var form = new Form
        {
            Text = "SlackPad 360 Host (M0 shell)",
            Width = 960,
            Height = 600,
        };
        Application.Run(form);
    }
}
