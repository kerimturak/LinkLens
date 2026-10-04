/* LinkLens example: ALIGN(64) produces a visible gap before .data */
MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 128K
  RAM   (rwx) : ORIGIN = 0x20000003, LENGTH = 32K
}

SECTIONS
{
  .text :
  {
    *(.text*)
  } > FLASH

  .rodata :
  {
    *(.rodata*)
  } > FLASH

  .data : ALIGN(64)
  {
    *(.data*)
  } > RAM

  .bss :
  {
    *(.bss*)
  } > RAM
}
