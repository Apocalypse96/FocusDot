/**
 * FocusDot - Background Script
 *
 * This script handles the core timer logic, state management, and real-time sync with Supabase.
 */

import { auth, timerDB, settingsDB, initializeAuth } from "../lib/supabase.js";

// Default settings
const DEFAULT_SETTINGS = {
  pomodoroMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  pomodorosBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartPomodoros: true,
  notifications: true,
  timerVisibility: true,
  dotSize: 45,
};

// Timer states
const TIMER_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
};

// Timer types
const TIMER_TYPE = {
  POMODORO: "pomodoro",
  BREAK: "break",
  SHORT_BREAK: "shortBreak",
  LONG_BREAK: "longBreak",
};

// Global state
let state = {
  settings: { ...DEFAULT_SETTINGS },
  currentTimer: {
    type: TIMER_TYPE.POMODORO,
    state: TIMER_STATE.IDLE,
    timeRemaining: DEFAULT_SETTINGS.pomodoroMinutes * 60,
    totalTime: DEFAULT_SETTINGS.pomodoroMinutes * 60,
  },
  completedPomodoros: 0,
  timerStartTime: null,
  timerEndTime: null,
  // Authentication state
  user: null,
  isAuthenticated: false,
  syncEnabled: false,
};

// Real-time subscription
let timerSubscription = null;

// Initialize periodic update interval
let periodicUpdateInterval = null;

// Initialize the extension
async function initialize() {
  console.log("FocusDot: Initializing background script");

  // Initialize authentication
  await initializeAuthentication();

  // Load saved settings or use defaults
  try {
    const savedState = await chrome.storage.local.get("focusdotState");
    if (savedState.focusdotState) {
      console.log("FocusDot: Loaded saved state", savedState.focusdotState);
      state = { ...state, ...savedState.focusdotState };

      // If timer was running when browser closed, calculate remaining time
      if (
        state.currentTimer.state === TIMER_STATE.RUNNING &&
        state.timerEndTime
      ) {
        const now = Date.now();
        if (now < state.timerEndTime) {
          state.currentTimer.timeRemaining = Math.ceil(
            (state.timerEndTime - now) / 1000
          );
          startTimer();
        } else {
          // Timer would have ended, move to next timer
          handleTimerComplete();
        }
      }
    } else {
      // First time setup - save default settings
      await saveState();
    }
  } catch (error) {
    console.error("Error loading saved state:", error);
    await saveState(); // Save default state
  }

  // If authenticated, sync with database
  if (state.isAuthenticated) {
    await syncWithDatabase();
  }

  // Broadcast initial state to all tabs
  broadcastTimerUpdate();
}

// Save current state to storage
async function saveState() {
  console.log("FocusDot: Saving state", state);
  try {
    await chrome.storage.local.set({ focusdotState: state });
  } catch (error) {
    console.error("Error saving state:", error);
  }
}

// Initialize authentication
async function initializeAuthentication() {
  try {
    const { user } = await initializeAuth();
    if (user) {
      state.user = user;
      state.isAuthenticated = true;
      state.syncEnabled = true;
      console.log("FocusDot: User authenticated:", user.email);

      // Set up real-time subscription
      setupRealtimeSubscription();
    } else {
      state.user = null;
      state.isAuthenticated = false;
      state.syncEnabled = false;
      console.log("FocusDot: No authenticated user");
    }
  } catch (error) {
    console.error("FocusDot: Error initializing auth:", error);
    state.user = null;
    state.isAuthenticated = false;
    state.syncEnabled = false;
  }
}

// Set up real-time subscription for timer state
function setupRealtimeSubscription() {
  if (!state.user || timerSubscription) return;

  console.log("FocusDot: Setting up real-time subscription");

  timerSubscription = timerDB.subscribeToTimerState(
    state.user.id,
    (payload) => {
      console.log("FocusDot: Real-time timer update received:", payload);

      if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
        const dbState = payload.new;

        // Update local state from database
        const wasRunning = state.currentTimer.state === TIMER_STATE.RUNNING;

        state.currentTimer.type = dbState.timer_type;
        state.currentTimer.state = dbState.state;
        state.currentTimer.timeRemaining = dbState.time_remaining;
        state.currentTimer.totalTime = dbState.total_time;
        state.completedPomodoros = dbState.completed_pomodoros;

        if (dbState.start_time) {
          state.timerStartTime = new Date(dbState.start_time).getTime();
        }
        if (dbState.end_time) {
          state.timerEndTime = new Date(dbState.end_time).getTime();
        }

        // Handle timer state changes
        if (state.currentTimer.state === TIMER_STATE.RUNNING && !wasRunning) {
          // Timer started from dashboard
          startLocalTimer();
        } else if (
          state.currentTimer.state !== TIMER_STATE.RUNNING &&
          wasRunning
        ) {
          // Timer paused/stopped from dashboard
          stopLocalTimer();
        }

        // Save updated state and broadcast
        saveState();
        broadcastTimerUpdate();
      }
    }
  );
}

// Sync local state with database
async function syncWithDatabase() {
  if (!state.user) return;

  try {
    // Get current timer state from database
    const { data: dbTimerState, error } = await timerDB.getTimerState(
      state.user.id
    );

    if (error && error.code !== "PGRST116") {
      console.error("FocusDot: Error syncing with database:", error);
      return;
    }

    if (dbTimerState) {
      // Database has state, use it as source of truth
      console.log("FocusDot: Syncing with database state:", dbTimerState);

      state.currentTimer.type = dbTimerState.timer_type;
      state.currentTimer.state = dbTimerState.state;
      state.currentTimer.timeRemaining = dbTimerState.time_remaining;
      state.currentTimer.totalTime = dbTimerState.total_time;
      state.completedPomodoros = dbTimerState.completed_pomodoros;

      if (dbTimerState.start_time) {
        state.timerStartTime = new Date(dbTimerState.start_time).getTime();
      }
      if (dbTimerState.end_time) {
        state.timerEndTime = new Date(dbTimerState.end_time).getTime();
      }

      // If timer is running, start local timer
      if (state.currentTimer.state === TIMER_STATE.RUNNING) {
        startLocalTimer();
      }
    } else {
      // No database state, push local state to database
      await pushStateToDatabase();
    }

    // Load user settings
    const { data: userSettings } = await settingsDB.getUserSettings(
      state.user.id
    );
    if (userSettings) {
      state.settings = {
        pomodoroMinutes: userSettings.pomodoro_minutes,
        shortBreakMinutes: userSettings.short_break_minutes,
        longBreakMinutes: userSettings.long_break_minutes,
        pomodorosBeforeLongBreak: userSettings.pomodoros_before_long_break,
        autoStartBreaks: userSettings.auto_start_breaks,
        autoStartPomodoros: userSettings.auto_start_pomodoros,
        notifications: userSettings.notifications,
        timerVisibility: userSettings.timer_visibility,
        dotSize: userSettings.dot_size,
      };
    }

    await saveState();
  } catch (error) {
    console.error("FocusDot: Error syncing with database:", error);
  }
}

// Push current state to database
async function pushStateToDatabase() {
  if (!state.user) return;

  try {
    const dbState = {
      timer_type: state.currentTimer.type,
      state: state.currentTimer.state,
      time_remaining: state.currentTimer.timeRemaining,
      total_time: state.currentTimer.totalTime,
      start_time: state.timerStartTime
        ? new Date(state.timerStartTime).toISOString()
        : null,
      end_time: state.timerEndTime
        ? new Date(state.timerEndTime).toISOString()
        : null,
      completed_pomodoros: state.completedPomodoros,
      session_id: null,
    };

    const { error } = await timerDB.upsertTimerState(state.user.id, dbState);
    if (error) {
      console.error("FocusDot: Error pushing state to database:", error);
    } else {
      console.log("FocusDot: State pushed to database successfully");
    }
  } catch (error) {
    console.error("FocusDot: Error pushing state to database:", error);
  }
}

// Start the timer
async function startTimer() {
  if (state.currentTimer.state !== TIMER_STATE.RUNNING) {
    console.log("FocusDot: Starting timer");
    state.currentTimer.state = TIMER_STATE.RUNNING;

    // Calculate end time
    const now = Date.now();
    state.timerStartTime = now;
    state.timerEndTime = now + state.currentTimer.timeRemaining * 1000;

    // Start local timer
    startLocalTimer();

    // Sync with database if authenticated
    if (state.isAuthenticated) {
      await pushStateToDatabase();
    }

    saveState();
    broadcastTimerUpdate();
  }
}

// Start local timer (alarms and intervals)
function startLocalTimer() {
  // Create an alarm
  chrome.alarms.create("focusdotTimer", {
    delayInMinutes: state.currentTimer.timeRemaining / 60,
  });

  startPeriodicUpdates(); // Start frequent updates
}

// Pause the timer
async function pauseTimer() {
  if (state.currentTimer.state === TIMER_STATE.RUNNING) {
    console.log("FocusDot: Pausing timer");
    state.currentTimer.state = TIMER_STATE.PAUSED;

    // Calculate remaining time
    const now = Date.now();
    state.currentTimer.timeRemaining = Math.ceil(
      (state.timerEndTime - now) / 1000
    );

    // Stop local timer
    stopLocalTimer();

    // Sync with database if authenticated
    if (state.isAuthenticated) {
      await pushStateToDatabase();
    }

    saveState();
    broadcastTimerUpdate();
  }
}

// Stop local timer (clear alarms and intervals)
function stopLocalTimer() {
  // Clear the alarm and periodic updates
  chrome.alarms.clear("focusdotTimer");
  if (periodicUpdateInterval) {
    clearInterval(periodicUpdateInterval);
    periodicUpdateInterval = null;
  }
}

// Reset the timer
async function resetTimer() {
  console.log("FocusDot: Resetting timer");

  // Stop local timer
  stopLocalTimer();

  // Reset to the beginning of the current timer type
  state.currentTimer.state = TIMER_STATE.IDLE;
  state.currentTimer.timeRemaining = getTimerDuration(state.currentTimer.type);
  state.currentTimer.totalTime = state.currentTimer.timeRemaining;
  state.timerStartTime = null;
  state.timerEndTime = null;

  // Sync with database if authenticated
  if (state.isAuthenticated) {
    await pushStateToDatabase();
  }

  saveState();
  broadcastTimerUpdate();
}

// Skip to the next timer
function skipTimer() {
  console.log("FocusDot: Skipping timer");
  handleTimerComplete();
}

// Handle timer completion
async function handleTimerComplete() {
  console.log("FocusDot: Timer completed");

  // Stop local timer
  stopLocalTimer();

  // Save session to database if it was a pomodoro and user is authenticated
  if (
    state.currentTimer.type === TIMER_TYPE.POMODORO &&
    state.isAuthenticated &&
    state.timerStartTime
  ) {
    try {
      const sessionData = {
        type: "pomodoro",
        start_time: new Date(state.timerStartTime).toISOString(),
        end_time: new Date().toISOString(),
        duration: Math.round(state.currentTimer.totalTime / 60), // Convert to minutes
        completed: true,
        interrupted: false,
      };

      const { error } = await timerDB.createSession(state.user.id, sessionData);
      if (error) {
        console.error("FocusDot: Error saving session:", error);
      } else {
        console.log("FocusDot: Session saved successfully");
      }
    } catch (error) {
      console.error("FocusDot: Error saving session:", error);
    }
  }

  // Simple toggle between Pomodoro and Break
  if (state.currentTimer.type === TIMER_TYPE.POMODORO) {
    // Switch to break
    state.completedPomodoros++;

    // Determine if this should be a long break
    const isLongBreak =
      state.completedPomodoros % state.settings.pomodorosBeforeLongBreak === 0;
    state.currentTimer.type = isLongBreak
      ? TIMER_TYPE.LONG_BREAK
      : TIMER_TYPE.SHORT_BREAK;

    // Show notification
    if (state.settings.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "../icons/icon128.png",
        title: "Focus Session Complete!",
        message: `Time for a ${isLongBreak ? "long" : "short"} break.`,
        silent: false,
      });
    }
  } else {
    // Switch to pomodoro
    state.currentTimer.type = TIMER_TYPE.POMODORO;

    if (state.settings.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "../icons/icon128.png",
        title: "Break Complete!",
        message: "Time to focus again!",
        silent: false,
      });
    }
  }

  // Set up the next timer
  state.currentTimer.timeRemaining = getTimerDuration(state.currentTimer.type);
  state.currentTimer.totalTime = state.currentTimer.timeRemaining;
  state.currentTimer.state = TIMER_STATE.IDLE;
  state.timerStartTime = null;
  state.timerEndTime = null;

  // Sync with database if authenticated
  if (state.isAuthenticated) {
    await pushStateToDatabase();
  }

  // Auto-start next timer based on settings
  if (
    (state.currentTimer.type === TIMER_TYPE.POMODORO &&
      state.settings.autoStartPomodoros) ||
    ((state.currentTimer.type === TIMER_TYPE.SHORT_BREAK ||
      state.currentTimer.type === TIMER_TYPE.LONG_BREAK) &&
      state.settings.autoStartBreaks)
  ) {
    await startTimer();
  }

  saveState();
  broadcastTimerUpdate();
}

// Get timer duration based on type
function getTimerDuration(timerType) {
  if (timerType === TIMER_TYPE.POMODORO) {
    return state.settings.pomodoroMinutes * 60;
  } else if (timerType === TIMER_TYPE.LONG_BREAK) {
    return state.settings.longBreakMinutes * 60;
  } else {
    return state.settings.shortBreakMinutes * 60;
  }
}

// Update settings
async function updateSettings(newSettings) {
  console.log("FocusDot: Updating settings", newSettings);
  state.settings = { ...state.settings, ...newSettings };

  // If timer is idle, update the current timer duration based on new settings
  if (state.currentTimer.state === TIMER_STATE.IDLE) {
    state.currentTimer.timeRemaining = getTimerDuration(
      state.currentTimer.type
    );
    state.currentTimer.totalTime = state.currentTimer.timeRemaining;
  }

  await saveState();
  broadcastTimerUpdate();

  return { success: true };
}

// Broadcast timer update to all tabs with improved reliability
function broadcastTimerUpdate() {
  const updateData = {
    currentTimer: state.currentTimer,
    completedPomodoros: state.completedPomodoros,
    settings: state.settings,
    timerStartTime: state.timerStartTime,
    timerEndTime: state.timerEndTime,
    timestamp: Date.now(), // Add timestamp for synchronization
  };

  console.log("FocusDot: Broadcasting timer update", updateData);

  // Broadcast to all tabs
  chrome.tabs.query({}, (tabs) => {
    if (tabs && Array.isArray(tabs)) {
      tabs.forEach((tab) => {
        try {
          chrome.tabs
            .sendMessage(tab.id, {
              action: "timerUpdate",
              data: updateData,
            })
            .catch(() => {
              // Ignore errors from tabs that don't have the content script loaded
            });
        } catch (error) {
          // Ignore errors for tabs where we can't send messages
        }
      });
    }
  });

  // Also broadcast to popup if it's open
  try {
    chrome.runtime
      .sendMessage({
        action: "timerUpdate",
        data: updateData,
      })
      .catch(() => {
        // Popup might not be open, which is expected
      });
  } catch (error) {
    // Ignore errors when popup is not open
  }
}

// When timer is running, send regular updates
function startPeriodicUpdates() {
  if (periodicUpdateInterval) {
    clearInterval(periodicUpdateInterval);
  }

  // Send updates every 250ms when timer is running
  if (state.currentTimer.state === TIMER_STATE.RUNNING) {
    periodicUpdateInterval = setInterval(() => {
      // Update time remaining
      if (state.timerEndTime) {
        const now = Date.now();
        if (now < state.timerEndTime) {
          state.currentTimer.timeRemaining = Math.ceil(
            (state.timerEndTime - now) / 1000
          );
          broadcastTimerUpdate();
        } else {
          // Timer ended
          clearInterval(periodicUpdateInterval);
          handleTimerComplete();
        }
      }
    }, 250); // More frequent updates for smoother display
  }
}

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focusdotTimer") {
    console.log("FocusDot: Alarm fired");
    handleTimerComplete();
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("FocusDot: Received message", message, "from", sender);

  switch (message.action) {
    case "getState":
      // Calculate current time remaining if timer is running
      if (
        state.currentTimer.state === TIMER_STATE.RUNNING &&
        state.timerEndTime
      ) {
        const now = Date.now();
        if (now < state.timerEndTime) {
          state.currentTimer.timeRemaining = Math.ceil(
            (state.timerEndTime - now) / 1000
          );
        } else {
          // Timer would have ended, handle completion
          handleTimerComplete();
          return true; // We'll respond after completion
        }
      }

      const response = {
        currentTimer: state.currentTimer,
        completedPomodoros: state.completedPomodoros,
        settings: state.settings,
        timerStartTime: state.timerStartTime,
        timerEndTime: state.timerEndTime,
      };

      console.log("FocusDot: Sending state", response);
      sendResponse(response);
      break;

    case "startTimer":
      startTimer();
      sendResponse({ success: true });
      break;

    case "pauseTimer":
      pauseTimer();
      sendResponse({ success: true });
      break;

    case "resetTimer":
      resetTimer();
      sendResponse({ success: true });
      break;

    case "skipTimer":
      skipTimer();
      sendResponse({ success: true });
      break;

    case "updateSettings":
      updateSettings(message.data)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error("Error updating settings:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicate we'll send response asynchronously

    case "userAuthenticated":
      console.log("FocusDot: User authenticated via popup");
      state.user = message.user;
      state.isAuthenticated = true;
      state.syncEnabled = true;

      // Set up real-time subscription and sync
      setupRealtimeSubscription();
      syncWithDatabase().then(() => {
        sendResponse({ success: true });
      });
      return true;

    case "userSignedOut":
      console.log("FocusDot: User signed out via popup");
      state.user = null;
      state.isAuthenticated = false;
      state.syncEnabled = false;

      // Clean up subscription
      if (timerSubscription) {
        timerSubscription.unsubscribe();
        timerSubscription = null;
      }

      sendResponse({ success: true });
      break;

    case "getAuthStatus":
      sendResponse({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        syncEnabled: state.syncEnabled,
      });
      break;

    case "dashboardAuthDetected":
      console.log("FocusDot: Dashboard authentication detected", {
        hasUser: !!message.user,
        hasSession: !!message.session,
        userEmail: message.user?.email,
      });

      if (message.user || message.session) {
        state.user = message.user;
        state.isAuthenticated = true;
        state.syncEnabled = true;

        // Store session data if available
        if (message.session) {
          console.log("FocusDot: Storing session data");
          auth.setSession(message.session).catch((error) => {
            console.error("FocusDot: Error storing session:", error);
          });
        }

        // Set up real-time subscription and sync
        setupRealtimeSubscription();
        syncWithDatabase()
          .then(() => {
            console.log("FocusDot: Sync completed after dashboard auth");
          })
          .catch((error) => {
            console.error(
              "FocusDot: Error syncing after dashboard auth:",
              error
            );
          });

        saveState();
        broadcastTimerUpdate();

        console.log("FocusDot: Extension authentication state updated", {
          isAuthenticated: state.isAuthenticated,
          userEmail: state.user?.email,
          syncEnabled: state.syncEnabled,
        });
      } else {
        console.warn(
          "FocusDot: Dashboard auth detected but no user/session data"
        );
      }
      sendResponse({ success: true });
      break;

    case "dashboardSignOutDetected":
      console.log("FocusDot: Dashboard sign out detected");
      state.user = null;
      state.isAuthenticated = false;
      state.syncEnabled = false;

      // Clean up subscription
      if (timerSubscription) {
        timerSubscription.unsubscribe();
        timerSubscription = null;
      }

      saveState();
      broadcastTimerUpdate();
      sendResponse({ success: true });
      break;

    default:
      console.log("FocusDot: Unknown action", message.action);
      sendResponse({ success: false, error: "Unknown action" });
  }

  return true; // Keep the message channel open for async responses
});

// Initialize when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("FocusDot: Extension installed or updated");
  initialize();
});

// Initialize when the background script starts
initialize();
