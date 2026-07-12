using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>Command-line → launch-mode parsing (Program dispatch).</summary>
public class GameLaunchOptionsTests
{
    [Fact]
    public void Default_IsGameMode_NoDevTools()
    {
        var o = GameLaunchOptions.Parse(Array.Empty<string>());
        Assert.Equal(HostMode.Game, o.Mode);
        Assert.False(o.DevTools);
    }

    [Fact]
    public void Null_IsGameMode()
    {
        var o = GameLaunchOptions.Parse(null);
        Assert.Equal(HostMode.Game, o.Mode);
        Assert.False(o.DevTools);
    }

    [Fact]
    public void Spike_SelectsSpikeMode()
    {
        Assert.Equal(HostMode.Spike, GameLaunchOptions.Parse(new[] { "--spike" }).Mode);
    }

    [Fact]
    public void Spike_IsCaseInsensitive()
    {
        Assert.Equal(HostMode.Spike, GameLaunchOptions.Parse(new[] { "--SPIKE" }).Mode);
    }

    [Fact]
    public void DevTools_SetsFlag_StaysGameMode()
    {
        var o = GameLaunchOptions.Parse(new[] { "--devtools" });
        Assert.Equal(HostMode.Game, o.Mode);
        Assert.True(o.DevTools);
    }

    [Fact]
    public void UnknownArgs_Ignored()
    {
        var o = GameLaunchOptions.Parse(new[] { "--wat", "foo", "-x" });
        Assert.Equal(HostMode.Game, o.Mode);
        Assert.False(o.DevTools);
    }

    [Fact]
    public void CombinedFlags_OrderIndependent()
    {
        var o = GameLaunchOptions.Parse(new[] { "--devtools", "--spike" });
        Assert.Equal(HostMode.Spike, o.Mode);
        Assert.True(o.DevTools);
    }
}
