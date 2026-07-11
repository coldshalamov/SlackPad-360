using SlackPad.Host.Contracts;

namespace SlackPad.Host.Core;

/// <summary>Computed G1 metrics plus the derived accept/reject/pause status.</summary>
public sealed class MetricsResult
{
    /// <summary>Longest continuous span (seconds) with >=2 confident tip-true contacts.</summary>
    public double DualPlantStableS { get; init; }

    /// <summary>ID reassignments per minute while contacts are held.</summary>
    public double IdThrashRate { get; init; }

    /// <summary>
    /// Fraction of tip-up edges that were temporally independent (sole lift in their frame,
    /// i.e. staggered per T5 rather than merged/simultaneous per T6), in [0,1].
    /// </summary>
    public double LiftIndependentFraction { get; init; }

    /// <summary>Count of tip-up edges observed.</summary>
    public int LiftEdges { get; init; }

    /// <summary>Detected primary rising edges / attempted clicks, in [0,1]. 0 if no attempts.</summary>
    public double ClickEdgeDetectRate { get; init; }

    /// <summary>Detected primary rising edges (false-&gt;true transitions).</summary>
    public int ClickEdges { get; init; }

    public int AttemptedClicks { get; init; }

    public double FrameDtP50Ms { get; init; }

    public double FrameDtP95Ms { get; init; }

    /// <summary>Frames where a tip-true contact vanished without a tip=false lift edge.</summary>
    public int GapFrames { get; init; }

    /// <summary>Focus-loss events while recording (supplied externally, not frame-derived).</summary>
    public int OsHijackEvents { get; init; }

    public int FrameCount { get; init; }

    /// <summary>
    /// Accept/reject/pause per input-platform spec §3.6. Accept requires ALL of:
    /// dual plant >=60s, click edges >=90% of attempts, staggered lifts independent,
    /// id thrash &lt;=2/min while held, and zero OS hijack events.
    /// </summary>
    public string Status
    {
        get
        {
            bool dualOk = DualPlantStableS >= 60.0;
            bool clickOk = AttemptedClicks > 0 && ClickEdgeDetectRate >= 0.90;
            bool liftOk = LiftEdges > 0 && LiftIndependentFraction >= 0.90;
            bool thrashOk = IdThrashRate <= 2.0;
            bool hijackOk = OsHijackEvents == 0;

            if (dualOk && clickOk && liftOk && thrashOk && hijackOk)
            {
                return "accept";
            }

            // Gross failure signatures -> reject (per §3.6 "Reject adapter").
            bool clickNeverObserved = AttemptedClicks > 0 && ClickEdges == 0;
            bool noIndependentLift = LiftEdges > 0 && LiftIndependentFraction == 0.0;
            bool gestureOnly = FrameCount > 0 && DualPlantStableS < 1.0 && LiftEdges == 0;
            if (clickNeverObserved || noIndependentLift || gestureOnly || OsHijackEvents > 0)
            {
                return "reject";
            }

            // Some criteria met but not all (e.g. a short run) -> needs a longer human run.
            return "pause";
        }
    }

    /// <summary>Boolean form used in metrics.json §4.1 (derived from the fraction threshold).</summary>
    public bool LiftIndependence => LiftEdges > 0 && LiftIndependentFraction >= 0.90;
}

/// <summary>
/// Pure, hardware-free metrics computation over a stream of ContactFrames.
/// Operational definitions are documented per-metric and tests pin those definitions.
/// </summary>
public static class MetricsEngine
{
    private static HashSet<int> TipIds(ContactFrame f) =>
        f.Contacts.Where(c => c.Tip && c.Confidence).Select(c => c.Id).ToHashSet();

    public static MetricsResult Compute(
        IReadOnlyList<ContactFrame> frames,
        int attemptedClicks,
        int osHijackEvents)
    {
        if (frames.Count == 0)
        {
            return new MetricsResult
            {
                AttemptedClicks = attemptedClicks,
                OsHijackEvents = osHijackEvents,
                FrameCount = 0,
            };
        }

        // ---- dual plant stable span (seconds) ----
        double bestDualMs = 0;
        double curDualStartMs = 0;
        bool inDual = false;

        // ---- id thrash: reassignments per minute while held ----
        int reassignments = 0;
        double heldMs = 0;

        // ---- lift edges ----
        int liftEdges = 0;
        int independentLiftEdges = 0;

        // ---- gap frames ----
        int gapFrames = 0;

        // ---- click rising edges ----
        int clickEdges = 0;

        // ---- inter-frame dt ----
        var dts = new List<double>(frames.Count);

        // Precompute the confident tip-true id set per frame so gap detection can look ahead.
        const int GapReappearWindow = 3;
        var tipIdsPerFrame = new HashSet<int>[frames.Count];
        var allIdsPerFrame = new HashSet<int>[frames.Count];
        for (int i = 0; i < frames.Count; i++)
        {
            tipIdsPerFrame[i] = TipIds(frames[i]);
            allIdsPerFrame[i] = frames[i].Contacts.Select(c => c.Id).ToHashSet();
        }

        bool ReappearsSoon(int id, int fromFrame)
        {
            int end = Math.Min(frames.Count - 1, fromFrame + GapReappearWindow);
            for (int j = fromFrame + 1; j <= end; j++)
            {
                if (tipIdsPerFrame[j].Contains(id))
                {
                    return true;
                }
            }
            return false;
        }

        for (int i = 0; i < frames.Count; i++)
        {
            var cur = frames[i];
            int curTips = tipIdsPerFrame[i].Count;

            // dual-plant span accounting (uses timestamps of the frames bounding the span)
            if (curTips >= 2)
            {
                if (!inDual)
                {
                    inDual = true;
                    curDualStartMs = cur.TPerfMs;
                }
                double span = cur.TPerfMs - curDualStartMs;
                if (span > bestDualMs)
                {
                    bestDualMs = span;
                }
            }
            else
            {
                inDual = false;
            }

            if (i == 0)
            {
                continue;
            }

            var prev = frames[i - 1];
            double dt = cur.TPerfMs - prev.TPerfMs;
            dts.Add(dt);

            var prevIds = tipIdsPerFrame[i - 1];
            var curIds = tipIdsPerFrame[i];
            var curAllIds = allIdsPerFrame[i];

            // held time: any confident tip down in current frame.
            if (curIds.Count >= 1)
            {
                heldMs += dt;
            }

            // id thrash: contact count unchanged and non-empty, but the id set differs ->
            // count the ids that appeared without an accompanying plant/lift (count change).
            if (prevIds.Count == curIds.Count && curIds.Count >= 1 && !prevIds.SetEquals(curIds))
            {
                reassignments += curIds.Except(prevIds).Count();
            }

            bool frameHasGap = false;
            int liftsThisFrame = 0;
            foreach (int id in prevIds)
            {
                if (curIds.Contains(id))
                {
                    continue; // still down, no transition
                }

                // A prev tip-true id that is not tip-true now. If it reappears within the
                // reappearance window it is a tracking dropout (gap); otherwise a real lift edge.
                if (!curAllIds.Contains(id) && ReappearsSoon(id, i))
                {
                    frameHasGap = true;
                    continue;
                }

                liftsThisFrame++;
            }

            // Independence is temporal separation (T5 vs T6): a lift is independent iff it is the
            // SOLE tip-up in its frame. Two lifts landing in one frame merged (simultaneous, T6).
            liftEdges += liftsThisFrame;
            if (liftsThisFrame == 1)
            {
                independentLiftEdges++;
            }

            if (frameHasGap)
            {
                gapFrames++;
            }

            // click rising edge.
            if (!prev.Buttons.Primary && cur.Buttons.Primary)
            {
                clickEdges++;
            }
        }

        dts.Sort();
        double p50 = Percentile(dts, 0.50);
        double p95 = Percentile(dts, 0.95);

        double idThrashRate = heldMs > 0 ? reassignments / (heldMs / 60000.0) : 0.0;
        double liftFraction = liftEdges > 0 ? (double)independentLiftEdges / liftEdges : 0.0;
        double clickRate = attemptedClicks > 0 ? (double)clickEdges / attemptedClicks : 0.0;

        return new MetricsResult
        {
            DualPlantStableS = bestDualMs / 1000.0,
            IdThrashRate = idThrashRate,
            LiftIndependentFraction = liftFraction,
            LiftEdges = liftEdges,
            ClickEdgeDetectRate = clickRate,
            ClickEdges = clickEdges,
            AttemptedClicks = attemptedClicks,
            FrameDtP50Ms = p50,
            FrameDtP95Ms = p95,
            GapFrames = gapFrames,
            OsHijackEvents = osHijackEvents,
            FrameCount = frames.Count,
        };
    }

    /// <summary>Nearest-rank percentile over a pre-sorted list. Returns 0 for an empty list.</summary>
    private static double Percentile(List<double> sorted, double q)
    {
        if (sorted.Count == 0)
        {
            return 0.0;
        }
        if (sorted.Count == 1)
        {
            return sorted[0];
        }
        int rank = (int)Math.Ceiling(q * sorted.Count) - 1;
        rank = Math.Clamp(rank, 0, sorted.Count - 1);
        return sorted[rank];
    }
}
