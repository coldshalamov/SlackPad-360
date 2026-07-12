using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>Dist-folder resolution order: packaged GameDist beats dev walk-up.</summary>
public class GameDistResolverTests
{
    private const string ExeDir = @"C:\app\bin\Release\net10.0-windows";

    [Fact]
    public void PrefersGameDist_NextToExe()
    {
        string expected = Path.Combine(ExeDir, "GameDist");
        // Both layouts present — packaged must win.
        string? result = GameDistResolver.Resolve(
            ExeDir,
            path => path == expected ||
                    path == Path.Combine(@"C:\app", "packages", "game", "dist"));
        Assert.Equal(expected, result);
    }

    [Fact]
    public void FallsBackToDevDist_ByWalkingUp()
    {
        // No GameDist anywhere; a packages/game/dist exists two parents up.
        string devDist = Path.Combine(@"C:\app", "packages", "game", "dist");
        string? result = GameDistResolver.Resolve(ExeDir, path => path == devDist);
        Assert.Equal(devDist, result);
    }

    [Fact]
    public void FindsDevDist_AtRepoRootSeveralLevelsUp()
    {
        string root = @"C:\Users\dev\SlackPad 360";
        string exe = Path.Combine(root, "host", "SlackPad.Host", "bin", "Release", "net10.0-windows");
        string devDist = Path.Combine(root, "packages", "game", "dist");
        string? result = GameDistResolver.Resolve(exe, path => path == devDist);
        Assert.Equal(devDist, result);
    }

    [Fact]
    public void ReturnsNull_WhenNeitherLayoutExists()
    {
        Assert.Null(GameDistResolver.Resolve(ExeDir, _ => false));
    }

    [Fact]
    public void GameDist_WinsEvenWhenDevDistIsCloser()
    {
        // A stray packages/game/dist sits right beside the exe, but GameDist (the
        // packaged marker) is checked first and must take precedence.
        string gameDist = Path.Combine(ExeDir, "GameDist");
        string closeDevDist = Path.Combine(ExeDir, "packages", "game", "dist");
        string? result = GameDistResolver.Resolve(
            ExeDir, path => path == gameDist || path == closeDevDist);
        Assert.Equal(gameDist, result);
    }
}
