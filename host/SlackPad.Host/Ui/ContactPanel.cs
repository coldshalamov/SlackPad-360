using SlackPad.Host.Contracts;

namespace SlackPad.Host.Ui;

/// <summary>
/// Double-buffered panel that paints live contact dots (position-scaled, id-labelled,
/// tip fill vs outline) with a border flash on primary click.
/// </summary>
internal sealed class ContactPanel : Panel
{
    private static readonly Color BgColor = Color.FromArgb(18, 20, 24);
    private static readonly Color PadColor = Color.FromArgb(30, 34, 40);
    private static readonly Color PadBorder = Color.FromArgb(64, 70, 80);
    private static readonly Color TipColor = Color.FromArgb(88, 196, 255);
    private static readonly Color NoTipColor = Color.FromArgb(120, 128, 140);
    private static readonly Color PalmColor = Color.FromArgb(220, 96, 96);
    private static readonly Color ClickFlash = Color.FromArgb(255, 208, 96);
    private static readonly Color TextColor = Color.FromArgb(220, 226, 235);

    private ContactFrame? _frame;
    private double _lastClickMs = -10000;

    public ContactPanel()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        BackColor = BgColor;
    }

    /// <summary>Store the latest frame for the next repaint (called on the UI thread).</summary>
    public void SetFrame(ContactFrame frame)
    {
        _frame = frame;
        if (frame.Buttons.Primary)
        {
            _lastClickMs = frame.TPerfMs;
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(BgColor);

        int margin = 24;
        var pad = new Rectangle(margin, margin, Math.Max(1, Width - 2 * margin), Math.Max(1, Height - 2 * margin));
        using (var padBrush = new SolidBrush(PadColor))
        {
            g.FillRectangle(padBrush, pad);
        }
        using (var padPen = new Pen(PadBorder, 2))
        {
            g.DrawRectangle(padPen, pad);
        }

        var frame = _frame;
        if (frame != null)
        {
            foreach (var c in frame.Contacts)
            {
                float cx = pad.Left + (float)Math.Clamp(c.X, 0, 1) * pad.Width;
                float cy = pad.Top + (float)Math.Clamp(c.Y, 0, 1) * pad.Height;
                float r = 16f;
                var dot = new RectangleF(cx - r, cy - r, r * 2, r * 2);

                Color color = !c.Confidence ? PalmColor : (c.Tip ? TipColor : NoTipColor);
                if (c.Tip && c.Confidence)
                {
                    using var fill = new SolidBrush(Color.FromArgb(180, color));
                    g.FillEllipse(fill, dot);
                }
                using (var pen = new Pen(color, 3))
                {
                    g.DrawEllipse(pen, dot);
                }

                using var textBrush = new SolidBrush(TextColor);
                using var font = new Font(FontFamily.GenericSansSerif, 9f, FontStyle.Bold);
                g.DrawString($"#{c.Id}", font, textBrush, cx + r + 2, cy - r);
            }

            // Border flash on recent primary click.
            if (frame.TPerfMs - _lastClickMs < 150)
            {
                using var flashPen = new Pen(ClickFlash, 6);
                g.DrawRectangle(flashPen, 3, 3, Width - 7, Height - 7);
            }

            using var hudBrush = new SolidBrush(TextColor);
            using var hudFont = new Font(FontFamily.GenericMonospace, 9f);
            int tips = frame.Contacts.Count(x => x.Tip && x.Confidence);
            g.DrawString(
                $"frame {frame.FrameId}  contacts {frame.Contacts.Count}  tips {tips}  primary {frame.Buttons.Primary}",
                hudFont, hudBrush, margin, 4);
        }
        else
        {
            using var hudBrush = new SolidBrush(NoTipColor);
            using var hudFont = new Font(FontFamily.GenericSansSerif, 11f);
            g.DrawString("Waiting for contacts — plant a finger on the trackpad.", hudFont, hudBrush, margin + 8, margin + 8);
        }
    }
}
