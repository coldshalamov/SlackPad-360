using SlackPad.Host.Contracts;

namespace SlackPad.Host.Core;

/// <summary>
/// Builds ContactFrame v1 values from assembled PTP reports while keeping a separate
/// scan-clock epoch for each physical device and one monotonic raw-adapter frame sequence.
/// </summary>
public sealed class RawInputContactFrameFactory
{
    private readonly Dictionary<string, HidScanTimeMapper> _deviceClocks = new(StringComparer.Ordinal);
    private long _frameId;

    public ContactFrame Build(
        string deviceId,
        LogicalContactFrame logical,
        double observedPerfMs,
        double? physicalAspectRatio = null)
    {
        if (!_deviceClocks.TryGetValue(deviceId, out HidScanTimeMapper? clock))
        {
            clock = new HidScanTimeMapper();
            _deviceClocks.Add(deviceId, clock);
        }

        HidFrameTimestamp timestamp = clock.Map(unchecked((uint)logical.ScanTime), observedPerfMs);
        var contacts = new List<Contact>(Math.Min(logical.Contacts.Count, 5));
        foreach (HidContact contact in logical.Contacts)
        {
            if (contacts.Count >= 5)
            {
                break;
            }

            contacts.Add(new Contact
            {
                Id = contact.Id,
                Tip = contact.Tip,
                X = contact.X,
                Y = contact.Y,
                Confidence = contact.Confidence,
            });
        }

        return new ContactFrame
        {
            FrameId = _frameId++,
            TPerfMs = timestamp.PerfTimeMs,
            TScanUs = timestamp.ScanTimeUs,
            Source = "hardware",
            Contacts = contacts,
            Buttons = new ContactFrameButtons { Primary = logical.Primary },
            Meta = new ContactFrameMeta
            {
                DeviceId = deviceId,
                ContactCountRaw = logical.ContactCountRaw,
                PhysicalAspectRatio = physicalAspectRatio,
                Adapter = "raw",
            },
        };
    }
}
