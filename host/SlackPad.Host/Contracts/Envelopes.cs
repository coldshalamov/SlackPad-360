using System.Text.Json.Serialization;

namespace SlackPad.Host.Contracts;

/// <summary>
/// Host → page message envelopes (WebView2 PostWebMessageAsJson payloads).
/// Mirrors <c>packages/shared/src/envelope.ts</c>. All serialize with the camelCase
/// policy in <see cref="ContactFrameJson.Options"/>.
/// </summary>
public sealed class ContactBatchEnvelope
{
    public int V { get; set; } = 1;
    public string Type { get; set; } = "contactBatch";

    /// <summary>"hardware" or "synthetic".</summary>
    public string Source { get; set; } = "hardware";

    public double HostTPerfMs { get; set; }

    public List<ContactFrame> Frames { get; set; } = new();
}

public sealed class HostInfoEnvelope
{
    public int V { get; set; } = 1;
    public string Type { get; set; } = "hostInfo";
    public HostInfoPayload Payload { get; set; } = new();
}

public sealed class HostInfoPayload
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Os { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Machine { get; set; }

    /// <summary>"raw" or "pointer".</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Adapter { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? QpcFreq { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? HostVersion { get; set; }
}

public sealed class FocusEnvelope
{
    public int V { get; set; } = 1;
    public string Type { get; set; } = "focus";
    public FocusPayload Payload { get; set; } = new();
}

public sealed class FocusPayload
{
    public bool Focused { get; set; }
}

/// <summary>Page → host message (chrome.webview.postMessage). Validate origin before trusting.</summary>
public sealed class PageToHostMessage
{
    public int V { get; set; }
    public string? Type { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object>? Payload { get; set; }
}
