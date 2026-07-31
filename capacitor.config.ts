import type { CapacitorConfig } from '@capacitor/cli';

// Native shell config for the iOS app.
//
// The app runs the built web bundle locally (webDir: 'dist') — it is NOT a
// browser pointed at the website, which is what Apple rejects under Guideline
// 4.2. All the native capability (camera, offline photo queue, background
// upload) runs inside this shell.
const config: CapacitorConfig = {
  appId: 'cleaning.brightly.app',
  appName: 'Brightly',
  webDir: 'dist',

  ios: {
    // Lets Supabase auth cookies persist across launches.
    limitsNavigationsToAppBoundDomains: false,
    contentInset: 'always',
    backgroundColor: '#F4F7F6',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#F4F7F6',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',            // dark text — the app is a light theme
      backgroundColor: '#F4F7F6',
    },
  },

  server: {
    // Required so the WKWebView origin is a proper https origin rather than
    // capacitor://, which browsers treat as opaque — that breaks Supabase
    // session cookies and would sign cleaners out constantly.
    iosScheme: 'https',
  },
};

export default config;
