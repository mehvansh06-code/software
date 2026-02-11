import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import type { User } from '../types';

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
}

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
  const [saving, setSaving] = useState(false);

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

  if (!canView) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-6 text-center text-gray-500">
        You do not have permission to view user management.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-gray-500">
        Loading users…
      </div>
    );
  }

  const presetLabel = presetName(modalPerms, presets);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">User Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">View and manage user permissions.</p>
        </div>
        {error && (
          <div className="mx-6 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-6 py-3">
                    <span className="font-medium text-slate-800">{u.name || u.username}</span>
                    <span className="text-gray-500 text-sm ml-2">({u.username})</span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{u.role}</td>
                  <td className="px-6 py-3">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openModal(u)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalUser(null)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">
                Permissions: {modalUser.name || modalUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setModalUser(null)}
                className="text-gray-500 hover:text-gray-700 p-1"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset('VIEWER')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm"
              >
                Viewer
              </button>
              <button
                type="button"
                onClick={() => applyPreset('CHECKER')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm"
              >
                Checker
              </button>
              <button
                type="button"
                onClick={() => applyPreset('MANAGEMENT')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm"
              >
                Management
              </button>
              {presetLabel ? (
                <span className="text-sm text-gray-500 ml-2">Applied: {presetLabel}</span>
              ) : (
                <span className="text-sm text-amber-600 ml-2">Custom</span>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {groups.map((g) => (
                <div key={g.id}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">{g.label}</h4>
                  <div className="flex flex-wrap gap-4">
                    {g.permissions.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={modalPerms.includes(perm)}
                          onChange={() => handleCheckboxChange(perm)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalUser(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-gray-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
