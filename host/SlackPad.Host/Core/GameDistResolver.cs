namespace SlackPad.Host.Core;

/// <summary>
/// Locates the built game's dist folder (the directory containing index.html and
/// assets/) that WebView2 maps to the <c>slackpad.game</c> virtual host.
///
/// Resolution order (first hit wins):
///   1. <c>GameDist/</c> next to the executable — the packaged layout produced by
///      scripts/package-win.mjs.
///   2. <c>&lt;repoRoot&gt;/packages/game/dist</c> — the dev layout, found by walking
///      up from the executable directory.
///
/// Pure: the filesystem is injected as a predicate so the ordering logic is unit
/// testable without a real build on disk.
/// </summary>
public static class GameDistResolver
{
    /// <summary>Max parent directories to walk up looking for packages/game/dist.</summary>
    private const int MaxWalkUp = 10;

    /// <summary>
    /// Resolve using the given executable directory and a "does this directory
    /// exist" predicate. Returns the dist folder path, or null when neither the
    /// packaged nor the dev layout is present.
    /// </summary>
    public static string? Resolve(string exeDir, Func<string, bool> dirExists)
    {
        ArgumentNullException.ThrowIfNull(exeDir);
        ArgumentNullException.ThrowIfNull(dirExists);

        // 1. Packaged: GameDist next to the exe.
        string packaged = Path.Combine(exeDir, "GameDist");
        if (dirExists(packaged))
        {
            return packaged;
        }

        // 2. Dev: walk up to <repoRoot>/packages/game/dist.
        var dir = new DirectoryInfo(exeDir);
        for (int i = 0; i < MaxWalkUp && dir != null; i++)
        {
            string candidate = Path.Combine(dir.FullName, "packages", "game", "dist");
            if (dirExists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }

        return null;
    }

    /// <summary>Resolve against the real filesystem from the running executable.</summary>
    public static string? Resolve() =>
        Resolve(AppContext.BaseDirectory, Directory.Exists);
}
