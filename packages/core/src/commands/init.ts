/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandActionReturn } from './types.js';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { debugLogger } from '../utils/debugLogger.js';

export async function performInit(
  doesGeminiMdExist: boolean,
  targetDir?: string,
): Promise<CommandActionReturn> {
  if (doesGeminiMdExist) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'A GEMINI.md file already exists in this directory. No changes were made.',
    };
  }

  let projectContext = '';
  if (targetDir) {
    const fileService = new FileDiscoveryService(targetDir, {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    });

    try {
      const folderStructure = await getFolderStructure(targetDir, {
        fileService,
        maxItems: 100,
      });

      let manifestContent = '';
      const manifests = [
        'package.json',
        'Makefile',
        'CMakeLists.txt',
        'pyproject.toml',
        'Cargo.toml',
        'build.gradle',
        'pom.xml',
        'go.mod',
      ];
      for (const manifest of manifests) {
        const manifestPath = path.join(targetDir, manifest);
        if (fs.existsSync(manifestPath)) {
          const content = fs.readFileSync(manifestPath, 'utf8');
          manifestContent += `\n--- ${manifest} ---\n${content}\n`;
        }
      }

      let readmeContent = '';
      const readmes = ['README.md', 'README.txt', 'README'];
      for (const readme of readmes) {
        const readmePath = path.join(targetDir, readme);
        if (fs.existsSync(readmePath)) {
          const content = fs.readFileSync(readmePath, 'utf8');
          const lines = content.split('\n').slice(0, 200).join('\n');
          readmeContent += `\n--- ${readme} (first 200 lines) ---\n${lines}\n`;
          break; // Only read the first README found
        }
      }

      let otherDocsContent = '';
      const otherDocs = ['CONTRIBUTING.md', 'ARCHITECTURE.md'];
      for (const doc of otherDocs) {
        const docPath = path.join(targetDir, doc);
        if (fs.existsSync(docPath)) {
          const content = fs.readFileSync(docPath, 'utf8');
          const lines = content.split('\n').slice(0, 50).join('\n');
          otherDocsContent += `\n--- ${doc} (first 50 lines) ---\n${lines}\n`;
        }
      }

      projectContext = `
**Project Context:**
\`\`\`
${folderStructure}
\`\`\`
${manifestContent}
${readmeContent}
${otherDocsContent}
`;
    } catch (e) {
      debugLogger.error('Error gathering project context for init', e);
    }
  }

  return {
    type: 'submit_prompt',
    content: `
You are an AI agent that brings the power of Gemini directly into the terminal. Your task is to analyze the provided project context and generate a comprehensive GEMINI.md file to be used as instructional context for future interactions.

${projectContext}

**Analysis Process:**

1.  **Identify Project Type:**
    *   **Code Project:** Look for clues like \`package.json\`, \`requirements.txt\`, \`pom.xml\`, \`go.mod\`, \`Cargo.toml\`, \`build.gradle\`, or a \`src\` directory. If you find them, this is likely a software project.
    *   **Non-Code Project:** If you don't find code-related files, this might be a directory for documentation, research papers, notes, or something else.

**GEMINI.md Content Generation:**

The model's output should be the raw Markdown content of the GEMINI.md file, nothing else. DO NOT wrap the output in markdown code blocks. DO NOT use triple backticks \`\`\`markdown at the beginning and \`\`\` at the end. The output must be the raw Markdown content of the GEMINI.md file, nothing else.

**The prompt must instruct the model to produce a structured GEMINI.md with these required sections:**
# Project overview
## Architecture summary
## Key directories and files
## Build, test, and run commands
## Coding conventions and style notes
## Important context for AI assistants working in this codebase

**Final Output:**
Write the complete content to the \`GEMINI.md\` file. The output must be well-formatted Markdown.
`,
  };
}
