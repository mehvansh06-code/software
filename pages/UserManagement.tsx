import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Users, X, Pencil } from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { AppDomain } from '../types';

interface PermissionGroup {
  id: string;
  label: string;
  permissions: string[];
}

interface PresetsMap {
  VIEWER: string[];
  CHECKER: string[];
  MANAGEMENT: string[];
  EXECUTIONER?: string[];
}

interface ApiUser {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: string[];
  allowedDomains?: string[];
}

const SCREEN_OPTIONS: { value: AppDomain; label: string }[] = [
  { value: AppDomain.IMPORT, label: 'Import' },
  { value: AppDomain.EXPORT, label: 'Export' },
  { value: AppDomain.LICENCE, label: 'Licence' },
  { value: AppDomain.SALES_INDENT, label: 'Sales Indent' },
];

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((p) => set.has(p));
}

function presetName(perms: string[], presets: PresetsMap): string | null {
  if (arraysEqual(perms, presets.MANAGEMENT || [])) return 'MANAGEMENT';
  if (arraysEqual(perms, presets.CHECKER || [])) return 'CHECKER';
  if (arraysEqual(perms, presets.VIEWER || [])) return 'VIEWER';
  if (arraysEqual(perms, presets.EXECUTIONER || [])) return 'EXECUTIONER';
  return null;
}

export default function UserManagement() {
  const { hasPermission } = usePermissions();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [presets, setPresets] = useState<PresetsMap>({ VIEWER: [], CHECKER: [], MANAGEMENT: [], EXECUTIONER: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalUser, setModalUser] = useState<ApiUser | null>(null);
  const [modalPerms, setModalPerms] = useState<string[]>([]);
  const [modalAllowedDomains, setModalAllowedDomains] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingScreens, setSavingScreens] = useState(false);
  const [screensSaveMessage, setScreensSaveMessage] = useState<'success' | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    name: '',
    role: 'VIEWER' as string,
    allowedDomains: [] as string[],
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<ApiUser | null>(null);
  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    password: '',
    role: 'VIEWER' as string,
    allowedDomains: [] as string[],
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const list = await api.users.list();
      setUsers(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    }
  }, []);

  const loadPermissionGroups = useCallback(async () => {
    try {
      const data = await api.getPermissionGroups();
      setGroups(data.groups || []);
      setPresets((data.presets || { VIEWER: [], CHECKER: [], MANAGEMENT: [], EXECUTIONER: [] }) as PresetsMap);
    } catch (_) {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadUsers(), loadPermissionGroups()]).finally(() => setLoading(false));
  }, [loadUsers, loadPermissionGroups]);

  const openModal = (user: ApiUser) => {
    setModalUser(user);
    setModalPerms([...(user.permissions || [])]);
    setModalAllowedDomains(Array.isArray(user.allowedDomains) ? [...user.allowedDomains] : []);
    setError(null);
    setScreensSaveMessage(null);
  };

  const applyPreset = (presetKey: keyof PresetsMap) => {
    const p = presets[presetKey];
    if (!Array.isArray(p) || !modalUser) return;
    const next = [...p];
    setModalPerms(next);
    setSaving(true);
    api.users
      .updatePermissions(modalUser.id, next)
      .then(() => {
        setModalUser((u) => (u ? { ...u, permissions: next } : null));
        setUsers((list) => list.map((u) => (u.id === modalUser.id ? { ...u, permissions: next } : u)));
      })
      .catch((e: any) => setError(e?.message || 'Failed to apply preset'))
      .finally(() => setSaving(false));
  };

  const togglePerm = (perm: string) => {
    setModalPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleCheckboxChange = (perm: string) => {
    const next = modalPerms.includes(perm)
      ? modalPerms.filter((p) => p !== perm)
      : [...modalPerms, perm];
    setModalPerms(next);
    // Optimistic: send PATCH immediately
    if (!modalUser) return;
    setSaving(true);
    api.users
      .updatePermissions(modalUser.id, next)
      .then(() => {
        setModalUser((u) => (u ? { ...u, permissions: next } : null));
        setUsers((list) =>
          list.map((u) => (u.id === modalUser.id ? { ...u, permissions: next } : u))
        );
      })
      .catch((e: any) => {
        setModalPerms(modalPerms);
        setError(e?.message || 'Update failed');
      })
      .finally(() => setSaving(false));
  };

  const canManage = hasPermission('users.manage_permissions');
  const canView = hasPermission('users.view');
  const canCreate = hasPermission('users.create');
  const canEdit = hasPermission('users.edit');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createForm.username.trim()) {
      setCreateError('Username is required');
      return;
    }
    if (!createForm.password) {
      setCreateError('Password is required');
      return;
    }
    if (createForm.allowedDomains.length === 0) {
      setCreateError('Select at least one screen the user can access.');
      return;
    }
    setCreating(true);
    try {
      await api.users.create({
        username: createForm.username.trim(),
        password: createForm.password,
        name: createForm.name.trim() || createForm.username.trim(),
        role: createForm.role,
        allowedDomains: createForm.allowedDomains,
      });
      await loadUsers();
      setShowCreateModal(false);
      setCreateForm({ username: '', password: '', name: '', role: 'VIEWER', allowedDomains: [] });
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (u: ApiUser) => {
    setEditUser(u);
    setEditForm({
      username: u.username,
      name: u.name || '',
      password: '',
      role: u.role,
      allowedDomains: Array.isArray(u.allowedDomains) ? [...u.allowedDomains] : [],
    });
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError(null);
    if (!editForm.username.trim()) {
      setEditError('Username is required');
      return;
    }
    if (editForm.allowedDomains.length === 0) {
      setEditError('Select at least one screen the user can access.');
      return;
    }
    setSavingEdit(true);
    try {
      await api.users.update(editUser.id, {
        username: editForm.username.trim(),
        name: editForm.name.trim() || editForm.username.trim(),
        role: editForm.role,
        allowedDomains: editForm.allowedDomains,
      });
      if (editForm.password) {
        await api.users.updatePassword(editUser.id, editForm.password);
      }
      await loadUsers();
      setEditUser(null);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleCreateScreen = (domain: string) => {
    setCreateForm((f) => ({
      ...f,
      allowedDomains: f.allowedDomains.includes(domain)
        ? f.allowedDomains.filter((d) => d !== domain)
        : [...f.allowedDomains, domain],
    }));
  };

  const toggleEditScreen = (domain: string) => {
    setEditForm((f) => ({
      ...f,
      allowedDomains: f.allowedDomains.includes(domain)
        ? f.allowedDomains.filter((d) => d !== domain)
        : [...f.allowedDomains, domain],
    }));
  };

  const toggleModalScreen = (domain: string) => {
    setModalAllowedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const handleSaveScreens = () => {
    if (!modalUser) return;
    if (modalAllowedDomains.length === 0) {
      setError('Select at least one screen. To remove all access, use Edit user instead.');
      return;
    }
    setSavingScreens(true);
    setError(null);
    api.users
      .updateAllowedDomains(modalUser.id, modalAllowedDomains)
      .then((updated: any) => {
        const domains = updated.allowedDomains || modalAllowedDomains;
        setModalUser((u) => (u ? { ...u, allowedDomains: domains } : null));
        setUsers((list) =>
          list.map((u) => (u.id === modalUser.id ? { ...u, allowedDomains: domains } : u))
        );
        setError(null);
        setScreensSaveMessage('success');
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to save screens');
        setScreensSaveMessage(null);
      })
      .finally(() => setSavingScreens(false));
  };

  if (!canView) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 text-center text-slate-500 font-medium">
        You do not have permission to view user management.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-12 text-center text-slate-500 font-medium">
        Loading users…
      </div>
    );
  }

  const presetLabel = presetName(modalPerms, presets);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users size={28} className="text-indigo-500" /> User Management
          </h1>
          <p className="text-slate-500 font-medium mt-1">View and manage users and permissions.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => { setShowCreateModal(true); setCreateError(null); setCreateForm({ username: '', password: '', name: '', role: 'VIEWER', allowedDomains: [] }); }}
            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <UserPlus size={18} /> New User
          </button>
        )}
      </header>

      {error && (
        <div className="px-6 py-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">User</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Role</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Screens</th>
                <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center rounded-xl">
                        {(u.name || u.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">{u.name || u.username}</span>
                        <span className="text-slate-500 text-sm ml-2">({u.username})</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-sm text-slate-600">
                      {Array.isArray(u.allowedDomains) && u.allowedDomains.length > 0
                        ? u.allowedDomains.map((d) => SCREEN_OPTIONS.find((s) => s.value === d)?.label || d).join(', ')
                        : 'All'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right flex items-center justify-end gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openModal(u)}
                        className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-sm hover:bg-indigo-100 transition-colors"
                      >
                        Manage Permissions
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setModalUser(null)}>
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">
                Permissions: {modalUser.name || modalUser.username}
              </h2>
              <button
                type="button"
                onClick={() => setModalUser(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <div className="px-8 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Presets</span>
              <button
                type="button"
                onClick={() => applyPreset('VIEWER')}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold transition-colors"
              >
                Viewer
              </button>
              <button
                type="button"
                onClick={() => applyPreset('CHECKER')}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold transition-colors"
              >
                Checker
              </button>
              <button
                type="button"
                onClick={() => applyPreset('MANAGEMENT')}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold transition-colors"
              >
                Management
              </button>
              {presetLabel ? (
                <span className="text-xs font-bold text-slate-500 ml-2">Applied: {presetLabel}</span>
              ) : (
                <span className="text-xs font-bold text-amber-600 ml-2">Custom</span>
              )}
            </div>
            <div className="px-8 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Screens this user can access</h3>
              <p className="text-xs text-slate-500 mb-3">Choose which hubs (Import, Export, Licence, Sales Indent) this user sees after login. Click <strong>Save screens</strong> to apply. The user must log out and log back in (or use Switch Domain) to see the change.</p>
              <div className="flex flex-wrap gap-4 mb-4">
                {SCREEN_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalAllowedDomains.includes(opt.value)}
                      onChange={() => toggleModalScreen(opt.value)}
                      disabled={savingScreens}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveScreens}
                  disabled={savingScreens || modalAllowedDomains.length === 0}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {savingScreens ? 'Saving…' : 'Save screens'}
                </button>
                {screensSaveMessage === 'success' && (
                  <span className="text-sm font-medium text-emerald-600">Screens saved. User should log out and back in (or use Switch Domain) to see the change.</span>
                )}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-8 space-y-6">
              {groups.map((g) => (
                <div key={g.id}>
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">{g.label}</h3>
                  <div className="flex flex-wrap gap-4">
                    {g.permissions.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={modalPerms.includes(perm)}
                          onChange={() => handleCheckboxChange(perm)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-slate-700">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setModalUser(null)}
                className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => !creating && setShowCreateModal(false)}>
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !creating && setShowCreateModal(false)}
              className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <h2 className="text-xl font-black text-slate-900 mb-6">Create new user</h2>
            {createError && (
              <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Username *</label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. jane.doe"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Display name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Screens this user can access *</label>
                <p className="text-xs text-slate-500 mb-2">Select which domains (Import, Export, Licence, Sales Indent) the user can see after login.</p>
                <div className="flex flex-wrap gap-4">
                  {SCREEN_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.allowedDomains.includes(opt.value)}
                        onChange={() => toggleCreateScreen(opt.value)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="CHECKER">Checker</option>
                  <option value="EXECUTIONER">Executioner</option>
                  <option value="MANAGEMENT">Management</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !creating && setShowCreateModal(false)}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-100"
                >
                  {creating ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => !savingEdit && setEditUser(null)}>
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !savingEdit && setEditUser(null)}
              className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <h2 className="text-xl font-black text-slate-900 mb-6">Edit user</h2>
            {editError && (
              <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                {editError}
              </div>
            )}
            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Username *</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. jane.doe"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Display name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">New password (leave blank to keep current)</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Screens this user can access *</label>
                <div className="flex flex-wrap gap-4">
                  {SCREEN_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.allowedDomains.includes(opt.value)}
                        onChange={() => toggleEditScreen(opt.value)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="CHECKER">Checker</option>
                  <option value="EXECUTIONER">Executioner</option>
                  <option value="MANAGEMENT">Management</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !savingEdit && setEditUser(null)}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-100"
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
