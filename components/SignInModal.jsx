import React, { useState, useEffect, useCallback } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { auth, ensureLocalAuthPersistence } from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
import { countryCodes } from '../assets/countryCodes';
import { linkGuestOrdersForCurrentUser } from '@/lib/linkGuestOrdersClient';
import { validatePasswordStrength } from '@/lib/passwordPolicy';
import {
  fetchCaptchaChallenge,
  runPreLogin,
  reportLoginResult,
  requestPasswordReset,
  confirmPasswordReset,
  setMfaVerified,
} from '@/lib/authClient';

const SignInModal = ({ open, onClose, defaultMode = 'login', bonusMessage = '', variant = 'modal' }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [view, setView] = useState('auth'); // auth | forgot | reset | mfa
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
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
  const [resetToken, setResetToken] = useState('');
  const [resetOtp, setResetOtp] = useState('');
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

  React.useEffect(() => {
    if (open) {
      setIsRegister(defaultMode === 'register');
    }
  }, [open, defaultMode]);

  // Clear errors when switching between login and register
  React.useEffect(() => {
    setError('');
    setFieldErrors({
      name: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: ''
    });
  }, [isRegister]);

  const loadCaptcha = useCallback(async () => {
    try {
      const data = await fetchCaptchaChallenge();
      setCaptcha({ challengeId: data.challengeId, question: data.question });
      setCaptchaAnswer('');
    } catch {
      setCaptcha({ challengeId: '', question: '' });
    }
  }, []);

  useEffect(() => {
    if (open || variant === 'page') {
      void loadCaptcha();
    }
  }, [open, variant, isRegister, view, loadCaptcha]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    const resetEmail = params.get('email');
    if (token) {
      setResetToken(token);
      setView('reset');
      if (resetEmail) setEmail(resetEmail);
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

  const validatePhoneNumber = (phone, countryCode) => {
    const cleaned = phone.replace(/\D/g, '');
    // For India (+91), require exactly 10 digits
    if (countryCode === '+91') {
      return cleaned.length === 10;
    }
    // For other countries, allow 7-15 digits
    return cleaned.length >= 7 && cleaned.length <= 15;
  };

  const trackLoginLocation = (token) => {
    const pageUrl = typeof window !== 'undefined' ? window.location.pathname : '/';
    axios.post('/api/users/track-location', { pageUrl }, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const runPostAuthTasks = async (user, { isNewUser = false, emailOverride = '', nameOverride = '' } = {}) => {
    try {
      const token = await user.getIdToken();
      trackLoginLocation(token);

      void linkGuestOrdersForCurrentUser(user, token, {
        email: emailOverride || user.email || '',
        phone: user.phoneNumber || '',
      });

      if (isNewUser) {
        pushGtmEvent(
          GTM_EVENTS.SIGN_UP,
          { method: emailOverride ? 'email' : 'google' },
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

  const finishAuthSuccess = async (user, { isNewUser = false, emailOverride = '', nameOverride = '' } = {}) => {
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
    void runPostAuthTasks(user, { isNewUser, emailOverride, nameOverride });
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

      await finishAuthSuccess(result.user, { isNewUser });
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

      await finishAuthSuccess(result.user, { isNewUser });
    } catch (err) {
      console.error('Facebook sign-in error:', err);
      const errorMessage = getAuthErrorMessage(err, 'Facebook sign-in failed. Please try again.');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!captchaAnswer.trim()) {
      setError('Please solve the CAPTCHA.');
      return;
    }
    setLoading(true);
    try {
      const data = await requestPasswordReset({
        email,
        captchaChallengeId: captcha.challengeId,
        captchaAnswer,
      });
      setInfo(data.message || 'If an account exists, a reset email was sent.');
      setView('reset');
      void loadCaptcha();
    } catch (err) {
      setError(err.message || 'Could not request reset');
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
    setLoading(true);
    try {
      await confirmPasswordReset({
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
        void runPostAuthTasks(auth.currentUser, { emailOverride: email });
      }
    } catch (err) {
      setError(err.message || 'MFA failed');
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
        setError(countryCode === '+91'
          ? 'Indian phone number must be exactly 10 digits.'
          : 'Please enter a valid phone number (7-15 digits).');
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

    if (!captchaAnswer.trim()) {
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
        });
      } else {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          await finishAuthSuccess(userCredential.user, {
            emailOverride: email,
            nameOverride: userCredential.user.displayName || name || 'Customer',
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
    <div className={isPage
      ? 'min-h-screen flex items-center justify-center bg-gray-50 p-4'
      : 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4'
    }>
      <div
        className="bg-white w-full max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex relative"
        style={{ maxWidth: modalSettings.sideImage ? '800px' : '448px' }}
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

          {view === 'forgot' ? (
            <form className="flex flex-col gap-2.5 sm:gap-3" onSubmit={handleForgotSubmit}>
              <p className="text-sm text-gray-600">Enter your account email. We send a reset link and a one-time code — check inbox and spam.</p>
              <input
                type="email"
                placeholder="Enter your email"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {captcha.question ? (
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-gray-600 whitespace-nowrap">{captcha.question}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Answer"
                    required
                  />
                </div>
              ) : null}
              {error ? <div className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</div> : null}
              {info ? <div className="text-green-700 text-xs bg-green-50 p-2 rounded-lg">{info}</div> : null}
              <button type="submit" disabled={loading} className="bg-gray-800 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" className="text-sm text-gray-600" onClick={() => { setView('auth'); setError(''); setInfo(''); }}>
                Back to sign in
              </button>
            </form>
          ) : null}

          {view === 'reset' ? (
            <form className="flex flex-col gap-2.5 sm:gap-3" onSubmit={handleResetConfirm}>
              <p className="text-sm text-gray-600">Set a new strong password. Use the code from the email if you opened this screen without the link.</p>
              <input
                type="email"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {!resetToken ? (
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Email OTP code"
                  className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full"
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value)}
                />
              ) : null}
              <input
                type="password"
                placeholder="New password"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Confirm new password"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-500">Min 8 chars, upper, lower, number, special character.</p>
              {error ? <div className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</div> : null}
              {info ? <div className="text-green-700 text-xs bg-green-50 p-2 rounded-lg">{info}</div> : null}
              <button type="submit" disabled={loading} className="bg-gray-800 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                {loading ? 'Updating…' : 'Update password'}
              </button>
              <button type="button" className="text-sm text-gray-600" onClick={() => setView('auth')}>Back to sign in</button>
            </form>
          ) : null}

          {view === 'mfa' ? (
            <form className="flex flex-col gap-2.5 sm:gap-3" onSubmit={handleMfaVerify}>
              <p className="text-sm text-gray-600">Multi-factor authentication — enter the code from your email.</p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-full tracking-widest"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
              />
              {error ? <div className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</div> : null}
              {info ? <div className="text-green-700 text-xs bg-green-50 p-2 rounded-lg">{info}</div> : null}
              <button type="submit" disabled={loading} className="bg-gray-800 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50">
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          ) : null}

          {/* Form */}
          {view === 'auth' ? (
          <form className="flex flex-col gap-2.5 sm:gap-3" onSubmit={handleSubmit}>
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
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => {
                      setCountryCode(e.target.value);
                      // Clear phone number when country code changes
                      setPhoneNumber('');
                      setFieldErrors(prev => ({ ...prev, phone: '' }));
                    }}
                    className="border border-gray-300 rounded-lg px-2 sm:px-3 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm w-24"
                    required
                  >
                    {countryCodes.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    className={`flex-1 border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm placeholder:text-gray-400 placeholder:opacity-100 ${
                      fieldErrors.phone ? 'border-red-500' : 'border-gray-300'
                    }`}
                    value={phoneNumber}
                    onChange={e => {
                      // Limit based on country code
                      const maxLength = countryCode === '+91' ? 10 : 15;
                      const value = e.target.value.replace(/\D/g, '').slice(0, maxLength);
                      setPhoneNumber(value);
                      
                      // Real-time validation
                      if (!value) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Phone number is required' }));
                      } else if (countryCode === '+91' && value.length !== 10) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Indian phone number must be 10 digits' }));
                      } else if (countryCode !== '+91' && value.length < 7) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Phone number must be at least 7 digits' }));
                      } else if (countryCode !== '+91' && value.length > 15) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Phone number too long' }));
                      } else {
                        setFieldErrors(prev => ({ ...prev, phone: '' }));
                      }
                    }}
                    onBlur={() => {
                      if (!phoneNumber) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Phone number is required' }));
                      } else if (countryCode === '+91' && phoneNumber.length !== 10) {
                        setFieldErrors(prev => ({ ...prev, phone: 'Indian phone number must be 10 digits' }));
                      }
                    }}
                    maxLength={countryCode === '+91' ? 10 : 15}
                    required
                  />
                </div>
                {fieldErrors.phone ? (
                  <div className="text-red-600 text-xs mt-1">{fieldErrors.phone}</div>
                ) : (
                  <div className="text-gray-500 text-xs mt-1">
                    {countryCode === '+91' ? '10 digits required' : '7-15 digits required'}
                  </div>
                )}
              </div>
            )}
            <div>
              <input
                type="email"
                placeholder="Enter your email"
                className={`border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-xs sm:text-sm w-full placeholder:text-gray-400 placeholder:opacity-100 ${
                  fieldErrors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  
                  // Real-time validation for email in both login and register
                  const emailValue = e.target.value;
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
            
            {captcha.question ? (
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-600 whitespace-nowrap shrink-0">{captcha.question}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder="CAPTCHA answer"
                  required
                />
                <button type="button" className="text-xs text-blue-600 shrink-0" onClick={() => void loadCaptcha()}>
                  Refresh
                </button>
              </div>
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
                onClick={() => { setView('forgot'); setError(''); setInfo(''); }}
              >
                Forgot password?
              </button>
            ) : null}

            <button
              type="submit"
              className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 sm:py-2.5 rounded-lg transition text-xs sm:text-sm disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'CONTINUE'}
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
