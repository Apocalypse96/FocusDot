/**
 * FocusDot - Content Script
 *
 * This script injects a minimal floating circle timer UI on all web pages.
 */

// Global variables
let timerElement = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let timerState = {
  currentTimer: {
    type: "pomodoro",
    state: "idle",
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
    dotSize: 45, // Default dot size
  },
  timerStartTime: null,
  timerEndTime: null,
};

// Timer states and types
const TIMER_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
};

const TIMER_TYPE = {
  POMODORO: "pomodoro",
  BREAK: "break",
  SHORT_BREAK: "shortBreak",
  LONG_BREAK: "longBreak",
};

// Initialize the content script
function initialize() {
  console.log("FocusDot: Initializing content script");

  // Create and inject the timer UI immediately
  createTimerElement();

  // Request current timer state from background script
  chrome.runtime.sendMessage({ action: "getState" }, (response) => {
    if (response) {
      console.log("FocusDot: Received initial state", response);
      updateTimerState(response);
      startAnimationLoop(); // Start animation loop for smooth updates
    }
  });

  // Listen for timer updates from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("FocusDot: Received message", message);

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
  if (!timerElement || !timerState.timerEndTime) return;

  const now = Date.now();
  if (now < timerState.timerEndTime) {
    const timeRemaining = Math.ceil((timerState.timerEndTime - now) / 1000);

    // Update tooltip with real-time countdown
    const tooltip = timerElement.querySelector(".focusdot-tooltip");
    if (tooltip) {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
      const timerType =
        timerState.currentTimer.type === TIMER_TYPE.POMODORO
          ? "Focus Time"
          : "Break Time";
      tooltip.textContent = `${timerType}: ${timeString}`;
    }
  }
}

// Create and inject the timer UI element
function createTimerElement() {
  console.log("FocusDot: Creating timer element");

  // Check if timer element already exists
  if (document.getElementById("focusdot-timer-container")) {
    console.log("FocusDot: Timer element already exists");
    return;
  }

  // Get saved size or use default
  const dotSize = timerState.settings.dotSize || 45;

  // Create container element
  timerElement = document.createElement("div");
  timerElement.id = "focusdot-timer-container";
  timerElement.className = "focusdot-timer-container";
  timerElement.style.position = "fixed";
  timerElement.style.zIndex = "2147483647"; // Highest z-index
  timerElement.style.bottom = "20px";
  timerElement.style.right = "20px";
  timerElement.style.width = `${dotSize}px`;
  timerElement.style.height = `${dotSize}px`;

  // Create timer circle with emoji
  timerElement.innerHTML = `
    <div class="focusdot-timer-circle">
      <div class="focusdot-timer-icon">🍅</div>
    </div>
    <div class="focusdot-tooltip">Focus Time: 25:00</div>
  `;

  // Add the timer element to the page
  document.body.appendChild(timerElement);
  console.log("FocusDot: Timer element added to page");

  // Apply initial styles
  const timerCircle = timerElement.querySelector(".focusdot-timer-circle");
  timerCircle.style.width = "100%";
  timerCircle.style.height = "100%";
  timerCircle.style.background = "#ffffff";
  timerCircle.style.borderRadius = "50%";
  timerCircle.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
  timerCircle.style.display = "flex";
  timerCircle.style.alignItems = "center";
  timerCircle.style.justifyContent = "center";
  timerCircle.style.cursor = "move";
  timerCircle.style.transition = "all 0.2s ease";
  timerCircle.style.border = "1px solid #ddd";

  // Remove direct styling of tooltip - let CSS handle it
  // Instead, we'll just add the triangle element which isn't easily done in CSS
  const tooltip = timerElement.querySelector(".focusdot-tooltip");
  tooltip.innerHTML += `
    <span class="focusdot-tooltip-arrow"></span>
  `;

  // Show tooltip on hover using classes instead of inline styles
  timerCircle.addEventListener("mouseenter", () => {
    // No need to manipulate styles directly, CSS handles this
  });

  timerCircle.addEventListener("mouseleave", () => {
    // No need to manipulate styles directly, CSS handles this
  });

  // Add event listeners for dragging and clicking
  timerCircle.addEventListener("mousedown", startDrag);

  // Load saved position
  const savedPosition = localStorage.getItem("focusdotPosition");
  if (savedPosition) {
    try {
      const position = JSON.parse(savedPosition);
      timerElement.style.left = position.left;
      timerElement.style.top = position.top;
      timerElement.style.right = "";
      timerElement.style.bottom = "";
    } catch (error) {
      console.error("Error loading saved position:", error);
    }
  }
}

// Apply size adjustments to dot
function applyDotSize(size) {
  if (!timerElement) return;

  // Update container size
  timerElement.style.width = `${size}px`;
  timerElement.style.height = `${size}px`;

  // Scale icon size proportionally
  const icon = timerElement.querySelector(".focusdot-timer-icon");
  if (icon) {
    // Base size is 18px for 45px container
    const iconSize = Math.max(12, Math.round(size * 0.4));
    icon.style.fontSize = `${iconSize}px`;
  }

  // Adjust tooltip position
  const tooltip = timerElement.querySelector(".focusdot-tooltip");
  if (tooltip) {
    tooltip.style.bottom = `${size + 10}px`;
  }

  // Adjust border width based on size
  const timerCircle = timerElement.querySelector(".focusdot-timer-circle");
  if (timerCircle) {
    const borderWidth = Math.max(1, Math.round(size * 0.04));
    timerCircle.style.borderWidth = `${borderWidth}px`;

    if (timerState.currentTimer.state === TIMER_STATE.RUNNING) {
      timerCircle.style.borderWidth = `${borderWidth * 1.5}px`;
    }
  }
}

// Handle click on the timer
function handleClick(e) {
  if (!isDragging) {
    console.log("FocusDot: Clicked timer");

    // Toggle timer state
    if (timerState.currentTimer.state === TIMER_STATE.RUNNING) {
      chrome.runtime.sendMessage({ action: "pauseTimer" });
    } else {
      chrome.runtime.sendMessage({ action: "startTimer" });
    }
  }
}

// Start dragging the timer
function startDrag(e) {
  isDragging = false; // Will be set to true if we actually drag

  // Calculate the offset
  const rect = timerElement.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;

  // Add event listeners for dragging
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", stopDrag);

  // Prevent text selection during drag
  e.preventDefault();
}

// Handle dragging
function drag(e) {
  isDragging = true; // Now we're definitely dragging

  // Calculate new position
  const newLeft = e.clientX - dragOffsetX;
  const newTop = e.clientY - dragOffsetY;

  // Apply new position
  timerElement.style.left = `${newLeft}px`;
  timerElement.style.top = `${newTop}px`;

  // Remove default positioning
  timerElement.style.right = "";
  timerElement.style.bottom = "";

  // Save position to localStorage
  localStorage.setItem(
    "focusdotPosition",
    JSON.stringify({
      left: `${newLeft}px`,
      top: `${newTop}px`,
    })
  );
}

// Stop dragging
function stopDrag(e) {
  document.removeEventListener("mousemove", drag);
  document.removeEventListener("mouseup", stopDrag);

  if (!isDragging) {
    // This was a click, not a drag
    handleClick(e);
  }

  isDragging = false;
}

// Update timer state from background script
function updateTimerState(data) {
  console.log("FocusDot: Updating timer state with", data);

  timerState.currentTimer = data.currentTimer;
  timerState.completedPomodoros = data.completedPomodoros;
  timerState.settings = data.settings;
  timerState.timerStartTime = data.timerStartTime;
  timerState.timerEndTime = data.timerEndTime;

  // Check if timer visibility setting changed
  if (timerElement) {
    timerElement.style.display = timerState.settings.timerVisibility
      ? "block"
      : "none";

    // Apply custom dot size if set
    if (timerState.settings.dotSize) {
      applyDotSize(timerState.settings.dotSize);
    }
  }

  updateTimerUI();
}

// Update the timer UI based on current state
function updateTimerUI() {
  if (!timerElement) return;

  // Calculate current time remaining if timer is running
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

  // Format minutes and seconds
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  // Update tooltip content
  const tooltip = timerElement.querySelector(".focusdot-tooltip");
  const timerType =
    timerState.currentTimer.type === TIMER_TYPE.POMODORO
      ? "Focus Time"
      : "Break Time";
  tooltip.textContent = `${timerType}: ${timeString}`;

  // Update timer circle appearance
  const timerCircle = timerElement.querySelector(".focusdot-timer-circle");

  // Update emoji based on timer type and state
  const icon = timerElement.querySelector(".focusdot-timer-icon");

  if (timerState.currentTimer.type === TIMER_TYPE.POMODORO) {
    icon.textContent =
      timerState.currentTimer.state === TIMER_STATE.RUNNING ? "🍅" : "⏸️";
    timerCircle.style.borderColor = "#e53935";
  } else {
    icon.textContent =
      timerState.currentTimer.state === TIMER_STATE.RUNNING ? "☕" : "⏸️";
    timerCircle.style.borderColor = "#43a047";
  }

  // Add active state with thicker border when running
  if (timerState.currentTimer.state === TIMER_STATE.RUNNING) {
    timerCircle.style.border = "3px solid";
    timerCircle.style.borderColor =
      timerState.currentTimer.type === TIMER_TYPE.POMODORO
        ? "#e53935"
        : "#43a047";
  } else {
    timerCircle.style.border = "1px solid #ddd";
  }
}

// Check if document is already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
