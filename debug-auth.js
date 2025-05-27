/**
 * FocusDot Authentication Debug Script
 * 
 * Run this in the browser console on the dashboard to debug authentication issues.
 * Usage: Copy and paste this entire script into the browser console on localhost:3000
 */

console.log("🔧 FocusDot Authentication Debug Script");
console.log("=====================================");

// 1. Check localStorage for auth tokens
console.log("\n1. 📦 Checking localStorage for auth tokens:");
const allKeys = Object.keys(localStorage);
const authKeys = allKeys.filter(key => key.includes('auth') || key.includes('supabase') || key.includes('sb-'));
console.log("All localStorage keys:", allKeys);
console.log("Auth-related keys:", authKeys);

authKeys.forEach(key => {
  const value = localStorage.getItem(key);
  console.log(`Key: ${key}`);
  console.log(`Value length: ${value?.length || 0}`);
  try {
    const parsed = JSON.parse(value);
    console.log(`Parsed data:`, parsed);
    if (parsed.user) {
      console.log(`✅ User found: ${parsed.user.email}`);
    }
    if (parsed.access_token) {
      console.log(`✅ Access token found`);
    }
  } catch (e) {
    console.log(`❌ Not valid JSON: ${e.message}`);
  }
  console.log("---");
});

// 2. Check window.focusDotAuth
console.log("\n2. 🪟 Checking window.focusDotAuth:");
if (window.focusDotAuth) {
  console.log("✅ window.focusDotAuth exists:", window.focusDotAuth);
  console.log("Is authenticated:", window.focusDotAuth.isAuthenticated);
  console.log("User email:", window.focusDotAuth.user?.email);
} else {
  console.log("❌ window.focusDotAuth not found");
}

// 3. Check for auth indicators in DOM
console.log("\n3. 🔍 Checking DOM for auth indicators:");
const indicators = [
  { selector: '[data-user-email]', name: 'data-user-email' },
  { selector: '.user-profile', name: 'user-profile' },
  { selector: '[data-authenticated="true"]', name: 'data-authenticated' },
  { selector: 'button[title*="Sign out"]', name: 'sign out button' },
  { selector: 'button[title*="Logout"]', name: 'logout button' },
  { selector: '[data-testid="user-menu"]', name: 'user menu' }
];

indicators.forEach(({ selector, name }) => {
  const element = document.querySelector(selector);
  if (element) {
    console.log(`✅ Found ${name}:`, element);
  } else {
    console.log(`❌ Not found: ${name}`);
  }
});

// 4. Test manual auth check
console.log("\n4. 🔄 Testing manual auth check:");
if (typeof window.focusDotManualAuthCheck === 'function') {
  console.log("✅ Manual auth check function exists");
  console.log("Triggering manual auth check...");
  window.focusDotManualAuthCheck();
} else {
  console.log("❌ Manual auth check function not found");
}

// 5. Check Chrome extension availability
console.log("\n5. 🔌 Checking Chrome extension:");
if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log("✅ Chrome extension API available");
  console.log("Extension ID:", chrome.runtime.id);
  
  // Try to send a test message
  try {
    chrome.runtime.sendMessage({ action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("❌ Extension communication error:", chrome.runtime.lastError.message);
      } else {
        console.log("✅ Extension responded:", response);
      }
    });
  } catch (error) {
    console.log("❌ Error sending message to extension:", error);
  }
} else {
  console.log("❌ Chrome extension API not available");
}

// 6. Force auth state update
console.log("\n6. 🚀 Force auth state update:");
if (window.focusDotAuth && window.focusDotAuth.isAuthenticated) {
  console.log("Dispatching custom auth event...");
  window.dispatchEvent(new CustomEvent('focusdot:authChanged', {
    detail: {
      event: 'MANUAL_DEBUG',
      user: window.focusDotAuth.user,
      session: window.focusDotAuth.session,
      isAuthenticated: true
    }
  }));
  console.log("✅ Custom auth event dispatched");
} else {
  console.log("❌ Cannot dispatch auth event - no valid auth state");
}

console.log("\n🎯 Debug script completed!");
console.log("Check the console for any additional FocusDot messages.");
