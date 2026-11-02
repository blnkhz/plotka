# Optimizing the plot

The **Optimize** section in the **Plot** tab cuts the time the pen spends moving with the pen up.

- **Join touching paths**: paths whose ends meet (within the **Within** distance, 0.1 mm by
  default) are joined, so the pen doesn't lift between them.
- **Reorder to cut travel**: draws paths in an order that keeps pen-up moves short, and reverses
  them where that helps.
- **Extra pass**: untangles the order a bit more.

The table below compares the file's own order with the optimized order: travel distance, pen
lifts and time. Turn on **Travel** above the preview to see the pen-up moves as thin lines.

Layers always plot in their own order; optimizing only changes the order within a layer.
