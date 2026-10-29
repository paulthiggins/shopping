// Lowercase letters and digits without 0, 1, i, l or o.
export const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const shortCode =
  /^[23456789abcdefghjkmnpqrstuvwxyz]{3}(-[23456789abcdefghjkmnpqrstuvwxyz]{3}){2}$/;
const legacyToken = /^[a-zA-Z0-9_-]{43}$/;
export function validToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (shortCode.test(value) || legacyToken.test(value))
  );
}
export function parseToken(value: string): string {
  // Legacy credentials are case-sensitive. Only friendly codes are normalised.
  if (legacyToken.test(value)) return value;
  const compact = value.trim().toLowerCase().replaceAll("-", "");
  const grouped = compact.match(/.{1,3}/g)?.join("-") ?? "";
  return shortCode.test(grouped) ? grouped : "";
}
export function generateToken(): string {
  let value = "";
  // Rejection sampling avoids favouring some characters in the 31-symbol alphabet.
  const ceiling = 256 - (256 % CODE_ALPHABET.length);
  while (value.length < 9) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < ceiling) value += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (value.length === 9) break;
    }
  }
  return value.match(/.{3}/g)!.join("-");
}
