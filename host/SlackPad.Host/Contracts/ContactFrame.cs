using System.Text.Json;
using System.Text.Json.Serialization;

namespace SlackPad.Host.Contracts;

/// <summary>
/// ContactFrame v1 — the sole input contract emitted by every adapter.
/// Mirrors <c>packages/shared/src/contactFrame.ts</c> and
/// <c>research/probes/contact-frame.schema.json</c>. Serialized with the
/// camelCase naming policy so JSON field names are exactly:
/// schemaVersion, frameId, tPerfMs, tScanUs, source, contacts, buttons, meta.
/// </summary>
public sealed class ContactFrame
{
    public const int CurrentSchemaVersion = 1;

    public int SchemaVersion { get; set; } = CurrentSchemaVersion;

    /// <summary>Monotonic per-source frame counter.</summary>
    public long FrameId { get; set; }

    /// <summary>Host QueryPerformanceCounter-derived milliseconds.</summary>
    public double TPerfMs { get; set; }

    /// <summary>HID scan time in microseconds when available; null for pointer path.</summary>
    public long? TScanUs { get; set; }

    /// <summary>Always "hardware" for the P0 adapters (never "raw"/"pointer" — see meta.adapter).</summary>
    public string Source { get; set; } = "hardware";

    public List<Contact> Contacts { get; set; } = new();

    public ContactFrameButtons Buttons { get; set; } = new();

    public ContactFrameMeta? Meta { get; set; }
}

public sealed class Contact
{
    /// <summary>Hardware contact identifier — opaque, stable while tip down.</summary>
    public int Id { get; set; }

    /// <summary>Tip switch: true while the finger is on the pad.</summary>
    public bool Tip { get; set; }

    /// <summary>Normalized pad X in [0,1].</summary>
    public double X { get; set; }

    /// <summary>Normalized pad Y in [0,1].</summary>
    public double Y { get; set; }

    /// <summary>HID confidence — false means likely palm; such contacts are ignored downstream.</summary>
    public bool Confidence { get; set; } = true;

    // Optional fields — omitted from JSON when null to match the trace-format example
    // (which carries only id/tip/x/y/confidence). PTP spike does not require pressure.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Pressure { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Width { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Height { get; set; }
}

public sealed class ContactFrameButtons
{
    /// <summary>Report-level primary click (Button 1). Not per-finger.</summary>
    public bool Primary { get; set; }

    public bool Secondary { get; set; }

    public bool Auxiliary { get; set; }
}

/// <summary>
/// Meta bag. Schema allows additionalProperties, so the adapter tag ("raw"/"pointer")
/// lives here rather than as a top-level ContactFrame field (which the schema forbids).
/// </summary>
public sealed class ContactFrameMeta
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DeviceId { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? ContactCountRaw { get; set; }

    /// <summary>Adapter identity tag: "raw" (P0-B) or "pointer" (P0-A).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Adapter { get; set; }
}

/// <summary>Shared System.Text.Json options for ContactFrame / envelope serialization.</summary>
public static class ContactFrameJson
{
    /// <summary>
    /// camelCase naming policy, compact output. WhenWritingNull is applied per-property
    /// via attributes (not globally), so tScanUs still serializes as null while optional
    /// contact fields are omitted.
    /// </summary>
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    public static string Serialize(ContactFrame frame) => JsonSerializer.Serialize(frame, Options);

    public static ContactFrame? Deserialize(string json) =>
        JsonSerializer.Deserialize<ContactFrame>(json, Options);
}
