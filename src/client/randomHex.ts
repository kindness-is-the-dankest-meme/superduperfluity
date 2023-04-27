/**
 * note: each hexadecimal digit is represented by a 2-character string, you can
 * think of them like "color channels" if you're generating a color, the first
 * digit is red, then green and blue
 *
 * @param length the number of hexadecimal digits to generate
 * @returns a hexadecimal string of `length * 2`
 */
export const randomHex = (length: number = 3) =>
  crypto
    .getRandomValues(Uint8Array.from({ length }))
    .reduce((acc, value) => acc + value.toString(16).padStart(2, "0"), "");
