# Hardware notes

Every machine value used by the app is recorded here with its source. Values marked
**provisional** are placeholders and must be confirmed in the DRIVER-0 spike.

## Sources read

- EBB command reference (firmware 3.x): https://evil-mad.github.io/EggBot/ebb.html
  (2.x commands: `ebb2.html` on the same site). No newer Bantam-hosted copy found yet.
- `plotink` (MIT, Bantam Tools): `ebb_serial.py`, `ebb_motion.py`
  https://github.com/evil-mad/plotink. Read for behavior only; no code copied.
- AxiDraw driver config `axidraw_conf.py` v3.9.0 (2023-05-11)
  https://github.com/evil-mad/axidraw. Read for values only.
- AxiDraw V3/A3 product page: https://shop.evilmadscientist.com/890

## EBB protocol (from the EBB reference and plotink)

- **Finding the board:** USB VID:PID `04D8:FD92`, or a port description starting with
  `EiBotBoard`. On macOS use the callout device `/dev/cu.usbmodem*`, not `/dev/tty.*`.
- **Serial:** USB CDC; baud rate is ignored. plotink opens with a 1 s read timeout and flushes
  input on connect.
- **Framing:** ASCII commands ending in `\r`, ≤ 256 bytes, case-insensitive. Default ("legacy")
  replies: plain commands answer `OK\r\n`; errors start with `!`. Future syntax (`CU,10,1`) changes
  every reply format; we stay on legacy for now.
- **Queries and their replies (legacy):**
  - `V` → `EBBv13_and_above EB Firmware Version 3.x.y\r\n` (no OK)
  - `QG` → two hex digits `\r\n` (no OK). Bits: 7 limit, 6 power lost, 5 button pressed since
    last QG/QB, 4 pen up, 3 command executing, 2 motor 1 moving, 1 motor 2 moving, 0 FIFO not
    empty. Needs firmware 2.6.2+. Replaces deprecated QB/QM/QP in 3.x.
  - `QS` → `steps1,steps2\n\r` then `OK\r\n`. Global step counters, cleared by `CS` and `EM`.
  - `QC` → `RA0,V+\r\n` then `OK`. 0–1023 each; V+ × 3.3/1023 × 9.2 ≈ volts (boards v2.3+).
  - `ES` → `interrupted\n\r` then `OK`. Stops motion and flushes the FIFO.
- **Motors:** `EM,m1,m2`: 1 = 16x microstepping, 2 = 8x, 0 = off. Changing it resets step
  counters. `XM,ms,A,B` mixed-axis move (firmware 2.3.0+): axis 1 += A+B, axis 2 += A−B,
  intended for AxiDraw/CoreXY. `SM,ms,s1,s2` raw per-motor move. Step rate 0.00001164 to
  25,000 steps/s per axis; steps quantized to the 25 kHz ISR. Moves are queued (FIFO).
- **Pen servo:** output RB1. `SC,4,v` pen-up position, `SC,5,v` pen-down position, units of
  83.3 ns (1/12 MHz). `SC,11,r` / `SC,12,r` raise / lower rate: units per 24 ms servo cycle.
  `SP,1,ms` pen up, `SP,0,ms` pen down (queued; ms = delay before the next command).
  `SP,2` moves up immediately (bypasses the FIFO).

## AxiDraw V3/A3 (primary machine)

| Value               | Used                                                  | Status             | Source                                                                                                       |
| ------------------- | ----------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Usable pen travel   | 430 × 297 mm                                          | Confirmed (vendor) | Product page; `axidraw_conf.py` 16.93 × 11.69 in                                                             |
| Vertical pen travel | 17 mm                                                 | Vendor spec        | Product page                                                                                                 |
| Home position       | Top left                                              | Decided            | Paper top-left at home. No "set origin here" for now.                                                        |
| Steps per mm        | 80 (16x)                                              | **To verify**      | `axidraw_conf.py`: native_res_factor 1016 steps/in, ×2 at 16x = 2032 steps/in. Spike measures a 100 mm line. |
| Mixed-axis mapping  | motor1 = x+y, motor2 = x−y (XM A = x, B = y)          | **To verify**      | EBB XM docs. Spike checks which way +X / +Y go.                                                              |
| Servo range         | 9855 – 27831 (0–100%)                                 | Vendor default     | `axidraw_conf.py` servo_min / servo_max (standard servo)                                                     |
| Pen up / down       | 60% / 30%                                             | Vendor default     | `axidraw_conf.py` pen_pos_up / pen_pos_down                                                                  |
| Servo full sweep    | 200 ms at 100% rate                                   | Vendor default     | `axidraw_conf.py` servo_sweep_time; raise 75%, lower 50%                                                     |
| Pen move time       | 45 ms + 2.69 ms per %                                 | Vendor default     | `axidraw_conf.py` servo_move_min / servo_move_slope                                                          |
| Max XY speed        | 8.70 in/s (221 mm/s) at 16x; 15 in/s (381 mm/s) at 8x | Vendor             | `axidraw_conf.py` speed_lim_xy_hr / _lr                                                                      |
| Acceleration        | 40 in/s² (1016 mm/s²) pen down, 60 in/s² pen up       | Vendor             | `axidraw_conf.py` accel_rate / accel_rate_pu                                                                 |
| Default speeds      | 25% pen down, 75% pen up                              | Vendor default     | `axidraw_conf.py`                                                                                            |

Narrow-band (brushless upgrade) servo values exist (`nb_servo_*`), for DRIVER-6 later.

### Other models (from `axidraw_conf.py`, inches → mm, untested)

| Model         | Travel       |
| ------------- | ------------ |
| V2, V3, SE/A4 | 300 × 218 mm |
| V3/A3, SE/A3  | 430 × 297 mm |
| V3 XLX        | 595 × 218 mm |
| MiniKit       | 160 × 102 mm |
| SE/A2         | 594 × 432 mm |
| SE/A1         | 864 × 594 mm |
| V3/B6         | 190 × 140 mm |

## DRIVER-0 spike results

_To be filled in from `tools/driver-spike/reports/` after running on the real machine:_
firmware version, macOS device name, confirmed steps/mm, axis directions, pen behavior, button.
NextDraw differences: not tested (no hardware).
