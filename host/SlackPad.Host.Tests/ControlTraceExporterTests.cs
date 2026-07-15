using System.Text.Json;
using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

public class ControlTraceExporterTests
{
    private static string TempDir()
    {
        string dir = Path.Combine(Path.GetTempPath(), "slackpad-control-trace-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Fact]
    public void Export_WritesValidatedControlTraceV2UnderInjectedRoot()
    {
        string dir = TempDir();
        try
        {
            using var doc = JsonDocument.Parse("""
                {"header":{"replayVersion":1},"frames":[],"checkpoints":[],
                 "controlTrace":{"version":2,"profile":{"assistPreset":"classic"},"events":[]}}
                """);

            string path = ControlTraceExporter.Export(
                dir,
                doc.RootElement,
                "kickflip / clean",
                new DateTimeOffset(2026, 7, 14, 18, 30, 0, TimeSpan.Zero));

            Assert.True(File.Exists(path));
            Assert.Equal(dir, Path.GetDirectoryName(path));
            Assert.Contains("kickflip-clean", Path.GetFileName(path));
            using var saved = JsonDocument.Parse(File.ReadAllText(path));
            Assert.Equal(2, saved.RootElement.GetProperty("controlTrace").GetProperty("version").GetInt32());
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"header\":{},\"controlTrace\":{\"version\":1,\"events\":[]}}")]
    [InlineData("{\"header\":{},\"controlTrace\":{\"version\":\"2\",\"events\":[]}}")]
    [InlineData("{\"header\":{},\"controlTrace\":{\"version\":2}}")]
    public void Export_RejectsMalformedOrWrongVersionTrace(string json)
    {
        string dir = TempDir();
        try
        {
            using var doc = JsonDocument.Parse(json);
            Assert.Throws<InvalidDataException>(() =>
                ControlTraceExporter.Export(dir, doc.RootElement, "attempt", DateTimeOffset.UtcNow));
            Assert.Empty(Directory.GetFiles(dir));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
