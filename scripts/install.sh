#!/bin/bash

echo "🚀 Claude-Discord Bridge Installation Script"
echo "==========================================="
echo ""

# Check Node.js version
echo "📋 Checking requirements..."
NODE_VERSION=$(node -v 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old!"
    echo "Please upgrade to Node.js 18+"
    exit 1
fi
echo "✅ Node.js $NODE_VERSION"

# Check for Claude Code CLI
echo ""
echo "🔍 Checking for Claude Code CLI..."
if command -v claude-code &> /dev/null; then
    echo "✅ Claude Code CLI found"
else
    echo "⚠️  Claude Code CLI not found!"
    echo "Install from: https://claude.ai/code"
fi

# Check for tmux (optional but recommended)
echo ""
echo "🔍 Checking for tmux..."
if command -v tmux &> /dev/null; then
    echo "✅ tmux found (recommended)"
else
    echo "⚠️  tmux not found (optional but recommended)"
    echo "Install with: sudo apt-get install tmux (Ubuntu/Debian)"
    echo "           : brew install tmux (macOS)"
fi

# Install dependencies
echo ""
echo "📦 Installing npm packages..."
npm install

# Build TypeScript
echo ""
echo "🔨 Building TypeScript..."
npm run build

# Initialize database
echo ""
echo "💾 Initializing database..."
npm run db:init

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your Discord bot token!"
fi

# Create required directories
echo ""
echo "📁 Creating directories..."
mkdir -p logs
mkdir -p data

echo ""
echo "✨ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your Discord bot token"
echo "2. Run 'npm run register' to register Discord commands"
echo "3. Start the bot with 'npm start' or 'npm run dev'"
echo ""
echo "Need help? Check the README.md"