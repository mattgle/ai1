# Local workflow states

These names describe local backlog states. They do not authorize remote label
creation or changes to an issue tracker.

| State | Meaning |
| --- | --- |
| `needs-triage` | Evaluate the report and establish a reproduction. |
| `needs-info` | Wait for required information from the reporter. |
| `ready-for-agent` | The task has enough detail for an agent to implement it. |
| `ready-for-human` | The task requires human implementation. |
| `wontfix` | The owner decides not to implement the change. |

Record test results separately. A workflow state does not prove that a fix works.
