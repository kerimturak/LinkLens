/* LinkLens example: .text estimate is larger than this FLASH region */
MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 32K
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 16K
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
