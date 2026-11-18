import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';

export function SupabaseLoginView() {
  const { t } = useTranslation();
  const { signInWithPassword } = useHarvestFlow();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await signInWithPassword(email, password);
      if (!res.ok) {
        setErrorMsg(res.error ?? t('auth.invalidCredentials'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-gradient-to-b from-[#eaf3ec] via-[#f5f8f5] to-[#ebf3ed] px-4 py-8 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          {/* Main Card */}
          <div className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-2xl shadow-emerald-950/6 backdrop-blur-sm sm:p-10">
            {/* Header Brand */}
            <div className="flex flex-col items-center text-center">
              <img
                src="/company-logo.png"
                alt="Nature Growers"
                className="h-12 w-auto object-contain sm:h-14"
              />
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-[#1b5e20] ring-1 ring-emerald-700/15">
                <span className="h-2 w-2 rounded-full bg-[#1b5e20] ring-2 ring-emerald-600/30" />
                <span>{t('auth.portalBadge')}</span>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1a241e] sm:text-[26px]">
                {t('auth.loginTitle')}
              </h1>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5a6b60] sm:text-sm">
                {t('auth.supabaseLoginSubtitle')}
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {/* Email */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-bold uppercase tracking-wider text-[#435349]"
                >
                  {t('admin.userEmailLabel')}
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5a6b60]" />
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('admin.userEmailPlaceholder')}
                    className="hf-input min-h-12 w-full rounded-xl border border-emerald-900/15 bg-[#fafcfa] pl-11 pr-4 text-sm text-[#1a241e] placeholder:text-[#5a6b60]/50 outline-none transition focus:border-[#1b5e20] focus:bg-white focus:ring-4 focus:ring-emerald-700/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold uppercase tracking-wider text-[#435349]"
                >
                  {t('admin.userPasswordLabel')}
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5a6b60]" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="hf-input min-h-12 w-full rounded-xl border border-emerald-900/15 bg-[#fafcfa] pl-11 pr-12 text-sm text-[#1a241e] placeholder:text-[#5a6b60]/50 outline-none transition focus:border-[#1b5e20] focus:bg-white focus:ring-4 focus:ring-emerald-700/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5a6b60] transition hover:bg-emerald-50 hover:text-[#1a241e]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {errorMsg && (
                <div className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                  {errorMsg}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-bold text-white shadow-md shadow-emerald-950/15 transition hover:bg-[#144718] active:scale-[0.99] disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>{t('auth.signingIn')}</span>
                  </>
                ) : (
                  <span>{t('auth.signInButton')}</span>
                )}
              </button>
            </form>

            {/* Reassurance badge */}
            <div className="mt-7 flex items-center justify-center gap-1.5 border-t border-emerald-900/8 pt-5 text-xs text-[#5a6b60]">
              <ShieldCheck className="h-4 w-4 text-[#1b5e20]" />
              <span>{t('auth.secureBadge')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Page bottom copyright */}
      <footer className="py-3 text-center text-xs text-[#5a6b60]/75">
        &copy; {new Date().getFullYear()} Nature Growers · {t('auth.allRightsReserved')}
      </footer>
    </div>
  );
}
