using SlackPad.Host.Core;
using SlackPad.Host.Ui;

namespace SlackPad.Host;

/// <summary>
/// Host entry point.
///   (default)  → GameForm: the built game full-window in WebView2, fed real
///                trackpad ContactFrames. This is what play.bat launches.
///   --spike    → SpikeForm: the M1 dual-adapter input diagnostic (dots + metrics).
///   --devtools → allow WebView2 dev tools in game mode.
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var options = GameLaunchOptions.Parse(args);
        using Form form = options.Mode == HostMode.Spike
            ? new SpikeForm()
            : new GameForm(options.DevTools);
        Application.Run(form);
    }
}
