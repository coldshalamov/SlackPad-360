using System.Diagnostics;

namespace SlackPad.Host.Core;

/// <summary>
/// Monotonic high-resolution clock. <see cref="Stopwatch"/> is QueryPerformanceCounter-backed
/// on Windows, so this is the QPC-derived tPerfMs source the ContactFrame contract expects.
/// </summary>
public static class PerfClock
{
    private static readonly long Origin = Stopwatch.GetTimestamp();

    /// <summary>QueryPerformanceFrequency (ticks/second).</summary>
    public static long Frequency => Stopwatch.Frequency;

    /// <summary>Milliseconds since process clock origin.</summary>
    public static double NowMs() =>
        (Stopwatch.GetTimestamp() - Origin) * 1000.0 / Stopwatch.Frequency;
}
