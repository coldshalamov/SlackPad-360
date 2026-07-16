using System.Text;
using System.Text.Json;

namespace SlackPad.Host.Core;

/// <summary>
/// Validates and persists a full page-authored replay/control trace. The root is
/// injected so tests never write player documents and the filename is generated
/// locally rather than trusted from WebView content.
/// </summary>
public static class ControlTraceExporter
{
    public const int MaxUtf8Bytes = 16 * 1024 * 1024;

    public static string Export(
        string rootDirectory,
        JsonElement trace,
        string? label,
        DateTimeOffset capturedAt,
        bool corpusNaming = false)
    {
        Validate(trace);
        string json = JsonSerializer.Serialize(trace, new JsonSerializerOptions { WriteIndented = true });
        if (Encoding.UTF8.GetByteCount(json) > MaxUtf8Bytes)
        {
            throw new InvalidDataException("Control trace exceeds the 16 MiB export limit.");
        }

        string root = Path.GetFullPath(rootDirectory);
        Directory.CreateDirectory(root);
        string safeLabel = SafeLabel(label);
        // Corpus files follow testdata/traces/README.md: YYYYMMDD-<label>.trace.json
        // (time-of-day suffix only to break a same-day same-label collision).
        string filename = corpusNaming
            ? $"{capturedAt:yyyyMMdd}-{safeLabel}.trace.json"
            : $"control-{capturedAt:yyyyMMdd-HHmmss}-{safeLabel}.json";
        string path = Path.GetFullPath(Path.Combine(root, filename));
        if (corpusNaming && File.Exists(path))
        {
            filename = $"{capturedAt:yyyyMMdd}-{safeLabel}-{capturedAt:HHmmss}.trace.json";
            path = Path.GetFullPath(Path.Combine(root, filename));
        }
        if (!string.Equals(Path.GetDirectoryName(path), root, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Control trace destination escaped its export root.");
        }
        File.WriteAllText(path, json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        return path;
    }

    private static void Validate(JsonElement trace)
    {
        if (trace.ValueKind != JsonValueKind.Object ||
            !trace.TryGetProperty("header", out var header) || header.ValueKind != JsonValueKind.Object ||
            !IsCompleteHeader(header) ||
            !trace.TryGetProperty("frames", out var frames) || frames.ValueKind != JsonValueKind.Array ||
            !trace.TryGetProperty("checkpoints", out var checkpoints) || checkpoints.ValueKind != JsonValueKind.Array ||
            !trace.TryGetProperty("controlTrace", out var control) || control.ValueKind != JsonValueKind.Object ||
            !control.TryGetProperty("version", out var version) ||
            version.ValueKind != JsonValueKind.Number ||
            !version.TryGetInt32(out int versionNumber) || (versionNumber != 2 && versionNumber != 3) ||
            !control.TryGetProperty("profile", out var profile) || !IsCompleteProfile(profile) ||
            !control.TryGetProperty("events", out var events) || events.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException("Expected a full SessionTrace with ControlTraceV2 or V3 events.");
        }

        foreach (JsonElement entry in frames.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object ||
                !HasNonNegativeInteger(entry, "step") ||
                !entry.TryGetProperty("frame", out JsonElement frame) ||
                !IsValidContactFrame(frame))
            {
                throw new InvalidDataException("Session trace contains an incomplete replay frame.");
            }
        }

        foreach (JsonElement checkpoint in checkpoints.EnumerateArray())
        {
            if (checkpoint.ValueKind != JsonValueKind.Object ||
                !HasNonNegativeInteger(checkpoint, "step") ||
                !HasString(checkpoint, "hash"))
            {
                throw new InvalidDataException("Session trace contains an incomplete replay checkpoint.");
            }
        }

        foreach (JsonElement entry in events.EnumerateArray())
        {
            if (!IsValidEvent(entry, versionNumber))
            {
                throw new InvalidDataException("Control trace contains an incomplete or unsupported event.");
            }
        }
    }

    private static bool IsCompleteHeader(JsonElement header) =>
        HasInt(header, "replayVersion", 1) &&
        HasString(header, "gameVersion") &&
        HasString(header, "rapierVersion") &&
        HasFiniteNumber(header, "hz") &&
        HasFiniteNumber(header, "seed") &&
        HasString(header, "levelId") &&
        HasString(header, "createdAt") &&
        HasInt(header, "contactFrameSchema", 1) &&
        (!header.TryGetProperty("profile", out JsonElement profile) || IsCompleteProfile(profile));

    private static bool IsCompleteProfile(JsonElement profile)
    {
        if (profile.ValueKind != JsonValueKind.Object ||
            !HasEnumString(profile, "stance", "regular", "goofy") ||
            !HasFiniteNumber(profile, "padYawOffset") ||
            !HasBoolean(profile, "swapFeet") ||
            !HasInt(profile, "assistLevel", 0, 1, 2) ||
            !HasEnumString(profile, "bothClickMeans", "ignore", "push", "ollie") ||
            !HasEnumString(profile, "kickAttribution", "motionTap", "buttonSide", "plantMask") ||
            !HasBoolean(profile, "tapToClickIsKick") ||
            !profile.TryGetProperty("accessibility", out JsonElement accessibility) ||
            accessibility.ValueKind != JsonValueKind.Object ||
            !HasBoolean(accessibility, "reducedMotion") ||
            !HasBoolean(accessibility, "highContrastHud"))
        {
            return false;
        }
        return !profile.TryGetProperty("assistPreset", out JsonElement preset) ||
            (preset.ValueKind == JsonValueKind.String &&
             preset.GetString() is "experienced" or "classic" or "streamlined");
    }

    private static bool IsValidEvent(JsonElement entry, int version)
    {
        if (entry.ValueKind != JsonValueKind.Object ||
            !entry.TryGetProperty("kind", out JsonElement kindElement) ||
            kindElement.ValueKind != JsonValueKind.String ||
            !entry.TryGetProperty("step", out JsonElement step) ||
            !step.TryGetInt64(out long stepValue) || stepValue < 0)
        {
            return false;
        }

        string? kind = kindElement.GetString();
        bool valid = kind switch
        {
            "contact" => entry.TryGetProperty("frame", out JsonElement frame) && IsValidContactFrame(frame),
            "control" => IsValidControlEvent(entry),
            "intent" => entry.TryGetProperty("intent", out JsonElement intent) && IsValidIntent(intent),
            "sim" => IsValidSimEvent(entry, version),
            "render" => IsValidRenderEvent(entry),
            "outcome" => IsValidOutcomeEvent(entry),
            _ => false,
        };
        return valid;
    }

    private static bool IsValidControlEvent(JsonElement entry)
    {
        if (!entry.TryGetProperty("samples", out JsonElement samples) ||
            samples.ValueKind != JsonValueKind.Array ||
            !entry.TryGetProperty("feet", out JsonElement feet) || !IsValidFeet(feet) ||
            !entry.TryGetProperty("clickEdges", out JsonElement clickEdges) ||
            clickEdges.ValueKind != JsonValueKind.Array ||
            !HasManeuverPhase(entry, "recognizerPhase") ||
            !entry.TryGetProperty("intent", out JsonElement intent) || !IsValidNullableIntent(intent))
        {
            return false;
        }

        foreach (JsonElement sample in samples.EnumerateArray())
        {
            if (sample.ValueKind != JsonValueKind.Object ||
                !HasNonNegativeInteger(sample, "frameId") ||
                !HasFiniteNumber(sample, "tPerfMs") ||
                !HasNonNegativeFiniteNumber(sample, "dtSeconds") ||
                !sample.TryGetProperty("state", out JsonElement state) || !IsValidFeet(state))
            {
                return false;
            }
        }

        foreach (JsonElement edge in clickEdges.EnumerateArray())
        {
            if (edge.ValueKind != JsonValueKind.Object ||
                !HasEnumString(edge, "button", "primary", "secondary") ||
                !HasEnumString(edge, "mask", "nose", "tail", "both", "none") ||
                !HasOptionalEnumString(edge, "source", "button", "motionTap") ||
                !HasOptionalEnumString(edge, "tapRole", "nose", "tail") ||
                !HasOptionalNonNegativeFiniteNumber(edge, "tapDurationMs") ||
                !HasOptionalNonNegativeFiniteNumber(edge, "tapDistance"))
            {
                return false;
            }
        }
        return true;
    }

    private static bool IsValidSimEvent(JsonElement entry, int version)
    {
        if (!entry.TryGetProperty("board", out JsonElement board) || !IsValidBoard(board) ||
            !HasManeuverPhase(entry, "phase") ||
            !entry.TryGetProperty("intent", out JsonElement intent) || !IsValidNullableIntent(intent))
        {
            return false;
        }

        if (version != 3 || !entry.TryGetProperty("physics", out JsonElement physics))
        {
            return true;
        }
        return IsValidPhysicsObservation(physics);
    }

    private static bool IsValidRenderEvent(JsonElement entry)
    {
        if (!HasFiniteNumber(entry, "tPerfMs") || !HasNonNegativeFiniteNumber(entry, "frameMs"))
        {
            return false;
        }
        return !entry.TryGetProperty("camera", out JsonElement camera) ||
            (camera.ValueKind == JsonValueKind.Object &&
             camera.TryGetProperty("p", out JsonElement p) && IsVec3(p) &&
             camera.TryGetProperty("target", out JsonElement target) && IsVec3(target));
    }

    private static bool IsValidOutcomeEvent(JsonElement entry) =>
        HasEnumString(entry, "type", "trickCompleted", "bail", "grindCompleted", "grindExit", "respawn") &&
        HasObject(entry, "payload");

    private static bool IsValidBoard(JsonElement board) =>
        board.ValueKind == JsonValueKind.Object &&
        board.TryGetProperty("p", out JsonElement p) && IsVec3(p) &&
        board.TryGetProperty("q", out JsonElement q) && IsQuat(q) &&
        board.TryGetProperty("lv", out JsonElement lv) && IsVec3(lv) &&
        board.TryGetProperty("av", out JsonElement av) && IsVec3(av);

    private static bool IsValidFeet(JsonElement feet)
    {
        if (feet.ValueKind != JsonValueKind.Object ||
            !feet.TryGetProperty("nose", out JsonElement nose) || !IsValidFoot(nose, "nose") ||
            !feet.TryGetProperty("tail", out JsonElement tail) || !IsValidFoot(tail, "tail") ||
            !feet.TryGetProperty("segment", out JsonElement segment) || !IsValidFootSegment(segment) ||
            !HasBoolean(feet, "bothPlanted") || !HasNonNegativeInteger(feet, "plantCount"))
        {
            return false;
        }
        return !feet.TryGetProperty("accelerating", out JsonElement accelerating) ||
            accelerating.ValueKind is JsonValueKind.True or JsonValueKind.False;
    }

    private static bool IsValidFoot(JsonElement foot, string role) =>
        foot.ValueKind == JsonValueKind.Object &&
        HasEnumString(foot, "role", role) &&
        HasBoolean(foot, "planted") &&
        foot.TryGetProperty("pos", out JsonElement pos) && IsVec2(pos) &&
        foot.TryGetProperty("vel", out JsonElement vel) && IsVec2(vel) &&
        foot.TryGetProperty("offsetFromRest", out JsonElement offset) && IsVec2(offset) &&
        foot.TryGetProperty("contactId", out JsonElement contactId) &&
        (contactId.ValueKind == JsonValueKind.Null || TryGetNonNegativeInteger(contactId));

    private static bool IsValidFootSegment(JsonElement segment) =>
        segment.ValueKind == JsonValueKind.Object &&
        HasBoolean(segment, "valid") &&
        HasFiniteNumber(segment, "angle") &&
        HasFiniteNumber(segment, "angleFromRest") &&
        HasFiniteNumber(segment, "angVel") &&
        segment.TryGetProperty("midpoint", out JsonElement midpoint) && IsVec2(midpoint) &&
        segment.TryGetProperty("midpointOffsetFromRest", out JsonElement midpointOffset) && IsVec2(midpointOffset) &&
        segment.TryGetProperty("midpointVel", out JsonElement midpointVel) && IsVec2(midpointVel) &&
        HasFiniteNumber(segment, "lengthRatio");

    private static bool IsValidNullableIntent(JsonElement intent) =>
        intent.ValueKind == JsonValueKind.Null || IsValidIntent(intent);

    private static bool IsValidIntent(JsonElement intent)
    {
        if (intent.ValueKind != JsonValueKind.Object ||
            !HasInt(intent, "version", 1) ||
            !HasString(intent, "attemptId") ||
            !HasEnumString(intent, "popSide", "tail", "nose") ||
            !HasEnumString(intent, "base", "ollie", "nollie") ||
            !HasEnumString(intent, "family", "ollie", "flip", "shuv") ||
            !HasEnumString(intent, "direction", "none", "heelside", "toeside", "frontside", "backside") ||
            !HasEnumString(intent, "label", "ollie", "nollie", "kickflip", "heelflip", "fs-shuv", "bs-shuv") ||
            !HasFiniteNumber(intent, "gestureSpeed") ||
            !HasFiniteNumber(intent, "gestureAccuracy") ||
            !HasFiniteNumber(intent, "confidence") ||
            !HasBoolean(intent, "fallback") ||
            !HasEnumString(intent, "stance", "regular", "goofy") ||
            !intent.TryGetProperty("source", out JsonElement source) ||
            source.ValueKind != JsonValueKind.Object ||
            !HasNonNegativeInteger(source, "popStep") ||
            !source.TryGetProperty("recognizedStep", out JsonElement recognizedStep) ||
            (recognizedStep.ValueKind != JsonValueKind.Null && !TryGetNonNegativeInteger(recognizedStep)) ||
            !HasOptionalFiniteNumber(source, "popTPerfMs") ||
            !HasOptionalFiniteNumber(source, "recognizedTPerfMs"))
        {
            return false;
        }
        return true;
    }

    private static bool IsValidContactFrame(JsonElement frame)
    {
        if (frame.ValueKind != JsonValueKind.Object ||
            !HasInt(frame, "schemaVersion", 1) ||
            !HasNonNegativeInteger(frame, "frameId") ||
            !HasFiniteNumber(frame, "tPerfMs") ||
            !HasOptionalNullableInteger(frame, "tScanUs") ||
            !HasEnumString(frame, "source", "hardware", "agent", "replay", "synthetic") ||
            !frame.TryGetProperty("contacts", out JsonElement contacts) ||
            contacts.ValueKind != JsonValueKind.Array || contacts.GetArrayLength() > 5 ||
            !frame.TryGetProperty("buttons", out JsonElement buttons) ||
            buttons.ValueKind != JsonValueKind.Object ||
            !HasBoolean(buttons, "primary") || !HasBoolean(buttons, "secondary") ||
            !HasBoolean(buttons, "auxiliary"))
        {
            return false;
        }

        foreach (JsonElement contact in contacts.EnumerateArray())
        {
            if (contact.ValueKind != JsonValueKind.Object ||
                !HasNonNegativeInteger(contact, "id") ||
                !HasBoolean(contact, "tip") ||
                !HasNumberInRange(contact, "x", 0, 1) ||
                !HasNumberInRange(contact, "y", 0, 1) ||
                !HasBoolean(contact, "confidence") ||
                !HasOptionalNullableNumberInRange(contact, "pressure", 0, 1) ||
                !HasOptionalNullableNonNegativeFiniteNumber(contact, "width") ||
                !HasOptionalNullableNonNegativeFiniteNumber(contact, "height"))
            {
                return false;
            }
        }
        return !frame.TryGetProperty("meta", out JsonElement meta) ||
            (meta.ValueKind == JsonValueKind.Object &&
             HasOptionalNumberInRange(meta, "physicalAspectRatio", 0.25, 4));
    }

    private static bool IsValidPhysicsObservation(JsonElement physics)
    {
        if (physics.ValueKind != JsonValueKind.Object || !HasInt(physics, "version", 1))
        {
            return false;
        }

        if (physics.TryGetProperty("body", out JsonElement body) && !IsValidPhysicsBody(body))
        {
            return false;
        }
        if (physics.TryGetProperty("solver", out JsonElement solver) && !IsValidSolverObservation(solver))
        {
            return false;
        }
        if (physics.TryGetProperty("wheelContacts", out JsonElement wheels))
        {
            if (wheels.ValueKind != JsonValueKind.Array) return false;
            foreach (JsonElement wheel in wheels.EnumerateArray())
            {
                if (!IsValidWheelObservation(wheel)) return false;
            }
        }
        if (physics.TryGetProperty("assists", out JsonElement assists))
        {
            if (assists.ValueKind != JsonValueKind.Array) return false;
            foreach (JsonElement assist in assists.EnumerateArray())
            {
                if (!IsValidAssistObservation(assist)) return false;
            }
        }
        if (physics.TryGetProperty("contactImpulses", out JsonElement impulses) &&
            !IsValidContactImpulseObservation(impulses))
        {
            return false;
        }
        return true;
    }

    private static bool IsValidPhysicsBody(JsonElement body) =>
        body.ValueKind == JsonValueKind.Object &&
        HasPositiveFiniteNumber(body, "boardMassKg") &&
        HasOptionalNonNegativeFiniteNumber(body, "riderProxyMassKg") &&
        body.TryGetProperty("centerOfMassLocalM", out JsonElement centerOfMass) && IsVec3(centerOfMass) &&
        (!body.TryGetProperty("inertiaKgM2", out JsonElement inertia) || IsVec3(inertia));

    private static bool IsValidSolverObservation(JsonElement solver) =>
        solver.ValueKind == JsonValueKind.Object &&
        HasPositiveFiniteNumber(solver, "totalMassKg") &&
        solver.TryGetProperty("physicsSubsteps", out JsonElement substeps) &&
        substeps.TryGetInt32(out int substepCount) && substepCount > 0 &&
        HasPositiveFiniteNumber(solver, "internalHz") &&
        HasBoolean(solver, "ccdEnabled");

    private static bool IsValidContactImpulseObservation(JsonElement impulses) =>
        impulses.ValueKind == JsonValueKind.Object &&
        HasNonNegativeFiniteNumber(impulses, "totalNs") &&
        HasNonNegativeFiniteNumber(impulses, "supportNs") &&
        HasNonNegativeFiniteNumber(impulses, "impactNs");

    private static bool IsValidWheelObservation(JsonElement wheel) =>
        wheel.ValueKind == JsonValueKind.Object &&
        HasEnumString(wheel, "wheel", "frontLeft", "frontRight", "rearLeft", "rearRight") &&
        HasBoolean(wheel, "grounded") &&
        (!wheel.TryGetProperty("point", out JsonElement point) || IsVec3(point)) &&
        (!wheel.TryGetProperty("normal", out JsonElement normal) || IsVec3(normal)) &&
        HasNonNegativeFiniteNumber(wheel, "normalLoadN") &&
        HasNonNegativeFiniteNumber(wheel, "suspensionCompressionM") &&
        HasFiniteNumber(wheel, "longitudinalSlipMps") &&
        HasFiniteNumber(wheel, "lateralSlipMps");

    private static bool IsValidAssistObservation(JsonElement assist) =>
        assist.ValueKind == JsonValueKind.Object &&
        HasEnumString(assist, "kind", "steering", "stability", "pop", "air-control", "catch", "landing", "transition", "grind") &&
        HasBoolean(assist, "active") &&
        HasNumberInRange(assist, "strength", 0, 1) &&
        (!assist.TryGetProperty("forceN", out JsonElement force) || IsVec3(force)) &&
        (!assist.TryGetProperty("torqueNm", out JsonElement torque) || IsVec3(torque)) &&
        (!assist.TryGetProperty("impulseNs", out JsonElement impulse) || IsVec3(impulse)) &&
        (!assist.TryGetProperty("torqueImpulseNms", out JsonElement torqueImpulse) || IsVec3(torqueImpulse)) &&
        (!assist.TryGetProperty("reason", out JsonElement reason) || reason.ValueKind == JsonValueKind.String);

    private static bool IsVec2(JsonElement value) =>
        value.ValueKind == JsonValueKind.Object && HasFiniteNumber(value, "x") && HasFiniteNumber(value, "y");

    private static bool IsVec3(JsonElement value) =>
        value.ValueKind == JsonValueKind.Object &&
        HasFiniteNumber(value, "x") && HasFiniteNumber(value, "y") && HasFiniteNumber(value, "z");

    private static bool IsQuat(JsonElement value) => IsVec3(value) && HasFiniteNumber(value, "w");

    private static bool HasManeuverPhase(JsonElement obj, string name) =>
        HasEnumString(obj, name, "none", "ground", "pop", "air", "catch", "grind", "bail");

    private static bool TryGetNonNegativeInteger(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out long number) && number >= 0;

    private static bool HasNonNegativeInteger(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) && TryGetNonNegativeInteger(value);

    private static bool HasNumberInRange(JsonElement obj, string name, double min, double max) =>
        obj.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number &&
        value.TryGetDouble(out double number) && double.IsFinite(number) && number >= min && number <= max;

    private static bool HasOptionalNumberInRange(JsonElement obj, string name, double min, double max) =>
        !obj.TryGetProperty(name, out JsonElement value) ||
        (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) &&
         double.IsFinite(number) && number >= min && number <= max);

    private static bool HasPositiveFiniteNumber(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number &&
        value.TryGetDouble(out double number) && double.IsFinite(number) && number > 0;

    private static bool HasNonNegativeFiniteNumber(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number &&
        value.TryGetDouble(out double number) && double.IsFinite(number) && number >= 0;

    private static bool HasOptionalFiniteNumber(JsonElement obj, string name) =>
        !obj.TryGetProperty(name, out JsonElement value) ||
        (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) && double.IsFinite(number));

    private static bool HasOptionalNonNegativeFiniteNumber(JsonElement obj, string name) =>
        !obj.TryGetProperty(name, out JsonElement value) ||
        (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) &&
         double.IsFinite(number) && number >= 0);

    private static bool HasOptionalNullableNonNegativeFiniteNumber(JsonElement obj, string name) =>
        !obj.TryGetProperty(name, out JsonElement value) || value.ValueKind == JsonValueKind.Null ||
        (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) &&
         double.IsFinite(number) && number >= 0);

    private static bool HasOptionalNullableNumberInRange(JsonElement obj, string name, double min, double max) =>
        !obj.TryGetProperty(name, out JsonElement value) || value.ValueKind == JsonValueKind.Null ||
        (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) &&
         double.IsFinite(number) && number >= min && number <= max);

    private static bool HasOptionalNullableInteger(JsonElement obj, string name) =>
        !obj.TryGetProperty(name, out JsonElement value) || value.ValueKind == JsonValueKind.Null ||
        (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out _));

    private static bool HasOptionalEnumString(JsonElement obj, string name, params string[] allowed) =>
        !obj.TryGetProperty(name, out JsonElement value) ||
        (value.ValueKind == JsonValueKind.String && IsAllowed(value.GetString(), allowed));

    private static bool IsAllowed(string? value, string[] allowed) =>
        value is not null && Array.IndexOf(allowed, value) >= 0;

    private static bool HasObject(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Object;

    private static bool HasString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String;

    private static bool HasBoolean(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) &&
        (value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False);

    private static bool HasFiniteNumber(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out JsonElement value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) && double.IsFinite(number);

    private static bool HasInt(JsonElement obj, string name, params int[] allowed) =>
        obj.TryGetProperty(name, out JsonElement value) && value.TryGetInt32(out int number) &&
        Array.IndexOf(allowed, number) >= 0;

    private static bool HasEnumString(JsonElement obj, string name, params string[] allowed) =>
        obj.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String &&
        IsAllowed(value.GetString(), allowed);

    private static string SafeLabel(string? label)
    {
        var b = new StringBuilder(32);
        bool dashPending = false;
        foreach (char c in label ?? "attempt")
        {
            if (char.IsAsciiLetterOrDigit(c))
            {
                if (dashPending && b.Length > 0 && b.Length < 32) b.Append('-');
                if (b.Length < 32) b.Append(char.ToLowerInvariant(c));
                dashPending = false;
            }
            else
            {
                dashPending = true;
            }
            if (b.Length >= 32) break;
        }
        return b.Length == 0 ? "attempt" : b.ToString().TrimEnd('-');
    }
}
