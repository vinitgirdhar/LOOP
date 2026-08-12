import assert from 'node:assert/strict';
import {
  cardNetwork,
  cardNumberValid,
  cvvLength,
  expiryValid,
  formatCardNumber,
  formatExpiry,
  luhn,
} from './payment-card';

/*
  Every number here is a published gateway test card, not a real one.
*/

// ── network detection ─────────────────────────────────────────────────────
{
  assert.equal(cardNetwork('4111 1111 1111 1111'), 'visa');
  assert.equal(cardNetwork('5267 3181 8797 5449'), 'mastercard');
  assert.equal(cardNetwork('2223 0031 2200 3222'), 'mastercard', 'the 2-series is Mastercard too');
  assert.equal(cardNetwork('3782 822463 10005'), 'amex');
  assert.equal(cardNetwork('3056 9309 0259 04'), 'diners');
  assert.equal(cardNetwork('6521 1234 5678 9012'), 'rupay', 'the domestic network an Indian checkout mostly sees');
  assert.equal(cardNetwork('6011 1111 1111 1117'), null, 'an unsupported network is unknown rather than guessed');
  assert.equal(cardNetwork(''), null);
}

// ── grouping ──────────────────────────────────────────────────────────────
{
  assert.equal(formatCardNumber('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(formatCardNumber('41111'), '4111 1');
  assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005', 'Amex groups 4-6-5');
  assert.equal(formatCardNumber('4111 1111 1111 1111 9999'), '4111 1111 1111 1111', 'overflow past the network length is dropped');
  assert.equal(formatCardNumber('4a1b1c1'), '4111', 'letters never reach the field');
  assert.equal(formatCardNumber(''), '');
}

// ── expiry ────────────────────────────────────────────────────────────────
{
  assert.equal(formatExpiry('08'), '08');
  assert.equal(formatExpiry('0828'), '08/28');
  assert.equal(formatExpiry('08/2'), '08/2', 'a backspace through the slash does not re-add it');

  const now = new Date('2026-08-12T00:00:00Z');
  assert.equal(expiryValid('09/26', now), true);
  assert.equal(expiryValid('08/26', now), true, 'a card is good through the last day of its printed month');
  assert.equal(expiryValid('07/26', now), false, 'last month has passed');
  assert.equal(expiryValid('13/28', now), false, 'there is no thirteenth month');
  assert.equal(expiryValid('00/28', now), false);
  assert.equal(expiryValid('8/28', now), false, 'a half-typed field is not yet valid');
}

// ── checksum ──────────────────────────────────────────────────────────────
{
  assert.equal(luhn('4111111111111111'), true);
  assert.equal(luhn('4111111111111112'), false, 'one wrong digit fails the checksum');
  assert.equal(luhn('378282246310005'), true);
  assert.equal(luhn('4111'), false, 'too short to be a card at all');

  assert.equal(cardNumberValid('4111 1111 1111 1111'), true);
  assert.equal(cardNumberValid('4111 1111 1111 111'), false, 'right prefix, wrong length');
  assert.equal(cardNumberValid('3782 822463 10005'), true, 'Amex is valid at 15 digits, not 16');
}

// ── cvv ───────────────────────────────────────────────────────────────────
{
  assert.equal(cvvLength('amex'), 4);
  assert.equal(cvvLength('visa'), 3);
  assert.equal(cvvLength(null), 3);
}

console.log('payment-card: all checks passed');
