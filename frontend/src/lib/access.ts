// Roles, the current-user shape, and which app sections each role may open.

export type RoleCode =
  | 'ADMIN'
  | 'CWS_CLERK'
  | 'CWS_MANAGER'
  | 'HQ_FINANCE'
  | 'HQ_DRY_MILL_OPERATOR'
  | 'HQ_EXPORT_MANAGER';

export interface FacilityRef {
  id: string;
  code: string;
  name: string;
  facility_type: 'CWS' | 'HQ_DRY_MILL';
}

export interface RoleAssignment {
  role: RoleCode;
  role_name: string;
  facility: FacilityRef | null;
}

/** Shape of GET /api/v1/auth/me/ */
export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  is_global: boolean;
  /** Set after an admin creates the account or resets its password. */
  must_change_password: boolean;
  roles: RoleAssignment[];
}

export type Section = 'cws' | 'drymill' | 'admin';

// Which roles may open each section of the app. The backend enforces the
// real data access; this only decides what the menu shows.
const SECTION_ROLES: Record<Section, RoleCode[]> = {
  cws: ['ADMIN', 'HQ_FINANCE', 'CWS_CLERK', 'CWS_MANAGER'],
  drymill: ['ADMIN', 'HQ_FINANCE', 'HQ_DRY_MILL_OPERATOR', 'HQ_EXPORT_MANAGER'],
  admin: ['ADMIN'],
};

export function canAccessSection(user: CurrentUser | null, section: Section): boolean {
  if (!user) return false;
  return user.roles.some((assignment) => SECTION_ROLES[section].includes(assignment.role));
}

export function allowedSections(user: CurrentUser | null): Section[] {
  return (['drymill', 'cws', 'admin'] as Section[]).filter((section) => canAccessSection(user, section));
}

export type WriteArea = 'cws' | 'drymill' | 'export' | 'cwsManage';

// Mirrors the backend's *_WRITE_ROLES; the server still enforces them.
const WRITE_ROLES: Record<WriteArea, RoleCode[]> = {
  cws: ['ADMIN', 'CWS_CLERK', 'CWS_MANAGER'],
  drymill: ['ADMIN', 'HQ_DRY_MILL_OPERATOR'],
  export: ['ADMIN', 'HQ_EXPORT_MANAGER'],
  // Closing labor pay periods and similar station-manager decisions.
  cwsManage: ['ADMIN', 'CWS_MANAGER'],
};

/** Whether the user may create/change records in this area (hides buttons for read-only roles). */
export function canWrite(user: CurrentUser | null, area: WriteArea): boolean {
  if (!user) return false;
  return user.roles.some((assignment) => WRITE_ROLES[area].includes(assignment.role));
}

/** Whether the user is one of the super-admins (sees everything, e.g. station registration). */
export function isAdmin(user: CurrentUser | null): boolean {
  return user?.roles.some((assignment) => assignment.role === 'ADMIN') ?? false;
}

/** Which section a URL belongs to (null for shared pages like /dashboard). */
export function sectionForPath(pathname: string): Section | null {
  if (pathname.startsWith('/drymill/')) return 'drymill';
  if (pathname.startsWith('/admin/')) return 'admin';
  if (pathname.startsWith('/cws/') || pathname === '/reception' || pathname === '/processing') return 'cws';
  return null;
}

/** Whether the user may open this URL. */
export function canAccessPath(user: CurrentUser | null, pathname: string): boolean {
  const section = sectionForPath(pathname);
  return section === null ? Boolean(user) : canAccessSection(user, section);
}
