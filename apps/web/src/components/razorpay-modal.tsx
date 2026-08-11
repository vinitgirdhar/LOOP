'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';

export interface RazorpayModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  amountINR: number;
  cadence?: string;
  onSuccess?: (details: { paymentId: string; amount: number; plan: string }) => void;
}

type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';

export function RazorpayModal({
  isOpen,
  onClose,
  planName,
  amountINR,
  cadence = 'per month',
  onSuccess,
}: RazorpayModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [vpa, setVpa] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [selectedBank, setSelectedBank] = useState('HDFC');
  
  const [step, setStep] = useState<'checkout' | 'processing' | 'otp' | 'success'>('checkout');
  const [otp, setOtp] = useState('');
  const [paymentId, setPaymentId] = useState('');

  if (!isOpen) return null;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');

    // Simulate gateway handoff to OTP
    setTimeout(() => {
      const generatedId = `pay_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 6)}`;
      setPaymentId(generatedId);
      setStep('otp');
    }, 1500);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');

    setTimeout(() => {
      setStep('success');
      if (onSuccess) {
        onSuccess({ paymentId, amount: amountINR, plan: planName });
      }
    }, 1200);
  };

  const formatCardNum = (val: string) => {
    const v = val.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return val;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity"
        onClick={step === 'processing' ? undefined : onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl transition-all">
        
        {/* Razorpay Brand Header */}
        <div className="bg-[#0c2340] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 font-bold text-white shadow-sm">
                R
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Razorpay Trusted</p>
                <p className="text-sm font-bold leading-tight">Loop Technologies</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={step === 'processing'}
              className="rounded-full p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon.close width={18} height={18} />
            </button>
          </div>

          <div className="mt-4 flex items-baseline justify-between border-t border-blue-900/60 pt-3">
            <div>
              <p className="text-xs text-blue-200">{planName} ({cadence})</p>
              <p className="text-xl font-extrabold text-white">₹{amountINR.toLocaleString('en-IN')}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              256-Bit SSL
            </span>
          </div>
        </div>

        {/* Modal Body depending on Step */}
        {step === 'checkout' && (
          <div className="p-5 sm:p-6">
            {/* Method Tabs */}
            <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-[var(--bg-inset)] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMethod('upi')}
                className={cx('rounded-lg py-2 transition-all', method === 'upi' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]')}
              >
                UPI / QR
              </button>
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={cx('rounded-lg py-2 transition-all', method === 'card' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]')}
              >
                Card
              </button>
              <button
                type="button"
                onClick={() => setMethod('netbanking')}
                className={cx('rounded-lg py-2 transition-all', method === 'netbanking' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]')}
              >
                Banking
              </button>
              <button
                type="button"
                onClick={() => setMethod('wallet')}
                className={cx('rounded-lg py-2 transition-all', method === 'wallet' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]')}
              >
                Wallets
              </button>
            </div>

            {/* UPI Payment Option */}
            {method === 'upi' && (
              <form onSubmit={handlePay} className="mt-5 space-y-4">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-center">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">Scan & Pay via any UPI App</p>
                  
                  {/* Simulated QR Code SVG */}
                  <div className="my-3 flex h-32 w-32 items-center justify-center rounded-xl bg-white p-2 shadow-inner border border-slate-200">
                    <svg viewBox="0 0 100 100" className="h-full w-full text-slate-900" fill="currentColor">
                      <rect x="0" y="0" width="30" height="30" />
                      <rect x="5" y="5" width="20" height="20" fill="white" />
                      <rect x="10" y="10" width="10" height="10" />
                      <rect x="70" y="0" width="30" height="30" />
                      <rect x="75" y="5" width="20" height="20" fill="white" />
                      <rect x="80" y="10" width="10" height="10" />
                      <rect x="0" y="70" width="30" height="30" />
                      <rect x="5" y="75" width="20" height="20" fill="white" />
                      <rect x="10" y="80" width="10" height="10" />
                      <rect x="38" y="10" width="8" height="20" />
                      <rect x="52" y="15" width="10" height="8" />
                      <rect x="35" y="40" width="30" height="20" />
                      <rect x="70" y="45" width="20" height="15" />
                      <rect x="40" y="70" width="15" height="20" />
                      <rect x="65" y="75" width="25" height="15" />
                    </svg>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-[var(--text-muted)]">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 font-bold dark:bg-blue-900/40 dark:text-blue-300">GPay</span>
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 font-bold dark:bg-purple-900/40 dark:text-purple-300">PhonePe</span>
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700 font-bold dark:bg-sky-900/40 dark:text-sky-300">Paytm</span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 font-bold dark:bg-amber-900/40 dark:text-amber-300">BHIM</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)]">Or enter UPI ID / VPA</label>
                  <input
                    type="text"
                    placeholder="mobilenumber@upi or name@okaxis"
                    value={vpa}
                    onChange={(e) => setVpa(e.target.value)}
                    className="input mt-1 text-sm"
                  />
                </div>

                <button type="submit" className="btn btn-primary w-full py-3 font-semibold text-sm shadow-md">
                  Pay ₹{amountINR.toLocaleString('en-IN')} via UPI
                </button>
              </form>
            )}

            {/* Credit/Debit Card Option */}
            {method === 'card' && (
              <form onSubmit={handlePay} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)]">Card Number</label>
                  <input
                    type="text"
                    maxLength={19}
                    placeholder="4532 •••• •••• 8921"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNum(e.target.value))}
                    required
                    className="input mt-1 font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)]">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="08/28"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      required
                      className="input mt-1 text-center font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)]">CVV / CVC</label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="•••"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      required
                      className="input mt-1 text-center font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)]">Cardholder Name</label>
                  <input
                    type="text"
                    placeholder="Full Name as on card"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="input mt-1 text-sm"
                  />
                </div>

                <button type="submit" className="btn btn-primary w-full py-3 font-semibold text-sm shadow-md">
                  Pay ₹{amountINR.toLocaleString('en-IN')}
                </button>
              </form>
            )}

            {/* Netbanking Option */}
            {method === 'netbanking' && (
              <form onSubmit={handlePay} className="mt-4 space-y-4">
                <p className="text-xs font-medium text-[var(--text-muted)]">Select Popular Indian Bank</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'HDFC', name: 'HDFC Bank' },
                    { id: 'ICICI', name: 'ICICI Bank' },
                    { id: 'SBI', name: 'State Bank' },
                    { id: 'AXIS', name: 'Axis Bank' },
                    { id: 'KOTAK', name: 'Kotak Bank' },
                    { id: 'YES', name: 'Yes Bank' },
                  ].map((bank) => (
                    <button
                      key={bank.id}
                      type="button"
                      onClick={() => setSelectedBank(bank.id)}
                      className={cx(
                        'flex flex-col items-center justify-center rounded-xl border p-2.5 text-xs font-semibold transition-all',
                        selectedBank === bank.id
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/30'
                          : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                      )}
                    >
                      <span className="font-bold text-sm">{bank.id}</span>
                      <span className="text-[10px] opacity-75">{bank.name}</span>
                    </button>
                  ))}
                </div>

                <button type="submit" className="btn btn-primary w-full py-3 font-semibold text-sm shadow-md">
                  Pay via {selectedBank} Netbanking
                </button>
              </form>
            )}

            {/* Wallets Option */}
            {method === 'wallet' && (
              <form onSubmit={handlePay} className="mt-4 space-y-4">
                <p className="text-xs font-medium text-[var(--text-muted)]">Select Wallet / Pay Later</p>
                <div className="space-y-2">
                  {['Paytm Wallet', 'PhonePe Wallet', 'MobiKwik', 'LazyPay (30 Days 0% Interest)', 'Simpl'].map((w) => (
                    <label
                      key={w}
                      className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs font-medium cursor-pointer hover:bg-[var(--bg-inset)]"
                    >
                      <span className="font-semibold">{w}</span>
                      <input type="radio" name="wallet" defaultChecked={w.startsWith('Paytm')} className="accent-blue-600" />
                    </label>
                  ))}
                </div>

                <button type="submit" className="btn btn-primary w-full py-3 font-semibold text-sm shadow-md">
                  Pay ₹{amountINR.toLocaleString('en-IN')}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Gateway Processing Step */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute h-full w-full animate-spin rounded-full border-4 border-blue-500/20 border-t-blue-600" />
              <div className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-600 font-bold flex items-center justify-center">
                R
              </div>
            </div>
            <p className="mt-4 font-bold text-base">Contacting Bank Gateway...</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Please do not refresh or close this window.</p>
          </div>
        )}

        {/* Simulated Bank 3D Secure OTP Step */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <Icon.shield width={24} height={24} />
            </div>
            <div>
              <h3 className="font-bold text-base">3D Secure OTP Verification</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Enter the 6-digit OTP sent to your registered mobile ending in <span className="font-mono font-semibold text-[var(--text)]">•••• 8920</span>
              </p>
            </div>

            <div className="my-2">
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="input text-center font-mono text-xl tracking-[0.4em] font-bold"
              />
              {/* Was a <p> styled as a link, so it invited a tap and did
                  nothing. In a simulated checkout the honest behaviour is to
                  clear the field and let the reader start again. */}
              <button
                type="button"
                onClick={() => setOtp('')}
                className="mt-1.5 text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                Resend OTP (simulated — enter 123456)
              </button>
            </div>

            <button
              type="submit"
              disabled={otp.length !== 6}
              className="btn btn-primary w-full py-3 text-sm font-semibold shadow-md disabled:opacity-50"
            >
              Verify & Complete Payment
            </button>
          </form>
        )}

        {/* Payment Success Confirmation Step */}
        {step === 'success' && (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 ring-8 ring-emerald-500/10">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div>
              <h3 className="font-extrabold text-xl text-emerald-600 dark:text-emerald-400">Payment Successful!</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Your subscription for <span className="font-semibold text-[var(--text)]">{planName}</span> is active.</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-left text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Payment ID:</span>
                <span className="font-bold">{paymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Amount Paid:</span>
                <span className="font-bold">₹{amountINR.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Status:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">CAPTURED</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary w-full py-3 text-sm font-semibold shadow-md"
            >
              Continue to Workspace
            </button>
          </div>
        )}

        {/* Razorpay Footer Security Badge */}
        <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-2.5 text-center text-[10px] text-[var(--text-faint)] flex items-center justify-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </svg>
          Secured by Razorpay Payments India • PCI-DSS Compliant
        </div>
      </div>
    </div>
  );
}
