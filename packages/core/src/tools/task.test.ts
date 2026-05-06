/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskTool } from './task.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';
import type { Config } from '../config/config.js';
import { AgentTerminateMode } from '../agents/types.js';
import { TASK_TOOL_NAME } from './tool-names.js';

describe('TaskTool', () => {
  let mockContext: AgentLoopContext;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    const mockConfig = {
      getAgentRegistry: vi.fn().mockReturnValue({
        getDefinition: vi.fn().mockReturnValue({
          kind: 'local',
          name: 'generalist',
        }),
      }),
    } as unknown as Config;

    mockContext = {
      config: mockConfig,
      geminiClient: {} as unknown,
      toolRegistry: {} as unknown,
    } as AgentLoopContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockMessageBus = new MessageBus({} as any);
  });

  it('initializes with proper schema and configuration', () => {
    const tool = new TaskTool(mockContext, mockMessageBus);
    expect(tool.name).toBe(TASK_TOOL_NAME);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((tool.schema.parametersJsonSchema as any).required).toContain(
      'tasks',
    );
  });

  it('rejects input with fewer than 2 tasks', async () => {
    const tool = new TaskTool(mockContext, mockMessageBus);
    expect(() =>
      tool.build({
        tasks: [{ description: 'task1', prompt: 'do task1' }],
      }),
    ).toThrow();
  });

  it('rejects input with more than 10 tasks', async () => {
    const tool = new TaskTool(mockContext, mockMessageBus);
    const tasks = Array.from({ length: 11 }).map((_, i) => ({
      description: `task${i}`,
      prompt: `do task${i}`,
    }));
    expect(() => tool.build({ tasks })).toThrow();
  });

  it('executes valid tasks concurrently and aggregates results', async () => {
    const tool = new TaskTool(mockContext, mockMessageBus);
    const invocation = tool.build({
      tasks: [
        { description: 'task1', prompt: 'do task1' },
        { description: 'task2', prompt: 'do task2' },
      ],
    });

    vi.spyOn(LocalAgentExecutor, 'create').mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        result: 'Success',
        terminate_reason: AgentTerminateMode.GOAL,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });
    expect(LocalAgentExecutor.create).toHaveBeenCalledTimes(2);

    const textContent = (result.llmContent as Array<{ text: string }>)[0].text;
    expect(textContent).toContain('Task 1: task1');
    expect(textContent).toContain('Task 2: task2');
    expect(textContent).toContain('Status: Completed');
  });

  it('handles partial failures correctly via Promise.allSettled', async () => {
    const tool = new TaskTool(mockContext, mockMessageBus);
    const invocation = tool.build({
      tasks: [
        { description: 'task1', prompt: 'do task1' },
        { description: 'task2', prompt: 'do task2' },
      ],
    });

    vi.spyOn(LocalAgentExecutor, 'create').mockImplementation(
      async (_definition, _context, _onActivity) =>
        ({
          run: vi
            .fn()
            .mockImplementation(async (inputs: { prompt: string }) => {
              if (inputs.prompt === 'do task1') {
                throw new Error('Failed to execute task1');
              }
              return {
                result: 'Success',
                terminate_reason: AgentTerminateMode.GOAL,
              };
            }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });
    expect(LocalAgentExecutor.create).toHaveBeenCalledTimes(2);

    // It shouldn't throw an error because partial failure is caught
    const textContent = (result.llmContent as Array<{ text: string }>)[0].text;
    expect(textContent).toContain('Task 1: task1');
    expect(textContent).toContain('Status: Failed');
    expect(textContent).toContain('Failed to execute task1');

    expect(textContent).toContain('Task 2: task2');
    expect(textContent).toContain('Status: Completed');
  });

  it('throws an error if all tasks fail', async () => {
    const tool = new TaskTool(mockContext, mockMessageBus);
    const invocation = tool.build({
      tasks: [
        { description: 'task1', prompt: 'do task1' },
        { description: 'task2', prompt: 'do task2' },
      ],
    });

    vi.spyOn(LocalAgentExecutor, 'create').mockResolvedValue({
      run: vi.fn().mockRejectedValue(new Error('Total failure')),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(
      invocation.execute({ abortSignal: new AbortController().signal }),
    ).rejects.toThrow('All sub-tasks failed');
  });
});
