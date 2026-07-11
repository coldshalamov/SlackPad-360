using System.Text.Json;
using SlackPad.Host.Contracts;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>Verifies host→page / page→host envelopes match packages/shared/src/envelope.ts.</summary>
public class EnvelopeTests
{
    [Fact]
    public void ContactBatchEnvelope_MatchesTsShape()
    {
        var env = new ContactBatchEnvelope
        {
            Source = "hardware",
            HostTPerfMs = 12.5,
            Frames = new List<ContactFrame> { new() { FrameId = 0 } },
        };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(env, ContactFrameJson.Options));
        var root = doc.RootElement;

        var keys = root.EnumerateObject().Select(p => p.Name).ToHashSet();
        Assert.Equal(new HashSet<string> { "v", "type", "source", "hostTPerfMs", "frames" }, keys);
        Assert.Equal(1, root.GetProperty("v").GetInt32());
        Assert.Equal("contactBatch", root.GetProperty("type").GetString());
        Assert.Equal("hardware", root.GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Array, root.GetProperty("frames").ValueKind);
    }

    [Fact]
    public void HostInfoEnvelope_MatchesTsShape()
    {
        var env = new HostInfoEnvelope
        {
            Payload = new HostInfoPayload
            {
                Os = "Windows",
                Machine = "PC",
                Adapter = "raw",
                QpcFreq = 10_000_000,
                HostVersion = "M1",
            },
        };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(env, ContactFrameJson.Options));
        var root = doc.RootElement;

        Assert.Equal(new HashSet<string> { "v", "type", "payload" }, root.EnumerateObject().Select(p => p.Name).ToHashSet());
        Assert.Equal("hostInfo", root.GetProperty("type").GetString());

        var payload = root.GetProperty("payload");
        var pkeys = payload.EnumerateObject().Select(p => p.Name).ToHashSet();
        Assert.Equal(new HashSet<string> { "os", "machine", "adapter", "qpcFreq", "hostVersion" }, pkeys);
        Assert.Equal("raw", payload.GetProperty("adapter").GetString());
    }

    [Fact]
    public void FocusEnvelope_MatchesTsShape()
    {
        var env = new FocusEnvelope { Payload = new FocusPayload { Focused = true } };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(env, ContactFrameJson.Options));
        var root = doc.RootElement;

        Assert.Equal("focus", root.GetProperty("type").GetString());
        Assert.True(root.GetProperty("payload").GetProperty("focused").GetBoolean());
    }

    [Fact]
    public void PageToHostMessage_Deserializes()
    {
        const string json = "{\"v\":1,\"type\":\"ready\",\"payload\":{}}";
        var msg = JsonSerializer.Deserialize<PageToHostMessage>(json, ContactFrameJson.Options);
        Assert.NotNull(msg);
        Assert.Equal(1, msg!.V);
        Assert.Equal("ready", msg.Type);
    }

    [Fact]
    public void HostInfoPayload_OmitsNullFields()
    {
        var env = new HostInfoEnvelope { Payload = new HostInfoPayload { Adapter = "pointer" } };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(env, ContactFrameJson.Options));
        var payload = doc.RootElement.GetProperty("payload");
        Assert.Equal(new HashSet<string> { "adapter" }, payload.EnumerateObject().Select(p => p.Name).ToHashSet());
    }
}
