using SlackPad.Host.Contracts;

namespace SlackPad.Host.Core;

/// <summary>
/// Samples the OS-resolved left/right click and foreground Ctrl state into the
/// ContactFrame stream.
///
/// Trackpad contacts can remain perfectly still while the player clicks. Raw
/// contact reports are therefore not a reliable carrier for a button edge: this
/// pump retains the last live contact snapshot and emits a new frame whenever a
/// left/right edge occurs between raw reports. Outgoing frame ids are generated
/// here so injected snapshots remain monotonic with adapter frames.
/// </summary>
public readonly record struct HostButtonSample(
    bool LeftDown,
    bool RightDown,
    bool LeftPressedSinceLastPoll,
    bool RightPressedSinceLastPoll,
    bool AuxiliaryDown = false);

public sealed class HostButtonFramePump
{
    // Long enough to bridge one missed 60-120 Hz contact report, but shorter
    // than the game's stable-click debounce. This snapshot is only eligible to
    // carry a button edge; it is never emitted as continuing contact state.
    private const double ConfirmedTwoTipEdgeHoldMs = 24;

    private readonly List<ContactFrame> _pending = new();
    private ContactFrame? _lastLiveFrame;
    private ContactFrame? _lastConfirmedTwoTipFrame;
    private long _nextFrameId;
    private bool _hasSample;
    private bool _lastLeftDown;
    private bool _lastRightDown;
    private bool _lastAuxiliaryDown;
    private bool _suppressButtonsUntilReleased;

    /// <summary>
    /// Forget every retained contact/button snapshot when the game loses focus.
    /// Frame ids remain monotonic, but a later click can no longer resurrect a
    /// finger stance that existed before deactivation.
    /// </summary>
    public void ResetForFocusLoss()
    {
        ResetRetainedInput();
        _suppressButtonsUntilReleased = false;
    }

    /// <summary>
    /// Start a fresh foreground input epoch. The activation sample is consumed,
    /// not emitted: its pressed-since-poll bits may belong to the click that
    /// merely refocused the window. Buttons still physically held at activation
    /// remain neutral until they are released once.
    /// </summary>
    public void ResetForFocusGain(HostButtonSample activationSample)
    {
        ResetRetainedInput();
        _suppressButtonsUntilReleased = activationSample.LeftDown ||
            activationSample.RightDown ||
            activationSample.AuxiliaryDown;
    }

    private void ResetRetainedInput()
    {
        _pending.Clear();
        _lastLiveFrame = null;
        _lastConfirmedTwoTipFrame = null;
        _hasSample = false;
        _lastLeftDown = false;
        _lastRightDown = false;
        _lastAuxiliaryDown = false;
    }

    /// <summary>Queue a raw adapter frame without mutating adapter-owned data.</summary>
    public void Enqueue(ContactFrame frame)
    {
        ContactFrame copy = Clone(frame);
        _pending.Add(copy);
        _lastLiveFrame = Clone(copy);
        if (HasTwoValidTips(copy))
        {
            _lastConfirmedTwoTipFrame = Clone(copy);
        }
        if (_pending.Count > 512)
        {
            _pending.RemoveRange(0, _pending.Count - 512);
        }
    }

    /// <summary>
    /// Drain raw frames plus any stationary-button edge snapshots. A completed
    /// tap detected by GetAsyncKeyState's pressed-since-poll bit is replayed as a
    /// down frame followed by the current released state, preserving FootTracker
    /// rising-edge semantics even when the click is shorter than one UI tick.
    /// </summary>
    public IReadOnlyList<ContactFrame> Drain(HostButtonSample sample, double nowMs)
    {
        if (_suppressButtonsUntilReleased)
        {
            bool allReleased = !sample.LeftDown &&
                !sample.RightDown &&
                !sample.AuxiliaryDown;
            sample = new HostButtonSample(false, false, false, false, false);
            if (allReleased)
            {
                _suppressButtonsUntilReleased = false;
            }
        }

        ContactFrameButtons current = HostButtonMerge.Merge(
            sample.LeftDown,
            sample.RightDown,
            sample.AuxiliaryDown);
        var output = new List<ContactFrame>(_pending.Count + 2);
        bool hadPending = _pending.Count > 0;

        bool stateChanged = !_hasSample ||
            sample.LeftDown != _lastLeftDown ||
            sample.RightDown != _lastRightDown ||
            sample.AuxiliaryDown != _lastAuxiliaryDown;
        // If the low bit is set while the button is currently up, a complete
        // press+release occurred since the previous GetAsyncKeyState query.
        // This remains true even when the previous sampled state was down: in
        // that case the player released it and completed another click.
        bool transientLeft = sample.LeftPressedSinceLastPoll && !sample.LeftDown;
        bool transientRight = sample.RightPressedSinceLastPoll && !sample.RightDown;
        bool hasNewButtonPress = (!_lastLeftDown && sample.LeftDown) ||
            (!_lastRightDown && sample.RightDown) ||
            transientLeft ||
            transientRight;
        ContactFrame? confirmedTwoTipSnapshot = FreshConfirmedTwoTipSnapshot(nowMs);
        bool recoverDropoutEdge = hasNewButtonPress &&
            _lastLiveFrame is not null &&
            !HasTwoValidTips(_lastLiveFrame) &&
            confirmedTwoTipSnapshot is not null;

        ContactFrameButtons previous = HostButtonMerge.Merge(
            _lastLeftDown,
            _lastRightDown,
            sample.AuxiliaryDown);

        foreach (ContactFrame frame in _pending)
        {
            // Pending reports predate this sampled edge. Ordinarily merging the
            // current state into them reduces latency. During a fresh one-frame
            // dropout, however, doing so consumes the edge on an invalid stance.
            // Keep every pending report truthful and emit the edge once below.
            output.Add(Emit(frame, recoverDropoutEdge ? previous : current, frame.TPerfMs));
        }
        _pending.Clear();

        bool releaseBeforeTransient = !hadPending &&
            ((_lastLeftDown && !sample.LeftDown) || (_lastRightDown && !sample.RightDown));

        _hasSample = true;
        _lastLeftDown = sample.LeftDown;
        _lastRightDown = sample.RightDown;
        _lastAuxiliaryDown = sample.AuxiliaryDown;

        ContactFrame? edgeSnapshot = recoverDropoutEdge
            ? confirmedTwoTipSnapshot
            : _lastLiveFrame;
        if (edgeSnapshot is { Contacts.Count: > 0 } snapshot)
        {
            if (transientLeft || transientRight)
            {
                if (releaseBeforeTransient)
                {
                    output.Add(Emit(snapshot, current, nowMs));
                }
                ContactFrameButtons pressed = HostButtonMerge.Merge(
                    sample.LeftDown || transientLeft,
                    sample.RightDown || transientRight,
                    sample.AuxiliaryDown);
                output.Add(Emit(snapshot, pressed, nowMs));
                output.Add(Emit(snapshot, current, nowMs));
            }
            else if ((!hadPending || recoverDropoutEdge) && stateChanged)
            {
                output.Add(Emit(snapshot, current, nowMs));
            }
        }

        return output;
    }

    private ContactFrame? FreshConfirmedTwoTipSnapshot(double nowMs)
    {
        if (_lastConfirmedTwoTipFrame is not { } snapshot)
        {
            return null;
        }

        double ageMs = nowMs - snapshot.TPerfMs;
        return ageMs is >= 0 and <= ConfirmedTwoTipEdgeHoldMs
            ? snapshot
            : null;
    }

    private static bool HasTwoValidTips(ContactFrame frame) =>
        frame.Contacts.Count(contact => contact.Tip && contact.Confidence) >= 2;

    private ContactFrame Emit(ContactFrame source, ContactFrameButtons buttons, double tPerfMs) => new()
    {
        SchemaVersion = source.SchemaVersion,
        FrameId = _nextFrameId++,
        TPerfMs = tPerfMs,
        TScanUs = source.TScanUs,
        Source = source.Source,
        Contacts = source.Contacts.Select(Clone).ToList(),
        Buttons = new ContactFrameButtons
        {
            Primary = buttons.Primary,
            Secondary = buttons.Secondary,
            Auxiliary = buttons.Auxiliary,
        },
        Meta = Clone(source.Meta),
    };

    private static ContactFrame Clone(ContactFrame source) => new()
    {
        SchemaVersion = source.SchemaVersion,
        FrameId = source.FrameId,
        TPerfMs = source.TPerfMs,
        TScanUs = source.TScanUs,
        Source = source.Source,
        Contacts = source.Contacts.Select(Clone).ToList(),
        Buttons = new ContactFrameButtons
        {
            Primary = source.Buttons.Primary,
            Secondary = source.Buttons.Secondary,
            Auxiliary = source.Buttons.Auxiliary,
        },
        Meta = Clone(source.Meta),
    };

    private static Contact Clone(Contact source) => new()
    {
        Id = source.Id,
        Tip = source.Tip,
        X = source.X,
        Y = source.Y,
        Confidence = source.Confidence,
        Pressure = source.Pressure,
        Width = source.Width,
        Height = source.Height,
    };

    private static ContactFrameMeta? Clone(ContactFrameMeta? source) => source is null
        ? null
        : new ContactFrameMeta
        {
            DeviceId = source.DeviceId,
            ContactCountRaw = source.ContactCountRaw,
            PhysicalAspectRatio = source.PhysicalAspectRatio,
            Adapter = source.Adapter,
        };
}
