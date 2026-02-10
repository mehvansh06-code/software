import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { ShieldCheck, Package } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const MOCK_USERS: User[] = [
  { id: '1', username: 'director', name: 'J P Tosniwal', role: UserRole.MANAGEMENT },
  { id: '2', username: 'checker', name: 'Sarah Accountant', role: UserRole.CHECKER },
  { id: '3', username: 'employee', name: 'Rahul Sharma', role: UserRole.EXECUTIONER },
];

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = MOCK_USERS.find(u => u.username === username);
    if (found && password === 'admin123') {
      onLogin(found);
    } else {
      setError('Invalid username or password (hint: use admin123)');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-900 p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden p-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-indigo-50 rounded-2xl mb-6">
            <Package size={40} className="text-indigo-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">Gujarat Flotex IMS</h2>
          <p className="text-slate-500 mt-2">Log in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="e.g. director, checker, employee"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <button 
            type="submit"
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck size={20} />
            Secure Login
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-center text-xs text-slate-400">
            For demo: Use 'director', 'checker', or 'employee' with password 'admin123'
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;