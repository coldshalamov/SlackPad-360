namespace SlackPad.Host.Core;

/// <summary>Which window Program launches.</summary>
public enum HostMode
{
    /// <summary>Full-window game in WebView2 with real trackpad streaming (default).</summary>
    Game,

    /// <summary>M1 dual-adapter input diagnostic window (dots + metrics).</summary>
    Spike,
}

/// <summary>
/// Pure command-line parsing for the host. Kept side-effect free so it is unit
/// testable without spinning up WinForms:
///   (default)    → game mode
///   --spike      → M1 SpikeForm
///   --devtools   → allow WebView2 dev tools (game mode only)
/// Order/casing independent; unknown args are ignored.
/// </summary>
public sealed record GameLaunchOptions(HostMode Mode, bool DevTools)
{
    public static GameLaunchOptions Parse(string[]? args)
    {
        var mode = HostMode.Game;
        bool devTools = false;

        if (args != null)
        {
            foreach (string raw in args)
            {
                string arg = raw.Trim();
                if (arg.Equals("--spike", StringComparison.OrdinalIgnoreCase))
                {
                    mode = HostMode.Spike;
                }
                else if (arg.Equals("--devtools", StringComparison.OrdinalIgnoreCase))
                {
                    devTools = true;
                }
            }
        }

        return new GameLaunchOptions(mode, devTools);
    }
}
