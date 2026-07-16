using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

public class HostButtonFramePumpTests
{
    [Fact]
    public void StationaryContacts_StillEmitPressAndReleaseEdges()
    {
        var pump = new HostButtonFramePump();
        pump.Enqueue(Fixtures.Frame(
            id: 40,
            tMs: 10,
            contacts: new[] { Fixtures.Tip(10, 0.4, 0.5), Fixtures.Tip(11, 0.6, 0.5) }));

        var initial = pump.Drain(new HostButtonSample(false, false, false, false), nowMs: 11);
        Assert.Single(initial);
        Assert.False(initial[0].Buttons.Primary);

        // A physical click can start and finish between raw contact reports. The
        // host must replay both edges using the last live two-contact snapshot.
        var tap = pump.Drain(new HostButtonSample(false, false, true, false), nowMs: 12);

        Assert.Equal(2, tap.Count);
        Assert.True(tap[0].Buttons.Primary);
        Assert.False(tap[0].Buttons.Secondary);
        Assert.False(tap[1].Buttons.Primary);
        Assert.Equal(2, tap[0].Contacts.Count);
        Assert.Equal(new[] { 10, 11 }, tap[0].Contacts.Select(c => c.Id));
        Assert.True(tap[0].FrameId > initial[0].FrameId);
        Assert.True(tap[1].FrameId > tap[0].FrameId);
    }

    [Fact]
    public void HeldButtonWithoutAPendingRawFrame_EmitsCurrentStateSnapshot()
    {
        var pump = new HostButtonFramePump();
        pump.Enqueue(Fixtures.Frame(
            id: 0,
            tMs: 10,
            contacts: new[] { Fixtures.Tip(1), Fixtures.Tip(2) }));
        _ = pump.Drain(new HostButtonSample(false, false, false, false), nowMs: 11);

        var press = pump.Drain(new HostButtonSample(true, false, true, false), nowMs: 12);

        var frame = Assert.Single(press);
        Assert.True(frame.Buttons.Primary);
        Assert.False(frame.Buttons.Secondary);
        Assert.Equal(2, frame.Contacts.Count);
        Assert.Equal(12, frame.TPerfMs);
    }

    [Fact]
    public void ShortTapBetweenPolls_WithFreshRawFrame_PreservesPressAndRelease()
    {
        var pump = PrimedTwoContactPump();

        // A 120 Hz touchpad normally has a fresh contact report waiting on
        // every 8 ms UI tick, even when the two contacts have not moved. The
        // physical click completed between polls, so only the Windows low bit
        // carries the button press by the time Drain runs.
        pump.Enqueue(Fixtures.Frame(
            id: 41,
            tMs: 12,
            contacts: new[] { Fixtures.Tip(10, 0.4, 0.5), Fixtures.Tip(11, 0.6, 0.5) }));

        var frames = pump.Drain(new HostButtonSample(false, false, true, false), nowMs: 13);

        Assert.Contains(frames, frame => frame.Buttons.Primary);
        Assert.False(frames[^1].Buttons.Primary);
        Assert.All(frames, frame => Assert.Equal(2, frame.Contacts.Count));
    }

    [Fact]
    public void RepeatedShortClicks_WithStationaryFreshReports_EmitOneRisingEdgeEach()
    {
        var pump = PrimedTwoContactPump();
        var all = new List<ContactFrame>();

        for (int click = 0; click < 3; click++)
        {
            pump.Enqueue(Fixtures.Frame(
                id: 50 + click,
                tMs: 20 + click,
                contacts: new[] { Fixtures.Tip(10, 0.4, 0.5), Fixtures.Tip(11, 0.6, 0.5) }));
            all.AddRange(pump.Drain(
                new HostButtonSample(false, false, true, false),
                nowMs: 20.5 + click));
        }

        int risingEdges = 0;
        bool previous = false;
        foreach (ContactFrame frame in all)
        {
            if (!previous && frame.Buttons.Primary)
            {
                risingEdges++;
            }
            previous = frame.Buttons.Primary;
        }

        Assert.Equal(3, risingEdges);
        Assert.False(previous);
        Assert.True(all.Zip(all.Skip(1), (a, b) => a.FrameId < b.FrameId).All(increasing => increasing));
    }

    [Fact]
    public void ReleaseThenAnotherTapBetweenPolls_DoesNotLoseTheSecondClick()
    {
        var pump = PrimedTwoContactPump();
        var all = new List<ContactFrame>();

        // First click is still held when sampled.
        all.AddRange(pump.Drain(
            new HostButtonSample(true, false, true, false),
            nowMs: 12));

        // Before the next sample: release click 1, then press+release click 2.
        // Current state is up; the low bit proves a new press occurred.
        all.AddRange(pump.Drain(
            new HostButtonSample(false, false, true, false),
            nowMs: 13));

        int risingEdges = 0;
        bool previous = false;
        foreach (ContactFrame frame in all)
        {
            if (!previous && frame.Buttons.Primary)
            {
                risingEdges++;
            }
            previous = frame.Buttons.Primary;
        }

        Assert.Equal(2, risingEdges);
        Assert.False(previous);
    }

    [Fact]
    public void FreshOneTipDropout_CoincidentHeldLeftClick_UsesLastConfirmedTwoTipStanceForEdge()
    {
        var pump = PrimedTwoContactPump();
        pump.Enqueue(Fixtures.Frame(
            id: 41,
            tMs: 12,
            contacts: new[] { Fixtures.Tip(10, 0.4, 0.5) }));

        var frames = pump.Drain(
            new HostButtonSample(true, false, true, false),
            nowMs: 13);

        // Preserve the truthful raw dropout, but do not let its one-tip frame
        // consume the LMB rising edge before the stable stance snapshot.
        Assert.Contains(frames, frame => frame.Contacts.Count == 1 && !frame.Buttons.Primary);
        var edge = Assert.Single(frames, frame => frame.Buttons.Primary);
        Assert.Equal(2, edge.Contacts.Count(contact => contact.Tip && contact.Confidence));
        Assert.False(edge.Buttons.Secondary);
    }

    [Fact]
    public void FreshZeroTipDropout_CoincidentShortRightClick_UsesLastConfirmedTwoTipStanceForEdge()
    {
        var pump = PrimedTwoContactPump();
        pump.Enqueue(Fixtures.Frame(id: 41, tMs: 12, contacts: Array.Empty<Contact>()));

        var frames = pump.Drain(
            new HostButtonSample(false, false, false, true),
            nowMs: 13);

        var edge = Assert.Single(frames, frame => frame.Buttons.Secondary);
        Assert.Equal(2, edge.Contacts.Count(contact => contact.Tip && contact.Confidence));
        Assert.False(edge.Buttons.Primary);
        Assert.False(frames[^1].Buttons.Secondary);
    }

    [Fact]
    public void ExpiredOneTipDropout_DoesNotResurrectOldTwoTipStanceForClick()
    {
        var pump = PrimedTwoContactPump();
        pump.Enqueue(Fixtures.Frame(
            id: 41,
            tMs: 50,
            contacts: new[] { Fixtures.Tip(10, 0.4, 0.5) }));

        var frames = pump.Drain(
            new HostButtonSample(true, false, true, false),
            nowMs: 51);

        Assert.DoesNotContain(
            frames,
            frame => frame.Buttons.Primary &&
                frame.Contacts.Count(contact => contact.Tip && contact.Confidence) >= 2);
    }

    [Fact]
    public void StationaryCtrlHeldAndReleased_EmitAuxiliaryEdges()
    {
        var pump = PrimedTwoContactPump();

        var held = pump.Drain(SampleWithAuxiliary(auxiliaryDown: true), nowMs: 12);
        var pressed = Assert.Single(held);
        Assert.True(pressed.Buttons.Auxiliary);
        Assert.Equal(2, pressed.Contacts.Count);

        var released = pump.Drain(SampleWithAuxiliary(auxiliaryDown: false), nowMs: 13);
        var up = Assert.Single(released);
        Assert.False(up.Buttons.Auxiliary);
        Assert.Equal(2, up.Contacts.Count);
        Assert.True(up.FrameId > pressed.FrameId);
    }

    [Fact]
    public void ForegroundGatedCtrlFalse_DoesNotEmitAuxiliaryPress()
    {
        var pump = PrimedTwoContactPump();

        // GameForm supplies false when Ctrl is held outside the foreground
        // SlackPad window. The pump must not invent an auxiliary edge.
        var frames = pump.Drain(SampleWithAuxiliary(auxiliaryDown: false), nowMs: 12);

        Assert.Empty(frames);
    }

    [Fact]
    public void FocusLoss_ForgetsRetainedContactsBeforeAnyLaterClick()
    {
        var pump = PrimedTwoContactPump();

        pump.ResetForFocusLoss();
        var frames = pump.Drain(
            new HostButtonSample(true, false, true, false),
            nowMs: 50);

        Assert.Empty(frames);

        pump.Enqueue(Fixtures.Frame(
            id: 80,
            tMs: 51,
            contacts: new[] { Fixtures.Tip(20, 0.35, 0.5), Fixtures.Tip(21, 0.65, 0.5) }));
        var fresh = pump.Drain(
            new HostButtonSample(false, false, false, false),
            nowMs: 52);

        Assert.Single(fresh);
        Assert.Equal(new[] { 20, 21 }, fresh[0].Contacts.Select(contact => contact.Id));
        Assert.False(fresh[0].Buttons.Primary);
    }

    [Fact]
    public void FocusLoss_BackgroundInputAndRefocusClick_DoNotProduceGameplayEdge()
    {
        var pump = PrimedTwoContactPump();

        pump.ResetForFocusLoss();

        // Model both inputs that may race after WM_ACTIVATE deactivation: a raw
        // background report and the left click Windows uses to refocus the form.
        pump.Enqueue(Fixtures.Frame(
            id: 80,
            tMs: 50,
            contacts: new[] { Fixtures.Tip(20, 0.35, 0.5), Fixtures.Tip(21, 0.65, 0.5) },
            primary: true));
        pump.ResetForFocusGain(new HostButtonSample(true, false, true, false));

        // The first legitimate foreground contact report can arrive while the
        // refocus click is still physically held. It must remain a neutral
        // stance, and releasing that click must not synthesize an edge either.
        pump.Enqueue(Fixtures.Frame(
            id: 81,
            tMs: 51,
            contacts: new[] { Fixtures.Tip(30, 0.4, 0.5), Fixtures.Tip(31, 0.6, 0.5) }));
        var held = pump.Drain(
            new HostButtonSample(true, false, false, false),
            nowMs: 52);
        var released = pump.Drain(
            new HostButtonSample(false, false, false, false),
            nowMs: 53);

        Assert.Single(held);
        Assert.Equal(new[] { 30, 31 }, held[0].Contacts.Select(contact => contact.Id));
        Assert.DoesNotContain(held.Concat(released), frame => frame.Buttons.Primary);

        // A later deliberate foreground click remains playable.
        var intentional = pump.Drain(
            new HostButtonSample(true, false, true, false),
            nowMs: 54);
        Assert.Contains(intentional, frame => frame.Buttons.Primary);
    }

    private static HostButtonFramePump PrimedTwoContactPump()
    {
        var pump = new HostButtonFramePump();
        pump.Enqueue(Fixtures.Frame(
            id: 40,
            tMs: 10,
            contacts: new[] { Fixtures.Tip(10, 0.4, 0.5), Fixtures.Tip(11, 0.6, 0.5) }));
        _ = pump.Drain(new HostButtonSample(false, false, false, false), nowMs: 11);
        return pump;
    }

    private static HostButtonSample SampleWithAuxiliary(bool auxiliaryDown)
    {
        var constructor = typeof(HostButtonSample).GetConstructor(new[]
        {
            typeof(bool), typeof(bool), typeof(bool), typeof(bool), typeof(bool),
        });
        Assert.NotNull(constructor);
        return (HostButtonSample)constructor.Invoke(new object[]
        {
            false, false, false, false, auxiliaryDown,
        });
    }
}
