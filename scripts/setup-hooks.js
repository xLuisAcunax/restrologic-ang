#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const hooksDir = path.join(__dirname, "..", ".git", "hooks");
const postCommitHookPath = path.join(hooksDir, "post-commit");

// Determine platform-specific hook content
const isWindows = os.platform() === "win32";

const hookContent = isWindows
  ? `@echo off
REM Auto-version the app after each commit

REM Run the version generation script
node scripts/generate-version.js

REM Stage the generated files
git add src/environments/version.ts package.json

REM Check if there are changes to commit
git diff --cached --quiet
if errorlevel 1 (
  REM Amend the previous commit with the version changes
  git commit --amend --no-edit
)
`
  : `#!/bin/bash
# Auto-version the app after each commit

# Run the version generation script
node scripts/generate-version.js

# Stage the generated files
git add src/environments/version.ts package.json

# Check if there are changes to commit
if ! git diff --cached --quiet; then
  # Amend the previous commit with the version changes
  git commit --amend --no-edit
fi
`;

try {
  // Ensure .git/hooks directory exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // Write the hook file
  fs.writeFileSync(postCommitHookPath, hookContent, "utf8");

  // Make it executable (Unix/Linux/Mac only)
  if (!isWindows) {
    try {
      execSync(`chmod +x "${postCommitHookPath}"`);
    } catch (e) {
      // Ignore chmod errors
    }
  }

  console.log("✓ Git post-commit hook installed successfully");
  console.log(
    "  The hook will auto-generate versions based on commit messages"
  );
  console.log("  Use conventional commits: feat(), fix(), BREAKING CHANGE");
} catch (error) {
  console.error("✗ Failed to setup git hook:", error.message);
  process.exit(1);
}
