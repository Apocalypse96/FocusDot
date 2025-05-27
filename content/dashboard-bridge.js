/**
 * FocusDot Dashboard Bridge
 *
 * This content script runs on the dashboard domain and facilitates
 * communication between the dashboard and the extension for authentication.
 */

// Only run on the dashboard domain
const DASHBOARD_DOMAINS = ["localhost:3000"]; // Add your production domain when deploying
const currentDomain = window.location.host;

if (DASHBOARD_DOMAINS.some((domain) => currentDomain.includes(domain))) {
  console.log("FocusDot: Dashboard bridge initialized");

  // Listen for authentication events from the dashboard
  let authCheckInterval = null;
  let lastAuthState = null;

  // Function to check authentication state
  async function checkAuthState() {
    try {
      // Try to get auth state from the dashboard's localStorage
      // Supabase stores session data with different key formats

      // Method 1: Try different Supabase localStorage key patterns
      // Supabase v2 uses this format: sb-<project-ref>-auth-token
      const hostname = window.location.hostname.replace(/\./g, "-");
      const possibleKeys = [
        `sb-${hostname}-auth-token`,
        `sb-localhost-auth-token`,
        `supabase.auth.token`,
        `sb-auth-token`,
      ];

      // Also check for any key that contains 'auth-token' (more flexible)
      const allKeys = Object.keys(localStorage);
      const authTokenKeys = allKeys.filter((key) => key.includes("auth-token"));
      possibleKeys.push(...authTokenKeys);

      let supabaseSession = null;
      let sessionData = null;

      // Try to find the session in localStorage
      for (const key of possibleKeys) {
        const stored = localStorage.getItem(key);
        if (stored && stored !== "null" && stored !== "undefined") {
          try {
            sessionData = JSON.parse(stored);
            supabaseSession = stored;
            console.log(
              "FocusDot: Found session with key:",
              key,
              "Data:",
              sessionData
            );

            // Validate that this is actually a valid session
            if (sessionData && (sessionData.access_token || sessionData.user)) {
              console.log("FocusDot: Valid session found");
              break;
            } else {
              console.log("FocusDot: Invalid session data, continuing search");
              sessionData = null;
              supabaseSession = null;
            }
          } catch (e) {
            console.log("FocusDot: Error parsing session for key:", key, e);
            // Try next key
            continue;
          }
        }
      }

      // Method 2: Check for auth context in the page
      const authIndicators = [
        document.querySelector("[data-user-email]"),
        document.querySelector(".user-profile"),
        document.querySelector('[data-authenticated="true"]'),
        // Check if user is logged in by looking for logout buttons or user info
        document.querySelector('button[title*="Sign out"]'),
        document.querySelector('button[title*="Logout"]'),
        document.querySelector('[data-testid="user-menu"]'),
      ];

      // Method 3: Check if we can access the FocusDot auth context from window
      let windowAuthState = null;
      try {
        if (window.focusDotAuth) {
          windowAuthState = window.focusDotAuth;
          console.log("FocusDot: Found window auth state:", windowAuthState);
          if (windowAuthState.isAuthenticated && windowAuthState.session) {
            sessionData = windowAuthState.session;
            supabaseSession = JSON.stringify(sessionData);
            console.log(
              "FocusDot: Using window auth session for user:",
              windowAuthState.user?.email
            );
          }
        } else {
          console.log("FocusDot: No window.focusDotAuth found");
        }
      } catch (e) {
        console.log("FocusDot: Error accessing window auth state:", e);
      }

      // Debug: Log what we found
      console.log("FocusDot: Auth detection results:", {
        foundLocalStorageSession: !!supabaseSession,
        foundWindowAuth: !!windowAuthState,
        windowAuthAuthenticated: windowAuthState?.isAuthenticated,
        authIndicatorsFound: authIndicators.some((el) => el !== null),
        localStorageKeys: possibleKeys.filter((key) =>
          localStorage.getItem(key)
        ),
      });

      // Determine if user is authenticated based on multiple sources
      const hasValidSession =
        sessionData && (sessionData.access_token || sessionData.user);
      const hasWindowAuth = windowAuthState && windowAuthState.isAuthenticated;
      const hasPageIndicators = authIndicators.some((el) => el !== null);

      const isAuthenticated =
        hasValidSession || hasWindowAuth || hasPageIndicators;

      console.log("FocusDot: Authentication check results:", {
        hasValidSession,
        hasWindowAuth,
        hasPageIndicators,
        finalResult: isAuthenticated,
        sessionDataType: typeof sessionData,
        windowAuthType: typeof windowAuthState,
      });

      // If auth state changed, notify the extension
      if (isAuthenticated !== lastAuthState) {
        lastAuthState = isAuthenticated;

        if (isAuthenticated) {
          console.log("FocusDot: User authenticated on dashboard");

          // Try to get user info
          let userInfo = null;
          try {
            if (windowAuthState && windowAuthState.user) {
              userInfo = windowAuthState.user;
              console.log("FocusDot: Using window auth user:", userInfo?.email);
            } else if (sessionData) {
              // Handle different session data structures
              if (sessionData.user) {
                userInfo = sessionData.user;
              } else if (
                sessionData.access_token &&
                sessionData.user_metadata
              ) {
                userInfo = {
                  id: sessionData.user_id,
                  email: sessionData.user_metadata.email,
                  ...sessionData.user_metadata,
                };
              } else {
                userInfo = sessionData;
              }
              console.log(
                "FocusDot: Extracted user info from session:",
                userInfo?.email
              );
            }
          } catch (e) {
            console.log("FocusDot: Could not parse session data:", e);
          }

          // Notify extension about authentication
          const message = {
            action: "dashboardAuthDetected",
            user: userInfo,
            session: sessionData,
            timestamp: Date.now(),
          };

          console.log(
            "FocusDot: Sending dashboardAuthDetected message:",
            message
          );

          try {
            if (chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "FocusDot: Error sending auth message:",
                    chrome.runtime.lastError.message
                  );
                } else {
                  console.log(
                    "FocusDot: Auth message sent successfully:",
                    response
                  );
                }
              });
            } else {
              console.error("FocusDot: Chrome runtime not available");
            }
          } catch (error) {
            console.error("FocusDot: Exception sending auth message:", error);
          }

          // Show a brief notification to user
          showAuthNotification("🎯 FocusDot extension connected!");
        } else {
          console.log("FocusDot: User signed out on dashboard");

          // Notify extension about sign out
          chrome.runtime.sendMessage({
            action: "dashboardSignOutDetected",
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error("FocusDot: Error checking auth state:", error);
    }
  }

  // Function to show a brief notification
  function showAuthNotification(message) {
    // Create a temporary notification element
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      backdrop-filter: blur(10px);
    `;

    // Add animation keyframes
    if (!document.getElementById("focusdot-animations")) {
      const style = document.createElement("style");
      style.id = "focusdot-animations";
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideOut 0.3s ease-in";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Start checking auth state periodically
  function startAuthMonitoring() {
    console.log("FocusDot: Starting auth monitoring");

    // Check immediately
    checkAuthState();

    // Then check every 2 seconds
    authCheckInterval = setInterval(checkAuthState, 2000);

    // Also log all localStorage keys for debugging
    console.log(
      "FocusDot: Available localStorage keys:",
      Object.keys(localStorage)
    );
  }

  // Stop monitoring
  function stopAuthMonitoring() {
    if (authCheckInterval) {
      clearInterval(authCheckInterval);
      authCheckInterval = null;
    }
  }

  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("FocusDot Dashboard Bridge: Received message", message);

    switch (message.action) {
      case "startAuthMonitoring":
        startAuthMonitoring();
        sendResponse({ success: true });
        break;

      case "stopAuthMonitoring":
        stopAuthMonitoring();
        sendResponse({ success: true });
        break;

      case "checkAuthState":
        checkAuthState();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: "Unknown action" });
    }

    return true;
  });

  // Add a global function for manual auth check (for debugging)
  window.focusDotManualAuthCheck = function () {
    console.log("FocusDot: Manual auth check triggered");
    checkAuthState();
  };

  // Start monitoring when the page loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAuthMonitoring);
  } else {
    startAuthMonitoring();
  }

  // Clean up when page unloads
  window.addEventListener("beforeunload", stopAuthMonitoring);

  // Also listen for storage changes (for immediate auth detection)
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.includes("auth-token")) {
      console.log("FocusDot: Auth storage changed");
      setTimeout(checkAuthState, 100); // Small delay to ensure state is updated
    }
  });

  // Listen for custom events from the dashboard app
  window.addEventListener("focusdot:authChanged", (e) => {
    console.log("FocusDot: Custom auth event received", e.detail);

    // Use multiple timeouts to ensure we catch the auth state
    setTimeout(checkAuthState, 50); // Quick check
    setTimeout(checkAuthState, 200); // Medium delay
    setTimeout(checkAuthState, 500); // Longer delay for slow updates
  });

  console.log("FocusDot: Dashboard bridge ready");
}
