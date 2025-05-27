/**
 * FocusDot Extension Configuration
 *
 * IMPORTANT: Replace these values with your actual Supabase credentials
 * You can find these in your Supabase project settings:
 * 1. Go to https://supabase.com/dashboard
 * 2. Select your project
 * 3. Go to Settings > API
 * 4. Copy the URL and anon key
 */

// Supabase Configuration
export const SUPABASE_CONFIG = {
  // Replace with your Supabase project URL
  url: "https://yhtbbupedmilamnvxcqy.supabase.co",

  // Replace with your Supabase anon key
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodGJidXBlZG1pbGFtbnZ4Y3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5ODM1NTksImV4cCI6MjA2MzU1OTU1OX0.iSJ7xRK7hmiBGyZzADgKZ9T6Yizc3pAjCMomLXXOH3A",
};

// Dashboard Configuration
export const DASHBOARD_CONFIG = {
  // Dashboard auth URL for development
  url: "http://localhost:3000/auth", // Change to your production URL when deployed
  baseUrl: "http://localhost:3000", // Base dashboard URL
};

// Extension Configuration
export const EXTENSION_CONFIG = {
  // Extension name for logging
  name: "FocusDot",

  // Version
  version: "1.0.0",

  // Real-time sync settings
  syncEnabled: true,
  syncRetryAttempts: 3,
  syncRetryDelay: 1000, // milliseconds
};

/**
 * Validation function to check if configuration is properly set
 */
export function validateConfig() {
  const errors = [];

  if (
    !SUPABASE_CONFIG.url ||
    SUPABASE_CONFIG.url === "YOUR_SUPABASE_URL_HERE"
  ) {
    errors.push("Supabase URL is not configured");
  }

  if (
    !SUPABASE_CONFIG.anonKey ||
    SUPABASE_CONFIG.anonKey === "YOUR_SUPABASE_ANON_KEY_HERE"
  ) {
    errors.push("Supabase anon key is not configured");
  }

  if (errors.length > 0) {
    console.error("FocusDot Configuration Errors:", errors);
    return false;
  }

  return true;
}
