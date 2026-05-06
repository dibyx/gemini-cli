# Task Tool

The Task tool (`Task`) is a built-in agent capability in Gemini CLI that allows for parallel execution of independent sub-tasks. It solves the performance limitations of strictly sequential tool calls by dispatching multiple sub-agents to work concurrently using `Promise.allSettled`.

## When to use it

Use the Task tool when a complex user request can be split into logically independent units of work that do not depend on each other's outputs. For example:
- Searching multiple files for a pattern and summarizing each independently.
- Running several shell commands where order doesn't matter.
- Fetching and parsing data from multiple disparate sources simultaneously.

## Constraints

- **Input limits**: Must dispatch a minimum of 2 tasks and a maximum of 10 tasks in a single invocation.
- **Independence**: Sub-agents do not share conversation history. Each prompt provided in the tasks array MUST be entirely self-contained. Include all necessary context, filenames, background logic, and specific questions in each task's prompt.
- **Recursion**: To prevent infinite recursion, sub-agents spawned by the Task tool are not given access to the Task tool itself.
- **Failure tolerance**: If a single task fails, the other tasks continue to execute. The parent agent will receive a compiled summary detailing which tasks succeeded and which failed, including any associated error messages.

## Example Usage

When prompted to analyze several disparate files, the agent might decide to parallelize the job:

```json
{
  "name": "Task",
  "args": {
    "tasks": [
      {
        "description": "Analyze file auth.ts",
        "prompt": "Read the file auth.ts and summarize any security concerns. Output only the summary."
      },
      {
        "description": "Analyze file database.ts",
        "prompt": "Read the file database.ts and summarize its schema operations. Output only the summary."
      },
      {
        "description": "Analyze file router.ts",
        "prompt": "Read the file router.ts and summarize all API endpoints exposed. Output only the summary."
      }
    ]
  }
}
```

The parent agent receives a combined output detailing the results or errors from each of these sub-agent executions.
