# FocusDot – Persistent Pomodoro Companion

A minimal browser extension that helps you stay focused using the Pomodoro technique with a simple, persistent floating dot timer.

## Features

- **Minimal Floating UI**: A simple draggable circle that appears on every webpage
- **Cross-Tab Synchronization**: Timer state persists and syncs across all open tabs
- **Customizable Settings**:
  - Pomodoro duration (default: 25 minutes)
  - Short break duration (default: 5 minutes)
  - Long break duration (default: 15 minutes)
  - Number of Pomodoros before a long break (default: 4)
  - Auto-start breaks and Pomodoros
  - Notification preferences
  - Timer visibility toggle
- **Visual Feedback**: Color-coded indication of active Pomodoro or break
- **Notifications**: Browser notifications when a Pomodoro or break is complete
- **Non-Intrusive Design**: Stay focused without distractions

## Installation

### Development Mode

1. Clone this repository:

   ```
   git clone https://github.com/yourusername/focusdot-extension.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top-right corner

4. Click "Load unpacked" and select the extension directory

### From Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store for easy installation.

## Usage

1. **Start a Pomodoro**: Click the dot to start the timer
2. **Pause/Resume**: Click the dot to pause or resume the timer
3. **Settings**: Click the extension icon to access settings
4. **Move Timer**: Drag the dot to reposition it on the page

## Architecture

The extension is built using:

- **Manifest V3**: The latest extension manifest format
- **Background Service Worker**: Handles timer logic and state management
- **Content Scripts**: Inject and manage the draggable timer UI
- **Chrome Storage API**: Persists settings and timer state
- **Chrome Alarms API**: Manages timer events
- **Chrome Notifications API**: Displays notifications

## Development

### Project Structure

```
focusdot-extension/
├── manifest.json        # Extension configuration
├── background/
│   └── background.js    # Background service worker
├── content/
│   ├── content.js       # Content script for timer UI
│   └── content.css      # Styles for timer UI
├── popup/
│   ├── popup.html       # Popup UI
│   ├── popup.js         # Popup functionality
│   └── popup.css        # Popup styles
└── icons/               # Extension icons
```

### Building for Production

For production, you may want to minify and bundle the code. Consider using tools like:

- Webpack or Rollup for bundling
- Terser for JavaScript minification
- PostCSS for CSS optimization

## License

MIT License

## Acknowledgements

- Inspired by the Pomodoro Technique developed by Francesco Cirillo
- UI/UX design inspired by industry-leading extensions like Grammarly
# poc-FocusDot
