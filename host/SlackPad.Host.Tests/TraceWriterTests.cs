using System.Text.Json;
using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using Xunit;
using static SlackPad.Host.Tests.Fixtures;

namespace SlackPad.Host.Tests;

public class TraceWriterTests
{
    private static string TempDir()
    {
        string dir = Path.Combine(Path.GetTempPath(), "slackpad-tests-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Fact]
    public void Trace_WritesSessionHeaderThenFrames()
    {
        string dir = TempDir();
        try
        {
            string path = Path.Combine(dir, "traces", "P0-B-test.jsonl");
            var header = new SessionHeader
            {
                Machine = "PC",
                Os = "Windows",
                Adapter = "P0-B",
                StartedAt = "2026-07-11T00:00:00Z",
                QpcFreq = 10_000_000,
            };

            using (var w = TraceWriter.Start(path, header))
            {
                w.Write(Frame(0, 0, new[] { Tip(1) }));
                w.Write(Frame(1, 10, new[] { Tip(1), Tip(2) }));
            }

            var lines = File.ReadAllLines(path);
            Assert.Equal(3, lines.Length);

            using var headerDoc = JsonDocument.Parse(lines[0]);
            Assert.Equal("session", headerDoc.RootElement.GetProperty("type").GetString());
            Assert.Equal("P0-B", headerDoc.RootElement.GetProperty("adapter").GetString());
            Assert.True(headerDoc.RootElement.TryGetProperty("qpcFreq", out _));

            using var frameDoc = JsonDocument.Parse(lines[1]);
            Assert.Equal(1, frameDoc.RootElement.GetProperty("schemaVersion").GetInt32());
            Assert.Equal(0, frameDoc.RootElement.GetProperty("frameId").GetInt64());
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void MetricsJson_HasExactSection41Keys()
    {
        var result = new MetricsResult
        {
            DualPlantStableS = 61.2,
            ClickEdges = 18,
            AttemptedClicks = 20,
            ClickEdgeDetectRate = 0.9,
            LiftEdges = 10,
            LiftIndependentFraction = 1.0,
            IdThrashRate = 0.5,
            FrameDtP50Ms = 8,
            FrameDtP95Ms = 12,
            GapFrames = 0,
            OsHijackEvents = 0,
            FrameCount = 6000,
        };

        var json = G1Report.Serialize(G1Report.Build(result, "raw", new[] { "traces/P0-B-x.jsonl" }));
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        foreach (var key in new[] { "gate", "status", "adapter", "dualPlantStableS", "clickEdges", "liftIndependence", "artifacts" })
        {
            Assert.True(root.TryGetProperty(key, out _), $"metrics.json missing §4.1 key {key}");
        }

        Assert.Equal("G1", root.GetProperty("gate").GetString());
        Assert.Equal("accept", root.GetProperty("status").GetString());
        Assert.Equal("raw", root.GetProperty("adapter").GetString());
        Assert.Equal(JsonValueKind.True, root.GetProperty("liftIndependence").ValueKind); // boolean per §4.1
        Assert.Equal(JsonValueKind.Array, root.GetProperty("artifacts").ValueKind);
        Assert.Equal(18, root.GetProperty("clickEdges").GetInt32());
    }

    [Fact]
    public void MetricsJson_Write_CreatesFile_InTempOnly()
    {
        string dir = TempDir();
        try
        {
            string path = Path.Combine(dir, "metrics.json");
            var frames = LoadJsonl("synthetic-session.jsonl");
            var result = MetricsEngine.Compute(frames, 0, 0);

            G1Report.Write(path, result, "raw", new[] { "traces/x.jsonl" });

            Assert.True(File.Exists(path));
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            Assert.Equal("G1", doc.RootElement.GetProperty("gate").GetString());
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
