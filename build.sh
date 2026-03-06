#!/usr/bin/env bash
# Render Static Site Build Script

# Install dependencies
npm install

# Build the Angular app
npm run build

# Ensure all static files are in the correct location
echo "Build completed successfully"
echo "Output directory: ./dist/restrologic/browser"

# List files to verify
ls -la ./dist/restrologic/browser/
