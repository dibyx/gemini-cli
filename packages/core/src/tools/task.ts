/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  type ToolInvocation,
  type ToolResult,
  type ExecuteOptions,
  Kind,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';
import {
  isToolActivityError,
  type SubagentActivityEvent,
  type SubagentProgress,
} from '../agents/types.js';
import { TASK_TOOL_NAME } from './tool-names.js';
import { randomUUID } from 'node:crypto';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';

export interface TaskInput {
  tasks: Array<{
    description: string;
    prompt: string;
  }>;
}

export class TaskToolInvocation extends BaseToolInvocation<
  TaskInput,
  ToolResult
> {
  constructor(
    private readonly context: AgentLoopContext,
    params: TaskInput,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(
      params,
      messageBus,
      _toolName ?? TASK_TOOL_NAME,
      _toolDisplayName ?? 'Task',
    );
  }

  getDescription(): string {
    return 'Dispatches tasks in parallel to subagents.';
  }

  async execute(options: ExecuteOptions): Promise<ToolResult> {
    const { tasks } = this.params;
    if (!tasks || tasks.length < 2 || tasks.length > 10) {
      throw new Error('Task tool requires between 2 and 10 tasks.');
    }

    const { abortSignal, updateOutput } = options;

    const progressByTask = new Map<number, SubagentProgress>();

    // Initialize progress for all tasks
    tasks.forEach((task, index) => {
      progressByTask.set(index, {
        isSubagentProgress: true,
        agentName: task.description,
        recentActivity: [],
        state: 'running',
      });
    });

    const sendUpdate = () => {
      if (updateOutput) {
        // UI handles arrays for ToolGroupMessage
        updateOutput(Array.from(progressByTask.values()));
      }
    };

    sendUpdate();

    const taskPromises = tasks.map(async (task, index) => {
      // Find the generalist agent definition (or any default local agent)
      const registry = this.context.config.getAgentRegistry();
      const definition = registry.getDefinition('generalist');
      if (!definition || definition.kind !== 'local') {
        throw new Error(
          'Could not find a valid local generalist agent definition for subtasks.',
        );
      }

      const onActivity = (activity: SubagentActivityEvent): void => {
        let updated = false;
        const progress = progressByTask.get(index)!;

        switch (activity.type) {
          case 'THOUGHT_CHUNK': {
            const text = String(activity.data['text']);
            const lastItem =
              progress.recentActivity[progress.recentActivity.length - 1];

            if (
              lastItem &&
              lastItem.type === 'thought' &&
              lastItem.status === 'running'
            ) {
              lastItem.content += text;
            } else {
              if (lastItem && lastItem.status === 'running') {
                lastItem.status = 'completed';
              }
              progress.recentActivity.push({
                id: randomUUID(),
                type: 'thought',
                content: text,
                status: 'running',
              });
            }
            updated = true;
            break;
          }
          case 'TOOL_CALL_START': {
            const name = String(activity.data['name']);
            const displayName = activity.data['displayName']
              ? String(activity.data['displayName'])
              : undefined;
            const description = activity.data['description']
              ? String(activity.data['description'])
              : undefined;
            let args = '{}';
            const rawArgs = activity.data['args'];
            if (rawArgs) {
              args = safeJsonStringify(rawArgs) || '{}';
              if (args.startsWith('"') && args.endsWith('"')) {
                args = String(rawArgs);
              }
            }

            progress.recentActivity.push({
              id: randomUUID(),
              type: 'tool_call',
              content: name,
              displayName,
              description,
              args,
              status: 'running',
            });
            updated = true;
            break;
          }
          case 'TOOL_CALL_END': {
            const name = String(activity.data['name']);
            const data = activity.data['data'];
            const isError = isToolActivityError(data);

            for (let i = progress.recentActivity.length - 1; i >= 0; i--) {
              if (
                progress.recentActivity[i].type === 'tool_call' &&
                progress.recentActivity[i].content === name &&
                progress.recentActivity[i].status === 'running'
              ) {
                progress.recentActivity[i].status = isError
                  ? 'error'
                  : 'completed';
                updated = true;
                break;
              }
            }
            break;
          }
          case 'ERROR': {
            const sanitizedError = String(
              activity.data['error'] || 'Unknown error',
            );
            const toolName = activity.data['toolName']
              ? String(activity.data['toolName'])
              : undefined;
            const errorType = activity.data['errorType'];

            const isCancellation = errorType === 'CANCELLED';
            const isRejection = errorType === 'REJECTED';

            if (isCancellation || isRejection) {
              for (let i = progress.recentActivity.length - 1; i >= 0; i--) {
                if (
                  progress.recentActivity[i].type === 'tool_call' &&
                  progress.recentActivity[i].content === toolName &&
                  progress.recentActivity[i].status === 'running'
                ) {
                  progress.recentActivity[i].status = 'cancelled';
                  updated = true;
                  break;
                }
              }
            } else if (toolName) {
              for (let i = progress.recentActivity.length - 1; i >= 0; i--) {
                if (
                  progress.recentActivity[i].type === 'tool_call' &&
                  progress.recentActivity[i].content === toolName &&
                  progress.recentActivity[i].status === 'running'
                ) {
                  progress.recentActivity[i].status = 'error';
                  updated = true;
                  break;
                }
              }
            }

            progress.recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content:
                isCancellation || isRejection
                  ? sanitizedError
                  : `Error: ${sanitizedError}`,
              status: isCancellation || isRejection ? 'cancelled' : 'error',
            });
            updated = true;
            break;
          }
          default:
            break;
        }

        if (updated) {
          sendUpdate();
        }
      };

      try {
        const executor = await LocalAgentExecutor.create(
          definition,
          this.context,
          onActivity,
        );

        // Run the agent.
        const output = await executor.run({ prompt: task.prompt }, abortSignal);

        const progress = progressByTask.get(index)!;
        progress.state = 'completed';
        progress.result = output.result;
        progress.terminateReason = output.terminate_reason;

        // Finalize running item
        const lastItem =
          progress.recentActivity[progress.recentActivity.length - 1];
        if (lastItem && lastItem.status === 'running') {
          lastItem.status = 'completed';
        }

        sendUpdate();

        return {
          status: 'success' as const,
          description: task.description,
          output: output.result,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const progress = progressByTask.get(index)!;
        progress.state = 'error';

        const lastItem =
          progress.recentActivity[progress.recentActivity.length - 1];
        if (lastItem && lastItem.status === 'running') {
          lastItem.status = 'error';
        }

        progress.recentActivity.push({
          id: randomUUID(),
          type: 'thought',
          content: `Error: ${errorMessage}`,
          status: 'error',
        });

        sendUpdate();

        return {
          status: 'failed' as const,
          description: task.description,
          error: errorMessage,
        };
      }
    });

    const results = await Promise.allSettled(taskPromises);

    let allFailed = true;
    let resultText = '## Task Results\n\n';

    results.forEach((res, index) => {
      if (res.status === 'fulfilled') {
        const data = res.value;
        if (data.status === 'success') {
          allFailed = false;
          resultText += `### Task ${index + 1}: ${data.description}\n`;
          resultText += `Status: Completed\n`;
          resultText += `Result:\n${data.output}\n\n`;
        } else {
          resultText += `### Task ${index + 1}: ${data.description}\n`;
          resultText += `Status: Failed\n`;
          resultText += `Error: ${data.error}\n\n`;
        }
      } else {
        // Unexpected rejection from executor/promise itself
        resultText += `### Task ${index + 1}: ${tasks[index].description}\n`;
        resultText += `Status: Failed\n`;
        const reason =
          res.reason instanceof Error ? res.reason.message : String(res.reason);
        resultText += `Error: ${reason}\n\n`;
      }
    });

    if (allFailed) {
      throw new Error('All sub-tasks failed.\n\n' + resultText);
    }

    return {
      llmContent: [{ text: resultText }],
      returnDisplay: Array.from(progressByTask.values()), // The UI will render these if it supports arrays
    };
  }
}

export class TaskTool extends BaseDeclarativeTool<TaskInput, ToolResult> {
  static readonly Name: string = TASK_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      TASK_TOOL_NAME,
      'Task',
      "Dispatch one or more independent sub-tasks to parallel sub-agents and return their combined results. Use this tool when a request can be split into logically independent units of work that do not depend on each other's outputs and would benefit from concurrent execution. Each sub-task is executed by a separate Gemini API call with access to the same built-in tools as the main agent. Do not use this for tasks that must be executed sequentially or that share state.",
      Kind.Execute,
      {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description:
              'An array of independent sub-tasks to execute in parallel. Each entry is a self-contained prompt ' +
              'that a sub-agent can complete independently.',
            items: {
              type: 'object',
              properties: {
                description: {
                  type: 'string',
                  description:
                    "A concise label for this sub-task, used in progress display (e.g., 'Analyze auth.ts').",
                },
                prompt: {
                  type: 'string',
                  description:
                    'The full, self-contained prompt for the sub-agent. Include all necessary context ' +
                    'because the sub-agent has no access to the parent conversation history.',
                },
              },
              required: ['description', 'prompt'],
            },
            minItems: 2,
            maxItems: 10,
          },
        },
        required: ['tasks'],
      },
      messageBus,
    );
  }

  protected override createInvocation(
    params: TaskInput,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<TaskInput, ToolResult> {
    return new TaskToolInvocation(
      this.context,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }

  override clone(messageBus: MessageBus): this {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return new TaskTool(this.context, messageBus) as this;
  }
}
