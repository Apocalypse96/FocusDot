/**
 * FocusDot - Popup Script
 *
 * This script handles the functionality of the extension popup UI.
 */

// Timer states and types for reference
const TIMER_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
};

const TIMER_TYPE = {
  POMODORO: "pomodoro",
  SHORT_BREAK: "shortBreak",
  LONG_BREAK: "longBreak",
  BREAK: "break",
};

// Global state
let timerState = {
  currentTimer: {
    type: TIMER_TYPE.POMODORO,
    state: TIMER_STATE.IDLE,
    timeRemaining: 25 * 60,
    totalTime: 25 * 60,
  },
  completedPomodoros: 0,
  settings: {
    pomodoroMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    pomodorosBeforeLongBreak: 4,
    autoStartBreaks: true,
    autoStartPomodoros: true,
    notifications: true,
    timerVisibility: true,
    dotSize: 45,
  },
  timerStartTime: null,
  timerEndTime: null,
};

// DOM elements
const elements = {
  timerTime: document.getElementById("timer-time"),
  timerType: document.getElementById("timer-type"),
  pomodoroCount: document.getElementById("pomodoro-count"),
  startPauseButton: document.getElementById("timer-start-pause"),
  resetButton: document.getElementById("timer-reset"),
  skipButton: document.getElementById("timer-skip"),
  saveSettingsButton: document.getElementById("save-settings"),
  progressCircle: document.querySelector(".timer-progress-circle"),
  playIcon: document.querySelector(".timer-play-icon"),
  pauseIcon: document.querySelector(".timer-pause-icon"),

  // Sync elements
  syncStatus: document.getElementById("sync-status"),
  authButton: document.getElementById("auth-button"),
  manualSyncButton: document.getElementById("manual-sync"),

  // Settings inputs
  pomodoroDuration: document.getElementById("pomodoro-duration"),
  shortBreakDuration: document.getElementById("short-break-duration"),
  longBreakDuration: document.getElementById("long-break-duration"),
  pomodorosBeforeLongBreak: document.getElementById(
    "pomodoros-before-long-break"
  ),
  autoStartBreaks: document.getElementById("auto-start-breaks"),
  autoStartPomodoros: document.getElementById("auto-start-pomodoros"),
  notifications: document.getElementById("notifications"),
  timerVisibility: document.getElementById("timer-visibility"),
  dotSize: document.getElementById("dot-size"),
  dotSizeValue: document.querySelector(".slider-value"),
};

// Initialize the popup
function initialize() {
  console.log("FocusDot Popup: Initializing");

  // Get current timer state from background script
  chrome.runtime.sendMessage({ action: "getState" }, (response) => {
    if (response) {
      console.log("FocusDot Popup: Received state", response);
      updateTimerState(response);
      startAnimationLoop(); // Start smooth animation loop
    }
  });

  // Get authentication status
  chrome.runtime.sendMessage({ action: "getAuthStatus" }, (response) => {
    if (response) {
      updateAuthStatus(response);
    }
  });

  // Set up event listeners
  elements.startPauseButton.addEventListener("click", toggleTimer);
  elements.resetButton.addEventListener("click", resetTimer);
  elements.skipButton.addEventListener("click", skipTimer);
  elements.saveSettingsButton.addEventListener("click", saveSettings);

  // Auth button event listener
  if (elements.authButton) {
    elements.authButton.addEventListener("click", handleAuthButtonClick);
  }

  // Manual sync button event listener
  if (elements.manualSyncButton) {
    elements.manualSyncButton.addEventListener("click", handleManualSync);
  }

  // Add event listener for dot size slider
  if (elements.dotSize) {
    elements.dotSize.addEventListener("input", function () {
      elements.dotSizeValue.textContent = `${this.value}px`;
    });
  }

  // Listen for timer updates from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("FocusDot Popup: Received message", message);

    if (message.action === "timerUpdate") {
      updateTimerState(message.data);
      sendResponse({ success: true });
    }
    return true; // Keep the message channel open for async responses
  });
}

// Animation loop for smooth real-time updates
function startAnimationLoop() {
  // Use requestAnimationFrame for smoother updates
  function updateLoop() {
    if (timerState.currentTimer.state === TIMER_STATE.RUNNING) {
      updateRealTimeDisplay();
    }
    requestAnimationFrame(updateLoop);
  }

  // Start the loop
  requestAnimationFrame(updateLoop);
}

// Update real-time display without waiting for messages
function updateRealTimeDisplay() {
  if (!timerState.timerEndTime) return;

  const now = Date.now();
  if (now < timerState.timerEndTime) {
    const timeRemaining = Math.ceil((timerState.timerEndTime - now) / 1000);

    // Format minutes and seconds
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

    // Update timer display
    elements.timerTime.textContent = timeString;

    // Update progress circle
    if (elements.progressCircle) {
      const circumference = 2 * Math.PI * 45; // 45 is the radius of the circle
      const progress = timeRemaining / timerState.currentTimer.totalTime;
      const dashOffset = circumference * (1 - progress);
      elements.progressCircle.style.strokeDasharray = circumference;
      elements.progressCircle.style.strokeDashoffset = dashOffset;
    }
  }
}

// Update timer state from background script
function updateTimerState(data) {
  console.log("FocusDot Popup: Updating timer state with", data);

  timerState.currentTimer = data.currentTimer;
  timerState.completedPomodoros = data.completedPomodoros;
  timerState.settings = data.settings;
  timerState.timerStartTime = data.timerStartTime;
  timerState.timerEndTime = data.timerEndTime;

  // Update settings inputs
  elements.pomodoroDuration.value = timerState.settings.pomodoroMinutes;
  elements.shortBreakDuration.value = timerState.settings.shortBreakMinutes;
  elements.longBreakDuration.value = timerState.settings.longBreakMinutes;
  elements.pomodorosBeforeLongBreak.value =
    timerState.settings.pomodorosBeforeLongBreak;
  elements.autoStartBreaks.checked = timerState.settings.autoStartBreaks;
  elements.autoStartPomodoros.checked = timerState.settings.autoStartPomodoros;
  elements.notifications.checked = timerState.settings.notifications;
  elements.timerVisibility.checked =
    timerState.settings.timerVisibility !== false; // Default to true if not set

  if (elements.dotSize && timerState.settings.dotSize) {
    elements.dotSize.value = timerState.settings.dotSize;
    elements.dotSizeValue.textContent = `${timerState.settings.dotSize}px`;
  }

  updateTimerUI();
}

// Update the timer UI based on current state
function updateTimerUI() {
  // If timer is running, calculate the current time remaining
  let timeRemaining = timerState.currentTimer.timeRemaining;
  if (
    timerState.currentTimer.state === TIMER_STATE.RUNNING &&
    timerState.timerEndTime
  ) {
    const now = Date.now();
    if (now < timerState.timerEndTime) {
      timeRemaining = Math.ceil((timerState.timerEndTime - now) / 1000);
    }
  }

  // Update timer display
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  elements.timerTime.textContent = `${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  // Update timer type display
  let typeText = "Pomodoro";
  if (
    timerState.currentTimer.type === TIMER_TYPE.SHORT_BREAK ||
    timerState.currentTimer.type === TIMER_TYPE.BREAK
  ) {
    typeText = "Short Break";
  } else if (timerState.currentTimer.type === TIMER_TYPE.LONG_BREAK) {
    typeText = "Long Break";
  }
  elements.timerType.textContent = typeText;

  // Update pomodoro count
  elements.pomodoroCount.textContent = timerState.completedPomodoros;

  // Update play/pause button
  if (timerState.currentTimer.state === TIMER_STATE.RUNNING) {
    elements.playIcon.style.display = "none";
    elements.pauseIcon.style.display = "block";
  } else {
    elements.playIcon.style.display = "block";
    elements.pauseIcon.style.display = "none";
  }

  // Update progress circle
  const circumference = 2 * Math.PI * 45; // 45 is the radius of the circle
  const progress = timeRemaining / timerState.currentTimer.totalTime;
  const dashOffset = circumference * (1 - progress);
  elements.progressCircle.style.strokeDasharray = circumference;
  elements.progressCircle.style.strokeDashoffset = dashOffset;

  // Update colors based on timer type - FIX COLOR COORDINATION
  elements.progressCircle.classList.remove(
    "pomodoro",
    "short-break",
    "long-break"
  );

  // Set the appropriate class based on timer type
  if (timerState.currentTimer.type === TIMER_TYPE.POMODORO) {
    elements.progressCircle.classList.add("pomodoro");
    elements.startPauseButton.style.backgroundColor = "#e53935"; // Red
    document.documentElement.style.setProperty("--timer-color", "#e53935");
  } else if (
    timerState.currentTimer.type === TIMER_TYPE.SHORT_BREAK ||
    timerState.currentTimer.type === TIMER_TYPE.BREAK
  ) {
    elements.progressCircle.classList.add("short-break");
    elements.startPauseButton.style.backgroundColor = "#43a047"; // Green
    document.documentElement.style.setProperty("--timer-color", "#43a047");
  } else if (timerState.currentTimer.type === TIMER_TYPE.LONG_BREAK) {
    elements.progressCircle.classList.add("long-break");
    elements.startPauseButton.style.backgroundColor = "#1e88e5"; // Blue
    document.documentElement.style.setProperty("--timer-color", "#1e88e5");
  }
}

// Toggle timer between start and pause
function toggleTimer() {
  console.log("FocusDot Popup: Toggle timer", timerState.currentTimer.state);

  // Apply immediate UI feedback before waiting for response
  if (timerState.currentTimer.state === TIMER_STATE.RUNNING) {
    // Temporarily update UI to paused state for immediate feedback
    elements.playIcon.style.display = "block";
    elements.pauseIcon.style.display = "none";

    chrome.runtime.sendMessage({ action: "pauseTimer" }, (response) => {
      console.log("FocusDot Popup: Pause response", response);
      // Final update will come through timerUpdate message
    });
  } else {
    // Temporarily update UI to running state for immediate feedback
    elements.playIcon.style.display = "none";
    elements.pauseIcon.style.display = "block";

    chrome.runtime.sendMessage({ action: "startTimer" }, (response) => {
      console.log("FocusDot Popup: Start response", response);
      // Final update will come through timerUpdate message
    });
  }
}

// Reset the timer
function resetTimer() {
  console.log("FocusDot Popup: Reset timer");

  chrome.runtime.sendMessage({ action: "resetTimer" }, (response) => {
    console.log("FocusDot Popup: Reset response", response);
    // Update will come through timerUpdate message
  });
}

// Skip to the next timer
function skipTimer() {
  console.log("FocusDot Popup: Skip timer");

  chrome.runtime.sendMessage({ action: "skipTimer" }, (response) => {
    console.log("FocusDot Popup: Skip response", response);
    // Update will come through timerUpdate message
  });
}

// Save settings
function saveSettings() {
  const newSettings = {
    pomodoroMinutes: parseInt(elements.pomodoroDuration.value, 10),
    shortBreakMinutes: parseInt(elements.shortBreakDuration.value, 10),
    longBreakMinutes: parseInt(elements.longBreakDuration.value, 10),
    pomodorosBeforeLongBreak: parseInt(
      elements.pomodorosBeforeLongBreak.value,
      10
    ),
    autoStartBreaks: elements.autoStartBreaks.checked,
    autoStartPomodoros: elements.autoStartPomodoros.checked,
    notifications: elements.notifications.checked,
    timerVisibility: elements.timerVisibility.checked,
    dotSize: parseInt(elements.dotSize.value, 10) || 45,
  };

  console.log("FocusDot Popup: Saving settings", newSettings);

  chrome.runtime.sendMessage(
    {
      action: "updateSettings",
      data: newSettings,
    },
    (response) => {
      console.log("FocusDot Popup: Settings save response", response);

      if (response && response.success) {
        // Show a brief "Saved" message
        elements.saveSettingsButton.textContent = "Saved!";
        setTimeout(() => {
          elements.saveSettingsButton.textContent = "Save Settings";
        }, 1500);
      } else {
        // Show error
        elements.saveSettingsButton.textContent = "Error!";
        setTimeout(() => {
          elements.saveSettingsButton.textContent = "Save Settings";
        }, 1500);
      }
    }
  );
}

// Update authentication status
function updateAuthStatus(authData) {
  console.log("FocusDot Popup: Updating auth status", authData);

  if (!elements.syncStatus || !elements.authButton) return;

  const syncIndicator = elements.syncStatus.querySelector(".sync-indicator");
  const syncText = elements.syncStatus.querySelector(".sync-text");

  if (authData.isAuthenticated) {
    // User is authenticated
    syncIndicator.classList.remove("offline");
    syncIndicator.classList.add("online");
    syncText.textContent = `Connected as ${authData.user?.email || "User"}`;

    elements.authButton.textContent = "Sign Out";
    elements.authButton.classList.add("sign-out");
  } else {
    // User is not authenticated
    syncIndicator.classList.remove("online");
    syncIndicator.classList.add("offline");
    syncText.textContent = "Not connected";

    elements.authButton.textContent = "Sign In";
    elements.authButton.classList.remove("sign-out");
  }
}

// Handle auth button click
function handleAuthButtonClick() {
  console.log("FocusDot Popup: Auth button clicked");

  // Check current auth status first
  chrome.runtime.sendMessage({ action: "getAuthStatus" }, (response) => {
    if (response && response.isAuthenticated) {
      // User is authenticated, sign them out
      chrome.runtime.sendMessage(
        { action: "userSignedOut" },
        (signOutResponse) => {
          if (signOutResponse && signOutResponse.success) {
            updateAuthStatus({ isAuthenticated: false, user: null });
          }
        }
      );
    } else {
      // User is not authenticated, redirect to dashboard auth page
      chrome.tabs.create({
        url: "http://localhost:3000/auth", // Your dashboard auth URL
        active: true,
      });

      // Also try to trigger auth check on dashboard tabs
      chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
        if (tabs && tabs.length > 0) {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { action: "checkAuthState" });
          });
        }
      });

      // Close the popup
      window.close();
    }
  });
}

// Add a manual sync button for debugging
function handleManualSync() {
  console.log("FocusDot Popup: Manual sync triggered");

  // Try to check auth state on dashboard tabs
  chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(
          tab.id,
          { action: "checkAuthState" },
          (response) => {
            console.log("FocusDot: Manual auth check response:", response);
          }
        );
      });
    } else {
      console.log("FocusDot: No dashboard tabs found");
    }
  });

  // Also refresh auth status
  chrome.runtime.sendMessage({ action: "getAuthStatus" }, (response) => {
    console.log("FocusDot: Current auth status:", response);
    if (response) {
      updateAuthStatus(response);
    }
  });
}

// Initialize when the popup loads
document.addEventListener("DOMContentLoaded", initialize);
