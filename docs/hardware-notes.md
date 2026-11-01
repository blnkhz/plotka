# Hardware notes

Every machine value used by the app is recorded here with its source. Values marked
**provisional** are placeholders and must be confirmed in the DRIVER-0 spike.

## AxiDraw V3/A3 (primary machine)

| Value               | Used         | Status             | Source                                                                                                                      |
| ------------------- | ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Usable pen travel   | 430 x 297 mm | Confirmed (vendor) | Evil Mad Scientist product page: "Usable pen travel: 430 × 297 mm (16.93 × 11.69 in)" https://shop.evilmadscientist.com/890 |
| Vertical pen travel | 17 mm        | Vendor spec        | Same page                                                                                                                   |
| Home position       | Top left     | Decided            | Paper's top-left corner is placed at home. No "set origin here" feature for now.                                            |
| Max pen-down speed  | 250 mm/s     | Provisional        | Placeholder for time estimates; to verify in DRIVER-0 / AxiDraw API docs                                                    |
| Max pen-up speed    | 380 mm/s     | Provisional        | Placeholder                                                                                                                 |
| Acceleration        | 1000 mm/s²   | Provisional        | Placeholder                                                                                                                 |
| Pen lift delay      | 0.15 s       | Provisional        | Placeholder                                                                                                                 |
| Servo up / down     | 60 / 30 %    | Provisional        | Placeholder; calibrated per pen in DRIVER-3                                                                                 |

To fill in during DRIVER-0: firmware version, exact EBB commands, steps per mm, servo ranges,
mixed-axis (CoreXY-style) kinematics, macOS device name (`/dev/cu.usbmodem*`), NextDraw differences.
