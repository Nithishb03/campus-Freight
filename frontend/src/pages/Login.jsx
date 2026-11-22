import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Truck, ShieldCheck, Mail, Lock, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';

const demoAccounts = [
  {
    role: 'Admin',
    name: 'Campus Administrator',
    email: 'admin@campus.edu',
    password: 'Password@123',
    badge: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  {
    role: 'Mailroom',
    name: 'Mailroom Supervisor',
    email: 'mailroom@campus.edu',
    password: 'Password@123',
    badge: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  {
    role: 'Faculty Requester',
    name: 'Prof. Alan Turing',
    email: 'faculty@campus.edu',
    password: 'Password@123',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  {
    role: 'Driver 1',
    name: 'Ramesh Kumar (Fleet)',
    email: 'driver1@campus.edu',
    password: 'Password@123',
    badge: 'bg-amber-100 text-amber-800 border-amber-200'
  }
];

const Login = () => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e, customEmail = null, customPass = null) => {
    if (e) e.preventDefault();
    setError('');
    setSubmitting(true);

    const emailToUse = customEmail || emailOrUsername;
    const passToUse = customPass || password;

    try {
      const user = await login(emailToUse, passToUse);
      if (user.role === 'admin' || user.role === 'mailroom') {
        navigate('/admin');
      } else if (user.role === 'driver') {
        navigate('/driver');
      } else {
        navigate('/requester');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickFill = (account) => {
    setEmailOrUsername(account.email);
    setPassword(account.password);
    handleLogin(null, account.email, account.password);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-md mb-4">
          <Truck className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Campus Freight Portal
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Intra-Campus Freight, Parcel Handover & Autonomous Fleet Dispatch
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Campus Email or Username
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  required
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="e.g. faculty@campus.edu"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Authenticating...' : 'Sign In to Portal'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick-Fill Demo Accounts */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Quick-Fill Demo Roles
              </span>
              <span className="text-[11px] text-slate-400">1-Click Login</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => handleQuickFill(account)}
                  className="flex flex-col text-left p-2.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                      {account.role}
                    </span>
                    <span className={`text-[9px] font-semibold px-1 rounded border ${account.badge}`}>
                      Demo
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 truncate">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
