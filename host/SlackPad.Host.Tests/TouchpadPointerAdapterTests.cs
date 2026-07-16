using System.Reflection;
using System.Runtime.InteropServices;
using Xunit;

namespace SlackPad.Host.Tests;

public class TouchpadPointerAdapterTests
{
    private static readonly Type AdapterType =
        typeof(SlackPad.Host.Contracts.ContactFrame).Assembly.GetType(
            "SlackPad.Host.Adapters.TouchpadPointerAdapter",
            throwOnError: true)!;

    [Fact]
    public void PointerConfidence_UsesTheWindowsConfidenceFlag()
    {
        Assert.False(InvokeStatic<bool>("HasPointerConfidence", 0u));
        Assert.False(InvokeStatic<bool>("HasPointerConfidence", 0x00000400u));
        Assert.True(InvokeStatic<bool>("HasPointerConfidence", 0x00004000u));
        Assert.True(InvokeStatic<bool>("HasPointerConfidence", 0x00004004u));
    }

    [Fact]
    public void PointerTimestamp_MapsTheEventPerformanceCountOntoTheHostTimeline()
    {
        double eventPerfMs = InvokeStatic<double>(
            "MapPerformanceCountToPerfMs",
            95_000UL,
            100_000L,
            2_000.0,
            10_000L);

        Assert.Equal(1_500.0, eventPerfMs, 6);
    }

    [Theory]
    [InlineData(0UL, 10_000L)]
    [InlineData(10_001UL, 10_000L)]
    public void PointerTimestamp_InvalidCounterFallsBackToObservedHostTime(
        ulong performanceCount,
        long nowTimestamp)
    {
        double eventPerfMs = InvokeStatic<double>(
            "MapPerformanceCountToPerfMs",
            performanceCount,
            nowTimestamp,
            72.25,
            10_000L);

        Assert.Equal(72.25, eventPerfMs, 6);
    }

    [Fact]
    public void CoalescedHistory_IsProcessedOldestFirst()
    {
        int[] rows = Enumerable.Range(0, 4)
            .Select(index => InvokeStatic<int>("ChronologicalHistoryRow", 4, index))
            .ToArray();

        Assert.Equal(new[] { 3, 2, 1, 0 }, rows);
    }

    [Fact]
    public void CoalescedHistory_OverlappingWindowsEmitEachDeviceFrameOnce()
    {
        object adapter = Activator.CreateInstance(AdapterType, nonPublic: true)!;
        var device = new IntPtr(0x1234);

        bool[] decisions = new uint[] { 8, 9, 10, 8, 9, 10 }
            .Select(frameId => InvokeInstance<bool>(
                adapter,
                "ShouldEmitPointerFrame",
                device,
                frameId))
            .ToArray();

        Assert.Equal(new[] { true, true, true, false, false, false }, decisions);
    }

    [Fact]
    public void CoalescedHistory_DeduplicationIsDeviceScopedAndClearedOnStop()
    {
        object adapter = Activator.CreateInstance(AdapterType, nonPublic: true)!;
        var firstDevice = new IntPtr(0x1234);
        var secondDevice = new IntPtr(0x5678);

        Assert.True(InvokeInstance<bool>(adapter, "ShouldEmitPointerFrame", firstDevice, 10u));
        Assert.False(InvokeInstance<bool>(adapter, "ShouldEmitPointerFrame", firstDevice, 10u));
        Assert.True(InvokeInstance<bool>(adapter, "ShouldEmitPointerFrame", secondDevice, 10u));

        AdapterType.GetMethod("Stop", BindingFlags.Instance | BindingFlags.Public)!.Invoke(adapter, null);

        Assert.True(InvokeInstance<bool>(adapter, "ShouldEmitPointerFrame", firstDevice, 10u));
    }

    [Fact]
    public void CoalescedHistory_DeduplicationWindowIsBounded()
    {
        object adapter = Activator.CreateInstance(AdapterType, nonPublic: true)!;
        var device = new IntPtr(0x1234);
        int capacity = (int)(AdapterType.GetField(
            "MaxFrameIdsPerDevice",
            BindingFlags.Static | BindingFlags.NonPublic)?.GetRawConstantValue()
            ?? throw new Xunit.Sdk.XunitException("Missing bounded frame history capacity."));

        for (uint frameId = 1; frameId <= capacity + 1; frameId++)
        {
            Assert.True(InvokeInstance<bool>(adapter, "ShouldEmitPointerFrame", device, frameId));
        }

        Assert.True(InvokeInstance<bool>(adapter, "ShouldEmitPointerFrame", device, 1u));
    }

    [Fact]
    public void NativePointerTouchpadInfo_MatchesPointerTouchInfoLayout()
    {
        Type hostAssemblyMarker = typeof(SlackPad.Host.Contracts.ContactFrame);
        Type pointerInfo = hostAssemblyMarker.Assembly.GetType(
            "SlackPad.Host.Interop.PointerInfo",
            throwOnError: true)!;
        Type touchpadInfo = hostAssemblyMarker.Assembly.GetType(
            "SlackPad.Host.Interop.PointerTouchpadInfo",
            throwOnError: true)!;

        int pointerInfoSize = Marshal.SizeOf(pointerInfo);

        Assert.Equal(0, Marshal.OffsetOf(touchpadInfo, "PointerInfo").ToInt32());
        Assert.Equal(pointerInfoSize, Marshal.OffsetOf(touchpadInfo, "TouchFlags").ToInt32());
        Assert.Equal(pointerInfoSize + sizeof(uint), Marshal.OffsetOf(touchpadInfo, "TouchMask").ToInt32());
        Assert.Equal(pointerInfoSize + (2 * sizeof(uint)), Marshal.OffsetOf(touchpadInfo, "RcContact").ToInt32());
        Assert.Equal(pointerInfoSize + 24, Marshal.OffsetOf(touchpadInfo, "RcContactRaw").ToInt32());
        Assert.Equal(pointerInfoSize + 40, Marshal.OffsetOf(touchpadInfo, "Orientation").ToInt32());
        Assert.Equal(pointerInfoSize + 44, Marshal.OffsetOf(touchpadInfo, "Pressure").ToInt32());
        Assert.Equal(pointerInfoSize + 48, Marshal.SizeOf(touchpadInfo));
    }

    [Theory]
    [InlineData(1200, 600, 2.0)]
    [InlineData(-1200, 600, 2.0)]
    [InlineData(5000, 500, 4.0)]
    [InlineData(500, 5000, 0.25)]
    [InlineData(1200, 0, 1.0)]
    public void PhysicalAspectRatio_UsesAbsoluteHimetricDeviceExtents(
        int width,
        int height,
        double expected)
    {
        double ratio = InvokeStatic<double>("PhysicalAspectRatio", width, height);

        Assert.Equal(expected, ratio, 6);
    }

    private static T InvokeStatic<T>(string methodName, params object[] arguments)
    {
        MethodInfo method = AdapterType.GetMethod(
            methodName,
            BindingFlags.Static | BindingFlags.NonPublic)
            ?? throw new Xunit.Sdk.XunitException($"Missing adapter helper {methodName}.");

        return (T)method.Invoke(null, arguments)!;
    }

    private static T InvokeInstance<T>(object instance, string methodName, params object[] arguments)
    {
        MethodInfo method = AdapterType.GetMethod(
            methodName,
            BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new Xunit.Sdk.XunitException($"Missing adapter helper {methodName}.");

        return (T)method.Invoke(instance, arguments)!;
    }
}
