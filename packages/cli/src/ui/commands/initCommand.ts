/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { performInit } from '@google/gemini-cli-core';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates a tailored GEMINI.md file',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.agentContext?.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.agentContext.config.getTargetDir();
    const geminiMdPath = path.join(targetDir, 'GEMINI.md');

    if (!context.overwriteConfirmed && fs.existsSync(geminiMdPath)) {
      return {
        type: 'confirm_action',
        prompt: React.createElement(
          Text,
          null,
          'A ',
          React.createElement(Text, { color: theme.text.accent }, 'GEMINI.md'),
          ' file already exists in this directory. Do you want to overwrite it?',
        ),
        originalInvocation: {
          raw: context.invocation?.raw || '/init',
        },
      };
    }

    context.ui.addItem(
      {
        type: 'info',
        text: 'Analyzing project structure to generate GEMINI.md...',
      },
      Date.now(),
    );

    // Pass false because we either don't have it or user confirmed overwrite
    const result = await performInit(false, targetDir);

    if (result.type === 'submit_prompt') {
      // Create or overwrite GEMINI.md
      fs.writeFileSync(geminiMdPath, '', 'utf8');

      // NOTE: For interactive UI, we don't return 'Gemini CLI will now use this file...' yet
      // because the LLM is about to stream the response into the chat and write to the file.
      // But the requirements asked to display success message "GEMINI.md created successfully."
      // Since it's done via streaming, we'll output the initial statement now, and the agent
      // will write the file contents.
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return result as SlashCommandActionReturn;
  },
};
