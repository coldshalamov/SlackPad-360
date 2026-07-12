using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>
/// Button-merge truth table: primary = LEFT mouse, secondary = RIGHT mouse. The
/// HID report-level Button 1 is deliberately not consulted here (it cannot tell
/// L from R), so a right-click-zone press must NOT set primary.
/// </summary>
public class HostButtonMergeTests
{
    [Fact]
    public void NoButtons_AllFalse()
    {
        var b = HostButtonMerge.Merge(leftDown: false, rightDown: false);
        Assert.False(b.Primary);
        Assert.False(b.Secondary);
        Assert.False(b.Auxiliary);
    }

    [Fact]
    public void Left_SetsPrimaryOnly()
    {
        var b = HostButtonMerge.Merge(leftDown: true, rightDown: false);
        Assert.True(b.Primary);
        Assert.False(b.Secondary);
    }

    [Fact]
    public void Right_SetsSecondaryOnly_NeverPrimary()
    {
        var b = HostButtonMerge.Merge(leftDown: false, rightDown: true);
        Assert.False(b.Primary);
        Assert.True(b.Secondary);
    }

    [Fact]
    public void Both_SetBothTrue()
    {
        var b = HostButtonMerge.Merge(leftDown: true, rightDown: true);
        Assert.True(b.Primary);
        Assert.True(b.Secondary);
    }

    [Fact]
    public void Auxiliary_AlwaysFalse()
    {
        Assert.False(HostButtonMerge.Merge(true, true).Auxiliary);
        Assert.False(HostButtonMerge.Merge(false, false).Auxiliary);
    }
}
