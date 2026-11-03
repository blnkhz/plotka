# Text

Plotters draw text best with single-stroke lettering: each letter is a line the pen draws once,
instead of an outline that has to be filled. The app has six such styles, from the classic
Hershey fonts: **Sans**, **Sans bold**, **Serif**, **Serif italic**, **Script** and **Gothic**.

## Adding text

Click **+ Add text** under the layers (it works with no file open too). A text layer appears at
the top left of the margins and the Fill tab shows its settings:

- **Text**: type it here; new lines start new lines.
- **Style**: one of the six fonts.
- **Size**: the height of capital letters, in mm.
- **Line spacing** and **Letter spacing**: room between lines (in % of the normal) and extra
  room between letters (in mm).
- **Align**: lines lined up on the left, center or right.

Text sits on the paper at its real size: the page's **Fit** and **Scale** and the transforms
don't change it, and it doesn't change how the artwork fits. To move, resize or turn it, use
**✥ Arrange** above the preview (or the **Position** numbers in the Fill tab). Like any layer it
has its own color, speed and plot checkbox; **✕** in the layer list deletes it (Undo brings it
back). Text is saved with the project.

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
