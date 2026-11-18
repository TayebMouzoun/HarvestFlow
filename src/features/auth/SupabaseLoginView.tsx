import React, { useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';

export function SupabaseLoginView() {
  const { t } = useTranslation();
  const { language, setLanguage, signInWithPassword } = useHarvestFlow();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="flex min-h-dvh flex-col bg-[#f6f9f6]">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/company-logo.png"
            alt="Nature Growers"
            className="h-10 w-auto object-contain sm:h-11"
          />
        </div>

        <div
          role="group"
          aria-label={t('app.language')}
          className="inline-flex rounded-xl border border-emerald-900/12 bg-white p-0.5 shadow-2xs"
        >
          {(['fr', 'es'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition ${
                language === lang
                  ? 'bg-[#1b5e20] text-white'
                  : 'text-[#5a6b60] hover:text-[#1a241e]'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-emerald-900/10 bg-white p-6 shadow-sm sm:p-8"
        >
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
            {t('auth.loginTitle')}
          </h1>
          <p className="mt-1.5 text-sm text-[#5a6b60]">{t('auth.supabaseLoginSubtitle')}</p>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-[#1a241e]">
                {t('admin.userEmailLabel')}
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6b60]" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('admin.userEmailPlaceholder')}
                  className="hf-input min-h-12 w-full rounded-xl border border-emerald-900/15 bg-white pl-10 pr-4 text-sm text-[#1a241e] outline-none transition focus:border-[#1b5e20] focus:ring-2 focus:ring-emerald-700/15"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-[#1a241e]">
                {t('admin.userPasswordLabel')}
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6b60]" />
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="hf-input min-h-12 w-full rounded-xl border border-emerald-900/15 bg-white pl-10 pr-4 text-sm text-[#1a241e] outline-none transition focus:border-[#1b5e20] focus:ring-2 focus:ring-emerald-700/15"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718] disabled:opacity-60"
            >
              {submitting ? t('auth.signingIn') : t('auth.signInButton')}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
