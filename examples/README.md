# Linker script examples

Open any `.ld` file in LinkLens with **Open** to explore its memory map and diagnostics. Edit values such as `ORIGIN`, `LENGTH`, `ALIGN`, or section assignments to see the diagram update.

- `getting-started.ld` — a small FLASH/RAM layout with code, constants, initialized data, and zero-initialized data.
- `alignment-padding.ld` — an intentionally unaligned RAM origin; `.data ALIGN(64)` creates visible padding and an alignment warning.
- `memory-overflow.ld` — a deliberately small FLASH region that reports an overflow.
- `riscv-bare-metal.ld` — an example RISC-V microcontroller layout with startup, text, read-only data, small data, BSS, heap, and stack sections.

Section sizes are estimates in the current preview. The examples demonstrate the visualizer and parser; they are not tied to a particular board's startup code or toolchain configuration.
