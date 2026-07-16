namespace SlackPad.Host.Core;

/// <summary>A PTP scan timestamp expressed on both device and host timelines.</summary>
public readonly record struct HidFrameTimestamp(long ScanTimeUs, double PerfTimeMs);

/// <summary>
/// Unwraps the PTP 16-bit Scan Time usage and anchors it to the host performance clock.
/// PTP scan ticks are 100 microseconds and wrap every 65,536 ticks. Host elapsed time is
/// used only to recover whole cycles after an idle/reporting gap; scan-to-scan cadence comes
/// from the device clock so OS delivery jitter does not distort input timing.
/// </summary>
public sealed class HidScanTimeMapper
{
    private const long TickModulus = 65_536;
    private const long MicrosecondsPerTick = 100;
    private const double TicksPerMillisecond = 10.0;
    // Five hardware milliseconds absorbs normal Raw Input delivery jitter.
    // Larger differences scale with the observed gap so long idle periods can
    // still recover one or more legitimate 16-bit wraps.
    private const long MinimumPlausibilityTicks = 50;
    // Raw Input may deliver several historical HID reports in one WM_INPUT.
    // Their QPC receipt times are effectively identical even though Scan Time
    // correctly advances. Preserve up to 500 ms of such coalesced device time;
    // a real reset produces a near-modulus backward delta instead.
    private const long MaximumCoalescedForwardTicks = 5_000;

    private bool _initialized;
    private ushort _previousRawTicks;
    private long _unwrappedTicks;
    private long _anchorTicks;
    private double _anchorPerfMs;
    private double _previousObservedPerfMs;

    public HidFrameTimestamp Map(uint rawScanTime, double observedPerfMs)
    {
        ushort rawTicks = unchecked((ushort)rawScanTime);

        if (!_initialized)
        {
            _initialized = true;
            _previousRawTicks = rawTicks;
            _unwrappedTicks = rawTicks;
            _anchorTicks = rawTicks;
            _anchorPerfMs = observedPerfMs;
            _previousObservedPerfMs = observedPerfMs;
            return CurrentTimestamp();
        }

        long moduloDelta = (rawTicks - (long)_previousRawTicks + TickModulus) % TickModulus;
        double observedDeltaMs = Math.Max(0.0, observedPerfMs - _previousObservedPerfMs);
        long expectedDeltaTicks = (long)Math.Round(observedDeltaMs * TicksPerMillisecond);
        long additionalCycles = Math.Max(
            0,
            (long)Math.Round(
                (expectedDeltaTicks - moduloDelta) / (double)TickModulus,
                MidpointRounding.AwayFromZero));
        long mappedDeltaTicks = moduloDelta + additionalCycles * TickModulus;
        long plausibilityTicks = Math.Max(
            MinimumPlausibilityTicks,
            (long)Math.Ceiling(expectedDeltaTicks * 0.25));

        // A device power-cycle/reconnect can restart Scan Time without changing
        // its Raw Input device name. Treating that short-gap backwards jump as a
        // 6.55 s wrap would put every subsequent gesture timestamp in the future.
        // Re-anchor to QPC while preserving a monotonic synthetic scan epoch.
        bool rawMovedBackward = rawTicks < _previousRawTicks;
        bool plausibleCoalescedOrWrap = mappedDeltaTicks <= Math.Max(
            MaximumCoalescedForwardTicks,
            expectedDeltaTicks + plausibilityTicks);
        if (rawMovedBackward && !plausibleCoalescedOrWrap &&
            Math.Abs(mappedDeltaTicks - expectedDeltaTicks) > plausibilityTicks)
        {
            _unwrappedTicks += expectedDeltaTicks;
            _previousRawTicks = rawTicks;
            _anchorTicks = _unwrappedTicks;
            _anchorPerfMs = Math.Max(_anchorPerfMs, observedPerfMs);
            _previousObservedPerfMs = Math.Max(_previousObservedPerfMs, observedPerfMs);
            return CurrentTimestamp();
        }

        _unwrappedTicks += mappedDeltaTicks;
        _previousRawTicks = rawTicks;
        _previousObservedPerfMs = Math.Max(_previousObservedPerfMs, observedPerfMs);
        return CurrentTimestamp();
    }

    private HidFrameTimestamp CurrentTimestamp() => new(
        _unwrappedTicks * MicrosecondsPerTick,
        _anchorPerfMs + (_unwrappedTicks - _anchorTicks) / TicksPerMillisecond);
}
