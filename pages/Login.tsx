import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { ShieldCheck, Package } from 'lucide-react';
import { api } from '../api';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(username, password);
      if (result.success && result.token && result.user) {
        localStorage.setItem('token', result.token);
        const user: User = {
          id: result.user.id,
          username: result.user.username,
          name: result.user.name,
          role: result.user.role as UserRole,
        };
        onLogin(user);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (/failed to fetch|network error|load failed|connection refused/i.test(msg)) {
        setError('Cannot reach server. Start the backend: run "npm run start" or "node server.js" in the project folder (port 3001).');
      } else {
        setError(msg || 'Invalid username or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-900 p-4 sm:p-6">
      <div className="max-w-md w-full bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10">
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center justify-center p-3 sm:p-4 bg-indigo-50 rounded-2xl mb-4 sm:mb-6">
            <Package size={40} className="text-indigo-600" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Gujarat Flotex IMS</h2>
          <p className="text-slate-500 mt-2">Log in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[44px]"
              placeholder="e.g. director, checker, employee"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[44px]"
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={20} />
            {loading ? 'Signing in…' : 'Secure Login'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-center text-xs text-slate-400">
            Sign in with your assigned username and password.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
