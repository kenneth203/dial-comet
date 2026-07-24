import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const REMIX_BACKEND_URL = "https://hywkufdgabkmhgexfgnu.supabase.co";
const REMIX_BACKEND_PUBLISHABLE_KEY = "sb_publishable_L0KkkJjZIe1jeqBSYvG0fA_zUrq7cNQ";
const REMIX_BACKEND_PROJECT_ID = "hywkufdgabkmhgexfgnu";

const requiredClientEnv = (mode: string) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || REMIX_BACKEND_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      env.VITE_SUPABASE_PUBLISHABLE_KEY || REMIX_BACKEND_PUBLISHABLE_KEY,
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      env.VITE_SUPABASE_PROJECT_ID || REMIX_BACKEND_PROJECT_ID,
    ),
    "import.meta.env.VITE_APP_ENV": JSON.stringify(env.VITE_APP_ENV || "development"),
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: requiredClientEnv(mode),
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Target modern browsers to avoid legacy JavaScript polyfills
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    // Optimize for modern JavaScript features
    minify: 'esbuild',
    // Ensure modern JavaScript output
    cssTarget: 'chrome87',
    // CSS optimization for reduced bundle size
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Optimize chunk splitting for better caching and reduced initial load
        manualChunks: {
          // Separate vendor libraries
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-accordion', 
            '@radix-ui/react-alert-dialog', 
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast'
          ],
          'supabase': ['@supabase/supabase-js'],
          'query': ['@tanstack/react-query'],
          'utils': ['clsx', 'class-variance-authority', 'tailwind-merge']
        },
        // Enhanced cache-friendly file naming with longer hashes
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || [];
          const extType = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType || '')) {
            return `assets/images/[name]-[hash:12][extname]`;
          }
          if (extType === 'css') {
            return `assets/css/[name]-[hash:12][extname]`;
          }
          return `assets/[name]-[hash:12][extname]`;
        },
        // Optimize chunk file naming with content-based hashing
        chunkFileNames: 'assets/js/[name]-[hash:12].js',
        entryFileNames: 'assets/js/[name]-[hash:12].js',
      },
    },
  },
  esbuild: {
    // Target modern JavaScript syntax
    target: 'es2020',
  },
}));
