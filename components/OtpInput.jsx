import React, { useEffect, useRef, useState } from 'react';

export default function OtpInput({
  value = '',
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
}) {
  const inputs = useRef([]);
  const digits = String(value || '').replace(/\D/g, '').slice(0, length);
  const complete = digits.length === length;
  const [popIndex, setPopIndex] = useState(-1);
  const [completePulse, setCompletePulse] = useState(false);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = setTimeout(() => {
      const nextEmpty = Math.min(digits.length, length - 1);
      inputs.current[nextEmpty]?.focus();
    }, 40);
    return () => clearTimeout(timer);
  }, [autoFocus, length]);

  useEffect(() => {
    if (!digits.length) {
      setPopIndex(-1);
      setCompletePulse(false);
      return undefined;
    }

    setPopIndex(digits.length - 1);
    const popTimer = setTimeout(() => setPopIndex(-1), 280);

    if (digits.length === length) {
      setCompletePulse(true);
      const doneTimer = setTimeout(() => setCompletePulse(false), 480);
      return () => {
        clearTimeout(popTimer);
        clearTimeout(doneTimer);
      };
    }

    setCompletePulse(false);
    return () => clearTimeout(popTimer);
  }, [digits, length]);

  const focusAt = (idx) => {
    const target = Math.max(0, Math.min(length - 1, idx));
    inputs.current[target]?.focus();
    inputs.current[target]?.select?.();
  };

  const applyDigits = (next, focusIdx) => {
    const cleaned = String(next || '').replace(/\D/g, '').slice(0, length);
    onChange(cleaned);
    if (typeof focusIdx === 'number') focusAt(focusIdx);
  };

  const handleChange = (event, idx) => {
    const incoming = event.target.value.replace(/\D/g, '');
    if (!incoming) {
      applyDigits(digits.slice(0, idx) + digits.slice(idx + 1), idx);
      return;
    }
    if (incoming.length > 1) {
      applyDigits(incoming, Math.min(incoming.length, length) - 1);
      return;
    }
    const next = `${digits.slice(0, idx)}${incoming}${digits.slice(idx + 1)}`.slice(0, length);
    applyDigits(next, idx + 1 < length ? idx + 1 : idx);
  };

  const handleKeyDown = (event, idx) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[idx]) {
        applyDigits(digits.slice(0, idx) + digits.slice(idx + 1), idx);
        return;
      }
      if (idx > 0) {
        applyDigits(digits.slice(0, idx - 1), idx - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(idx - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(idx + 1);
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData?.getData('text') || '';
    const incoming = pasted.replace(/\D/g, '').slice(0, length);
    if (!incoming) return;
    event.preventDefault();
    applyDigits(incoming, Math.min(incoming.length, length) - 1);
  };

  return (
    <div className="otp-pin-row" dir="ltr" onPaste={handlePaste}>
      {Array.from({ length }).map((_, idx) => {
        const filled = Boolean(digits[idx]);
        const cellClass = [
          'otp-pin-cell',
          filled ? 'is-filled' : '',
          complete ? 'is-complete' : '',
          !complete && popIndex === idx ? 'otp-pin-pop' : '',
          complete && completePulse ? 'otp-pin-complete' : '',
        ].filter(Boolean).join(' ');

        return (
          <label key={idx} className={cellClass}>
            <input
              ref={(el) => {
                inputs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              disabled={disabled}
              aria-label={`Digit ${idx + 1} of ${length}`}
              value={digits[idx] || ''}
              onChange={(event) => handleChange(event, idx)}
              onKeyDown={(event) => handleKeyDown(event, idx)}
              onFocus={(event) => event.target.select()}
              className="otp-pin-input"
            />
            <span className="otp-pin-bar" />
          </label>
        );
      })}
    </div>
  );
}
