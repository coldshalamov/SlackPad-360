using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>PTP's 16-bit, 100-microsecond scan clock mapped onto the host QPC timeline.</summary>
public class HidScanTimeMapperTests
{
    [Fact]
    public void Map_CoalescedForwardSamples_PreservesDeviceCadence()
    {
        var mapper = new HidScanTimeMapper();

        HidFrameTimestamp first = mapper.Map(1_000, 500.0);
        HidFrameTimestamp second = mapper.Map(1_080, 500.01);

        Assert.Equal(8.0, second.PerfTimeMs - first.PerfTimeMs, 6);
        Assert.Equal(8_000, second.ScanTimeUs - first.ScanTimeUs);
    }

    [Fact]
    public void Map_FirstSample_PreservesDeviceTicksAndAnchorsHostTime()
    {
        var mapper = new HidScanTimeMapper();

        HidFrameTimestamp timestamp = mapper.Map(12_345, 800.25);

        Assert.Equal(1_234_500, timestamp.ScanTimeUs);
        Assert.Equal(800.25, timestamp.PerfTimeMs, 6);
    }

    [Fact]
    public void Map_SixteenBitRollover_KeepsBothTimelinesContinuous()
    {
        var mapper = new HidScanTimeMapper();

        HidFrameTimestamp before = mapper.Map(65_534, 1_000.0);
        HidFrameTimestamp after = mapper.Map(2, 1_000.4);

        Assert.Equal(6_553_400, before.ScanTimeUs);
        Assert.Equal(6_553_800, after.ScanTimeUs);
        Assert.Equal(1_000.4, after.PerfTimeMs, 6);
    }

    [Fact]
    public void Map_HostArrivalJitter_UsesDeviceScanCadenceAfterAnchor()
    {
        var mapper = new HidScanTimeMapper();

        HidFrameTimestamp first = mapper.Map(1_000, 500.0);
        HidFrameTimestamp delayedArrival = mapper.Map(1_100, 515.0);

        Assert.Equal(500.0, first.PerfTimeMs, 6);
        Assert.Equal(510.0, delayedArrival.PerfTimeMs, 6);
    }

    [Fact]
    public void Map_IdleGapLongerThanOneWrap_UsesHostElapsedTimeToRecoverWholeCycles()
    {
        var mapper = new HidScanTimeMapper();

        mapper.Map(100, 1_000.0);
        HidFrameTimestamp afterTenSeconds = mapper.Map(34_564, 11_000.0);

        Assert.Equal(10_010_000, afterTenSeconds.ScanTimeUs);
        Assert.Equal(11_000.0, afterTenSeconds.PerfTimeMs, 6);
    }

    [Fact]
    public void Map_DuplicateScan_KeepsIdenticalAlignedTimestamp()
    {
        var mapper = new HidScanTimeMapper();

        HidFrameTimestamp first = mapper.Map(500, 100.0);
        HidFrameTimestamp duplicate = mapper.Map(500, 105.0);

        Assert.Equal(first, duplicate);
    }

    [Fact]
    public void Map_ShortGapDeviceClockReset_ReanchorsInsteadOfInventingAFullWrap()
    {
        var mapper = new HidScanTimeMapper();

        HidFrameTimestamp beforeReset = mapper.Map(1_000, 100.0);
        HidFrameTimestamp afterReset = mapper.Map(0, 110.0);
        HidFrameTimestamp next = mapper.Map(10, 111.0);

        Assert.Equal(100.0, beforeReset.PerfTimeMs, 6);
        Assert.Equal(110.0, afterReset.PerfTimeMs, 6);
        Assert.Equal(111.0, next.PerfTimeMs, 6);
        Assert.Equal(110_000, afterReset.ScanTimeUs);
        Assert.Equal(111_000, next.ScanTimeUs);
    }
}
