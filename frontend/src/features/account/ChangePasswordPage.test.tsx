import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, renderWithApp } from '../../test/render';
import { ChangePasswordPage } from './ChangePasswordPage';

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ChangePasswordPage', () => {
  it('explains why when the password was set by an admin', () => {
    renderWithApp(<ChangePasswordPage />, { user: fakeUser({ must_change_password: true }) });
    expect(screen.getByText(/temporary password for you/i)).toBeTruthy();
    expect(screen.getByLabelText(/Temporary password/)).toBeTruthy();
  });

  it('refuses mismatched passwords without calling the server', async () => {
    const changePassword = vi.fn();
    renderWithApp(<ChangePasswordPage />, { auth: { changePassword } });
    fill(/Current password/, 'old-pass-123');
    fill(/^New password/, 'Kigali-Coffee-2026');
    fill(/Repeat new password/, 'Kigali-Coffee-2027');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/do not match/)).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('sends the current and new password', async () => {
    const changePassword = vi.fn().mockResolvedValue(fakeUser());
    renderWithApp(<ChangePasswordPage />, { auth: { changePassword } });
    fill(/Current password/, 'old-pass-123');
    fill(/^New password/, 'Kigali-Coffee-2026');
    fill(/Repeat new password/, 'Kigali-Coffee-2026');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-pass-123', 'Kigali-Coffee-2026'));
  });
});
