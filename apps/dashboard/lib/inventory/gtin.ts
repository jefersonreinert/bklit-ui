/**
 * GTIN (EAN-13, UPC-A, EAN-8, GTIN-14) as printed under a barcode: only
 * digits, and the last one is a check digit (GS1 mod 10). A code that
 * fails the check was misread or invented and is never saved.
 */

export function normalizeGtin(code: string) {
  return code.replace(/\D/g, "");
}

export function validGtin(code: string) {
  const d = normalizeGtin(code);
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) {
    return false;
  }
  const digits = [...d].map(Number);
  const check = digits.pop() as number;
  // From the right (before the check digit): weights 3, 1, 3, 1…
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
