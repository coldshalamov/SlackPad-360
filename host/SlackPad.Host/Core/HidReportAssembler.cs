namespace SlackPad.Host.Core;

/// <summary>A single parsed HID contact (already normalized to [0,1] by the adapter).</summary>
public readonly record struct HidContact(int Id, bool Tip, double X, double Y, bool Confidence);

/// <summary>
/// One parsed HID input report. In PTP "hybrid" mode a single logical touch frame
/// spans several of these: the FIRST report carries the true <see cref="ContactCount"/>
/// and (typically) some of the contacts; FOLLOW-ON reports of the same
/// <see cref="ScanTime"/> carry <see cref="ContactCount"/> == 0 and the remaining contacts.
/// </summary>
public sealed class HidReport
{
    public long ScanTime { get; set; }

    /// <summary>Report-level Contact Count usage. True total in the first report, 0 in follow-ons.</summary>
    public int ContactCount { get; set; }

    /// <summary>Report-level Button 1 (primary click).</summary>
    public bool Primary { get; set; }

    public List<HidContact> Contacts { get; set; } = new();
}

/// <summary>One assembled logical touch frame (all contacts for a single scan time).</summary>
public sealed class LogicalContactFrame
{
    public long ScanTime { get; set; }

    /// <summary>The true contact count reported by the frame's first report.</summary>
    public int ContactCountRaw { get; set; }

    public bool Primary { get; set; }

    public List<HidContact> Contacts { get; set; } = new();
}

/// <summary>
/// Reassembles multi-report PTP frames (hybrid mode) into one <see cref="LogicalContactFrame"/>
/// per scan time. Pure and hardware-free so it is unit-testable against synthetic reports.
///
/// Rules (see input-platform spec §1.3 pitfall note):
///  1. A report while NOT accumulating starts a new frame. If it has ContactCount==0 AND no
///     contacts it is a genuine "all fingers up" frame and is emitted immediately.
///  2. The frame's expected total is the max of the first report's ContactCount and the
///     number of contacts actually seen (defends against a mislabeled count).
///  3. Follow-on reports (same scan time, ContactCount==0, carrying contacts) accumulate until
///     the accumulated count reaches the expected total, then the frame is emitted.
///  4. If the scan time changes while a frame is still incomplete, the stale partial frame is
///     flushed (defensive — handles a dropped follow-on report) before the new frame begins.
/// </summary>
public sealed class HidReportAssembler
{
    private bool _accumulating;
    private long _frameScanTime;
    private int _expectedCount;
    private bool _primary;
    private readonly List<HidContact> _accumulated = new();

    /// <summary>
    /// Feed one parsed report. Returns zero, one, or (defensively) more completed logical frames.
    /// </summary>
    public IReadOnlyList<LogicalContactFrame> Process(HidReport report)
    {
        var results = new List<LogicalContactFrame>();

        // Rule 4: scan time advanced while mid-frame -> flush the stale partial.
        if (_accumulating && report.ScanTime != _frameScanTime)
        {
            results.Add(FlushCurrent());
        }

        if (!_accumulating)
        {
            // Rule 1: genuine zero-contact frame.
            if (report.ContactCount == 0 && report.Contacts.Count == 0)
            {
                results.Add(new LogicalContactFrame
                {
                    ScanTime = report.ScanTime,
                    ContactCountRaw = 0,
                    Primary = report.Primary,
                    Contacts = new List<HidContact>(),
                });
                return results;
            }

            // Begin a new accumulation.
            _accumulating = true;
            _frameScanTime = report.ScanTime;
            _expectedCount = Math.Max(report.ContactCount, report.Contacts.Count);
            _primary = false;
            _accumulated.Clear();
        }

        // Accumulate this report's contribution.
        _accumulated.AddRange(report.Contacts);
        _primary |= report.Primary;
        if (report.ContactCount > _expectedCount)
        {
            _expectedCount = report.ContactCount;
        }

        // Rule 3: frame complete.
        if (_accumulated.Count >= _expectedCount)
        {
            results.Add(FlushCurrent());
        }

        return results;
    }

    /// <summary>Force-emit any in-progress partial frame (e.g. on stream stop). Returns null if none.</summary>
    public LogicalContactFrame? Flush() => _accumulating ? FlushCurrent() : null;

    private LogicalContactFrame FlushCurrent()
    {
        var frame = new LogicalContactFrame
        {
            ScanTime = _frameScanTime,
            ContactCountRaw = _expectedCount,
            Primary = _primary,
            Contacts = new List<HidContact>(_accumulated),
        };
        _accumulating = false;
        _accumulated.Clear();
        _expectedCount = 0;
        _primary = false;
        return frame;
    }
}
