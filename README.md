# <div align="center">Interview Coder</div>

<div align="center">
  <img src="build/logo.png" alt="Interview Coder Logo" width="150" height="150"/>
  <br/>
  <br/>
  <strong>Your AI-Powered Coding Interview Assistant</strong>
  <br/>
  <br/>
</div>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Platform - Windows, macOS, Linux](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

![Electron Version](https://img.shields.io/badge/electron-v35.1.2-blue)
![Version](https://img.shields.io/badge/version-v1.5.1-green)

</div>

<hr/>

## 🚀 Overview

Interview Coder is an advanced Electron application that leverages AI to analyze screenshots and assist with coding interviews. Whether you need to solve coding problems, generate code, or get detailed explanations, Interview Coder has got you covered with support for multiple AI providers and a seamless user experience.

## ✨ Key Features

- 📸 **Smart Screenshot Capture**
  - Global keyboard shortcuts for instant captures
  - Support for window and area-specific screenshots
  - Multi-page mode for complex questions

- 🤖 **Powerful AI Integration**
  - OpenAI integration (GPT-4 Vision)
  - Google Gemini support
  - Local Ollama compatibility
  - Real-time streaming responses

- 🌐 **Multilingual Support**
  - Responses in 8 different languages
  - English, Vietnamese, Spanish, French, German, Japanese, Korean, and Chinese
  - Language preferences persist across sessions

- 🎯 **User-Friendly Interface**
  - Transparent, always-on-top window
  - Markdown-rendered responses
  - Customizable positioning
  - Platform-aware keyboard shortcuts
  - Collapsible settings sections

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- For AI functionality (one of the following):
  - OpenAI API key
  - Google Gemini API key
  - [Ollama](https://ollama.ai/) running locally

## 📦 Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/MinhOmega/interview-coder.git
   cd interview-coder
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

## 🔧 AI Configuration

No environment configuration is required to get started. API keys can be entered directly in the application:

1. Launch Interview Coder
2. Press `⌘+M` (Mac) or `Ctrl+M` (Windows/Linux) to open the model selector
3. Choose your preferred AI provider (OpenAI, Google Gemini, or Ollama)
4. Enter your API key when prompted
5. Select your preferred model
6. Choose your preferred response language
7. Save settings and start using!

## 🔧 Using with Ollama

1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Start the Ollama service
3. Pull a vision-capable model:
   ```bash
   ollama pull deepseek-r1:14b
   ```
4. Launch Interview Coder
5. Press `⌘+M` (Mac) or `Ctrl+M` (Windows/Linux) to open the model selector
6. Select "Ollama" as your AI provider
7. Configure the Ollama base URL if needed (default: http://127.0.0.1:11434)
8. Choose your preferred model from the dropdown
9. Save settings and start using!

## 🌐 Language Settings

Choose your preferred language for AI responses:

1. Press `⌘+M` (Mac) or `Ctrl+M` (Windows/Linux) to open the model selector
2. Scroll down to the "Response Language" section
3. Select your language from the available options:
   - English (default)
   - Vietnamese (Tiếng Việt)
   - Spanish (Español)
   - French (Français)
   - German (Deutsch)
   - Japanese (日本語)
   - Korean (한국어)
   - Chinese (中文)
4. Save settings to apply your language preference

The application will generate all AI responses in your selected language, with solution approaches tailored to your language preference.

## ⌨️ Keyboard Shortcuts

### macOS
| Shortcut           | Action                      |
| ------------------ | --------------------------- |
| `⌘ + B`            | Toggle window visibility    |
| `⌘ + H`            | Capture window screenshot   |
| `⌘ + D`            | Capture selected area       |
| `⌘ + A`            | Add screenshot (multi-page) |
| `⌘ + Enter`        | Process screenshots         |
| `⌘ + R`            | Reset current process       |
| `⌘ + M`            | Open model selector         |
| `⌘ + T`            | Toggle split view           |
| `⌘ + ,`            | Open settings               |
| `⌘ + Q`            | Quit application            |
| `⌘ + Shift + ↑↓←→` | Move window                 |
| `Shift + ↑↓`       | Scroll up/down              |
| `⌘ + Shift + =`    | Increase window size        |
| `⌘ + Shift + -`    | Decrease window size        |
| `⌘ + Shift + I`    | Toggle DevTools             |

### Windows/Linux
| Shortcut              | Action                      |
| --------------------- | --------------------------- |
| `Ctrl + B`            | Toggle window visibility    |
| `Ctrl + H`            | Capture window screenshot   |
| `Ctrl + D`            | Capture selected area       |
| `Ctrl + A`            | Add screenshot (multi-page) |
| `Ctrl + Enter`        | Process screenshots         |
| `Ctrl + R`            | Reset current process       |
| `Ctrl + M`            | Open model selector         |
| `Ctrl + T`            | Toggle split view           |
| `Ctrl + ,`            | Open settings               |
| `Ctrl + Q`            | Quit application            |
| `Ctrl + Shift + ↑↓←→` | Move window                 |
| `Shift + ↑↓`          | Scroll up/down              |
| `Ctrl + Shift + =`    | Increase window size        |
| `Ctrl + Shift + -`    | Decrease window size        |
| `Ctrl + Shift + I`    | Toggle DevTools             |

> **Note for Linux users:** Alternative key bindings may be used automatically if the primary shortcuts cannot be registered.

## 🤖 Supported AI Models

### OpenAI
- gpt-4o-mini
- gpt-4o
- gpt-4-vision-preview
- gpt-4-turbo

### Google Gemini
- gemini-2.0-flash

### Ollama
- deepseek-r1:14b (recommended)
- Any vision-capable Ollama model

## ⚠️ Status

This project is under active development. While core features are functional, you may encounter occasional bugs or incomplete features. Your feedback and contributions are welcome!

## 💭 Personal Note

Inspired by interviewcoder.co but with a twist - making the tool openly available rather than behind paywalls. This project aims to challenge the status quo of technical interviews and encourage companies to explore more comprehensive ways of assessing candidates beyond traditional coding challenges.

## Development Mode with Hot Reload

This application supports a development mode with hot reloading for a more efficient development experience.

### Running in Development Mode

Use these npm scripts to run the application with hot reload enabled:

```bash
# For macOS/Linux
npm run dev

# For Windows
npm run dev:windows
```

### Hot Reload Features

When running in development mode, the application provides the following features:

- **Automatic reloading** when files are changed
- **Manual reload** with keyboard shortcut `Ctrl+Shift+R` (or `Cmd+Shift+R` on macOS)
- **Visual indicator** showing "DEV MODE" in the bottom-right corner with a clickable reload button
- **Force reload option** in the right-click context menu
- **Independent window reload** - only reloads the window (main or settings) that's affected by the file changes
- **IPC communication** for development-specific channels between renderer and main processes

### Monitored Files

The following files are monitored for changes:

- **Renderer Files**: HTML, CSS, and renderer JavaScript files
  - `renderer.js`, `styles.css`, `index.html`
  - `model-selector.js`, `model-selector.css`, `model-selector.html`
- **Main Process Files**: `main.js` and all files in the `js/` directory
  - Excludes `js/dev-config.js` to prevent reload loops

### Development IPC Channels

The application uses a dedicated IPC channel for development:

- `DEV_RELOAD`: Used to trigger a manual reload of all applicable windows

### Debugging

To open the DevTools for debugging:
- Use keyboard shortcut `Ctrl+Shift+I` (or `Cmd+Shift+I` on macOS)
- Alternative shortcut: `Ctrl+D` (or `Cmd+D` on macOS)
- Or right-click and select "Inspect Element" from the context menu

<div align="center">
<br/>
Made with ❤️ by <a href="mailto:vnqminh0502@gmail.com">Minh Vo</a>
</div>