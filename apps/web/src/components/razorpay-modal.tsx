'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';
import { useMediaQuery } from '@/lib/hooks';
import {
  cardNetwork,
  cardNumberValid,
  cvvLength,
  expiryValid,
  formatCardNumber,
  formatExpiry,
  type CardNetwork,
} from '@/lib/payment-card';

/*
  The checkout sheet.

  Built to the shape of a real Razorpay checkout, because that is the shape an
  Indian reader already knows how to use: navy merchant band with the amount in
  it, a payment-method rail down the left on a desktop and a list-then-detail
  drill on a phone, the session countdown, the blue pay button carrying the
  figure, and the secured-by strip along the bottom.

  It runs in test mode and says so, exactly as the real gateway does when it is
  handed test keys — the amber strip is not a disclaimer bolted on, it is part
  of the thing being imitated. Nothing typed here leaves the component: there is
  no network call, no storage, no analytics. The card helpers still do real
  Luhn and expiry validation, because a checkout that accepts 1234 as a card
  number is the detail that gives a demo away.

  The sheet paints on a fixed light palette rather than the app's theme tokens.
  A gateway renders in its own frame and stays light whatever the host page is
  doing, and a dark "checkout" reads as something other than a checkout.
*/

export interface RazorpayModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  amountINR: number;
  cadence?: string;
  onSuccess?: (details: { paymentId: string; amount: number; plan: string }) => void;
}

type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet' | 'paylater';
type Step = 'checkout' | 'processing' | 'otp' | 'success' | 'expired';

/** Razorpay's own palette, held here so no shade is invented twice. */
const NAVY = '#02042B';
const BLUE = '#3395FF';
const INK = '#12203C';
const MUTED = '#6E7B91';
const LINE = '#E4E8EE';
const WASH = '#F6F8FB';

/** How long the gateway holds a session open before it has to be restarted. */
const SESSION_SECONDS = 300;

const TEST_CARD = { number: '4111 1111 1111 1111', expiry: '08/30', cvv: '123', name: 'Vinit Girdhar' };
const TEST_VPA = 'success@razorpay';

const METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm' },
  { id: 'card', label: 'Cards', hint: 'Visa, Mastercard, RuPay' },
  { id: 'netbanking', label: 'Netbanking', hint: 'All Indian banks' },
  { id: 'wallet', label: 'Wallet', hint: 'Paytm, MobiKwik, Freecharge' },
  { id: 'paylater', label: 'Pay Later', hint: 'LazyPay, Simpl, ICICI' },
];

const BANKS = [
  { id: 'HDFC', name: 'HDFC Bank' },
  { id: 'ICICI', name: 'ICICI Bank' },
  { id: 'SBI', name: 'State Bank of India' },
  { id: 'AXIS', name: 'Axis Bank' },
  { id: 'KOTAK', name: 'Kotak Mahindra' },
  { id: 'YES', name: 'Yes Bank' },
];

const OTHER_BANKS = ['Bank of Baroda', 'Canara Bank', 'IDFC FIRST Bank', 'IndusInd Bank', 'Punjab National Bank', 'Union Bank of India'];

const WALLETS = ['Paytm', 'PhonePe', 'MobiKwik', 'Freecharge', 'Amazon Pay'];

const PAY_LATER = [
  { name: 'LazyPay', hint: 'Up to ₹1,00,000 · 15 days interest free' },
  { name: 'Simpl', hint: 'Pay in 3 · no cost' },
  { name: 'ICICI PayLater', hint: 'For ICICI account holders' },
];

const NETWORK_LABEL: Record<Exclude<CardNetwork, null>, string> = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  rupay: 'RuPay',
  amex: 'AMEX',
  diners: 'Diners',
};

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export function RazorpayModal({ isOpen, onClose, planName, amountINR, cadence = 'per month', onSuccess }: RazorpayModalProps) {
  const wide = useMediaQuery('(min-width: 640px)');

  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [drilled, setDrilled] = useState(false);
  const [step, setStep] = useState<Step>('checkout');
  const [remaining, setRemaining] = useState(SESSION_SECONDS);
  const [paymentId, setPaymentId] = useState('');
  const [otp, setOtp] = useState('');

  const sheet = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* Escape closes, except mid-authorisation where there is nothing safe to do
     with a half-finished payment. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && step !== 'processing') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, step]);

  /* The page behind a payment sheet must not scroll away under it. */
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  /* The session countdown the gateway shows, and honours. */
  useEffect(() => {
    if (!isOpen || step === 'success' || step === 'expired') return;
    const tick = setInterval(() => {
      setRemaining((left) => {
        if (left <= 1) {
          setStep('expired');
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [isOpen, step]);

  /* Pending step changes have to die with the component, or a closed sheet
     re-opens itself on a timer that outlived it. */
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.length = 0;
    };
  }, []);

  const later = (run: () => void, delay: number) => {
    timers.current.push(setTimeout(run, delay));
  };

  if (!isOpen) return null;

  const authorise = () => {
    setStep('processing');
    later(() => {
      setPaymentId(`pay_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`);
      setStep('otp');
    }, 1600);
  };

  const settle = () => {
    setStep('processing');
    later(() => {
      setStep('success');
      onSuccess?.({ paymentId, amount: amountINR, plan: planName });
    }, 1300);
  };

  const restart = () => {
    setRemaining(SESSION_SECONDS);
    setOtp('');
    setStep('checkout');
    setDrilled(false);
  };

  const showRail = wide || !drilled;
  const showPane = wide || drilled;
  const busy = step === 'processing';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Razorpay checkout">
      <button
        type="button"
        aria-label="Close checkout"
        onClick={busy ? undefined : onClose}
        className="rzp-backdrop fixed inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />

      <div
        ref={sheet}
        tabIndex={-1}
        className="rzp-sheet relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[18px] bg-white text-[13px] shadow-2xl outline-none sm:max-h-[86dvh] sm:max-w-[46rem] sm:rounded-[12px]"
        style={{ color: INK }}
      >
        <MerchantBand
          planName={planName}
          cadence={cadence}
          amountINR={amountINR}
          remaining={remaining}
          onClose={onClose}
          busy={busy}
        />

        {busy && (
          <div className="relative h-[3px] overflow-hidden" style={{ background: LINE, color: BLUE }}>
            <span className="rzp-bar absolute inset-0 block" />
          </div>
        )}

        <TestModeStrip />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {step === 'checkout' && (
            <>
              <ContactRow />
              <div className="sm:grid sm:grid-cols-[13.5rem_1fr]">
                {showRail && (
                  <MethodRail
                    method={method}
                    wide={wide}
                    onPick={(next) => {
                      setMethod(next);
                      setDrilled(true);
                    }}
                  />
                )}
                {showPane && (
                  <div key={method} className={cx('p-4 sm:p-5', wide ? 'rzp-pane' : 'rzp-push')}>
                    {!wide && (
                      <button
                        type="button"
                        onClick={() => setDrilled(false)}
                        className="mb-3 -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[12px] font-semibold"
                        style={{ color: BLUE }}
                      >
                        <Icon.arrowLeft width={14} height={14} /> All payment options
                      </button>
                    )}
                    <MethodPane method={method} amountINR={amountINR} onPay={authorise} />
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'processing' && <Processing />}
          {step === 'otp' && <SecureStep otp={otp} setOtp={setOtp} amountINR={amountINR} onVerify={settle} onCancel={restart} />}
          {step === 'success' && <Settled paymentId={paymentId} amountINR={amountINR} planName={planName} onDone={onClose} />}
          {step === 'expired' && <Expired onRetry={restart} />}
        </div>

        <SecuredStrip />
      </div>
    </div>
  );
}

/* ── chrome ─────────────────────────────────────────────────────────────── */

function MerchantBand({
  planName,
  cadence,
  amountINR,
  remaining,
  onClose,
  busy,
}: {
  planName: string;
  cadence: string;
  amountINR: number;
  remaining: number;
  onClose: () => void;
  busy: boolean;
}) {
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div className="px-4 pb-3 pt-3.5 text-white sm:px-5" style={{ background: NAVY }}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white" style={{ color: BLUE }}>
          <RazorpayMark size={22} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight">Loop Technologies</p>
          <p className="mt-0.5 truncate text-[11.5px] text-white/60">
            {planName} · {cadence}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[17px] font-bold leading-tight tabular-nums">{rupees(amountINR)}</p>
          <p className="mt-0.5 text-[10.5px] tabular-nums text-white/55">Session ends in {clock}</p>
        </div>

        <button
          type="button"
          onClick={busy ? undefined : onClose}
          disabled={busy}
          aria-label="Close"
          className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <Icon.close width={16} height={16} />
        </button>
      </div>
    </div>
  );
}

/** The real gateway prints this band whenever it is holding test keys. */
function TestModeStrip() {
  return (
    <p className="flex items-center gap-1.5 border-b px-4 py-1.5 text-[10.5px] font-semibold sm:px-5" style={{ background: '#FFF6E5', borderColor: '#F3E1BC', color: '#8A5B00' }}>
      <Icon.alert width={12} height={12} />
      Test mode — no money moves. Card 4111 1111 1111 1111, any future expiry, any CVV, OTP 123456.
    </p>
  );
}

function ContactRow() {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2.5 sm:px-5" style={{ borderColor: LINE, background: WASH }}>
      <Icon.user width={14} height={14} style={{ color: MUTED }} />
      <p className="min-w-0 flex-1 truncate text-[12px]" style={{ color: MUTED }}>
        +91 98765 43210 · billing@loop.app
      </p>
      <span className="text-[11.5px] font-semibold" style={{ color: BLUE }}>
        Edit
      </span>
    </div>
  );
}

function SecuredStrip() {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1.5 border-t px-4 py-2 text-[10.5px]" style={{ borderColor: LINE, background: WASH, color: MUTED }}>
      <Icon.lock width={11} height={11} />
      Secured by
      <span className="inline-flex items-center gap-1 font-bold" style={{ color: NAVY }}>
        <RazorpayMark size={11} />
        Razorpay
      </span>
    </div>
  );
}

/* ── method list ────────────────────────────────────────────────────────── */

function MethodRail({ method, wide, onPick }: { method: PaymentMethod; wide: boolean; onPick: (next: PaymentMethod) => void }) {
  return (
    <div className="sm:border-r sm:py-2" style={{ borderColor: LINE, background: wide ? WASH : 'transparent' }}>
      {METHODS.map((item) => {
        const active = wide && item.id === method;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            className={cx(
              'flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors sm:border-b-0 sm:border-l-[3px] sm:px-4 sm:py-2.5',
              active ? 'bg-white' : 'hover:bg-black/[0.03]',
            )}
            style={{ borderColor: active ? BLUE : LINE, borderLeftColor: active ? BLUE : 'transparent' }}
          >
            <MethodIcon id={item.id} active={active} />
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-[13px]', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
              <span className="block truncate text-[10.5px]" style={{ color: MUTED }}>
                {item.hint}
              </span>
            </span>
            <Icon.chevronRight width={14} height={14} className="sm:hidden" style={{ color: MUTED }} />
          </button>
        );
      })}
    </div>
  );
}

function MethodIcon({ id, active }: { id: PaymentMethod; active: boolean }) {
  const shared = { width: 15, height: 15, style: { color: active ? BLUE : MUTED } };
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: active ? '#E8F2FF' : '#EDF0F5' }}>
      {id === 'upi' && <Icon.bolt {...shared} />}
      {id === 'card' && <Icon.board {...shared} />}
      {id === 'netbanking' && <Icon.home {...shared} />}
      {id === 'wallet' && <Icon.folder {...shared} />}
      {id === 'paylater' && <Icon.clock {...shared} />}
    </span>
  );
}

/* ── panes ──────────────────────────────────────────────────────────────── */

function MethodPane({ method, amountINR, onPay }: { method: PaymentMethod; amountINR: number; onPay: () => void }) {
  if (method === 'upi') return <UpiPane amountINR={amountINR} onPay={onPay} />;
  if (method === 'card') return <CardPane amountINR={amountINR} onPay={onPay} />;
  if (method === 'netbanking') return <NetbankingPane onPay={onPay} />;
  if (method === 'wallet') return <ListPane title="Select a wallet" options={WALLETS.map((name) => ({ name }))} amountINR={amountINR} onPay={onPay} />;
  return <ListPane title="Pay later & EMI" options={PAY_LATER} amountINR={amountINR} onPay={onPay} />;
}

function PayButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-4 w-full rounded-lg py-3 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: BLUE }}
    >
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
      {children}
    </label>
  );
}

const fieldClass = 'mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-[13.5px] outline-none transition-colors focus:border-[#3395FF] focus:ring-2 focus:ring-[#3395FF]/20';

function UpiPane({ amountINR, onPay }: { amountINR: number; onPay: () => void }) {
  const [vpa, setVpa] = useState('');
  const valid = /^[\w.\-]{2,}@[a-z]{2,}$/i.test(vpa.trim());

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onPay();
      }}
    >
      <div className="rounded-xl border p-4 text-center" style={{ borderColor: LINE, background: WASH }}>
        <p className="text-[12px] font-semibold">Scan with any UPI app</p>
        <QrCode seed={`loop-${amountINR}`} />
        <p className="text-[10.5px]" style={{ color: MUTED }}>
          Test mode — this code is decorative and will not scan.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
          {['GPay', 'PhonePe', 'Paytm', 'BHIM'].map((app) => (
            <span key={app} className="rounded-md border bg-white px-2 py-1 text-[10.5px] font-semibold" style={{ borderColor: LINE, color: INK }}>
              {app}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>Or enter UPI ID</FieldLabel>
          <button type="button" onClick={() => setVpa(TEST_VPA)} className="text-[11px] font-semibold" style={{ color: BLUE }}>
            Use test ID
          </button>
        </div>
        <input
          type="text"
          inputMode="email"
          placeholder="yourname@okhdfcbank"
          value={vpa}
          onChange={(event) => setVpa(event.target.value)}
          className={fieldClass}
          style={{ borderColor: LINE }}
        />
        {vpa.length > 2 && !valid && (
          <p className="mt-1 text-[11px] font-medium" style={{ color: '#C0392B' }}>
            A UPI ID looks like name@bank.
          </p>
        )}
      </div>

      <PayButton label={`Pay ${rupees(amountINR)}`} disabled={!valid} />
    </form>
  );
}

function CardPane({ amountINR, onPay }: { amountINR: number; onPay: () => void }) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const network = cardNetwork(number);
  const numberOk = cardNumberValid(number);
  const expiryOk = expiryValid(expiry);
  const cvvOk = cvv.length === cvvLength(network);
  const ready = numberOk && expiryOk && cvvOk && name.trim().length > 1;

  const autofill = () => {
    setNumber(TEST_CARD.number);
    setExpiry(TEST_CARD.expiry);
    setCvv(TEST_CARD.cvv);
    setName(TEST_CARD.name);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (ready) onPay();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Card number</FieldLabel>
        <button type="button" onClick={autofill} className="text-[11px] font-semibold" style={{ color: BLUE }}>
          Use test card
        </button>
      </div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="1234 5678 9012 3456"
          value={number}
          onChange={(event) => setNumber(formatCardNumber(event.target.value))}
          className={cx(fieldClass, 'pr-20 font-mono tracking-wide')}
          style={{ borderColor: touched && !numberOk ? '#E4A0A0' : LINE }}
        />
        {network && (
          <span
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border bg-white px-1.5 py-0.5 text-[10px] font-bold"
            style={{ borderColor: LINE, color: NAVY }}
          >
            {NETWORK_LABEL[network]}
          </span>
        )}
      </div>
      {touched && !numberOk && <FieldError>That card number fails its checksum.</FieldError>}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Expiry</FieldLabel>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/YY"
            value={expiry}
            onChange={(event) => setExpiry(formatExpiry(event.target.value))}
            className={cx(fieldClass, 'text-center font-mono')}
            style={{ borderColor: touched && !expiryOk ? '#E4A0A0' : LINE }}
          />
        </div>
        <div>
          <FieldLabel>CVV</FieldLabel>
          <input
            type="password"
            inputMode="numeric"
            placeholder={network === 'amex' ? '••••' : '•••'}
            maxLength={cvvLength(network)}
            value={cvv}
            onChange={(event) => setCvv(event.target.value.replace(/\D/g, ''))}
            className={cx(fieldClass, 'text-center font-mono')}
            style={{ borderColor: touched && !cvvOk ? '#E4A0A0' : LINE }}
          />
        </div>
      </div>
      {touched && !expiryOk && <FieldError>Use a month between 01 and 12 that has not passed.</FieldError>}

      <div className="mt-3">
        <FieldLabel>Name on card</FieldLabel>
        <input
          type="text"
          autoComplete="off"
          placeholder="As printed on the card"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
          style={{ borderColor: LINE }}
        />
      </div>

      <PayButton label={`Pay ${rupees(amountINR)}`} disabled={touched && !ready} />
    </form>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[11px] font-medium" style={{ color: '#C0392B' }}>
      {children}
    </p>
  );
}

function NetbankingPane({ onPay }: { onPay: () => void }) {
  const [bank, setBank] = useState('HDFC');
  const [other, setOther] = useState('');
  const chosen = other || BANKS.find((item) => item.id === bank)?.name || '';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onPay();
      }}
    >
      <p className="text-[12px] font-semibold">Popular banks</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {BANKS.map((item) => {
          const active = !other && item.id === bank;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setBank(item.id);
                setOther('');
              }}
              className="flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2.5 transition-colors"
              style={{ borderColor: active ? BLUE : LINE, background: active ? '#E8F2FF' : 'white' }}
            >
              <span className="text-[12px] font-bold" style={{ color: active ? BLUE : INK }}>
                {item.id}
              </span>
              <span className="truncate text-[9.5px] leading-tight" style={{ color: MUTED }}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <FieldLabel>All other banks</FieldLabel>
        <select value={other} onChange={(event) => setOther(event.target.value)} className={fieldClass} style={{ borderColor: LINE }}>
          <option value="">Select a bank</option>
          {OTHER_BANKS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <PayButton label={`Pay via ${chosen}`} />
    </form>
  );
}

function ListPane({
  title,
  options,
  amountINR,
  onPay,
}: {
  title: string;
  options: { name: string; hint?: string }[];
  amountINR: number;
  onPay: () => void;
}) {
  const [picked, setPicked] = useState(options[0]?.name ?? '');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onPay();
      }}
    >
      <p className="text-[12px] font-semibold">{title}</p>
      <div className="mt-2.5 space-y-2">
        {options.map((option) => {
          const active = option.name === picked;
          return (
            <label
              key={option.name}
              className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              style={{ borderColor: active ? BLUE : LINE, background: active ? '#E8F2FF' : 'white' }}
            >
              <input
                type="radio"
                name="option"
                checked={active}
                onChange={() => setPicked(option.name)}
                className="h-4 w-4 shrink-0"
                style={{ accentColor: BLUE }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{option.name}</span>
                {option.hint && (
                  <span className="block truncate text-[10.5px]" style={{ color: MUTED }}>
                    {option.hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <PayButton label={`Pay ${rupees(amountINR)}`} disabled={!picked} />
    </form>
  );
}

/* ── steps after authorisation starts ───────────────────────────────────── */

function Processing() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute h-full w-full animate-spin rounded-full border-[3px] border-[#3395FF]/20 border-t-[#3395FF]" />
        <span style={{ color: BLUE }}>
          <RazorpayMark size={20} />
        </span>
      </span>
      <p className="mt-4 text-[14px] font-semibold">Contacting your bank</p>
      <p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>
        Do not press back or refresh this page.
      </p>
    </div>
  );
}

function SecureStep({
  otp,
  setOtp,
  amountINR,
  onVerify,
  onCancel,
}: {
  otp: string;
  setOtp: (value: string) => void;
  amountINR: number;
  onVerify: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onVerify();
      }}
      className="rzp-pane px-5 py-6 text-center"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: '#E8F2FF', color: BLUE }}>
        <Icon.shield width={22} height={22} />
      </span>

      <h3 className="mt-3 text-[15px] font-bold">3D Secure verification</h3>
      <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        Your bank is authorising {rupees(amountINR)} to Loop Technologies. Enter the code sent to the mobile ending
        <span className="font-semibold" style={{ color: INK }}>
          {' '}
          •••• 3210
        </span>
        .
      </p>

      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        placeholder="······"
        value={otp}
        onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
        aria-label="One time password"
        className="mx-auto mt-4 block w-44 rounded-lg border bg-white py-2.5 text-center font-mono text-[20px] font-bold tracking-[0.35em] outline-none focus:border-[#3395FF] focus:ring-2 focus:ring-[#3395FF]/20"
        style={{ borderColor: LINE }}
      />

      <button type="button" onClick={() => setOtp('')} className="mt-2 text-[11px] font-semibold" style={{ color: BLUE }}>
        Resend code
      </button>

      <button
        type="submit"
        disabled={otp.length !== 6}
        className="mt-4 w-full rounded-lg py-3 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: BLUE }}
      >
        Verify and pay
      </button>
      <button type="button" onClick={onCancel} className="mt-2 text-[11.5px] font-medium" style={{ color: MUTED }}>
        Cancel and choose another method
      </button>
    </form>
  );
}

function Settled({
  paymentId,
  amountINR,
  planName,
  onDone,
}: {
  paymentId: string;
  amountINR: number;
  planName: string;
  onDone: () => void;
}) {
  return (
    <div className="px-5 py-7 text-center">
      <span className="rzp-ring mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: '#E4F7EE' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#12805C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path className="rzp-tick" d="M20 6L9 17l-5-5" />
        </svg>
      </span>

      <h3 className="mt-3 text-[17px] font-bold" style={{ color: '#12805C' }}>
        Payment successful
      </h3>
      <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
        {planName} is active. A receipt is on its way to billing@loop.app.
      </p>

      <dl className="mx-auto mt-4 max-w-xs space-y-1.5 rounded-xl border p-3 text-left text-[11.5px]" style={{ borderColor: LINE, background: WASH }}>
        <Receipt label="Payment ID" value={paymentId} mono />
        <Receipt label="Amount" value={rupees(amountINR)} />
        <Receipt label="Status" value="CAPTURED" />
      </dl>

      <button type="button" onClick={onDone} className="mt-5 w-full rounded-lg py-3 text-[14px] font-semibold text-white" style={{ background: BLUE }}>
        Continue to workspace
      </button>
    </div>
  );
}

function Receipt({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd className={cx('truncate font-semibold', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

function Expired({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-5 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: '#FFF1E6', color: '#B45309' }}>
        <Icon.clock width={22} height={22} />
      </span>
      <h3 className="mt-3 text-[15px] font-bold">This session has expired</h3>
      <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        Checkout sessions are held for five minutes. Nothing was charged.
      </p>
      <button type="button" onClick={onRetry} className="mt-5 w-full rounded-lg py-3 text-[14px] font-semibold text-white" style={{ background: BLUE }}>
        Start again
      </button>
    </div>
  );
}

/* ── decoration ─────────────────────────────────────────────────────────── */

/**
 * The gateway mark: three angled bars reading as an R.
 *
 * Drawn rather than imported so the sheet has no external asset, and kept
 * deliberately generic — it is the silhouette of a payment brand, not a
 * traced copy of one.
 */
function RazorpayMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.1 2.2h4.4L11.6 21.8H7.2z" />
      <path d="M4.5 7.6h6.9l-1 3.2H3.5z" opacity="0.55" />
      <path d="M3.2 13.2h6.9l-1 3.2H2.2z" opacity="0.55" />
    </svg>
  );
}

/**
 * A QR-shaped block: finder squares, timing rows and a stable module pattern.
 *
 * Decorative on purpose. Encoding a genuine UPI intent would need a real QR
 * encoder for a sheet that takes no real payment, and a random module grid is
 * not a valid symbol, so a scanner declines to read it rather than sending
 * anybody anywhere.
 */
function QrCode({ seed }: { seed: string }) {
  const modules = useMemo(() => {
    const size = 25;
    const grid: boolean[] = new Array(size * size).fill(false);

    let hash = 2166136261;
    for (const character of seed) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    }

    const finder = (originX: number, originY: number) => {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const ring = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[(originY + y) * size + originX + x] = ring || core;
        }
      }
    };

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        hash = (Math.imul(hash, 1103515245) + 12345) >>> 0;
        grid[y * size + x] = (hash >>> 16) % 100 < 46;
      }
    }

    // Quiet zones around the finders, then the finders themselves.
    for (const [originX, originY] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
          const gx = originX + x;
          const gy = originY + y;
          if (gx >= 0 && gx < size && gy >= 0 && gy < size) grid[gy * size + gx] = false;
        }
      }
      finder(originX, originY);
    }

    for (let i = 8; i < size - 8; i += 1) {
      grid[6 * size + i] = i % 2 === 0;
      grid[i * size + 6] = i % 2 === 0;
    }

    return { size, grid };
  }, [seed]);

  return (
    <span className="rzp-qr my-3 inline-flex rounded-lg border-4 border-white bg-white p-1 shadow-sm" style={{ borderColor: 'white' }}>
      <svg width={124} height={124} viewBox={`0 0 ${modules.size} ${modules.size}`} shapeRendering="crispEdges" role="img" aria-label="Decorative UPI QR placeholder">
        <rect width={modules.size} height={modules.size} fill="#ffffff" />
        {modules.grid.map((on, index) =>
          on ? <rect key={index} x={index % modules.size} y={Math.floor(index / modules.size)} width={1} height={1} fill={NAVY} /> : null,
        )}
      </svg>
    </span>
  );
}
