// Keeps only the last 10 digits, so "55 1234 5678", "+52 55 1234 5678" and
// "5512345678" all normalize to the same value — used both when storing a
// phone number and when looking one up, so formatting differences between
// visits don't break the returning-customer match.
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(-10) || digits;
}
