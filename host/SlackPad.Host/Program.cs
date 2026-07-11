using SlackPad.Host.Ui;

namespace SlackPad.Host;

/// <summary>
/// M1 entry point. Launches the dual-adapter P0 hardware spike:
/// Raw Input HID digitizer (0x0D/0x05, primary) + Win11 pointer co-spike, emitting
/// ContactFrame v1, recording JSONL traces, and computing G1 metrics from a human run.
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var form = new SpikeForm();
        Application.Run(form);
    }
}
