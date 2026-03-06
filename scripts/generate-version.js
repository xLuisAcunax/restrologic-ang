const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Read package.json to get the version
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
let version = packageJson.version;

// Parse version into major, minor, patch
const [major, minor, patch] = version.split(".").map(Number);

// Get the last commit message to determine version bump
try {
  const lastCommit = execSync("git log -1 --pretty=%B", {
    encoding: "utf8",
  }).trim();

  let newMajor = major;
  let newMinor = minor;
  let newPatch = patch;

  // Check for BREAKING CHANGE (major bump)
  if (lastCommit.includes("BREAKING CHANGE")) {
    newMajor = major + 1;
    newMinor = 0;
    newPatch = 0;
    console.log(`📈 BREAKING CHANGE detected - bumping major version`);
  }
  // Check for feat: (minor bump)
  else if (lastCommit.match(/^feat(\(.+\))?:/m)) {
    newMinor = minor + 1;
    newPatch = 0;
    console.log(`✨ New feature detected - bumping minor version`);
  }
  // Default: patch bump for fix: or other commits
  else if (lastCommit.match(/^(fix|refactor|perf|docs)(\(.+\))?:/m)) {
    newPatch = patch + 1;
    console.log(`🔧 Fix/change detected - bumping patch version`);
  }

  version = `${newMajor}.${newMinor}.${newPatch}`;

  // Update package.json with new version
  packageJson.version = version;
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    "utf8"
  );
  console.log(`📝 Updated package.json version to ${version}`);
} catch (error) {
  console.log("⚠️  Could not read git commits, using current version");
}

// Generate version.ts file
const versionFilePath = path.join(
  __dirname,
  "..",
  "src",
  "environments",
  "version.ts"
);
const versionFileContent = `export const appVersion = '${version}';\n`;

fs.writeFileSync(versionFilePath, versionFileContent, "utf8");
console.log(`✓ Generated version.ts with version ${version}`);
