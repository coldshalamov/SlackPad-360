namespace SlackPad.Host.Core;

/// <summary>
/// Locates the repository's <c>testdata/traces</c> corpus directory when the
/// host runs from a repo checkout (play.bat launches
/// host/SlackPad.Host/bin/…/SlackPad.Host.exe). Sprint 02 S5: corpus-targeted
/// trace exports land in the repo so recorded human sessions become permanent
/// deterministic test inputs; packaged/installed builds find no repo and fall
/// back to the Documents export root.
/// </summary>
public static class RepoPaths
{
    /// <summary>Walk up from <paramref name="startDirectory"/> looking for the repo root.</summary>
    public static string? FindCorpusTracesRoot(string startDirectory, int maxLevels = 8)
    {
        var dir = new DirectoryInfo(Path.GetFullPath(startDirectory));
        for (int i = 0; i < maxLevels && dir is not null; i++, dir = dir.Parent)
        {
            // The repo root is the directory holding both the npm workspace
            // manifest and the testdata tree (guards against unrelated
            // package.json files above the checkout).
            if (File.Exists(Path.Combine(dir.FullName, "package.json")) &&
                Directory.Exists(Path.Combine(dir.FullName, "testdata")))
            {
                return Path.Combine(dir.FullName, "testdata", "traces");
            }
        }
        return null;
    }
}
