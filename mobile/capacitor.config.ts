import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the same React build as the website (../frontend, `npm run build` -> dist/).
// It talks to the server chosen on the login screen (default https://ims.bahocoffee.com).
const config: CapacitorConfig = {
  appId: 'rw.baho.ims',
  appName: 'Baho IMS',
  webDir: '../frontend/dist',
  server: {
    androidScheme: 'https',
    // Lets a tester point the app at a PC on the local Wi-Fi (http://192.168.x.x:8000).
    // Production is https; the login screen warns when an http server is chosen.
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Keep the app clear of the status/navigation bars (pages don't use viewport-fit=cover).
    SystemBars: { insetsHandling: 'native' },
  },
};

export default config;
