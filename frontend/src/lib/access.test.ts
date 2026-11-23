import { describe, expect, it } from 'vitest';
import { fakeUser } from '../test/render';
import { allowedSections, canAccessPath, canWrite, isAdmin, sectionForPath, type CurrentUser } from './access';

const withRoles = (...roles: CurrentUser['roles'][number]['role'][]): CurrentUser =>
  fakeUser({ roles: roles.map((role) => ({ role, role_name: role, facility: null })) });

describe('sections', () => {
  it('maps URLs to sections', () => {
    expect(sectionForPath('/drymill/ledger')).toBe('drymill');
    expect(sectionForPath('/cws/farmers')).toBe('cws');
    expect(sectionForPath('/reception')).toBe('cws');
    expect(sectionForPath('/admin/users')).toBe('admin');
    expect(sectionForPath('/account/password')).toBeNull();
    expect(sectionForPath('/dashboard')).toBeNull();
  });

  it('gives a station clerk only the CWS section', () => {
    const clerk = withRoles('CWS_CLERK');
    expect(allowedSections(clerk)).toEqual(['cws']);
    expect(canAccessPath(clerk, '/cws/labor')).toBe(true);
    expect(canAccessPath(clerk, '/drymill/ledger')).toBe(false);
    expect(canAccessPath(clerk, '/admin/users')).toBe(false);
  });

  it('gives an admin every section', () => {
    const admin = withRoles('ADMIN');
    expect(allowedSections(admin)).toEqual(['drymill', 'cws', 'admin']);
    expect(isAdmin(admin)).toBe(true);
  });

  it('lets anyone signed in open shared pages, and nobody signed out', () => {
    expect(canAccessPath(withRoles('HQ_FINANCE'), '/account/password')).toBe(true);
    expect(canAccessPath(null, '/account/password')).toBe(false);
  });
});

describe('write permissions mirror the backend', () => {
  it('only managers and admins close labor pay periods', () => {
    expect(canWrite(withRoles('CWS_CLERK'), 'cwsManage')).toBe(false);
    expect(canWrite(withRoles('CWS_MANAGER'), 'cwsManage')).toBe(true);
    expect(canWrite(withRoles('ADMIN'), 'cwsManage')).toBe(true);
  });

  it('keeps finance read-only on CWS and dry mill', () => {
    const finance = withRoles('HQ_FINANCE');
    expect(canWrite(finance, 'cws')).toBe(false);
    expect(canWrite(finance, 'drymill')).toBe(false);
    expect(allowedSections(finance)).toEqual(['drymill', 'cws']);
  });
});
