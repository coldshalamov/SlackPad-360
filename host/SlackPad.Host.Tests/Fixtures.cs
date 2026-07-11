using SlackPad.Host.Contracts;

namespace SlackPad.Host.Tests;

/// <summary>Helpers for building synthetic ContactFrame streams and loading JSONL fixtures.</summary>
internal static class Fixtures
{
    public static string Dir => Path.Combine(AppContext.BaseDirectory, "fixtures");

    /// <summary>Load a JSONL fixture of ContactFrames (skips any session-header line).</summary>
    public static List<ContactFrame> LoadJsonl(string fileName)
    {
        var frames = new List<ContactFrame>();
        foreach (string line in File.ReadAllLines(Path.Combine(Dir, fileName)))
        {
            if (string.IsNullOrWhiteSpace(line) || line.Contains("\"type\":\"session\""))
            {
                continue;
            }
            var frame = ContactFrameJson.Deserialize(line);
            if (frame != null)
            {
                frames.Add(frame);
            }
        }
        return frames;
    }

    public static ContactFrame Frame(long id, double tMs, Contact[] contacts, bool primary = false, int? countRaw = null) =>
        new()
        {
            FrameId = id,
            TPerfMs = tMs,
            Source = "synthetic",
            Contacts = contacts.ToList(),
            Buttons = new ContactFrameButtons { Primary = primary },
            Meta = new ContactFrameMeta { ContactCountRaw = countRaw ?? contacts.Length, Adapter = "raw" },
        };

    public static Contact Tip(int id, double x = 0.5, double y = 0.5, bool confidence = true) =>
        new() { Id = id, Tip = true, X = x, Y = y, Confidence = confidence };
}
