using System.Text.Json;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

public class RawInputContactFrameFactoryTests
{
    private static HidContact C(int id) => new(id, true, id / 10.0, 0.5, true);

    [Fact]
    public void Build_AcrossScanRollover_EmitsContinuousAlignedContactFrameV1()
    {
        var factory = new RawInputContactFrameFactory();

        factory.Build("device-a", Frame(65_534, C(1)), 1_000.0);
        var after = factory.Build("device-a", Frame(2, C(1)), 1_000.4);

        Assert.Equal(1, after.FrameId);
        Assert.Equal(6_553_800, after.TScanUs);
        Assert.Equal(1_000.4, after.TPerfMs, 6);
        Assert.Equal("hardware", after.Source);
        Assert.Equal("device-a", after.Meta!.DeviceId);
        Assert.Equal("raw", after.Meta.Adapter);
        Assert.Equal(1, after.Meta.ContactCountRaw);

        using var json = JsonDocument.Parse(ContactFrameJson.Serialize(after));
        var contactKeys = json.RootElement.GetProperty("contacts")[0]
            .EnumerateObject()
            .Select(property => property.Name)
            .ToHashSet();
        Assert.Equal(
            new HashSet<string> { "id", "tip", "x", "y", "confidence" },
            contactKeys);
    }

    [Fact]
    public void Build_TracksEachDeviceClockIndependentlyWhileFrameIdsRemainGlobal()
    {
        var factory = new RawInputContactFrameFactory();

        var a0 = factory.Build("device-a", Frame(65_534, C(1)), 100.0);
        var b0 = factory.Build("device-b", Frame(10, C(2)), 100.1);
        var a1 = factory.Build("device-a", Frame(2, C(1)), 100.4);
        var b1 = factory.Build("device-b", Frame(20, C(2)), 101.1);

        Assert.Equal(new long[] { 0, 1, 2, 3 }, new[] { a0.FrameId, b0.FrameId, a1.FrameId, b1.FrameId });
        Assert.Equal(6_553_800, a1.TScanUs);
        Assert.Equal(2_000, b1.TScanUs);
    }

    [Fact]
    public void Build_MoreThanFiveContacts_PreservesContactFrameMaximum()
    {
        var factory = new RawInputContactFrameFactory();
        var logical = Frame(100, C(1), C(2), C(3), C(4), C(5), C(6));

        var frame = factory.Build("device-a", logical, 1.0);

        Assert.Equal(5, frame.Contacts.Count);
        Assert.DoesNotContain(frame.Contacts, contact => contact.Id == 6);
        Assert.Equal(6, frame.Meta!.ContactCountRaw);
    }

    [Fact]
    public void Build_DevicePhysicalAspect_PreservesIsotropicGestureMetadata()
    {
        var factory = new RawInputContactFrameFactory();

        var frame = factory.Build("wide-pad", Frame(100, C(1)), 1.0, 2.125);

        Assert.Equal(2.125, frame.Meta!.PhysicalAspectRatio);
        using var json = JsonDocument.Parse(ContactFrameJson.Serialize(frame));
        Assert.Equal(
            2.125,
            json.RootElement.GetProperty("meta").GetProperty("physicalAspectRatio").GetDouble());
    }

    private static LogicalContactFrame Frame(long scanTime, params HidContact[] contacts) => new()
    {
        ScanTime = scanTime,
        ContactCountRaw = contacts.Length,
        Contacts = contacts.ToList(),
    };
}
