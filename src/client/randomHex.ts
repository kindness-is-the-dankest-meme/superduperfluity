export const randomHex = (size = 3): string =>
  crypto
    .getRandomValues(Uint8Array.from({ length: size }))
    .reduce((acc, value) => acc + value.toString(16), "")
    .padStart(size * 2, "0");
