import { AngolanCarrier } from "./notifications.types";

/**
 * Normalizes an Angolan phone number to E.164 format (+2449XXXXXXXX).
 * Accepts:
 *   "923111222" -> "+244923111222"
 *   "+244 923 111 222" -> "+244923111222"
 *   "00244923111222" -> "+244923111222"
 *   "244923111222" -> "+244923111222"
 */
export function normalizeAngolanPhone(input: string): string {
  if (!input) return "";

  // Remove all non-digits except leading '+'
  let cleaned = input.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  if (cleaned.startsWith("+244")) {
    cleaned = "+244" + cleaned.slice(4).replace(/^0+/, "");
  } else if (cleaned.startsWith("244") && cleaned.length >= 12) {
    cleaned = "+" + cleaned;
  } else if (/^9\d{8}$/.test(cleaned)) {
    cleaned = "+244" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

/**
 * Validates if the phone number is a valid Angolan mobile number (+244 9XXXXXXXX).
 */
export function isValidAngolanMobile(phone: string): boolean {
  const normalized = normalizeAngolanPhone(phone);
  return /^\+2449\d{8}$/.test(normalized);
}

/**
 * Detects the Angolan carrier based on the phone prefix.
 */
export function detectAngolanCarrier(phone: string): AngolanCarrier {
  const normalized = normalizeAngolanPhone(phone);
  if (!isValidAngolanMobile(normalized)) return "other";

  const prefix = normalized.slice(4, 6); // +244[9X]

  if (["92", "93", "94", "99"].includes(prefix)) {
    return "unitel";
  }
  if (prefix === "95") {
    return "africell";
  }
  if (["91", "97"].includes(prefix)) {
    return "movicel";
  }

  return "other";
}
