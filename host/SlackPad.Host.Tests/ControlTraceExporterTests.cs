using System.Text.Json;
using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

public class ControlTraceExporterTests
{
    private const string FullProfile = """
        {
          "stance":"regular",
          "padYawOffset":0,
          "swapFeet":false,
          "assistLevel":1,
          "assistPreset":"classic",
          "bothClickMeans":"ollie",
          "kickAttribution":"motionTap",
          "tapToClickIsKick":false,
          "accessibility":{"reducedMotion":false,"highContrastHud":false}
        }
        """;

    private const string FullSimEventV3 = """
        {
          "kind":"sim",
          "step":1,
          "board":{
            "p":{"x":0,"y":0.2,"z":1},
            "q":{"x":0,"y":0,"z":0,"w":1},
            "lv":{"x":0,"y":0,"z":4},
            "av":{"x":0,"y":0.3,"z":0}
          },
          "phase":"ground",
          "intent":null,
          "physics":{
            "version":1,
            "body":{
              "boardMassKg":2.4,
              "riderProxyMassKg":72,
              "centerOfMassLocalM":{"x":0,"y":0,"z":0},
              "inertiaKgM2":{"x":1,"y":1,"z":1}
            },
            "solver":{
              "totalMassKg":74.4,
              "physicsSubsteps":2,
              "internalHz":120,
              "ccdEnabled":true
            },
            "wheelContacts":[{
              "wheel":"frontLeft",
              "grounded":true,
              "point":{"x":-0.11,"y":0,"z":0.32},
              "normal":{"x":0,"y":1,"z":0},
              "normalLoadN":190,
              "suspensionCompressionM":0.008,
              "longitudinalSlipMps":0.02,
              "lateralSlipMps":0.08
            }],
            "assists":[{
              "kind":"stability",
              "active":true,
              "strength":0.25,
              "torqueNm":{"x":0,"y":0,"z":-1.2},
              "torqueImpulseNms":{"x":0,"y":0,"z":-0.02},
              "reason":"classic-ground-stability"
            }],
            "contactImpulses":{"totalNs":8,"supportNs":8,"impactNs":0}
          }
        }
        """;

    private static string TempDir()
    {
        string dir = Path.Combine(Path.GetTempPath(), "slackpad-control-trace-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string ValidTrace(int version, string events = "", string? profile = null) => $$"""
        {
          "header":{
            "replayVersion":1,
            "gameVersion":"0.2.0",
            "rapierVersion":"0.19.3",
            "hz":60,
            "seed":1234,
            "levelId":"flat-dev",
            "createdAt":"2026-07-15T12:00:00.000Z",
            "contactFrameSchema":1
          },
          "frames":[],
          "checkpoints":[],
          "controlTrace":{
            "version":{{version}},
            "profile":{{profile ?? FullProfile}},
            "events":[{{events}}]
          }
        }
        """;

    [Fact]
    public void Export_AcceptsControlTraceV3PhysicsDiagnostics()
    {
        string dir = TempDir();
        try
        {
            using var doc = JsonDocument.Parse(ValidTrace(3, FullSimEventV3));

            string path = ControlTraceExporter.Export(
                dir, doc.RootElement, "physics", DateTimeOffset.UtcNow);

            using var saved = JsonDocument.Parse(File.ReadAllText(path));
            Assert.Equal(3, saved.RootElement.GetProperty("controlTrace").GetProperty("version").GetInt32());
            Assert.Equal(
                2.4,
                saved.RootElement.GetProperty("controlTrace").GetProperty("events")[0]
                    .GetProperty("physics").GetProperty("body").GetProperty("boardMassKg").GetDouble());
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void Export_WritesValidatedControlTraceV2UnderInjectedRoot()
    {
        string dir = TempDir();
        try
        {
            using var doc = JsonDocument.Parse(ValidTrace(2));

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
        AssertRejected(json);
    }

    [Fact]
    public void Export_RejectsPartialProfile()
    {
        AssertRejected(ValidTrace(3, profile: "{\"assistPreset\":\"classic\"}"));
    }

    [Theory]
    [InlineData("{\"kind\":\"sim\",\"step\":1,\"physics\":{\"version\":1}}")]
    [InlineData("{\"kind\":\"sim\",\"step\":1,\"board\":{\"p\":{},\"q\":{\"x\":0,\"y\":0,\"z\":0,\"w\":1},\"lv\":{\"x\":0,\"y\":0,\"z\":0},\"av\":{\"x\":0,\"y\":0,\"z\":0}},\"phase\":\"ground\",\"intent\":null}")]
    [InlineData("{\"kind\":\"sim\",\"step\":1,\"board\":{\"p\":{\"x\":0,\"y\":0,\"z\":0},\"q\":{\"x\":0,\"y\":0,\"z\":0,\"w\":1},\"lv\":{\"x\":0,\"y\":0,\"z\":0},\"av\":{\"x\":0,\"y\":0,\"z\":0}},\"phase\":\"ground\",\"intent\":null,\"physics\":{\"version\":2}}")]
    [InlineData("{\"kind\":\"sim\",\"step\":1,\"board\":{\"p\":{\"x\":0,\"y\":0,\"z\":0},\"q\":{\"x\":0,\"y\":0,\"z\":0,\"w\":1},\"lv\":{\"x\":0,\"y\":0,\"z\":0},\"av\":{\"x\":0,\"y\":0,\"z\":0}},\"phase\":\"ground\",\"intent\":null,\"physics\":{\"version\":1,\"solver\":{\"totalMassKg\":74.4,\"physicsSubsteps\":0,\"internalHz\":120,\"ccdEnabled\":true}}}")]
    public void Export_RejectsPartialOrMalformedSimEvent(string simEvent)
    {
        AssertRejected(ValidTrace(3, simEvent));
    }

    private static void AssertRejected(string json)
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

    [Fact]
    public void Export_CorpusNamingFollowsConventionAndBreaksCollisions()
    {
        string dir = TempDir();
        try
        {
            using var doc = JsonDocument.Parse(ValidTrace(3, FullSimEventV3));
            var stamp = new DateTimeOffset(2026, 7, 16, 18, 30, 15, TimeSpan.Zero);

            string first = ControlTraceExporter.Export(
                dir, doc.RootElement, "Hard Ollie", stamp, corpusNaming: true);
            Assert.Equal("20260716-hard-ollie.trace.json", Path.GetFileName(first));

            string second = ControlTraceExporter.Export(
                dir, doc.RootElement, "Hard Ollie", stamp, corpusNaming: true);
            Assert.Equal("20260716-hard-ollie-183015.trace.json", Path.GetFileName(second));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void RepoPaths_FindsCorpusRootFromNestedBinDirAndNullOtherwise()
    {
        string root = TempDir();
        try
        {
            // Simulated checkout: repo/{package.json, testdata}/host/.../bin
            File.WriteAllText(Path.Combine(root, "package.json"), "{}");
            Directory.CreateDirectory(Path.Combine(root, "testdata"));
            string bin = Path.Combine(root, "host", "SlackPad.Host", "bin", "Release", "net10.0-windows");
            Directory.CreateDirectory(bin);

            string? corpus = RepoPaths.FindCorpusTracesRoot(bin);
            Assert.Equal(Path.Combine(root, "testdata", "traces"), corpus);

            // No repo markers above → null (packaged/installed build).
            string bare = Path.Combine(root, "elsewhere", "deep", "dir");
            Directory.CreateDirectory(bare);
            Assert.Null(RepoPaths.FindCorpusTracesRoot(bare, maxLevels: 2));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
