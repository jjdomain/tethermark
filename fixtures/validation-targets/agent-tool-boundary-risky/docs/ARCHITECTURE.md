# Architecture

System overview:

- user input reaches a tool-using agent
- the agent can request shell-backed tools
- command policy enforcement is not clearly implemented

Trust boundaries:

- user to model
- model to tool runner
- tool runner to host shell

Threat model questions:

- can prompt injection trigger unauthorized tool execution
- are command allowlists enforced server-side
- can credential-like data leak into transcripts or logs
