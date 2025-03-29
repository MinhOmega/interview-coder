# OA Coder

OA Coder is an AI-powered coding assistant that analyzes screenshots of code, problem statements, and documentation to provide explanations, solutions, and insights.

## Features

- Capture full-screen or area screenshots
- Multi-screenshot mode for analyzing multiple pages
- AI-powered analysis of code and text in screenshots
- Support for multiple AI providers:
  - OpenAI (GPT-4 Vision)
  - Google Gemini Pro Vision
  - Local Ollama models with vision capabilities

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm (v8 or higher)

### Setup

1. Clone this repository
   ```
   git clone https://github.com/yourusername/oa-coder.git
   cd oa-coder
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Build the application
   ```
   npm run build
   ```

4. Start the application
   ```
   npm start
   ```

### Development

For development with hot-reloading:
```
npm run dev
```

## Usage

### Keyboard Shortcuts

- **Cmd+Shift+S** (Mac) / **Ctrl+Shift+S** (Windows/Linux): Capture full screen
- **Cmd+Shift+D** (Mac) / **Ctrl+Shift+D** (Windows/Linux): Capture selected area
- **Cmd+Shift+A** (Mac) / **Ctrl+Shift+A** (Windows/Linux): Toggle multi-screenshot mode
- **Cmd+Shift+M** (Mac) / **Ctrl+Shift+M** (Windows/Linux): Open model settings
- **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows/Linux): Repeat last analysis
- **Cmd+Shift+Q** (Mac) / **Ctrl+Shift+Q** (Windows/Linux): Quit application

### AI Provider Configuration

The first time you run the application, you'll need to configure an AI provider:

1. Select your preferred AI provider (OpenAI, Gemini, or Ollama)
2. Enter the required API keys or URLs
3. Select the appropriate model

#### For Ollama

To use local Ollama models:
1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model with vision capabilities:
   ```
   ollama pull llava
   ```
3. Run Ollama server
4. In OA Coder, select Ollama as provider and enter the URL (default: http://localhost:11434)

## Building for Distribution

Build for all platforms:
```
npm run build:all
```

Platform-specific builds:
```
npm run build:mac
npm run build:win
npm run build:linux
```

## License

MIT
