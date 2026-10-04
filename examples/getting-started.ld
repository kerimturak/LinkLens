/* LinkLens example: basic embedded memory layout */
MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 256K
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 64K
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

  .data :
  {
    *(.data*)
  } > RAM

  .bss :
  {
    *(.bss*)
  } > RAM
}
