import React, { useState, useEffect, useCallback } from 'react';
import { X, Eye, EyeOff, KeyRound, Mail, MessageCircle, Check, Loader2, ChevronDown } from 'lucide-react';
import { auth, ensureLocalAuthPersistence } from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { pushGtmEvent } from '@/lib/pushGtmEcommerceEvent';
import { GTM_EVENTS, gtmDedupeKey } from '@/lib/gtmEvents';
import { signInWithGooglePopup, signInWithFacebookPopup, getAuthErrorMessage as getSharedAuthErrorMessage } from '@/lib/firebaseAuthActions';
import Image from 'next/image';
import Link from 'next/link';
import GoogleIcon from '../assets/google.png';
import axios from 'axios';
import { countryCodes, UAE_PHONE_CODE } from '../assets/countryCodes';
import {
  clampPhoneInput,
  getPhoneInputError,
  getPhoneInputHint,
  getPhonePlaceholder,
  isValidPhoneNumber,
} from '@/lib/phoneValidation';
import { linkGuestOrdersForCurrentUser } from '@/lib/linkGuestOrdersClient';
import { validatePasswordStrength } from '@/lib/passwordPolicy';
import OtpInput from '@/components/OtpInput';
import {
  fetchCaptchaChallenge,
  runPreLogin,
  reportLoginResult,
  requestPasswordReset,
  confirmPasswordReset,
  requestWhatsAppOtp,
  verifyWhatsAppOtp,
  requestEmailOtp,
  verifyEmailOtp,
  setMfaVerified,
} from '@/lib/authClient';

function looksLikePhoneNumber(value = '') {
  const text = String(value || '').trim();
  if (!text || text.includes('@')) return false;
  return /^\+?[\d\s()-]{7,}$/.test(text);
}

function isValidEmailAddress(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function formatPhoneDisplay(digits = '') {
  const raw = String(digits || '').replace(/\D/g, '');
  if (raw.startsWith('0')) {
    if (raw.length <= 3) return raw;
    if (raw.length <= 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`;
    return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
  }
  if (raw.length <= 2) return raw;
  if (raw.length <= 5) return `${raw.slice(0, 2)} ${raw.slice(2)}`;
  return `${raw.slice(0, 2)} ${raw.slice(2, 5)} ${raw.slice(5)}`;
}

function CountryCodePicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = countryCodes.find((country) => country.code === value) || countryCodes[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const timer = window.setTimeout(() => {
      window.addEventListener('click', close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', close);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="flex h-[42px] min-w-[7.25rem] items-center justify-between gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm font-medium text-gray-800 disabled:bg-gray-50"
      >
        <span>{selected.code}</span>
        <ChevronDown size={14} className={`shrink-0 text-gray-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-1 max-h-56 w-64 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {countryCodes.map((country) => (
            <button
              key={country.code}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onChange(country.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                country.code === selected.code ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'
              }`}
            >
              <span className="truncate pr-2">{country.label}</span>
              <span className="shrink-0 text-gray-500">{country.code}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isMathCaptchaSolved(question, answer) {
  const match = String(question || '').match(/(\d+)\s*\+\s*(\d+)/);
  if (!match) return false;
  const expected = Number(match[1]) + Number(match[2]);
  const given = Number(String(answer || '').trim());
  return Number.isFinite(given) && given === expected;
}

function CaptchaField({ question, value, onChange, onRefresh, onReady }) {
  const solved = isMathCaptchaSolved(question, value);
  const attempted = String(value || '').trim() !== '';
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    if (!solved) {
      setPhase('idle');
      onReady?.(false);
      return undefined;
    }

    setPhase('loading');
    onReady?.(false);
    const timer = setTimeout(() => {
      setPhase('success');
      onReady?.(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [solved, question, onReady]);

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <Loader2 size={18} className="shrink-0 animate-spin text-slate-600" />
        <p className="text-sm font-medium text-slate-700">Verifying CAPTCHA…</p>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2.5">
        <Check size={18} className="shrink-0 text-emerald-600" strokeWidth={2.5} />
        <p className="text-sm font-medium text-emerald-800">CAPTCHA verified successfully</p>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition bg-white ${
      attempted ? 'border-red-300' : 'border-gray-300'
    }`}>
      <div className="flex w-full items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-gray-600 whitespace-nowrap">{question}</label>
        <input
          type="text"
          inputMode="numeric"
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
            attempted ? 'text-red-600' : 'text-gray-900'
          }`}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
          placeholder="Answer"
          required
        />
        {onRefresh ? (
          <button type="button" className="shrink-0 text-xs text-blue-600" onClick={onRefresh}>
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SignInModal = ({ open, onClose, defaultMode = 'login', bonusMessage = '', variant = 'modal' }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [view, setView] = useState('auth'); // auth | reset | mfa | otp
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countryCode, setCountryCode] = useState('+971');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [fieldErrors, setFieldErrors] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captcha, setCaptcha] = useState({ challengeId: '', question: '' });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaConfirmed, setCaptchaConfirmed] = useState(false);
  const [authMethod, setAuthMethod] = useState('email'); // email | whatsapp | email_otp
  const [otpChannel, setOtpChannel] = useState('whatsapp'); // email | whatsapp
  const [whatsappStep, setWhatsappStep] = useState('phone'); // phone | otp
  const [whatsappOtp, setWhatsappOtp] = useState('');
  const [whatsappCooldown, setWhatsappCooldown] = useState(0);
  const [emailOtpStep, setEmailOtpStep] = useState('email'); // email | otp
  const [emailOtp, setEmailOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [formNonce, setFormNonce] = useState(0);
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const [resetToken, setResetToken] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetChannel, setResetChannel] = useState('email'); // email | whatsapp
  const [resetStep, setResetStep] = useState('identify'); // identify | code
  const [resetCooldown, setResetCooldown] = useState(0);
  const [resetSentTo, setResetSentTo] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [pendingMfaToken, setPendingMfaToken] = useState('');
  const [modalSettings, setModalSettings] = useState({
    sideImage: '',
    sideImageLink: '',
    sideImageClickable: false,
    showCtaButton: false,
    ctaButtonText: 'Shop Now',
    ctaButtonLink: '/shop',
  });

  const getAuthErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
    return getSharedAuthErrorMessage(err, fallback);
  };

  React.useEffect(() => {
    axios.get('/api/store/signin-modal').then(res => {
      if (res.data) setModalSettings(prev => ({ ...prev, ...res.data }));
    }).catch(() => {});
  }, []);

  const resetAuthForm = useCallback(() => {
    setIsRegister(defaultMode === 'register');
    setView('auth');
    setName('');
    setEmail('');
    setOtpEmail('');
    setFormNonce((value) => value + 1);
    setPassword('');
    setConfirmPassword('');
    setPhoneNumber('');
    setError('');
    setInfo('');
    setFieldErrors({
      name: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
    setLoading(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setCaptchaAnswer('');
    setCaptchaConfirmed(false);
    setAuthMethod('email');
    setOtpChannel('whatsapp');
    setWhatsappStep('phone');
    setWhatsappOtp('');
    setWhatsappCooldown(0);
    setEmailOtpStep('email');
    setEmailOtp('');
    setEmailOtpCooldown(0);
    setResetOtp('');
    setResetToken('');
    setResetChannel('email');
    setResetStep('identify');
    setResetCooldown(0);
    setResetSentTo('');
    setMfaCode('');
    setPendingMfaToken('');
  }, [defaultMode]);

  const captchaReady = !captcha.question || captchaConfirmed;

  React.useEffect(() => {
    if (variant !== 'modal') return undefined;
    if (open) {
      resetAuthForm();
    }
    return undefined;
  }, [open, variant, resetAuthForm]);

  // Clear errors when switching between login and register
  React.useEffect(() => {
    setError('');
    setInfo('');
    setWhatsappOtp('');
    setWhatsappStep('phone');
    setFieldErrors({
      name: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: ''
    });
  }, [isRegister, authMethod]);

  const loadCaptcha = useCallback(async () => {
    try {
      const data = await fetchCaptchaChallenge();
      setCaptcha({ challengeId: data.challengeId, question: data.question });
      setCaptchaAnswer('');
      setCaptchaConfirmed(false);
    } catch {
      setCaptcha({ challengeId: '', question: '' });
      setCaptchaConfirmed(false);
    }
  }, []);

  useEffect(() => {
    if (open || variant === 'page') {
      void loadCaptcha();
    }
  }, [open, variant, isRegister, view, authMethod, loadCaptcha]);

  useEffect(() => {
    if (whatsappCooldown <= 0) return undefined;
    const timer = setTimeout(() => setWhatsappCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [whatsappCooldown]);

  useEffect(() => {
    if (emailOtpCooldown <= 0) return undefined;
    const timer = setTimeout(() => setEmailOtpCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [emailOtpCooldown]);

  useEffect(() => {
    if (resetCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResetCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resetCooldown]);

  const openOtpLogin = (channel = 'whatsapp') => {
    setView('otp');
    setIsRegister(false);
    setOtpChannel(channel);
    setAuthMethod(channel === 'email' ? 'email_otp' : 'whatsapp');
    if (channel !== 'email') setCountryCode(UAE_PHONE_CODE);
    setError('');
    setInfo('');
    setWhatsappStep('phone');
    setWhatsappOtp('');
    setEmailOtpStep('email');
    setEmailOtp('');
    setOtpEmail(isValidEmailAddress(email) ? email : '');
    setFormNonce((value) => value + 1);
    void loadCaptcha();
  };

  const closeOtpLogin = () => {
    setView('auth');
    setAuthMethod('email');
    setError('');
    setInfo('');
    void loadCaptcha();
  };

  const switchOtpChannel = (channel) => {
    setOtpChannel(channel);
    setAuthMethod(channel === 'email' ? 'email_otp' : 'whatsapp');
    setError('');
    setInfo('');
    if (channel === 'email') {
      setWhatsappStep('phone');
      setWhatsappOtp('');
      setOtpEmail((current) => (isValidEmailAddress(current) ? current : ''));
      setFormNonce((value) => value + 1);
    } else {
      setCountryCode(UAE_PHONE_CODE);
      setEmailOtpStep('email');
      setEmailOtp('');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    const resetEmail = params.get('email');
    if (token) {
      setResetToken(token);
      setView('reset');
      setResetChannel('email');
      setResetStep('code');
      if (resetEmail) {
        setEmail(resetEmail);
        setResetSentTo(resetEmail);
      }
    }
  }, []);

  if (!open && variant === 'modal') return null;

  const isPage = variant === 'page';

  const validateEmail = (email) => {
    // Simple email regex
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateName = (name) => {
    // Name should be at least 2 characters and contain only letters and spaces
    return name.trim().length >= 2 && /^[a-zA-Z\s]+$/.test(name.trim());
  };

  const validatePhoneNumber = (phone, code) => isValidPhoneNumber(phone, code);

  const trackLoginLocation = (token) => {
    const pageUrl = typeof window !== 'undefined' ? window.location.pathname : '/';
    axios.post('/api/users/track-location', { pageUrl }, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const runPostAuthTasks = async (user, { isNewUser = false, emailOverride = '', nameOverride = '', phoneOverride = '', method } = {}) => {
    try {
      const token = await user.getIdToken();
      trackLoginLocation(token);

      void linkGuestOrdersForCurrentUser(user, token, {
        email: emailOverride || user.email || '',
        phone: phoneOverride || user.phoneNumber || '',
      });

      const authMethod = method
        || (emailOverride ? 'email' : (user.phoneNumber && !user.email ? 'phone' : 'google'));

      if (isNewUser) {
        pushGtmEvent(
          GTM_EVENTS.SIGN_UP,
          { method: authMethod },
          gtmDedupeKey(GTM_EVENTS.SIGN_UP, user.uid),
        );

        axios.post('/api/wallet/bonus', {}, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});

        axios.post('/api/send-welcome-email', {
          email: emailOverride || user.email,
          name: nameOverride || user.displayName || 'Customer',
        }, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => {
          console.error('Welcome email failed:', err?.response?.data || err?.message || err);
        });
      } else {
        pushGtmEvent(
          GTM_EVENTS.LOGIN,
          { method: authMethod },
          gtmDedupeKey(GTM_EVENTS.LOGIN, user.uid),
        );
        axios.post('/api/send-login-email', {
          email: emailOverride || user.email,
          name: nameOverride || user.displayName || 'Customer',
        }, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => {
          console.error('Login alert email failed:', err?.response?.data || err?.message || err);
        });
      }
    } catch {
      // Non-blocking background work.
    }
  };

  const finishAuthSuccess = async (user, { isNewUser = false, emailOverride = '', nameOverride = '', phoneOverride = '', method } = {}) => {
    const token = await user.getIdToken();
    const loginMeta = await reportLoginResult({
      email: emailOverride || user.email,
      success: true,
      idToken: token,
    });

    if (loginMeta.twoFactorRequired) {
      setPendingMfaToken(token);
      setView('mfa');
      setInfo('Enter the verification code sent to your email.');
      await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken: token }),
      }).catch(() => {});
      return;
    }

    setMfaVerified(true);
    if (isNewUser && !user.emailVerified) {
      try {
        await sendEmailVerification(user);
      } catch {
        // non-blocking
      }
    }

    onClose();
    void runPostAuthTasks(user, { isNewUser, emailOverride, nameOverride, phoneOverride, method });
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithGooglePopup();
      const isNewUser = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;

      const bonusClaimed = localStorage.getItem('welcomeBonusClaimed');
      if (bonusClaimed === 'true') {
        localStorage.setItem('freeShippingEligible', 'true');
        localStorage.removeItem('welcomeBonusClaimed');
      }

      await finishAuthSuccess(result.user, { isNewUser, method: 'google' });
    } catch (err) {
      console.error('Google sign-in error:', err);
      const errorMessage = getAuthErrorMessage(err, 'Google sign-in failed. Please try again.');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithFacebookPopup();
      const isNewUser = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;

      const bonusClaimed = localStorage.getItem('welcomeBonusClaimed');
      if (bonusClaimed === 'true') {
        localStorage.setItem('freeShippingEligible', 'true');
        localStorage.removeItem('welcomeBonusClaimed');
      }

      await finishAuthSuccess(result.user, { isNewUser, method: 'facebook' });
    } catch (err) {
      console.error('Facebook sign-in error:', err);
      const errorMessage = getAuthErrorMessage(err, 'Facebook sign-in failed. Please try again.');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openResetView = (channel = 'email') => {
    setView('reset');
    setResetChannel(channel);
    setResetStep(resetToken ? 'code' : 'identify');
    setResetOtp('');
    setError('');
    setInfo('');
    if (channel === 'whatsapp') {
      setCountryCode(UAE_PHONE_CODE);
      setResetToken('');
    }
  };

  const switchResetChannel = (channel) => {
    if (channel === resetChannel) return;
    setResetChannel(channel);
    setResetStep('identify');
    setResetOtp('');
    setResetToken('');
    setResetSentTo('');
    setResetCooldown(0);
    setError('');
    setInfo('');
    if (channel === 'whatsapp') setCountryCode(UAE_PHONE_CODE);
  };

  const handleResetIdentityChange = (nextEmail) => {
    const value = looksLikePhoneNumber(nextEmail) ? '' : nextEmail;
    setEmail(value);
    if (resetToken) setResetToken('');
    if (resetSentTo && value.trim().toLowerCase() !== String(resetSentTo).trim().toLowerCase()) {
      setResetStep('identify');
      setResetOtp('');
      setInfo('');
    }
  };

  const handleForgotSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    setInfo('');

    if (resetChannel === 'whatsapp') {
      const phoneError = getPhoneInputError(phoneNumber, UAE_PHONE_CODE);
      if (phoneError) {
        setError(phoneError);
        return;
      }
    } else if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    const isResend = resetStep === 'code' && resetSentTo && (
      resetChannel === 'whatsapp'
        ? phoneNumber === resetSentTo
        : email.trim().toLowerCase() === String(resetSentTo).trim().toLowerCase()
    );
    if (!isResend && !isMathCaptchaSolved(captcha.question, captchaAnswer)) {
      setError('Please solve the CAPTCHA.');
      return;
    }
    setLoading(true);
    try {
      const data = resetChannel === 'whatsapp'
        ? await requestPasswordReset({
            channel: 'whatsapp',
            phone: phoneNumber,
            phoneCode: UAE_PHONE_CODE,
            captchaChallengeId: captcha.challengeId,
            captchaAnswer,
          })
        : await requestPasswordReset({
            channel: 'email',
            email,
            captchaChallengeId: captcha.challengeId,
            captchaAnswer,
          });
      setInfo(data.message || (resetChannel === 'whatsapp'
        ? 'If an account exists, a WhatsApp code has been sent.'
        : 'If an account exists, a reset code was sent.'));
      setResetStep('code');
      setResetSentTo(resetChannel === 'whatsapp' ? phoneNumber : email);
      setResetCooldown(45);
    } catch (err) {
      setError(err.message || 'Could not send reset code');
      void loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e) => {
    e.preventDefault();
    setError('');
    const policy = validatePasswordStrength(password);
    if (!policy.ok) {
      setError(policy.message);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (resetChannel === 'whatsapp') {
      const phoneError = getPhoneInputError(phoneNumber, UAE_PHONE_CODE);
      if (phoneError) {
        setError(phoneError);
        return;
      }
      if (resetOtp.replace(/\D/g, '').length < 4) {
        setError('Enter the 4-digit WhatsApp code.');
        return;
      }
    } else if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    } else if (!resetToken && resetOtp.replace(/\D/g, '').length < 6) {
      setError('Enter the 6-digit email code.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(resetChannel === 'whatsapp'
        ? {
            channel: 'whatsapp',
            phone: phoneNumber,
            phoneCode: UAE_PHONE_CODE,
            otp: resetOtp,
            newPassword: password,
          }
        : {
            channel: 'email',
            email,
            newPassword: password,
            resetToken: resetToken || undefined,
            otp: resetOtp || undefined,
          });
      setInfo('Password updated. Please sign in.');
      setView('auth');
      setIsRegister(false);
      setPassword('');
      setConfirmPassword('');
      setResetOtp('');
      setResetToken('');
      setResetStep('identify');
      setResetSentTo('');
    } catch (err) {
      setError(err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = pendingMfaToken || (await auth.currentUser?.getIdToken());
      const res = await fetch('/api/auth/mfa', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: mfaCode, idToken: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      setMfaVerified(true);
      setView('auth');
      onClose();
      if (auth.currentUser) {
        void runPostAuthTasks(auth.currentUser, { emailOverride: email, method: 'email' });
      }
    } catch (err) {
      setError(err.message || 'MFA failed');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppSend = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (isRegister) {
      if (!name.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!validateName(name)) {
        setError('Name should contain only letters and be at least 2 characters.');
        return;
      }
    }
    if (!phoneNumber.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    if (!validatePhoneNumber(phoneNumber, countryCode)) {
      setError(getPhoneInputError(phoneNumber, countryCode) || 'Enter a valid UAE mobile number (05xxxxxxxx).');
      return;
    }
    const isResend = whatsappStep === 'otp';
    if (!isResend && !isMathCaptchaSolved(captcha.question, captchaAnswer)) {
      setError('Please solve the CAPTCHA.');
      return;
    }

    setLoading(true);
    try {
      const data = await requestWhatsAppOtp({
        phone: phoneNumber,
        phoneCode: countryCode,
        name,
        captchaChallengeId: captcha.challengeId,
        captchaAnswer,
      });
      setWhatsappStep('otp');
      setWhatsappOtp('');
      setWhatsappCooldown(data.retryAfterSeconds || 45);
      setInfo(data.message || 'WhatsApp code sent. Check your messages.');
      void loadCaptcha();
    } catch (err) {
      setError(err.message || 'Could not send WhatsApp code.');
      if (err.status === 429 && err.data?.retryAfterSeconds) {
        setWhatsappCooldown(err.data.retryAfterSeconds);
      }
      void loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleEmailOtpSend = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!isValidEmailAddress(otpEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    const isResend = emailOtpStep === 'otp';
    if (!isResend && !isMathCaptchaSolved(captcha.question, captchaAnswer)) {
      setError('Please solve the CAPTCHA.');
      return;
    }
    setLoading(true);
    try {
      const data = await requestEmailOtp({
        email: otpEmail,
        name,
        captchaChallengeId: captcha.challengeId,
        captchaAnswer,
      });
      setEmailOtpStep('otp');
      setEmailOtp('');
      setEmailOtpCooldown(data.retryAfterSeconds || 45);
      setInfo(data.message || 'Email code sent. Check your inbox.');
      void loadCaptcha();
    } catch (err) {
      setError(err.message || 'Could not send email code.');
      if (err.status === 429 && err.data?.retryAfterSeconds) {
        setEmailOtpCooldown(err.data.retryAfterSeconds);
      }
      void loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleEmailOtpVerify = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (emailOtp.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit email code.');
      return;
    }
    setLoading(true);
    try {
      await ensureLocalAuthPersistence();
      const data = await verifyEmailOtp({ email: otpEmail, code: emailOtp, name });
      const credential = await signInWithCustomToken(auth, data.customToken);
      await finishAuthSuccess(credential.user, {
        isNewUser: Boolean(data.isNewUser),
        emailOverride: data.email || email,
        nameOverride: data.name || name || 'Customer',
        method: 'email_otp',
      });
    } catch (err) {
      setError(err.message || 'Could not verify email code.');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppVerify = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (whatsappOtp.replace(/\D/g, '').length !== 4) {
      setError('Enter the 4-digit WhatsApp code.');
      return;
    }

    setLoading(true);
    try {
      await ensureLocalAuthPersistence();
      const data = await verifyWhatsAppOtp({
        phone: phoneNumber,
        phoneCode: countryCode,
        code: whatsappOtp,
        name,
      });
      const credential = await signInWithCustomToken(auth, data.customToken);
      await finishAuthSuccess(credential.user, {
        isNewUser: Boolean(data.isNewUser),
        emailOverride: data.email || '',
        nameOverride: data.name || name || 'Customer',
        phoneOverride: data.phone || `${countryCode}${phoneNumber}`,
        method: 'whatsapp',
      });
    } catch (err) {
      setError(err.message || 'Could not verify WhatsApp code.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (isRegister) {
      if (!name.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!validateName(name)) {
        setError('Name should contain only letters and be at least 2 characters.');
        return;
      }
      if (!phoneNumber.trim()) {
        setError('Please enter your phone number.');
        return;
      }
      if (!validatePhoneNumber(phoneNumber, countryCode)) {
        setError(getPhoneInputError(phoneNumber, countryCode) || getPhoneInputHint(countryCode));
        return;
      }
      if (!validateEmail(email)) {
        setError('Please enter a valid email address.');
        return;
      }
      const policy = validatePasswordStrength(password);
      if (!policy.ok) {
        setError(policy.message);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    } else {
      if (!email.trim() || !validateEmail(email)) {
        setError('Please enter a valid email address.');
        return;
      }
      if (!password.trim()) {
        setError('Please enter your password.');
        return;
      }
    }

    if (!isMathCaptchaSolved(captcha.question, captchaAnswer)) {
      setError('Please solve the CAPTCHA.');
      return;
    }

    setLoading(true);
    try {
      await ensureLocalAuthPersistence();
      await runPreLogin({
        email,
        captchaChallengeId: captcha.challengeId,
        captchaAnswer,
      });

      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(userCredential.user, { displayName: name });
        }

        const bonusClaimed = localStorage.getItem('welcomeBonusClaimed');
        if (bonusClaimed === 'true') {
          localStorage.setItem('freeShippingEligible', 'true');
          localStorage.removeItem('welcomeBonusClaimed');
        }

        await finishAuthSuccess(userCredential.user, {
          isNewUser: true,
          emailOverride: email,
          nameOverride: name,
          phoneOverride: `${countryCode}${phoneNumber}`,
          method: 'email',
        });
      } else {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          await finishAuthSuccess(userCredential.user, {
            emailOverride: email,
            nameOverride: userCredential.user.displayName || name || 'Customer',
            method: 'email',
          });
        } catch (authErr) {
          await reportLoginResult({ email, success: false });
          void loadCaptcha();
          throw authErr;
        }
      }
    } catch (err) {
      if (err.status === 423) {
        setError(err.data?.error || 'Account locked. Try again later.');
      } else {
        setError(getAuthErrorMessage(err, err.message || 'Sign in failed. Please try again.'));
      }
      void loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={isPage
        ? 'min-h-screen flex items-center justify-center bg-gray-50 p-4'
        : 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4'
      }
      onClick={isPage ? undefined : onClose}
    >
      <div
        className="bg-white w-full max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex relative"
        style={{ maxWidth: modalSettings.sideImage ? '800px' : '448px' }}
        onClick={(event) => event.stopPropagation()}
      >
        {!isPage ? (
        <button
          type="button"
          className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-md ring-1 ring-black/10 transition hover:bg-white hover:text-black"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        ) : null}

        {/* Left Column - Side Image (only when image is set) */}
        {modalSettings.sideImage && (
          <div className="hidden sm:block relative w-[45%] flex-shrink-0 overflow-hidden bg-gradient-to-br from-amber-200 via-amber-100 to-yellow-100">
            {modalSettings.sideImageClickable && modalSettings.sideImageLink ? (
              <Link href={modalSettings.sideImageLink} onClick={onClose} className="block w-full h-full">
                <Image
                  src={modalSettings.sideImage}
                  alt="Sign In Banner"
                  fill
                  style={{ objectFit: 'cover' }}
                  priority
                  unoptimized
                />
                {modalSettings.showCtaButton && (
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
                    <span className="bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow hover:bg-gray-700 transition">
                      {modalSettings.ctaButtonText}
                    </span>
                  </div>
                )}
              </Link>
            ) : (
              <>
                <Image
                  src={modalSettings.sideImage}
                  alt="Sign In Banner"
                  fill
                  style={{ objectFit: 'cover' }}
                  priority
                  unoptimized
                />
                {modalSettings.showCtaButton && (
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
                    {modalSettings.ctaButtonLink ? (
                      <Link href={modalSettings.ctaButtonLink} onClick={onClose} className="bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow hover:bg-gray-700 transition">
                        {modalSettings.ctaButtonText}
                      </Link>
                    ) : (
                      <span className="bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow">
                        {modalSettings.ctaButtonText}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Right Column - Form */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-1">Hala! Let&apos;s get started</h2>
          <p className="text-gray-600 text-xs sm:text-sm mb-3 sm:mb-4">Create account or sign in to your account</p>

          {bonusMessage && isRegister && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {bonusMessage}
            </div>
          )}

          {/* Tab Buttons */}
          {view === 'auth' ? (
          <div className="flex gap-2 sm:gap-3 mb-3 sm:mb-4">
            <button
              type="button"
              onClick={() => setIsRegister(false)}
              className={`flex-1 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg font-semibold transition text-sm ${
                !isRegister
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setIsRegister(true)}
              className={`flex-1 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg font-semibold transition text-sm ${
                isRegister
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Sign up
            </button>
          </div>
          ) : null}

          {view === 'reset' ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={resetStep === 'code' ? handleResetConfirm : handleForgotSubmit}
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-slate-800">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ${resetChannel === 'whatsapp' ? 'text-[#128C7E]' : ''}`}>
                    {resetChannel === 'whatsapp' ? <MessageCircle size={16} /> : <KeyRound size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {resetChannel === 'whatsapp' ? 'Reset with WhatsApp' : 'Reset with email'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {resetChannel === 'whatsapp'
                        ? 'We will send a 4-digit code to this UAE number.'
                        : 'We will send a 6-digit code to this email.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => switchResetChannel(resetChannel === 'whatsapp' ? 'email' : 'whatsapp')}
                  className="mt-3 text-xs font-medium text-slate-600 hover:underline"
                >
                  {resetChannel === 'whatsapp' ? 'Use email instead' : 'Use WhatsApp instead'}
                </button>
              </div>

              {resetChannel === 'email' ? (
                <div>
                  <input
                    type="email"
                    name="reset-email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    readOnly={resetStep === 'code'}
                    disabled={resetStep === 'code'}
                    className={`w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 ${
                      resetStep === 'code' ? 'bg-slate-50 text-slate-600' : 'bg-white'
                    }`}
                    value={email}
                    onChange={(e) => handleResetIdentityChange(e.target.value)}
                    required
                  />
                  {resetStep === 'code' ? (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-slate-600 hover:underline"
                      onClick={() => {
                        setResetStep('identify');
                        setResetOtp('');
                        setInfo('');
                        setResetSentTo('');
                      }}
                    >
                      Change email
                    </button>
                  ) : null}
                </div>
              ) : (
                <div>
                  <div className="flex gap-3">
                    <span className="flex h-[42px] shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                      {UAE_PHONE_CODE}
                    </span>
                    <input
                      type="tel"
                      name="reset-phone"
                      autoComplete="tel-national"
                      placeholder={getPhonePlaceholder(UAE_PHONE_CODE)}
                      readOnly={resetStep === 'code'}
                      disabled={resetStep === 'code'}
                      className={`min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm tracking-wide outline-none focus:border-slate-400 ${
                        resetStep === 'code' ? 'bg-slate-50 text-slate-600' : 'bg-white'
                      }`}
                      value={formatPhoneDisplay(phoneNumber)}
                      onChange={(e) => {
                        const next = clampPhoneInput(e.target.value, UAE_PHONE_CODE);
                        setPhoneNumber(next);
                        if (resetToken) setResetToken('');
                        if (resetSentTo && next !== resetSentTo) {
                          setResetStep('identify');
                          setResetOtp('');
                          setInfo('');
                        }
                      }}
                      required
                    />
                  </div>
                  {resetStep === 'code' ? (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-slate-600 hover:underline"
                      onClick={() => {
                        setResetStep('identify');
                        setResetOtp('');
                        setInfo('');
                        setResetSentTo('');
                      }}
                    >
                      Change number
                    </button>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">{getPhoneInputHint(UAE_PHONE_CODE)}</p>
                  )}
                </div>
              )}

              {resetStep === 'code' && !resetToken ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-600">
                      {resetChannel === 'whatsapp' ? 'WhatsApp code' : 'Email code'}
                    </p>
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-700 hover:underline disabled:text-gray-400"
                      disabled={loading || resetCooldown > 0}
                      onClick={handleForgotSubmit}
                    >
                      {resetCooldown > 0 ? `Resend in ${resetCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                  <OtpInput
                    value={resetOtp}
                    onChange={setResetOtp}
                    length={resetChannel === 'whatsapp' ? 4 : 6}
                    autoFocus
                    disabled={loading}
                  />
                </div>
              ) : null}

              {resetStep === 'code' ? (
                <>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="New password"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none focus:border-slate-400"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none focus:border-slate-400"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">Min 8 chars, upper, lower, number, special character.</p>
                </>
              ) : null}

              {resetStep === 'identify' && captcha.question ? (
                <CaptchaField
                  question={captcha.question}
                  value={captchaAnswer}
                  onChange={setCaptchaAnswer}
                  onRefresh={() => void loadCaptcha()}
                  onReady={setCaptchaConfirmed}
                />
              ) : null}

              {error ? <div className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</div> : null}
              {info ? <div className="text-green-700 text-xs bg-green-50 p-2 rounded-lg">{info}</div> : null}

              {resetStep === 'identify' ? (
                <button
                  type="submit"
                  disabled={loading || !captchaReady}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : (resetChannel === 'whatsapp' ? 'Send WhatsApp code' : 'Send email code')}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Updating…</> : 'Update password'}
                </button>
              )}
              <button
                type="button"
                className="text-sm text-gray-600"
                onClick={() => {
                  setView('auth');
                  setError('');
                  setInfo('');
                  setResetStep('identify');
                  setResetOtp('');
                  setResetToken('');
                }}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {view === 'mfa' ? (
            <form className="flex flex-col gap-2.5 sm:gap-3" onSubmit={handleMfaVerify}>
              <p className="text-sm text-gray-600">Multi-factor authentication — enter the code from your email.</p>
              <OtpInput
                value={mfaCode}
                onChange={setMfaCode}
                length={6}
                autoFocus
                disabled={loading}
              />
              {error ? <div className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</div> : null}
              {info ? <div className="text-green-700 text-xs bg-green-50 p-2 rounded-lg">{info}</div> : null}
              <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 bg-gray-800 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Verify'}
              </button>
            </form>
          ) : null}

          {view === 'otp' ? (
          <form
            key={otpChannel}
            className="flex flex-col gap-2.5 sm:gap-3"
            autoComplete="off"
            onSubmit={otpChannel === 'email'
              ? (emailOtpStep === 'otp' ? handleEmailOtpVerify : handleEmailOtpSend)
              : (whatsappStep === 'otp' ? handleWhatsAppVerify : handleWhatsAppSend)}
          >
            <p className="text-sm text-gray-600">Choose how you want to receive your login code.</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => switchOtpChannel('email')}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold transition sm:text-sm ${
                  otpChannel === 'email'
                    ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Mail size={16} className="shrink-0" />
                Email OTP
              </button>
              <button
                type="button"
                onClick={() => switchOtpChannel('whatsapp')}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold transition sm:text-sm ${
                  otpChannel === 'whatsapp'
                    ? 'border-[#25D366] bg-[#25D366] text-white shadow-sm'
                    : 'border-[#25D366]/25 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/15'
                }`}
              >
                <MessageCircle size={16} className="shrink-0" />
                WhatsApp OTP
              </button>
            </div>

            {otpChannel === 'email' ? (
              <>
                <input
                  key={`otp-email-${formNonce}`}
                  type="email"
                  name={`otp-email-${formNonce}`}
                  autoComplete="off"
                  inputMode="email"
                  placeholder="Enter your email"
                  className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full"
                  value={otpEmail}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (looksLikePhoneNumber(next)) {
                      setOtpEmail('');
                      return;
                    }
                    setOtpEmail(next);
                    if (emailOtpStep === 'otp') {
                      setEmailOtpStep('email');
                      setEmailOtp('');
                      setInfo('');
                    }
                  }}
                  required
                />
                {emailOtpStep === 'otp' ? (
                  <div>
                    <OtpInput
                      value={emailOtp}
                      onChange={setEmailOtp}
                      length={6}
                      autoFocus
                      disabled={loading}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-xs text-gray-600 hover:underline"
                        onClick={() => { setEmailOtpStep('email'); setEmailOtp(''); setError(''); setInfo(''); }}
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        className="text-xs text-gray-700 hover:underline disabled:text-gray-400"
                        disabled={loading || emailOtpCooldown > 0}
                        onClick={handleEmailOtpSend}
                      >
                        {emailOtpCooldown > 0 ? `Resend in ${emailOtpCooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <div className="flex gap-3">
                    <span className="flex h-[42px] shrink-0 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-800">
                      {UAE_PHONE_CODE}
                    </span>
                    <input
                      type="tel"
                      name="otp-phone"
                      autoComplete="tel-national"
                      placeholder={getPhonePlaceholder(UAE_PHONE_CODE)}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm tracking-wide"
                      value={formatPhoneDisplay(phoneNumber)}
                      onChange={(e) => setPhoneNumber(clampPhoneInput(e.target.value, UAE_PHONE_CODE))}
                      required
                      disabled={whatsappStep === 'otp'}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{getPhoneInputHint(UAE_PHONE_CODE)}</p>
                  {phoneNumber && getPhoneInputError(phoneNumber, UAE_PHONE_CODE) ? (
                    <p className="mt-1 text-xs text-red-600">{getPhoneInputError(phoneNumber, UAE_PHONE_CODE)}</p>
                  ) : null}
                </div>
                {whatsappStep === 'otp' ? (
                  <div>
                    <OtpInput
                      value={whatsappOtp}
                      onChange={setWhatsappOtp}
                      length={4}
                      autoFocus
                      disabled={loading}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-xs text-gray-600 hover:underline"
                        onClick={() => { setWhatsappStep('phone'); setWhatsappOtp(''); setError(''); setInfo(''); }}
                      >
                        Change number
                      </button>
                      <button
                        type="button"
                        className="text-xs text-gray-700 hover:underline disabled:text-gray-400"
                        disabled={loading || whatsappCooldown > 0}
                        onClick={handleWhatsAppSend}
                      >
                        {whatsappCooldown > 0 ? `Resend in ${whatsappCooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {captcha.question && (
              (otpChannel === 'email' && emailOtpStep === 'email')
              || (otpChannel === 'whatsapp' && whatsappStep === 'phone')
            ) ? (
              <CaptchaField
                question={captcha.question}
                value={captchaAnswer}
                onChange={setCaptchaAnswer}
                onRefresh={() => void loadCaptcha()}
                onReady={setCaptchaConfirmed}
              />
            ) : null}

            {error ? <div className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</div> : null}
            {info ? <div className="text-green-700 text-xs bg-green-50 p-2 rounded-lg">{info}</div> : null}

            <button
              type="submit"
              disabled={loading || (
                ((otpChannel === 'email' && emailOtpStep === 'email')
                  || (otpChannel === 'whatsapp' && whatsappStep === 'phone'))
                && !captchaReady
              )}
              className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {otpChannel === 'email'
                    ? (emailOtpStep === 'otp' ? 'Verifying…' : 'Sending…')
                    : (whatsappStep === 'otp' ? 'Verifying…' : 'Sending…')}
                </>
              ) : otpChannel === 'email'
                ? (emailOtpStep === 'otp' ? 'Verify & continue' : 'Send email code')
                : (whatsappStep === 'otp' ? 'Verify & continue' : 'Send WhatsApp code')}
            </button>
            <button type="button" className="text-sm text-gray-600" onClick={closeOtpLogin}>
              Back to email login
            </button>
          </form>
          ) : null}

          {/* Form */}
          {view === 'auth' ? (
          <form key={`auth-form-${formNonce}`} className="flex flex-col gap-2.5 sm:gap-3" autoComplete="off" onSubmit={handleSubmit}>
            {isRegister && (
              <div>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  className={`border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm w-full placeholder:text-gray-400 placeholder:opacity-100 ${
                    fieldErrors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  value={name}
                  onChange={e => {
                    const value = e.target.value;
                    setName(value);
                    
                    // Real-time validation
                    if (!value.trim()) {
                      setFieldErrors(prev => ({ ...prev, name: 'Name is required' }));
                    } else if (!/^[a-zA-Z\s]+$/.test(value.trim())) {
                      setFieldErrors(prev => ({ ...prev, name: 'Name should contain only letters' }));
                    } else if (value.trim().length < 2) {
                      setFieldErrors(prev => ({ ...prev, name: 'Name should be at least 2 characters' }));
                    } else {
                      setFieldErrors(prev => ({ ...prev, name: '' }));
                    }
                  }}
                  onBlur={() => {
                    if (!name.trim()) {
                      setFieldErrors(prev => ({ ...prev, name: 'Name is required' }));
                    }
                  }}
                  required
                />
                {fieldErrors.name && (
                  <div className="text-red-600 text-xs mt-1">{fieldErrors.name}</div>
                )}
              </div>
            )}
            {isRegister && (
              <div>
                <div className="flex gap-3">
                  <CountryCodePicker
                    value={countryCode}
                    disabled={false}
                    onChange={(code) => {
                      setCountryCode(code);
                      setPhoneNumber('');
                      setFieldErrors(prev => ({ ...prev, phone: '' }));
                    }}
                  />
                  <input
                    type="tel"
                    placeholder={getPhonePlaceholder(countryCode)}
                    className={`min-w-0 flex-1 rounded-lg border px-4 py-2 sm:py-2.5 tracking-wide focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm placeholder:text-gray-400 placeholder:opacity-100 ${
                      fieldErrors.phone ? 'border-red-500' : 'border-gray-300'
                    }`}
                    value={formatPhoneDisplay(phoneNumber)}
                    onChange={e => {
                      const value = clampPhoneInput(e.target.value, countryCode);
                      setPhoneNumber(value);
                      if (!value) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Phone number is required' }));
                      } else {
                        setFieldErrors(prev => ({
                          ...prev,
                          phone: getPhoneInputError(value, countryCode) || '',
                        }));
                      }
                    }}
                    onBlur={() => {
                      if (!phoneNumber) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Phone number is required' }));
                      } else {
                        setFieldErrors(prev => ({
                          ...prev,
                          phone: getPhoneInputError(phoneNumber, countryCode) || '',
                        }));
                      }
                    }}
                    required
                  />
                </div>
                {fieldErrors.phone ? (
                  <div className="text-red-600 text-xs mt-1">{fieldErrors.phone}</div>
                ) : (
                  <div className="text-gray-500 text-xs mt-1">
                    {getPhoneInputHint(countryCode)}
                  </div>
                )}
              </div>
            )}
            <>
            <div>
              <input
                key={`login-email-${formNonce}`}
                type="email"
                name={`login-email-${formNonce}`}
                autoComplete="off"
                placeholder="Enter your email"
                className={`border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm w-full placeholder:text-gray-400 placeholder:opacity-100 ${
                  fieldErrors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                value={email}
                onChange={e => {
                  const emailValue = e.target.value;
                  if (looksLikePhoneNumber(emailValue)) {
                    setEmail('');
                    setFieldErrors(prev => ({ ...prev, email: '' }));
                    return;
                  }
                  setEmail(emailValue);
                  if (!emailValue) {
                    setFieldErrors(prev => ({ ...prev, email: 'Email is required' }));
                  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
                    setFieldErrors(prev => ({ ...prev, email: 'Please enter a valid email' }));
                  } else {
                    setFieldErrors(prev => ({ ...prev, email: '' }));
                  }
                }}
                onBlur={() => {
                  if (!email) {
                    setFieldErrors(prev => ({ ...prev, email: 'Email is required' }));
                  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    setFieldErrors(prev => ({ ...prev, email: 'Please enter a valid email' }));
                  }
                }}
                required
              />
              {fieldErrors.email && (
                <div className="text-red-600 text-xs mt-1">{fieldErrors.email}</div>
              )}
            </div>
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className={`border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm w-full placeholder:text-gray-400 placeholder:opacity-100 ${
                    fieldErrors.password ? 'border-red-500' : 'border-gray-300'
                  }`}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    
                    // Real-time validation for both login and register
                    const pwdValue = e.target.value;
                    if (!pwdValue) {
                      setFieldErrors(prev => ({ ...prev, password: 'Password is required' }));
                    } else if (pwdValue.length < 6) {
                      setFieldErrors(prev => ({ ...prev, password: 'Password must be at least 6 characters' }));
                    } else if (isRegister) {
                      const policy = validatePasswordStrength(pwdValue);
                      setFieldErrors(prev => ({
                        ...prev,
                        password: policy.ok ? '' : policy.message,
                      }));
                    } else {
                      setFieldErrors(prev => ({ ...prev, password: '' }));
                    }
                  }}
                  onBlur={() => {
                    const pwdValue = password;
                    if (!pwdValue) {
                      setFieldErrors(prev => ({ ...prev, password: 'Password is required' }));
                    } else if (pwdValue.length < 6) {
                      setFieldErrors(prev => ({ ...prev, password: 'Password must be at least 6 characters' }));
                    }
                  }}
                  minLength={isRegister ? 8 : 6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="text-red-600 text-xs mt-1">{fieldErrors.password}</div>
              )}
              {isRegister ? (
                <div className="text-gray-500 text-[11px] mt-1">
                  Min 8 characters with upper, lower, number, and special character.
                </div>
              ) : null}
            </div>
            {isRegister && (
              <div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    className={`border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm w-full placeholder:text-gray-400 placeholder:opacity-100 ${
                      fieldErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                    }`}
                    value={confirmPassword}
                    onChange={e => {
                      setConfirmPassword(e.target.value);
                      
                      // Real-time validation
                      const confirmValue = e.target.value;
                      if (!confirmValue) {
                        setFieldErrors(prev => ({ ...prev, confirmPassword: 'Please confirm your password' }));
                      } else if (confirmValue !== password) {
                        setFieldErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
                      } else {
                        setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
                      }
                    }}
                    onBlur={() => {
                      if (!confirmPassword) {
                        setFieldErrors(prev => ({ ...prev, confirmPassword: 'Please confirm your password' }));
                      } else if (confirmPassword !== password) {
                        setFieldErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
                      }
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <div className="text-red-600 text-xs mt-1">{fieldErrors.confirmPassword}</div>
                )}
              </div>
            )}
            </>
            
            {captcha.question ? (
              <CaptchaField
                question={captcha.question}
                value={captchaAnswer}
                onChange={setCaptchaAnswer}
                onRefresh={() => void loadCaptcha()}
                onReady={setCaptchaConfirmed}
              />
            ) : null}

            {error && (
              <div className="text-red-500 text-xs sm:text-sm bg-red-50 p-2 rounded-lg">
                {error}
              </div>
            )}
            {info && (
              <div className="text-green-700 text-xs sm:text-sm bg-green-50 p-2 rounded-lg">
                {info}
              </div>
            )}

            {!isRegister ? (
              <button
                type="button"
                className="text-left text-xs text-blue-600 hover:underline"
                onClick={() => openResetView('email')}
              >
                Forgot password?
              </button>
            ) : null}

            <button
              type="submit"
              className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 sm:py-2.5 rounded-lg transition text-xs sm:text-sm disabled:opacity-50"
              disabled={loading || !captchaReady}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Loading…</> : 'CONTINUE'}
            </button>
          </form>
          ) : null}

          {view === 'auth' ? (
          <>
          {/* Divider */}
          <div className="flex items-center gap-2 sm:gap-3 my-3 sm:my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Or continue with</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Social Sign In */}
          <div className="mb-3 grid grid-cols-1 gap-2.5 sm:mb-5 sm:grid-cols-2 sm:gap-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="group flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow disabled:opacity-50"
            >
              <Image src={GoogleIcon} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />
              <span>Google</span>
            </button>

            <button
              type="button"
              onClick={handleFacebookSignIn}
              disabled={loading}
              className="group flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[#1877F2]/20 bg-[#1877F2] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#166fe5] hover:shadow disabled:opacity-50"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
              </svg>
              <span>Facebook</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => openOtpLogin('whatsapp')}
            disabled={loading}
            className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow disabled:opacity-50 sm:mb-5"
          >
            <KeyRound size={16} className="shrink-0 text-slate-600" />
            <span>Login with OTP</span>
          </button>

          {/* Terms & Privacy */}
          <p className="text-xs text-gray-500 text-center">
            By continuing, I confirm that I have read the{' '}
            <a href="/privacy-policy" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
          </p>
          </>
          ) : null}

          {isPage ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full text-center text-sm text-gray-600 hover:text-gray-900 transition"
            >
              Continue shopping
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SignInModal;
