# Text

Plotters draw text best with single-stroke lettering: each letter is a line the pen draws once,
instead of an outline that has to be filled. The app has six such styles, from the classic
Hershey fonts: **Sans**, **Sans bold**, **Serif**, **Serif italic**, **Script** and **Gothic**.
Four more, **Blackletter**, **Blackletter ornate**, **Gothic** and **Rotunda** (each marked
"parallel pen"), are drawn for a flat-nibbed pen (see below).

## Adding text

Click **+ Add text** under the layers (it works with no file open too). A text layer appears at
the top left of the margins and the Fill tab shows its settings:

- **Text**: type it here; new lines start new lines.
- **Style**: one of the ten fonts.
- **Size**: the height of capital letters, in mm.
- **Line spacing** and **Letter spacing**: room between lines (in % of the normal) and extra
  room between letters (in mm).
- **Align**: lines lined up on the left, center or right.

Text sits on the paper at its real size: the page's **Fit** and **Scale** and the transforms
don't change it, and it doesn't change how the artwork fits. To move, resize or turn it, use
**✥ Arrange** above the preview (or the **Position** numbers in the Fill tab). Like any layer it
has its own color, speed and plot checkbox; **✕** in the layer list deletes it (Undo brings it
back). Text is saved with the project.

## Gothic hands for a parallel pen

**Blackletter (parallel pen)** is an Old English (Textura) hand made only of broad-nib strokes,
for a flat-nibbed pen such as a Pilot Parallel in the plotter. Each stroke is the path the middle
of the nib follows. The thick stems, diamond heads and feet, and hairlines all come from the
nib's flat edge, so with a round pen the letters look like a thin skeleton.

- **Nib**: the nib's width (a Pilot Parallel size or your own) and the angle it's held at. These
  are the same settings as **Parallel pen** above the preview, and choosing one of these styles
  turns that preview on.
- **Size** with **From nib**: capitals are 7 nib widths tall and the x-height 5 (6 and 4 for the
  Gothic and the Rotunda), the classic proportion for each hand. The size follows the nib:
  change the nib width and the text resizes with it. Clear **From nib** to set your own size;
  fewer nib widths look heavier, more look lighter.
- The small preview under the size shows the text as that nib draws it.

**Blackletter ornate** is the same hand dressed up, still for a pen that never turns: diamond
thorns on the capitals' stems, swashes curling over their heads, forked ascenders, hairlines
joining the letters, and curled descenders. Every ornament is a stroke of the same nib at the
same angle: across the nib for a diamond, along its edge for a hairline, and curves that swell
and thin as they turn. The swashes reach about a nib above the capitals, so lines sit a little
further apart.

**Gothic** is the rounder, more compact hand of the usual broad-pen worksheets: the x-height is 4
nib widths and the capitals 6. Its capitals are round, with a wedge-shaped spike in their
counters, doubled stems, and hairline bars across letters like I, M, N and X (x and z have them
too). The figures and punctuation are the blackletter's.

**Rotunda** is the round Gothic, the same hand written with curves: arched shoulders on n, m
and h, bowls that swing round, an uncial d whose ascender sweeps back over the bowl, descenders
that curl under the letter, and big C-shaped capitals (C, E, G, O, Q, T) with a doubled inner
stroke and a spike. It has the Gothic's proportions and figures. The curves still need no pen
turns: their thickness swells and thins as they turn against the fixed nib.

Fit the pen with its edge at about 40° to the paper's horizontal, the angle the letters are
drawn for, and set the same angle in the app. The plotter can't turn the pen, so don't turn this
text with Arrange: the strokes would rotate but the nib wouldn't. All four have the English
letters, numbers and common punctuation; other characters are drawn as "?".

The fonts cover the English letters, numbers and punctuation. Accented letters are drawn without
their accents, and other characters as "?".

## Text in SVG files

Text in an SVG file is drawn the same way: in the closest of these styles (sans, serif, script;
bold and italic when the file asks for them), at its size, position and color. It won't look
like the file's own typeface, and a note says so. To keep the typeface, convert the text to paths
in your drawing app before saving (in Inkscape: **Path → Object to Path**; in Illustrator: **Type
→ Create Outlines**); it's then outlines, which can be filled or drawn around like any shape.

The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S.
National Bureau of Standards. The format of the font data was originally created by James Hurt,
Cognition, Inc.
