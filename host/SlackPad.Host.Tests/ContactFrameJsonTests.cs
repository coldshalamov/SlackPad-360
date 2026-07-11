using System.Text.Json;
using SlackPad.Host.Contracts;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>
/// Verifies C# ContactFrame JSON serializes to EXACTLY the camelCase field names and required
/// keys of research/probes/contact-frame.schema.json and packages/shared/src/contactFrame.ts.
/// </summary>
public class ContactFrameJsonTests
{
    private static ContactFrame SampleFrame() => new()
    {
        SchemaVersion = 1,
        FrameId = 42,
        TPerfMs = 123.4,
        TScanUs = null,
        Source = "hardware",
        Contacts = new List<Contact>
        {
            new() { Id = 1, Tip = true, X = 0.4, Y = 0.5, Confidence = true },
        },
        Buttons = new ContactFrameButtons { Primary = false, Secondary = false, Auxiliary = false },
        Meta = new ContactFrameMeta { DeviceId = "dev1", ContactCountRaw = 2, Adapter = "raw" },
    };

    [Fact]
    public void TopLevel_HasExactCamelCaseKeys()
    {
        using var doc = JsonDocument.Parse(ContactFrameJson.Serialize(SampleFrame()));
        var keys = doc.RootElement.EnumerateObject().Select(p => p.Name).ToHashSet();

        var expected = new HashSet<string>
        {
            "schemaVersion", "frameId", "tPerfMs", "tScanUs", "source", "contacts", "buttons", "meta",
        };
        Assert.Equal(expected, keys);
    }

    [Fact]
    public void RequiredSchemaKeys_ArePresent()
    {
        using var doc = JsonDocument.Parse(ContactFrameJson.Serialize(SampleFrame()));
        var root = doc.RootElement;

        foreach (var key in new[] { "schemaVersion", "frameId", "tPerfMs", "source", "contacts", "buttons" })
        {
            Assert.True(root.TryGetProperty(key, out _), $"missing required key {key}");
        }

        var contact = root.GetProperty("contacts")[0];
        foreach (var key in new[] { "id", "tip", "x", "y", "confidence" })
        {
            Assert.True(contact.TryGetProperty(key, out _), $"missing contact key {key}");
        }

        var buttons = root.GetProperty("buttons");
        foreach (var key in new[] { "primary", "secondary", "auxiliary" })
        {
            Assert.True(buttons.TryGetProperty(key, out _), $"missing buttons key {key}");
        }
    }

    [Fact]
    public void Contact_OmitsOptionalNullFields()
    {
        using var doc = JsonDocument.Parse(ContactFrameJson.Serialize(SampleFrame()));
        var contact = doc.RootElement.GetProperty("contacts")[0];
        var keys = contact.EnumerateObject().Select(p => p.Name).ToHashSet();

        Assert.Equal(new HashSet<string> { "id", "tip", "x", "y", "confidence" }, keys);
        Assert.DoesNotContain("pressure", keys);
        Assert.DoesNotContain("width", keys);
        Assert.DoesNotContain("height", keys);
    }

    [Fact]
    public void TScanUs_SerializesAsNull_WhenNull_AndNumber_WhenSet()
    {
        using var docNull = JsonDocument.Parse(ContactFrameJson.Serialize(SampleFrame()));
        Assert.Equal(JsonValueKind.Null, docNull.RootElement.GetProperty("tScanUs").ValueKind);

        var withScan = SampleFrame();
        withScan.TScanUs = 987654;
        using var docSet = JsonDocument.Parse(ContactFrameJson.Serialize(withScan));
        Assert.Equal(987654, docSet.RootElement.GetProperty("tScanUs").GetInt64());
    }

    [Fact]
    public void Meta_CarriesAdapterTag_NotTopLevel()
    {
        using var doc = JsonDocument.Parse(ContactFrameJson.Serialize(SampleFrame()));
        // schema forbids top-level adapter (additionalProperties:false); it must live in meta.
        Assert.False(doc.RootElement.TryGetProperty("adapter", out _));
        var meta = doc.RootElement.GetProperty("meta");
        Assert.Equal("raw", meta.GetProperty("adapter").GetString());
        Assert.Equal(2, meta.GetProperty("contactCountRaw").GetInt32());
        Assert.Equal("dev1", meta.GetProperty("deviceId").GetString());
    }

    [Fact]
    public void Source_IsHardware_NotAdapterName()
    {
        using var doc = JsonDocument.Parse(ContactFrameJson.Serialize(SampleFrame()));
        // .ts enum is hardware|agent|replay|synthetic — never raw/pointer.
        Assert.Equal("hardware", doc.RootElement.GetProperty("source").GetString());
    }

    [Fact]
    public void RoundTrips()
    {
        var original = SampleFrame();
        var back = ContactFrameJson.Deserialize(ContactFrameJson.Serialize(original));
        Assert.NotNull(back);
        Assert.Equal(original.FrameId, back!.FrameId);
        Assert.Equal(original.TPerfMs, back.TPerfMs);
        Assert.Equal(original.Source, back.Source);
        Assert.Single(back.Contacts);
        Assert.Equal(1, back.Contacts[0].Id);
        Assert.True(back.Contacts[0].Tip);
        Assert.Equal("raw", back.Meta!.Adapter);
    }
}
