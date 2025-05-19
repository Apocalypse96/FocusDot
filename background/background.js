/**
 * FocusDot - Background Script
 *
 * This script handles the core timer logic and state management.
 */

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
};

// Initialize periodic update interval
let periodicUpdateInterval = null;

// Initialize the extension
async function initialize() {
  console.log("FocusDot: Initializing background script");

  // Load saved settings or use defaults
  try {
    const savedState = await chrome.storage.local.get("focusdotState");
    if (savedState.focusdotState) {
      console.log("FocusDot: Loaded saved state", savedState.focusdotState);
      state = { ...savedState.focusdotState };

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

// Start the timer
function startTimer() {
  if (state.currentTimer.state !== TIMER_STATE.RUNNING) {
    console.log("FocusDot: Starting timer");
    state.currentTimer.state = TIMER_STATE.RUNNING;

    // Calculate end time
    const now = Date.now();
    state.timerStartTime = now;
    state.timerEndTime = now + state.currentTimer.timeRemaining * 1000;

    // Create an alarm
    chrome.alarms.create("focusdotTimer", {
      delayInMinutes: state.currentTimer.timeRemaining / 60,
    });

    saveState();
    broadcastTimerUpdate();
    startPeriodicUpdates(); // Start frequent updates
  }
}

// Pause the timer
function pauseTimer() {
  if (state.currentTimer.state === TIMER_STATE.RUNNING) {
    console.log("FocusDot: Pausing timer");
    state.currentTimer.state = TIMER_STATE.PAUSED;

    // Calculate remaining time
    const now = Date.now();
    state.currentTimer.timeRemaining = Math.ceil(
      (state.timerEndTime - now) / 1000
    );

    // Clear the alarm and periodic updates
    chrome.alarms.clear("focusdotTimer");
    if (periodicUpdateInterval) {
      clearInterval(periodicUpdateInterval);
      periodicUpdateInterval = null;
    }

    saveState();
    broadcastTimerUpdate();
  }
}

// Reset the timer
function resetTimer() {
  console.log("FocusDot: Resetting timer");

  // Clear any existing alarm
  chrome.alarms.clear("focusdotTimer");

  // Reset to the beginning of the current timer type
  state.currentTimer.state = TIMER_STATE.IDLE;
  state.currentTimer.timeRemaining = getTimerDuration(state.currentTimer.type);
  state.currentTimer.totalTime = state.currentTimer.timeRemaining;
  state.timerStartTime = null;
  state.timerEndTime = null;

  saveState();
  broadcastTimerUpdate();
}

// Skip to the next timer
function skipTimer() {
  console.log("FocusDot: Skipping timer");
  handleTimerComplete();
}

// Handle timer completion
function handleTimerComplete() {
  console.log("FocusDot: Timer completed");

  // Clear the alarm
  chrome.alarms.clear("focusdotTimer");

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

  // Auto-start next timer based on settings
  if (
    (state.currentTimer.type === TIMER_TYPE.POMODORO &&
      state.settings.autoStartPomodoros) ||
    ((state.currentTimer.type === TIMER_TYPE.SHORT_BREAK ||
      state.currentTimer.type === TIMER_TYPE.LONG_BREAK) &&
      state.settings.autoStartBreaks)
  ) {
    startTimer();
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
