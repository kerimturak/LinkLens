/* LinkLens example: generic RISC-V bare-metal microcontroller layout */
OUTPUT_ARCH(riscv)
ENTRY(_start)

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x20000000, LENGTH = 512K
  RAM   (rwx) : ORIGIN = 0x80000000, LENGTH = 128K
}

SECTIONS
{
  .init :
  {
    KEEP(*(.init))
  } > FLASH

  .text :
  {
    *(.text.init*)
    *(.text*)
  } > FLASH

  .rodata :
  {
    *(.rodata*)
  } > FLASH

  .data :
  {
    *(.data*)
  } > RAM

  .sdata :
  {
    *(.sdata*)
  } > RAM

  .bss :
  {
    *(.bss*)
  } > RAM

  .sbss :
  {
    *(.sbss*)
  } > RAM

  .heap :
  {
    . = . + 0x1000;
  } > RAM

  .stack :
  {
    . = . + 0x2000;
  } > RAM
}
