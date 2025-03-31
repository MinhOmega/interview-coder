# Interview Coder

Interview Coder is an Electron application that captures screenshots and leverages AI APIs to analyze them. It can solve questions, generate code, or provide detailed answers based on screenshots. The app supports both single screenshot processing and multi-page mode for capturing multiple images before analysis.

## Features

- **Screenshot Capture:** Use global keyboard shortcuts to capture the screen.
- **AI Integration:** Send captured screenshots to OpenAI, Google Gemini, or Ollama for automated analysis.
- **Multi-Page Mode:** Combine multiple screenshots for questions spanning several pages.
- **Customizable UI:** Transparent, always-on-top window with an instruction banner and markdown-rendered responses.
- **Global Shortcuts:** Easily control the application using keyboard shortcuts.
- **Platform-Aware:** Automatically uses Command key on macOS and Control key on Windows/Linux.
- **Local AI Options:** Support for local Ollama models, including multimodal vision models.
- **Streaming Responses:** View AI responses as they're generated in real-time.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- An OpenAI API key (if using OpenAI) OR
- A Google Gemini API key (if using Gemini) OR
- [Ollama](https://ollama.ai/) installed and running locally (if using local models)

## Installation

1. **Clone the repository:**

   ```
   git clone https://github.com/MinhOmega/interview-coder.git
   cd interview-coder
   ```

2. **Install the dependencies:**
   ```
   npm install
   ```

3. **Configure the application:**
   Create a `.env` file in the project root with your settings. For example:
    ```
    OPENAI_API_KEY=YOUR_OPENAI_API_KEY
    OPENAI_MODEL=gpt-4o-mini
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    GEMINI_MODEL=gemini-2.0-flash
    AI_PROVIDER=openai
    OLLAMA_BASE_URL=http://127.0.0.1:11434
    OLLAMA_MODEL=deepseek-r1:14b
    ```
  - Note: If the `OPENAI_MODEL` value is omitted, the application defaults to "gpt-4o-mini".
  - `AI_PROVIDER` can be set to `openai`, `gemini`, or `ollama`. 
  - Always use `127.0.0.1` instead of `localhost` for Ollama to avoid IPv6 connection issues.
  - If using Ollama, make sure you have it installed and running with vision-capable models.

## Using with Ollama

To use Interview Coder with Ollama:

1. Install Ollama from https://ollama.ai/
2. Run Ollama
3. Pull a vision-capable model such as `deepseek-r1:14b` by running:
   ```
   ollama pull deepseek-r1:14b
   ```
4. Start Interview Coder
5. Press `Command+M` (Mac) or `Ctrl+M` (Windows/Linux) to open the model selector
6. Select "Ollama" as your AI provider and choose your model from the dropdown
7. Click "Save Settings"

### Troubleshooting Ollama Connection

If you encounter connection issues with Ollama:

1. Make sure Ollama is running by checking its status in your system tray or task manager
2. Verify that you're using `http://127.0.0.1:11434` instead of `localhost` in the Ollama URL settings
3. Use the "Test Connection" button in the model selector to check if Interview Coder can connect to Ollama
4. Check that your firewall is not blocking connections to port 11434
5. If you've configured Ollama to use a different port or host, update the URL accordingly

## Usage

1. **Start the Application:**
    Run the following command to launch Interview Coder:
    ```
    npm start
    ```

2. **Global Keyboard Shortcuts:**

    On macOS:
    - Command+H: Capture a window screenshot and process it immediately.
    - Command+D: Capture a screenshot of a selected area and process it.
    - Command+A: Capture an additional screenshot in multi-page mode.
    - Command+Enter: Process all captured screenshots.
    - Command+R: Reset the current process, clearing all captured screenshots and any displayed results.
    - Command+M: Open the model selector to switch between OpenAI, Gemini, and Ollama models.
    - Command+Q: Quit the application.
    - Command+B: Toggle visibility of all application windows (both main window and settings).
    - Command+Arrow keys: Move the window in the specified direction.

    On Windows/Linux:
    - Ctrl+H: Capture a window screenshot and process it immediately.
    - Ctrl+D: Capture a screenshot of a selected area and process it.
    - Ctrl+A: Capture an additional screenshot in multi-page mode.
    - Ctrl+Enter: Process all captured screenshots.
    - Ctrl+R: Reset the current process, clearing all captured screenshots and any displayed results.
    - Ctrl+M: Open the model selector to switch between OpenAI, Gemini, and Ollama models.
    - Ctrl+Q: Quit the application.
    - Ctrl+B: Toggle visibility of all application windows (both main window and settings).
    - Ctrl+Arrow keys: Move the window in the specified direction.

## Supported Models

### OpenAI Models
- gpt-4o-mini
- gpt-4o
- gpt-4-vision-preview
- gpt-4-turbo

### Google Gemini Models
- gemini-2.0-flash

### Ollama Models
Any Ollama model that supports vision capabilities, including:
- deepseek-r1:14b (recommended)

## Status

This program is still under development. Some features may not be fully implemented, and there might be bugs or incomplete functionality. Your feedback and contributions are welcome as we work towards a more stable release.


**Personal Thoughts**: Inspired by interviewcoder.co but didn't like the idea of gatekeeping **cheating** softwares behind paywalls. Like you're literally cheating wtf man? And this might help incompetent software engineers join the company and eat it from the inside forcing companies to realise that Leetcode isn't the only way people should get hired and there are other alternative ways to assess a candidate's abilities.
