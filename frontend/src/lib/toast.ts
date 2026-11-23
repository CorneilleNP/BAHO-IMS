import { notifications } from '@mantine/notifications';

// When a save was just queued offline, the "Saved offline" message is the one to
// show: the form's own success message would quote fields the server has not
// assigned yet (GRN number, farmer code…).
let queuedAt = 0;

/** Toast notifications (bottom-right, clear of the header), used instead of inline success banners. */
export const toast = {
  success(message: string, title = 'Saved') {
    if (Date.now() - queuedAt < 2000) return;
    notifications.show({ color: 'teal', title, message, autoClose: 5000 });
  },
  error(message: string, title = 'Something went wrong') {
    notifications.show({ color: 'red', title, message, autoClose: 8000 });
  },
  info(message: string, title?: string) {
    notifications.show({ color: 'coffee', title, message, autoClose: 4000 });
  },
  /** Called by the API layer when a write is saved on the device instead of the server. */
  queued() {
    queuedAt = Date.now();
    notifications.show({
      color: 'gray',
      title: 'Saved offline',
      message: 'Saved on this device. It will be sent to the server automatically when you are back online.',
      autoClose: 5000,
    });
  },
};
