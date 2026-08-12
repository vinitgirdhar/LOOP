/*
  Card field behaviour for the checkout.

  Small, but worth having on its own: grouping, network detection and the Luhn
  check are what make a payment form feel like a payment gateway rather than a
  text box, and every one of them is an off-by-one waiting to happen.
*/

export type CardNetwork = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'diners' | null;

const digitsOnly = (value: string) => value.replace(/\D/g, '');

/**
 * Card network from the leading digits.
 *
 * Ordered by specificity: 3xx is American Express or Diners before anything
 * else can claim it, and RuPay's 6-ranges are checked after those.
 */
export function cardNetwork(value: string): CardNetwork {
  const digits = digitsOnly(value);
  if (!digits) return null;
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^3(?:0[0-5]|[689])/.test(digits)) return 'diners';
  if (/^4/.test(digits)) return 'visa';
  if (/^(?:5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  // RuPay: the domestic network, which is most of what an Indian checkout
  // sees. 6011 is carved out of the 60 range because it is Discover, and a
  // Discover card silently labelled RuPay is a wrong logo on a real payment.
  if (/^(?:6(?!011)0|6521|6522|508|81|82)/.test(digits)) return 'rupay';
  return null;
}

/** Digits a completed number of this network should have. */
export function cardLength(network: CardNetwork): number {
  return network === 'amex' ? 15 : network === 'diners' ? 14 : 16;
}

/** `4111 1111 1111 1111`, or `3782 822463 10005` for the 4-6-5 networks. */
export function formatCardNumber(value: string): string {
  const network = cardNetwork(value);
  const digits = digitsOnly(value).slice(0, cardLength(network));
  const groups = network === 'amex' || network === 'diners' ? [4, 6, 5] : [4, 4, 4, 4];

  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(' ');
}

/** `08/28`. Types forwards only — a backspace must not re-add the slash. */
export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** The Luhn checksum every one of these networks uses. */
export function luhn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 12) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** A card number that is the right length for its network and passes Luhn. */
export function cardNumberValid(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === cardLength(cardNetwork(value)) && luhn(digits);
}

/** MM/YY that names a real month and has not already passed. */
export function expiryValid(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(formatExpiry(value));
  if (!match) return false;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return false;

  // A card is good through the last day of its printed month, so it expires at
  // the start of the month after.
  const expires = new Date(2000 + Number(match[2]), month, 1);
  return expires > now;
}

/** Amex prints a 4-digit code on the front; everyone else uses 3 on the back. */
export function cvvLength(network: CardNetwork): number {
  return network === 'amex' ? 4 : 3;
}
