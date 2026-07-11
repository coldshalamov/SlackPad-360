using System.Runtime.InteropServices;

namespace SlackPad.Host.Interop;

/// <summary>HidP report type discriminator.</summary>
internal enum HidpReportType
{
    Input = 0,
    Output = 1,
    Feature = 2,
}

/// <summary>hid.dll preparsed-data capability structures. Byte layouts mirror hidpi.h.</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct HidpCaps
{
    public ushort Usage;
    public ushort UsagePage;
    public ushort InputReportByteLength;
    public ushort OutputReportByteLength;
    public ushort FeatureReportByteLength;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)]
    public ushort[] Reserved;

    public ushort NumberLinkCollectionNodes;
    public ushort NumberInputButtonCaps;
    public ushort NumberInputValueCaps;
    public ushort NumberInputDataIndices;
    public ushort NumberOutputButtonCaps;
    public ushort NumberOutputValueCaps;
    public ushort NumberOutputDataIndices;
    public ushort NumberFeatureButtonCaps;
    public ushort NumberFeatureValueCaps;
    public ushort NumberFeatureDataIndices;
}

/// <summary>
/// HIDP_VALUE_CAPS (72 bytes on x64). BOOLEAN fields are modeled as bytes to match the
/// 1-byte UCHAR layout; the trailing union is modeled as its NotRange shape so that the
/// first union field (<see cref="Usage"/>) reads correctly for single-usage value caps.
/// </summary>
[StructLayout(LayoutKind.Sequential)]
internal struct HidpValueCaps
{
    public ushort UsagePage;
    public byte ReportID;
    public byte IsAlias;
    public ushort BitField;
    public ushort LinkCollection;
    public ushort LinkUsage;
    public ushort LinkUsagePage;
    public byte IsRange;
    public byte IsStringRange;
    public byte IsDesignatorRange;
    public byte IsAbsolute;
    public byte HasNull;
    public byte Reserved;
    public ushort BitSize;
    public ushort ReportCount;
    public ushort Reserved2_0;
    public ushort Reserved2_1;
    public ushort Reserved2_2;
    public ushort Reserved2_3;
    public ushort Reserved2_4;
    public uint UnitsExp;
    public uint Units;
    public int LogicalMin;
    public int LogicalMax;
    public int PhysicalMin;
    public int PhysicalMax;

    // union { Range | NotRange } — NotRange layout; Usage == UsageMin for a range cap.
    public ushort Usage;
    public ushort Reserved1;
    public ushort StringIndex;
    public ushort Reserved3;
    public ushort DesignatorIndex;
    public ushort Reserved4;
    public ushort DataIndex;
    public ushort Reserved5;
}

/// <summary>HIDP_LINK_COLLECTION_NODE (24 bytes on x64). Bitfields packed into one uint.</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct HidpLinkCollectionNode
{
    public ushort LinkUsage;
    public ushort LinkUsagePage;
    public ushort Parent;
    public ushort NumberOfChildren;
    public ushort NextSibling;
    public ushort FirstChild;

    /// <summary>CollectionType:8, IsAlias:1, Reserved:23.</summary>
    public uint Bitfield;

    public IntPtr UserContext;

    public readonly byte CollectionType => (byte)(Bitfield & 0xFF);
}

internal static class HidNative
{
    public const int HidpStatusSuccess = 0x00110000;

    // HID usage pages / usages used by the PTP digitizer collection.
    public const ushort UsagePageGenericDesktop = 0x01;
    public const ushort UsagePageButton = 0x09;
    public const ushort UsagePageDigitizer = 0x0D;

    public const ushort UsageX = 0x30;
    public const ushort UsageY = 0x31;
    public const ushort UsageFinger = 0x22;
    public const ushort UsageTipSwitch = 0x42;
    public const ushort UsageConfidence = 0x47;
    public const ushort UsageContactId = 0x51;
    public const ushort UsageContactCount = 0x54;
    public const ushort UsageScanTime = 0x56;
    public const ushort UsageButton1 = 0x01;

    [DllImport("hid.dll")]
    public static extern int HidP_GetCaps(IntPtr preparsedData, out HidpCaps capabilities);

    [DllImport("hid.dll")]
    public static extern int HidP_GetValueCaps(
        HidpReportType reportType,
        [In, Out] HidpValueCaps[] valueCaps,
        ref ushort valueCapsLength,
        IntPtr preparsedData);

    [DllImport("hid.dll")]
    public static extern int HidP_GetLinkCollectionNodes(
        [In, Out] HidpLinkCollectionNode[] linkCollectionNodes,
        ref uint linkCollectionNodesLength,
        IntPtr preparsedData);

    [DllImport("hid.dll")]
    public static extern int HidP_GetUsageValue(
        HidpReportType reportType,
        ushort usagePage,
        ushort linkCollection,
        ushort usage,
        out uint usageValue,
        IntPtr preparsedData,
        byte[] report,
        uint reportLength);

    [DllImport("hid.dll")]
    public static extern int HidP_GetUsages(
        HidpReportType reportType,
        ushort usagePage,
        ushort linkCollection,
        [In, Out] ushort[] usageList,
        ref uint usageLength,
        IntPtr preparsedData,
        byte[] report,
        uint reportLength);
}
