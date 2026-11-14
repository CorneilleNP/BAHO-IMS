import { notifications } from '@mantine/notifications';

/** Toast notifications (bottom-right, clear of the header), used instead of inline success banners. */
export const toast = {
  success(message: string, title = 'Saved') {
    notifications.show({ color: 'teal', title, message, autoClose: 5000 });
  },
  error(message: string, title = 'Something went wrong') {
    notifications.show({ color: 'red', title, message, autoClose: 8000 });
  },
  info(message: string, title?: string) {
    notifications.show({ color: 'coffee', title, message, autoClose: 4000 });
  },
};
