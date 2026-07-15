using System.Text;
using System.Text.Json;

namespace SlackPad.Host.Core;

/// <summary>
/// Validates and persists a full page-authored replay/control trace. The root is
/// injected so tests never write player documents and the filename is generated
/// locally rather than trusted from WebView content.
/// </summary>
public static class ControlTraceExporter
{
    public const int MaxUtf8Bytes = 16 * 1024 * 1024;

    public static string Export(
        string rootDirectory,
        JsonElement trace,
        string? label,
        DateTimeOffset capturedAt)
    {
        Validate(trace);
        string json = JsonSerializer.Serialize(trace, new JsonSerializerOptions { WriteIndented = true });
        if (Encoding.UTF8.GetByteCount(json) > MaxUtf8Bytes)
        {
            throw new InvalidDataException("Control trace exceeds the 16 MiB export limit.");
        }

        string root = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(root);
        string safeLabel = SafeLabel(label);
        string filename = $"control-{capturedAt:yyyyMMdd-HHmmss}-{safeLabel}.json";
        string path = Path.GetFullPath(Path.Combine(root, filename));
        if (!string.Equals(Path.GetDirectoryName(path), root, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Control trace destination escaped its export root.");
        }
        File.WriteAllText(path, json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        return path;
    }

    private static void Validate(JsonElement trace)
    {
        if (trace.ValueKind != JsonValueKind.Object ||
            !trace.TryGetProperty("header", out var header) || header.ValueKind != JsonValueKind.Object ||
            !trace.TryGetProperty("controlTrace", out var control) || control.ValueKind != JsonValueKind.Object ||
            !control.TryGetProperty("version", out var version) ||
            version.ValueKind != JsonValueKind.Number ||
            !version.TryGetInt32(out int versionNumber) || versionNumber != 2 ||
            !control.TryGetProperty("events", out var events) || events.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException("Expected a full SessionTrace with ControlTraceV2 events.");
        }
    }

    private static string SafeLabel(string? label)
    {
        var b = new StringBuilder(32);
        bool dashPending = false;
        foreach (char c in label ?? "attempt")
        {
            if (char.IsAsciiLetterOrDigit(c))
            {
                if (dashPending && b.Length > 0 && b.Length < 32) b.Append('-');
                if (b.Length < 32) b.Append(char.ToLowerInvariant(c));
                dashPending = false;
            }
            else
            {
                dashPending = true;
            }
            if (b.Length >= 32) break;
        }
        return b.Length == 0 ? "attempt" : b.ToString().TrimEnd('-');
    }
}
