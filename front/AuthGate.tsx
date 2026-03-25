import React, { useState } from 'react';
import { Mail, Lock, User, Hexagon, ArrowRight } from 'lucide-react';

export type AuthMode = 'login' | 'register' | 'verify';

type Props = {
  apiBase: string;
  mode: AuthMode;
  setMode: (m: AuthMode) => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  nick: string;
  setNick: (s: string) => void;
  code: string;
  setCode: (s: string) => void;
  err: string;
  setErr: (s: string) => void;
  onToken: (token: string) => void;
};

const inputClassName =
  'block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors sm:text-sm';

const API_TIMEOUT_MS = 55_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function setNetworkErr(setErr: (s: string) => void, e: unknown) {
  if (e instanceof DOMException && e.name === 'AbortError') {
    setErr('Serwer nie odpowiedział na czas (często wolny lub zablokowany SMTP). Spróbuj za chwilę.');
    return;
  }
  setErr('Błąd sieci. Sprawdź połączenie.');
}

export function AuthGate({
  apiBase,
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  nick,
  setNick,
  code,
  setCode,
  err,
  setErr,
  onToken,
}: Props) {
  const [busy, setBusy] = useState(false);

  const isLogin = mode === 'login';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'username') setNick(value);
    else if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
    else if (name === 'code') setCode(value);
  };

  const toggleMode = () => {
    if (mode === 'login') {
      setMode('register');
    } else {
      setMode('login');
    }
    setErr('');
    setEmail('');
    setPassword('');
    setNick('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'login') {
      void (async () => {
        setErr('');
        setBusy(true);
        try {
          const r = await fetchWithTimeout(`${apiBase}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password }),
          });
          if (!r.ok) {
            setErr('Nieprawidłowy e-mail lub hasło.');
            return;
          }
          const d = (await r.json()) as { access_token?: string };
          if (!d.access_token) {
            setErr('Brak tokenu w odpowiedzi serwera.');
            return;
          }
          onToken(d.access_token);
        } catch (e) {
          setNetworkErr(setErr, e);
        } finally {
          setBusy(false);
        }
      })();
    } else if (mode === 'register') {
      void (async () => {
        setErr('');
        setBusy(true);
        try {
          const r = await fetchWithTimeout(`${apiBase}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email.trim(),
              password,
              display_name: nick.trim() || email.split('@')[0],
              nick: nick.trim(),
            }),
          });
          if (!r.ok) {
            let msg = 'Nie udało się zarejestrować.';
            try {
              const j = (await r.json()) as { error?: string };
              const er = j?.error ?? '';
              if (r.status === 409 || er === 'email exists') {
                msg = 'Ten adres jest już zweryfikowany — zaloguj się.';
              } else if (r.status === 401 || er === 'invalid credentials') {
                msg = 'Konto z tym e-mailem czeka na kod — hasło się nie zgadza.';
              } else if (r.status === 502 || er.includes('mail')) {
                msg = 'Nie wysłano maila (SMTP). Sprawdź logi serwera.';
              } else if (er) {
                msg = er;
              }
            } catch {
              /* ignore */
            }
            setErr(msg);
            return;
          }
          setMode('verify');
        } catch (e) {
          setNetworkErr(setErr, e);
        } finally {
          setBusy(false);
        }
      })();
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void (async () => {
      setErr('');
      setBusy(true);
      try {
        const r = await fetchWithTimeout(`${apiBase}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        });
        if (!r.ok) {
          setErr('Nieprawidłowy lub wygasły kod.');
          return;
        }
        setCode('');
        setMode('login');
      } catch (e) {
        setNetworkErr(setErr, e);
      } finally {
        setBusy(false);
      }
    })();
  };

  if (mode === 'verify') {
    return (
      <div className="fixed inset-0 z-[600] flex min-h-screen items-center justify-center overflow-hidden bg-gray-900 font-sans text-gray-200">
        <div className="absolute top-[-10%] left-[-10%] h-96 w-96 animate-pulse rounded-full bg-indigo-600 opacity-40 mix-blend-multiply blur-[128px] filter"></div>
        <div
          className="absolute bottom-[-10%] right-[-10%] h-96 w-96 animate-pulse rounded-full bg-purple-600 opacity-40 mix-blend-multiply blur-[128px] filter"
          style={{ animationDelay: '2s' }}
        ></div>

        <div className="relative z-10 w-full max-w-md transform rounded-2xl border border-gray-700/50 bg-gray-800 p-8 shadow-2xl transition-all duration-500">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 rotate-3 transform items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30 transition-transform hover:rotate-6">
              <Hexagon className="h-10 w-10 fill-current text-white" />
            </div>
            <h2 className="mb-1 text-3xl font-bold text-white">Sprawdź skrzynkę</h2>
            <p className="text-sm text-gray-400">Wpisz kod z maila wysłany na {email || '…'}</p>
          </div>

          {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}

          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Kod weryfikacyjny <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  name="code"
                  value={code}
                  onChange={handleChange}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={inputClassName}
                  placeholder="000000"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="group mt-6 flex w-full items-center justify-center rounded-lg border border-transparent bg-indigo-600 py-3 px-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95 disabled:opacity-60"
            >
              {busy ? 'Sprawdzanie…' : 'Potwierdź e-mail'}
              <ArrowRight className="ml-2 h-4 w-4 opacity-70 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => {
                setErr('');
                setMode('login');
              }}
              className="text-sm font-medium text-indigo-400 transition-colors hover:text-indigo-300 focus:outline-none"
            >
              Wróć do logowania
            </button>
          </div>
        </div>

        <style
          dangerouslySetInnerHTML={{
            __html: `
        @keyframes fadeInDown {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.3s ease-out forwards;
        }
      `,
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[600] flex min-h-screen items-center justify-center overflow-hidden bg-gray-900 font-sans text-gray-200">
      <div className="absolute top-[-10%] left-[-10%] h-96 w-96 animate-pulse rounded-full bg-indigo-600 opacity-40 mix-blend-multiply blur-[128px] filter"></div>
      <div
        className="absolute bottom-[-10%] right-[-10%] h-96 w-96 animate-pulse rounded-full bg-purple-600 opacity-40 mix-blend-multiply blur-[128px] filter"
        style={{ animationDelay: '2s' }}
      ></div>

      <div className="relative z-10 w-full max-w-md transform rounded-2xl border border-gray-700/50 bg-gray-800 p-8 shadow-2xl transition-all duration-500">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 rotate-3 transform items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30 transition-transform hover:rotate-6">
            <Hexagon className="h-10 w-10 fill-current text-white" />
          </div>
          <h2 className="mb-1 text-3xl font-bold text-white">
            {isLogin ? 'Witaj z powrotem!' : 'Dołącz do Devcord'}
          </h2>
          <p className="text-sm text-gray-400">
            {isLogin
              ? 'Cieszymy się, że znów jesteś z nami.'
              : 'Stwórz konto i dołącz do naszej społeczności.'}
          </p>
        </div>

        {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="animate-fade-in-down space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Nazwa użytkownika <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  name="username"
                  value={nick}
                  onChange={handleChange}
                  required={!isLogin}
                  className={inputClassName}
                  placeholder="Jak mają na Ciebie mówić?"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Adres Email <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="email"
                name="email"
                value={email}
                onChange={handleChange}
                required
                className={inputClassName}
                placeholder="twoj@email.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Hasło <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="password"
                name="password"
                value={password}
                onChange={handleChange}
                required
                className={inputClassName}
                placeholder="••••••••"
              />
            </div>
            {isLogin && (
              <div className="flex justify-end pt-1">
                <a
                  href="#"
                  className="text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                  onClick={(e) => {
                    e.preventDefault();
                    setErr('Odzyskiwanie hasła wkrótce. Skontaktuj się z administratorem.');
                  }}
                >
                  Zapomniałeś hasła?
                </a>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="group mt-6 flex w-full items-center justify-center rounded-lg border border-transparent bg-indigo-600 py-3 px-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95 disabled:opacity-60"
          >
            {busy ? 'Proszę czekać…' : isLogin ? 'Zaloguj się' : 'Zarejestruj się'}
            <ArrowRight className="ml-2 h-4 w-4 opacity-70 transition-transform group-hover:translate-x-1" />
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            {isLogin ? 'Potrzebujesz konta?' : 'Masz już konto?'}
            <button
              type="button"
              onClick={toggleMode}
              className="ml-2 font-medium text-indigo-400 transition-colors hover:text-indigo-300 focus:outline-none"
            >
              {isLogin ? 'Zarejestruj się' : 'Zaloguj się'}
            </button>
          </p>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes fadeInDown {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.3s ease-out forwards;
        }
      `,
        }}
      />
    </div>
  );
}
