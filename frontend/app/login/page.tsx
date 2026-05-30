'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { authApi } from '@/services/api';
import { Eye, EyeOff, MessageSquare, Zap, ShieldCheck, Users, TrendingUp, Clock } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = () => {
    const redirect = searchParams.get('redirect');
    router.push(redirect && redirect.startsWith('/dashboard') ? redirect : '/dashboard/overview');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(email, password);
      if (response.data.success) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        document.cookie = `authToken=${response.data.token}; path=/; max-age=${8 * 60 * 60}; SameSite=Lax`;
        redirectTo();
      } else {
        setError(response.data.errorMessage || 'Login failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.errorMessage || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/dev-login`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        document.cookie = `authToken=${data.token}; path=/; max-age=${8 * 60 * 60}; SameSite=Lax`;
        redirectTo();
      }
    } catch {
      setError('Dev bypass failed — make sure the backend is running.');
    }
  };

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── Left panel — branding ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 overflow-hidden flex-shrink-0"
           style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

        {/* Layered background decorations */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Radial glow — top-left */}
          <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full opacity-30"
               style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
          {/* Radial glow — bottom-right */}
          <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full opacity-20"
               style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)' }} />
          {/* Center ring */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full border border-indigo-800/30" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] rounded-full border border-indigo-800/20" />
          {/* Dot grid */}
          <div className="absolute inset-0"
               style={{
                 backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.15) 1px, transparent 1px)',
                 backgroundSize: '28px 28px',
               }} />
        </div>

        {/* Top: logo + headline */}
        <div className="relative z-10">
          <div className="mb-10">
            <Image
              src="/images/tejoo-logo-light.png"
              alt="Tejoo Fashions"
              width={140}
              height={70}
              style={{ height: 'auto' }}
              className="brightness-0 invert opacity-90"
            />
          </div>
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-indigo-400 uppercase mb-5 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              AI-Powered Platform
            </span>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              WhatsApp<br />
              <span style={{ background: 'linear-gradient(90deg, #818cf8, #c7d2fe)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                AI Automation
              </span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Manage conversations, automate replies, and scale your customer support with intelligent AI — all from one dashboard.
            </p>
          </div>
        </div>

        {/* Middle: stats strip */}
        <div className="relative z-10">
          <div className="grid grid-cols-3 gap-4 mb-10">
            {[
              { value: '10x', label: 'Faster replies', icon: Zap },
              { value: '98%', label: 'Resolution rate', icon: TrendingUp },
              { value: '24/7', label: 'AI availability', icon: Clock },
            ].map(({ value, label, icon: Icon }) => (
              <div key={label}
                   className="rounded-2xl p-4 border border-white/[0.08]"
                   style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)' }}>
                <div className="h-7 w-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mb-2">
                  <Icon className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {[
              { icon: MessageSquare, label: 'Live conversation management' },
              { icon: ShieldCheck,   label: 'Role-based access control'    },
              { icon: Users,         label: 'Team escalation workflows'     },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-indigo-500/20 bg-indigo-500/10">
                  <Icon className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <span className="text-slate-400 text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: trust badge */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03]">
            <div className="h-8 w-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Enterprise Grade Security</p>
              <p className="text-[11px] text-slate-500 mt-0.5">JWT auth · Role-based access · Audit logs</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image src="/images/tejoo-logo-dark.png" alt="Tejoo Fashions" width={130} height={65} style={{ height: 'auto' }} />
          </div>

          {/* Card wrapper */}
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/80 border border-gray-100 p-8">

            <div className="mb-7">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-gray-400 text-sm mt-1.5">Sign in to your Tejoo dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@tejoofashions.co.in"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all duration-200"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="text-red-500 mt-0.5 flex-shrink-0">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 text-sm flex items-center justify-center gap-2 mt-1 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                style={{ background: loading ? undefined : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', backgroundColor: loading ? '#6366f1' : undefined }}
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Social / SSO placeholder — dev bypass */}
            <button
              type="button"
              onClick={handleDevBypass}
              className="w-full text-sm text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 py-2.5 rounded-xl transition-all duration-200 font-medium"
            >
              Dev Access — Skip Login
            </button>
            <p className="text-center text-[11px] text-gray-300 mt-2">Remove before production</p>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-gray-400 mt-6">
            © {new Date().getFullYear()} Tejoo Fashions. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
