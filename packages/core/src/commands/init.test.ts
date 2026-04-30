/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, vi } from 'vitest';
import { performInit } from './init.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('performInit', () => {
  it('returns info if GEMINI.md already exists', async () => {
    const result = await performInit(true);

    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('already exists');
    }
  });

  it('returns submit_prompt if GEMINI.md does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await performInit(false, '/test/dir');
    expect(result.type).toBe('submit_prompt');

    if (result.type === 'submit_prompt') {
      expect(result.content).toContain('You are an AI agent');
    }
  });
});
