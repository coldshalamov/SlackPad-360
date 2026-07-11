using SlackPad.Host.Core;
using Xunit;

namespace SlackPad.Host.Tests;

/// <summary>Hybrid multi-report frame assembly (input-platform spec §1.3 pitfall).</summary>
public class HidReportAssemblerTests
{
    private static HidContact C(int id) => new(id, true, 0.5, 0.5, true);

    [Fact]
    public void ParallelMode_SingleReport_TwoContacts_EmitsOneFrame()
    {
        var a = new HidReportAssembler();
        var report = new HidReport { ScanTime = 100, ContactCount = 2, Contacts = { C(1), C(2) } };

        var frames = a.Process(report);

        Assert.Single(frames);
        Assert.Equal(2, frames[0].Contacts.Count);
        Assert.Equal(100, frames[0].ScanTime);
        Assert.Equal(2, frames[0].ContactCountRaw);
    }

    [Fact]
    public void HybridMode_TwoReports_SameScanTime_AccumulateIntoOneFrame()
    {
        var a = new HidReportAssembler();

        // First report carries the true count (2) plus one contact.
        var r1 = new HidReport { ScanTime = 100, ContactCount = 2, Contacts = { C(1) } };
        // Follow-on carries count 0 and the remaining contact.
        var r2 = new HidReport { ScanTime = 100, ContactCount = 0, Contacts = { C(2) } };

        var out1 = a.Process(r1);
        var out2 = a.Process(r2);

        Assert.Empty(out1); // incomplete after first report
        Assert.Single(out2);
        Assert.Equal(2, out2[0].Contacts.Count);
        Assert.Contains(out2[0].Contacts, c => c.Id == 1);
        Assert.Contains(out2[0].Contacts, c => c.Id == 2);
    }

    [Fact]
    public void HybridMode_ThreeContacts_SpanThreeReports()
    {
        var a = new HidReportAssembler();
        var r1 = new HidReport { ScanTime = 7, ContactCount = 3, Contacts = { C(1) } };
        var r2 = new HidReport { ScanTime = 7, ContactCount = 0, Contacts = { C(2) } };
        var r3 = new HidReport { ScanTime = 7, ContactCount = 0, Contacts = { C(3) } };

        Assert.Empty(a.Process(r1));
        Assert.Empty(a.Process(r2));
        var done = a.Process(r3);

        Assert.Single(done);
        Assert.Equal(3, done[0].Contacts.Count);
    }

    [Fact]
    public void GenuineZeroContactFrame_EmitsImmediately()
    {
        var a = new HidReportAssembler();
        var report = new HidReport { ScanTime = 200, ContactCount = 0, Contacts = { } };

        var frames = a.Process(report);

        Assert.Single(frames);
        Assert.Empty(frames[0].Contacts);
        Assert.Equal(0, frames[0].ContactCountRaw);
    }

    [Fact]
    public void ScanTimeChange_FlushesStalePartialFrame()
    {
        var a = new HidReportAssembler();
        // Incomplete frame: expects 3 contacts but only 1 arrives.
        var r1 = new HidReport { ScanTime = 100, ContactCount = 3, Contacts = { C(1) } };
        // A follow-on for the missing contacts is dropped; a NEW scan time arrives.
        var r2 = new HidReport { ScanTime = 200, ContactCount = 2, Contacts = { C(5) } };

        Assert.Empty(a.Process(r1));
        var flushed = a.Process(r2);

        // The stale partial (scan 100, 1 contact) is flushed before the new frame begins.
        Assert.Single(flushed);
        Assert.Equal(100, flushed[0].ScanTime);
        Assert.Single(flushed[0].Contacts);
        Assert.Equal(1, flushed[0].Contacts[0].Id);
    }

    [Fact]
    public void PrimaryButton_IsOredAcrossReportsOfAFrame()
    {
        var a = new HidReportAssembler();
        var r1 = new HidReport { ScanTime = 100, ContactCount = 2, Primary = false, Contacts = { C(1) } };
        var r2 = new HidReport { ScanTime = 100, ContactCount = 0, Primary = true, Contacts = { C(2) } };

        a.Process(r1);
        var done = a.Process(r2);

        Assert.Single(done);
        Assert.True(done[0].Primary);
    }

    [Fact]
    public void Flush_EmitsInProgressPartial()
    {
        var a = new HidReportAssembler();
        a.Process(new HidReport { ScanTime = 5, ContactCount = 2, Contacts = { C(1) } });

        var partial = a.Flush();

        Assert.NotNull(partial);
        Assert.Single(partial!.Contacts);
        Assert.Null(a.Flush()); // nothing left
    }
}
