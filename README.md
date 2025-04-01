# Interview Coder

A specialized tool for coding interviews that allows you to take screenshots of coding problems and get AI-powered analysis and solutions.

## Features

- **Screenshot Capture**: Capture your screen to analyze coding problems
- **AI Analysis**: Process screenshots with AI to get detailed explanations and solutions
- **Streaming Responses**: Get real-time streaming AI responses
- **Todo App**: A simple Todo application to demonstrate functionality
- **Context Awareness**: Add multiple screenshots to continue the conversation

## Project Structure

```
src/
├── components/               # React components
│   ├── ui/                   # Reusable UI components
│   │   ├── TopToolbar.tsx    # App toolbar with actions
│   │   ├── LoadingContent.tsx# Loading skeleton UI
│   │   ├── ResultContent.tsx # Markdown renderer for AI responses
│   │   ├── ModelBadge.tsx    # Shows current AI model info
│   │   └── ...
│   ├── Todo.tsx              # Todo app component
│   └── AppContainer.tsx      # Container for the Todo app
├── services/                 # Business logic services
│   ├── ScreenshotService.ts  # Handles screenshot operations
│   └── AIService.ts          # Manages AI interactions
├── hooks/                    # Custom React hooks
│   └── useElectron.ts        # Hook for Electron IPC communication
├── electron/                 # Electron main process code
│   ├── screenshot-handler.ts # Screenshot capture and processing
│   └── main-process-bridge.ts# Main process initialization
├── styles/                   # CSS styles
├── App.tsx                   # Main application component
└── preload.ts                # Electron preload script for secure IPC
```

## Technology Stack

- **React**: UI framework
- **TypeScript**: Type-safe JavaScript
- **Electron**: Cross-platform desktop app framework
- **OpenAI API**: AI-powered code analysis

## Key Components

### UI Components

- **TopToolbar**: Contains buttons for taking screenshots, processing images, and accessing settings
- **LoadingContent**: Shows a skeleton UI while waiting for AI responses
- **ResultContent**: Renders markdown responses from the AI with syntax highlighting
- **InstructionBanner**: Displays instructions to the user
- **ModelBadge**: Shows current AI model information
- **NotificationContainer**: Displays notifications to the user
- **ContextActions**: Provides actions for continuing the conversation

### Services

- **ScreenshotService**: Handles taking screenshots and processing them with AI
- **AIService**: Manages AI interaction and model settings

### Electron Integration

- **useElectron**: Hook to safely access Electron's IPC functionality
- **screenshot-handler.ts**: Manages screenshot capture and AI processing in the main process
- **main-process-bridge.ts**: Initializes all main process handlers

## Setup and Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`

## Usage

- Press **Cmd+T** (or Ctrl+T) to show the Todo app
- Press **Cmd+H** (or Ctrl+H) to take a screenshot and process it with AI
- Press **Cmd+B** (or Ctrl+B) to show/hide the app window
- Press **Cmd+Enter** (or Ctrl+Enter) to process existing screenshots

## Key Shortcuts

- **Cmd+H** (or Ctrl+H): Take a screenshot
- **Cmd+A** (or Ctrl+A): Add additional screenshot to the current context
- **Cmd+D** (or Ctrl+D): Take a screenshot of a selected area (area capture)
- **Cmd+Enter** (or Ctrl+Enter): Process existing screenshots
- **Cmd+B** (or Ctrl+B): Toggle window visibility (always active, even when hidden)
- **Cmd+R** (or Ctrl+R): Reset and clear all screenshots
- **Cmd+M** or **Cmd+,** (or Ctrl+M/Ctrl+,): Open model selector
- **Cmd+L** (or Ctrl+L): Delete the last screenshot
- **Cmd+[/]** (or Ctrl+[/]): Adjust window opacity
- **Cmd+Arrow Keys** (or Ctrl+Arrow Keys): Move the window
- **Cmd+Q** (or Ctrl+Q): Quit the application

## Special Features

### Hidden Mode Behavior

When the app window is hidden (using Cmd+B or setting opacity to minimum):
- Only the Cmd+B shortcut remains active to restore visibility
- All other shortcuts are disabled
- This prevents accidental interactions when the app is not visible

### Opacity Control

- Use Cmd+[ and Cmd+] to decrease/increase opacity
- When opacity drops below a certain threshold, the app automatically switches to hidden mode
- When in hidden mode, only Cmd+B works to restore visibility
