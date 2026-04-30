# Generate Project Context (/init)

The `/init` slash command allows you to automatically analyze the current
working directory and generate a comprehensive \`GEMINI.md\` context file at the
project root. This provides Gemini CLI with persistent, project-specific context
on every subsequent session.

## Overview

When working on complex or unfamiliar codebases, Gemini needs context about the
project's structure, architecture, build commands, and coding conventions to
provide accurate and helpful responses. Manually writing this context can be
time-consuming.

The \`/init\` command solves this by doing the initial legwork for you. It scans
the project, reads important files like \`README.md\`, \`package.json\`, or
\`Makefile\`, and uses a specialized prompt to generate a structured
\`GEMINI.md\` file.

## Usage

Simply run the command in an interactive Gemini CLI session within your project
directory:

\`\`\`

> /init \`\`\`

1.  **Analysis:** The CLI will immediately display a progress message indicating
    that it is analyzing the project structure.
2.  **Generation:** Gemini will examine the directory tree and key files
    (respecting your ignore rules) and stream the generated \`GEMINI.md\`
    content back to you, simultaneously writing it to the file.
3.  **Confirmation (if existing):** If a \`GEMINI.md\` file already exists in
    the project root, the CLI will ask for your confirmation before overwriting
    it.

## Example Output Structure

The generated \`GEMINI.md\` typically follows this structure:

\`\`\`markdown

# Project overview

A high-level summary of the project's purpose and main technologies.

## Architecture summary

A description of how the project is organized.

## Key directories and files

A list of important folders and files and what they contain.

## Build, test, and run commands

Commands inferred from manifest files (e.g., \`npm run build\`, \`make test\`).

## Coding conventions and style notes

Any observed patterns regarding code style or testing practices.

## Important context for AI assistants working in this codebase

Specific instructions or tips for AI agents interacting with this project.
\`\`\`

## What is Analyzed

During the analysis phase, the \`/init\` command looks at:

- **Directory Structure:** The overall hierarchy of folders and files.
- **Manifest Files:** The contents of build/dependency files like
  \`package.json\`, \`Makefile\`, \`CMakeLists.txt\`, \`pyproject.toml\`,
  \`Cargo.toml\`, \`build.gradle\`, \`pom.xml\`, or \`go.mod\`.
- **Documentation:** Up to the first 200 lines of \`README.md\`, and up to the
  first 50 lines of \`CONTRIBUTING.md\` or \`ARCHITECTURE.md\`.

## Ignored Files and Directories

The \`/init\` command respects your existing ignore rules. It will **not**
analyze files or directories that are excluded by:

- \`.gitignore\`
- \`.geminiignore\`
- Custom ignore paths specified in your Gemini CLI settings.

This ensures that build artifacts (like \`dist/\`, \`build/\`), dependency
folders (like \`node_modules/\`), and sensitive files are not included in the
generated context.
