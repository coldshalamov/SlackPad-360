using SlackPad.Host.Contracts;
using SlackPad.Host.Core;
using Xunit;
using static SlackPad.Host.Tests.Fixtures;

namespace SlackPad.Host.Tests;

public class MetricsEngineTests
{
    [Fact]
    public void FixtureStream_ProducesExpectedMetrics()
    {
        var frames = LoadJsonl("synthetic-session.jsonl");
        var m = MetricsEngine.Compute(frames, attemptedClicks: 0, osHijackEvents: 0);

        Assert.Equal(6, m.FrameCount);
        Assert.Equal(0.02, m.DualPlantStableS, 3);       // dual span t=10..30 -> 20ms
        Assert.Equal(2, m.LiftEdges);                     // c2 then c1, each sole in its frame
        Assert.Equal(1.0, m.LiftIndependentFraction, 3);  // both temporally separated
        Assert.Equal(0, m.GapFrames);
        Assert.Equal(0.0, m.IdThrashRate, 3);
        Assert.Equal(0, m.ClickEdges);
        Assert.Equal(10.0, m.FrameDtP50Ms, 3);
        Assert.Equal(10.0, m.FrameDtP95Ms, 3);
    }

    [Fact]
    public void DualPlant_LongestContinuousBothTipSpan()
    {
        var frames = new List<ContactFrame>();
        for (int t = 0; t <= 600; t += 100)
        {
            frames.Add(Frame(t / 100, t, new[] { Tip(1, 0.4), Tip(2, 0.6) }));
        }
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(0.6, m.DualPlantStableS, 3);
    }

    [Fact]
    public void DualPlant_ResetsOnBreak_KeepsLongestSpan()
    {
        // 300ms dual, break, then 100ms dual -> longest is 0.3s.
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1), Tip(2) }),
            Frame(1, 100, new[] { Tip(1), Tip(2) }),
            Frame(2, 200, new[] { Tip(1), Tip(2) }),
            Frame(3, 300, new[] { Tip(1), Tip(2) }),
            Frame(4, 400, new[] { Tip(1) }),               // break
            Frame(5, 500, new[] { Tip(1), Tip(2) }),
            Frame(6, 600, new[] { Tip(1), Tip(2) }),
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(0.3, m.DualPlantStableS, 3);
    }

    [Fact]
    public void IdThrash_CountsReassignmentWhileHeld()
    {
        // Contact count stays 2, but id 2 -> id 3 (reassignment). 1 minute held for a clean rate.
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1), Tip(2) }),
            Frame(1, 60000, new[] { Tip(1), Tip(3) }),
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(1.0, m.IdThrashRate, 3); // 1 reassignment / 1 minute held
    }

    [Fact]
    public void StaggeredLifts_AreIndependent()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1), Tip(2) }),
            Frame(1, 10, new[] { Tip(1) }),        // c2 lifts alone -> independent
            Frame(2, 20, Array.Empty<Contact>()),  // c1 lifts alone -> independent
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(2, m.LiftEdges);
        Assert.Equal(1.0, m.LiftIndependentFraction, 3); // both temporally separated (T5)
    }

    [Fact]
    public void SimultaneousDualLift_IsNotIndependent()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1), Tip(2) }),
            Frame(1, 10, Array.Empty<Contact>()), // both lift same frame
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(2, m.LiftEdges);
        Assert.Equal(0.0, m.LiftIndependentFraction, 3);
    }

    [Fact]
    public void GapFrame_CountsDropoutThatReappears_NotACleanLift()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1) }),
            Frame(1, 10, Array.Empty<Contact>()), // c1 vanishes...
            Frame(2, 20, new[] { Tip(1) }),        // ...and reappears -> dropout, not a lift
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(1, m.GapFrames);
        Assert.Equal(0, m.LiftEdges);
    }

    [Fact]
    public void Vanish_WithoutReappear_IsALiftNotAGap()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1) }),
            Frame(1, 10, Array.Empty<Contact>()),
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        Assert.Equal(0, m.GapFrames);
        Assert.Equal(1, m.LiftEdges);
    }

    [Fact]
    public void ClickEdges_CountRisingEdges_AndRate()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1) }, primary: false),
            Frame(1, 10, new[] { Tip(1) }, primary: true),  // rising edge
            Frame(2, 20, new[] { Tip(1) }, primary: true),  // held, no edge
            Frame(3, 30, new[] { Tip(1) }, primary: false),
            Frame(4, 40, new[] { Tip(1) }, primary: true),  // rising edge
        };
        var m = MetricsEngine.Compute(frames, attemptedClicks: 4, osHijackEvents: 0);
        Assert.Equal(2, m.ClickEdges);
        Assert.Equal(0.5, m.ClickEdgeDetectRate, 3);
    }

    [Fact]
    public void FrameDt_Percentiles()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1) }),
            Frame(1, 10, new[] { Tip(1) }),
            Frame(2, 30, new[] { Tip(1) }),
            Frame(3, 60, new[] { Tip(1) }),
            Frame(4, 100, new[] { Tip(1) }),
        };
        var m = MetricsEngine.Compute(frames, 0, 0); // dts = [10,20,30,40]
        Assert.Equal(20.0, m.FrameDtP50Ms, 3);
        Assert.Equal(40.0, m.FrameDtP95Ms, 3);
    }

    [Fact]
    public void PalmContacts_IgnoredFromTipCounts()
    {
        var frames = new List<ContactFrame>
        {
            Frame(0, 0, new[] { Tip(1), Tip(2, confidence: false) }),
            Frame(1, 100, new[] { Tip(1), Tip(2, confidence: false) }),
        };
        var m = MetricsEngine.Compute(frames, 0, 0);
        // Only one confident tip -> never a dual plant.
        Assert.Equal(0.0, m.DualPlantStableS, 3);
    }

    [Fact]
    public void EmptyStream_ReturnsZeroedResult()
    {
        var m = MetricsEngine.Compute(new List<ContactFrame>(), 5, 2);
        Assert.Equal(0, m.FrameCount);
        Assert.Equal(0.0, m.DualPlantStableS);
        Assert.Equal(5, m.AttemptedClicks);
        Assert.Equal(2, m.OsHijackEvents);
    }

    // ---- status thresholds (input-platform spec §3.6) ----

    [Fact]
    public void Status_Accept_WhenAllCriteriaMet()
    {
        var r = new MetricsResult
        {
            DualPlantStableS = 60,
            ClickEdges = 9,
            AttemptedClicks = 10,
            ClickEdgeDetectRate = 0.9,
            LiftEdges = 5,
            LiftIndependentFraction = 1.0,
            IdThrashRate = 1.0,
            OsHijackEvents = 0,
            FrameCount = 500,
        };
        Assert.Equal("accept", r.Status);
        Assert.True(r.LiftIndependence);
    }

    [Fact]
    public void Status_Reject_WhenClickNeverObserved()
    {
        var r = new MetricsResult
        {
            DualPlantStableS = 0,
            ClickEdges = 0,
            AttemptedClicks = 10,
            LiftEdges = 3,
            LiftIndependentFraction = 1.0,
            IdThrashRate = 0,
            OsHijackEvents = 0,
            FrameCount = 100,
        };
        Assert.Equal("reject", r.Status);
    }

    [Fact]
    public void Status_Reject_WhenOsHijackOccurs()
    {
        var r = new MetricsResult
        {
            DualPlantStableS = 60,
            ClickEdges = 10,
            AttemptedClicks = 10,
            ClickEdgeDetectRate = 1.0,
            LiftEdges = 5,
            LiftIndependentFraction = 1.0,
            IdThrashRate = 0,
            OsHijackEvents = 2,
            FrameCount = 500,
        };
        Assert.Equal("reject", r.Status);
    }

    [Fact]
    public void Status_Pause_WhenPartialButNoGrossFailure()
    {
        var r = new MetricsResult
        {
            DualPlantStableS = 30, // short of 60
            ClickEdges = 9,
            AttemptedClicks = 10,
            ClickEdgeDetectRate = 0.9,
            LiftEdges = 5,
            LiftIndependentFraction = 1.0,
            IdThrashRate = 1.0,
            OsHijackEvents = 0,
            FrameCount = 200,
        };
        Assert.Equal("pause", r.Status);
    }
}
