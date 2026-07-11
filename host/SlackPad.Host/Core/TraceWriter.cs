using System.Text.Json;
using System.Text.Json.Serialization;
using SlackPad.Host.Contracts;

namespace SlackPad.Host.Core;

/// <summary>Session header line written first in every JSONL trace.</summary>
public sealed class SessionHeader
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "session";

    [JsonPropertyName("machine")]
    public string Machine { get; set; } = "";

    [JsonPropertyName("os")]
    public string Os { get; set; } = "";

    /// <summary>"P0-A" (pointer) or "P0-B" (raw).</summary>
    [JsonPropertyName("adapter")]
    public string Adapter { get; set; } = "";

    [JsonPropertyName("startedAt")]
    public string StartedAt { get; set; } = "";

    [JsonPropertyName("qpcFreq")]
    public long QpcFreq { get; set; }
}

/// <summary>
/// Appends a JSONL trace: one session-header line, then one ContactFrame per line.
/// File I/O only (no Win32), and the destination path is injected — tests point it at
/// a temp dir and it never writes to the evidence directory on its own.
/// </summary>
public sealed class TraceWriter : IDisposable
{
    private readonly StreamWriter _writer;
    private bool _disposed;

    public string FilePath { get; }
    public int FramesWritten { get; private set; }

    private TraceWriter(string filePath, StreamWriter writer)
    {
        FilePath = filePath;
        _writer = writer;
    }

    /// <summary>Open <paramref name="filePath"/> (creating parent dirs) and write the header line.</summary>
    public static TraceWriter Start(string filePath, SessionHeader header)
    {
        string? dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var writer = new StreamWriter(filePath, append: false) { AutoFlush = false };
        writer.WriteLine(JsonSerializer.Serialize(header, ContactFrameJson.Options));
        return new TraceWriter(filePath, writer);
    }

    public void Write(ContactFrame frame)
    {
        if (_disposed)
        {
            return;
        }
        _writer.WriteLine(ContactFrameJson.Serialize(frame));
        FramesWritten++;
    }

    public void Flush() => _writer.Flush();

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }
        _disposed = true;
        _writer.Flush();
        _writer.Dispose();
    }
}

/// <summary>metrics.json DTO per final-observability §4.1 (exact keys + extra diagnostics).</summary>
public sealed class G1MetricsJson
{
    [JsonPropertyName("gate")]
    public string Gate { get; set; } = "G1";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "pause";

    /// <summary>"raw" or "pointer".</summary>
    [JsonPropertyName("adapter")]
    public string Adapter { get; set; } = "";

    [JsonPropertyName("dualPlantStableS")]
    public double DualPlantStableS { get; set; }

    [JsonPropertyName("clickEdges")]
    public int ClickEdges { get; set; }

    [JsonPropertyName("liftIndependence")]
    public bool LiftIndependence { get; set; }

    [JsonPropertyName("artifacts")]
    public List<string> Artifacts { get; set; } = new();

    // --- extra diagnostics (allowed; additionalProperties) ---
    [JsonPropertyName("idThrashRate")]
    public double IdThrashRate { get; set; }

    [JsonPropertyName("liftIndependentFraction")]
    public double LiftIndependentFraction { get; set; }

    [JsonPropertyName("clickEdgeDetectRate")]
    public double ClickEdgeDetectRate { get; set; }

    [JsonPropertyName("attemptedClicks")]
    public int AttemptedClicks { get; set; }

    [JsonPropertyName("frameDtP50Ms")]
    public double FrameDtP50Ms { get; set; }

    [JsonPropertyName("frameDtP95Ms")]
    public double FrameDtP95Ms { get; set; }

    [JsonPropertyName("gapFrames")]
    public int GapFrames { get; set; }

    [JsonPropertyName("osHijackEvents")]
    public int OsHijackEvents { get; set; }

    [JsonPropertyName("frameCount")]
    public int FrameCount { get; set; }
}

/// <summary>Builds and writes the G1 metrics.json from a computed MetricsResult.</summary>
public static class G1Report
{
    private static readonly JsonSerializerOptions PrettyOptions = new()
    {
        WriteIndented = true,
    };

    public static G1MetricsJson Build(MetricsResult r, string adapterTag, IEnumerable<string> artifacts) =>
        new()
        {
            Gate = "G1",
            Status = r.Status,
            Adapter = adapterTag,
            DualPlantStableS = Math.Round(r.DualPlantStableS, 3),
            ClickEdges = r.ClickEdges,
            LiftIndependence = r.LiftIndependence,
            Artifacts = artifacts.ToList(),
            IdThrashRate = Math.Round(r.IdThrashRate, 3),
            LiftIndependentFraction = Math.Round(r.LiftIndependentFraction, 3),
            ClickEdgeDetectRate = Math.Round(r.ClickEdgeDetectRate, 3),
            AttemptedClicks = r.AttemptedClicks,
            FrameDtP50Ms = Math.Round(r.FrameDtP50Ms, 3),
            FrameDtP95Ms = Math.Round(r.FrameDtP95Ms, 3),
            GapFrames = r.GapFrames,
            OsHijackEvents = r.OsHijackEvents,
            FrameCount = r.FrameCount,
        };

    public static string Serialize(G1MetricsJson metrics) =>
        JsonSerializer.Serialize(metrics, PrettyOptions);

    /// <summary>Write metrics.json to <paramref name="path"/> (creating parent dirs).</summary>
    public static void Write(string path, MetricsResult r, string adapterTag, IEnumerable<string> artifacts)
    {
        string? dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }
        File.WriteAllText(path, Serialize(Build(r, adapterTag, artifacts)));
    }
}
