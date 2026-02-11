import type { User } from '../types';

/**
 * Reads user (with permissions) from localStorage when userFromContext is not provided.
 * Prefer passing the current user from App/useAppData so permissions stay in sync after auth/me.
 */
function getStoredUser(): { permissions?: string[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    const u = JSON.parse(raw);
    return u && typeof u === 'object' ? u : null;
  } catch {
    return null;
  }
}

export function usePermissions(userFromContext?: User | null) {
  const user = userFromContext ?? getStoredUser();
  const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];

  const hasPermission = (perm: string): boolean => {
    if (!perm) return false;
    return permissions.includes(perm);
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    if (!Array.isArray(perms) || perms.length === 0) return false;
    return perms.some((p) => permissions.includes(p));
  };

  return { hasPermission, hasAnyPermission, permissions };
}

export type UsePermissionsReturn = ReturnType<typeof usePermissions>;
