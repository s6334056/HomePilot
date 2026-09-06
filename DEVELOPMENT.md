# HomePilot Development Guide

This document describes the development philosophy, architecture, implementation history, development workflow, and lessons learned from building HomePilot.

このドキュメントでは、HomePilotの開発思想、アーキテクチャ、実装の歴史、開発手順、設計上の判断、そして開発を通じて得られた知見をまとめます。

---

# English

## 1. Purpose of This Document

`README.md` explains what HomePilot is.

`SETUP.md` explains how to prepare and run HomePilot.

This document explains:

- Why HomePilot was designed this way
- How the architecture evolved
- How the major development phases were implemented
- How ChatGPT, OpenCode, MiMo, and the human developer were used
- How implementation decisions were validated
- How the system should be extended in the future
- What lessons were learned during development

The goal is not to document every individual commit.

The goal is to preserve the **development knowledge behind HomePilot** so that the project can be understood and maintained years later.

---

# 2. Development Philosophy

HomePilot was developed as a personal project with a strong emphasis on:

- Zero-cost development where practical
- Reuse of free/open-source tools and services
- Small, incremental implementation steps
- Real-device validation
- Evidence-based API investigation
- AI-assisted development
- Keeping the architecture understandable
- Avoiding unnecessary complexity

The most important principle was:

> **Do not assume that something works. Verify it.**

This was especially important when working with:

- OpenCode APIs
- Cloudflare Workers
- EvenHub
- Even Realities G2 hardware
- Browser microphone APIs
- SSE
- Local LLMs

Documentation, generated API definitions, simulators, and AI suggestions were treated as references.

Actual runtime behavior was treated as the final authority.

---

# 3. The HomePilot Development Model

One of the most important outcomes of the project was the development workflow itself.

HomePilot was developed using three major roles.

```text
┌───────────────────────┐
│                  Human                       │
│                                              │
│  Goals / Decisions / Testing / Validation    │
└───────────┬───────────┘
                        │
                        ▼
┌───────────────────────┐
│                 ChatGPT                      │
│                                              │
│  Consultation / Investigation / Design       │
│  Architecture / Debugging / Review           │
└───────────┬───────────┘
                        │
                        ▼
┌───────────────────────┐
│              OpenCode / MiMo                 │
│                                              │
│  Implementation / Code Modification          │
│  Build Fixes / Refactoring                   │
└───────────────────────┘
```

The important point is that these roles were intentionally separated.

---

# 4. Human Developer Role

The human developer remains responsible for:

- Defining the desired behavior
- Deciding what should be built
- Choosing between alternatives
- Reviewing proposed designs
- Running commands
- Testing actual hardware
- Evaluating UX
- Confirming whether a fix actually works
- Deciding when a feature is complete

AI was not treated as the final authority.

The human developer remained the final decision maker.

This became particularly important for G2 development because simulator behavior and physical-device behavior were not always identical.

---

# 5. ChatGPT Role

ChatGPT was primarily used as:

- Consultation partner
- Investigation partner
- Architecture designer
- Specification writer
- Debugging partner
- Code reviewer
- Documentation assistant

In practice, a large part of the development process was:

```text
Problem
 ↓
Discuss with ChatGPT
 ↓
Investigate possible causes
 ↓
Design solution
 ↓
Define implementation requirements
 ↓
Create implementation prompt
 ↓
Give prompt to MiMo / OpenCode
 ↓
Review implementation
 ↓
Build / test
 ↓
Report actual result
 ↓
Continue discussion
```

ChatGPT was therefore used primarily for **thinking**, rather than directly modifying the repository.

---

# 6. OpenCode / MiMo Role

OpenCode, with MiMo used as the primary implementation-oriented AI, was used primarily as the coding agent.

Typical tasks included:

- Editing TypeScript
- Editing React components
- Implementing new services
- Modifying state management
- Fixing build errors
- Refactoring code
- Implementing G2 pages
- Implementing voice input
- Implementing state persistence
- Updating existing behavior according to specifications

The preferred workflow was to provide a detailed implementation specification rather than simply asking the coding agent to "make it work."

A good implementation request described:

1. Current behavior
2. Desired behavior
3. Exact constraints
4. Files/components likely involved
5. Behavior that must not change
6. Test cases
7. Acceptance criteria

This significantly reduced unintended changes.

---

# 7. Why the Role Separation Matters

AI coding agents are very good at implementing clearly defined requirements.

They are less reliable when the requirements themselves are ambiguous.

Therefore:

```text
Bad workflow:

"Please improve this."

Better workflow:

"Here is the current behavior.
Here is the desired behavior.
Here are the constraints.
Do not change these parts.
Implement only this scope.
These test cases must pass."
```

The development process therefore intentionally separated:

```text
Thinking / Design
        ↓
Specification
        ↓
Implementation
        ↓
Verification
```

This separation was one of the most useful lessons from HomePilot.

---

# 8. Zero-Cost Development Approach

HomePilot was designed and developed with a strong preference for free services and tools.

The development stack combines:

- GitHub
- React
- Vite
- TypeScript
- Tailwind CSS
- Cloudflare
- Cloudflare Workers
- Workers AI
- EvenHub
- OpenCode
- LM Studio
- Local LLMs
- AI-assisted development

The important point is not that every component is permanently free.

The important point is that the project demonstrated that a surprisingly capable multi-device AI application can be developed without requiring a conventional paid development stack.

The practical model was:

```text
Free / Open Source tools
        +
Free-tier cloud services
        +
Local PC resources
        +
AI-assisted development
        +
Human validation
        =
Low-cost personal AI system
```

---

# 9. Architecture Overview

The HomePilot architecture is divided into several layers.

```text
                     ┌──────────┐
                     │   PC Browser       │
                     └────┬─────┘
                               │
                     ┌────▼─────┐
                     │ Smartphone Browser │
                     └────┬─────┘
                               │
                     ┌────▼─────┐
                     │   Even Realities   │
                     │        G2          │
                     └────┬─────┘
                               │
                               ▼
                     ┌──────────┐
                     │ HomePilot Client   │
                     │ PWA / EvenHub      │
                     └────┬─────┘
                               │
                               ▼
                     ┌──────────┐
                     │ HomePilot Gateway  │
                     └───┬──┬───┘
                             │    │
                 ┌─────┘    └──────┐
                 ▼                              ▼
        ┌─────────┐            ┌─────────┐
        │ Home PC Files    │            │ OpenCode Server  │
        └─────────┘            └──┬──────┘
                                                │
                                                ▼
                                          ┌─────────┐
                                          │ Cloud / Local    │
                                          │      LLM         │
                                          └─────────┘
```

Voice input adds:

```text
PWA / G2
   ↓
Gateway
   ↓
Cloudflare Speech Worker
   ↓
Whisper
   ↓
Transcript
   ↓
Agent
```

---

# 10. Repository Structure

The major repository structure is:

```text
HomePilot/
├── explorer/
│   ├── cloudflare/
│   │   └── PWA
│   │
│   └── evenhub/
│       └── EvenHub / G2 application
│
├── gateway/
│   └── Local Gateway
│
├── launcher/
│   └── Windows startup orchestration
│
├── speech-worker/
│   └── Cloudflare speech transcription Worker
│
├── tools/
│   └── Development utilities
│
├── README.md
├── SETUP.md
└── DEVELOPMENT.md
```

The architecture deliberately separates:

- PWA
- G2
- Gateway
- Speech Worker
- Launcher

rather than putting everything into a single application.

---

# 11. PWA Architecture

The PWA is responsible for:

- Explorer UI
- File Viewer
- Agent UI
- Session List
- Agent Chat
- Responsive desktop/mobile layout
- Voice input
- Gateway communication
- Agent state presentation

The desktop layout evolved into:

```text
┌───────────┬───────────┐
│                      │                      │
│      Explorer        │        Agent         │
│                      │                      │
│                      │                      │
└───────────┴───────────┘
```

On smaller screens, the UI becomes a single-pane experience.

The breakpoint and pane sizing were tuned through actual use rather than being treated as purely theoretical responsive design.

---

# 12. G2 Architecture

The G2 application intentionally remains separate from the PWA.

This is important.

The G2 has very different interaction constraints:

- Tap
- Double Tap
- Long Press
- Limited display area
- Hardware microphone
- Different lifecycle behavior
- Different rendering constraints

Therefore, the G2 UI is not simply a "small PWA."

It is a dedicated client optimized for G2 interaction.

---

# 13. Why PWA and G2 Logic Are Not Fully Unified

Although PWA and G2 share concepts such as:

- Agent sessions
- Processing state
- Unread state
- Agent context
- Gateway
- OpenCode

their UI and lifecycle requirements are different.

Therefore the implementation intentionally keeps some state and behavior separate.

In particular:

```text
PWA Context
    ≠
G2 Context
```

and:

```text
PWA UI State
    ≠
G2 UI State
```

Shared semantics are preferred.

Forced code sharing is not.

---

# 14. Gateway Architecture

The Gateway is the local security and communication boundary.

It provides access to:

- Filesystem
- OpenCode
- Speech Worker

The Gateway runs locally on the home PC.

Typical flow:

```text
Remote Client
     ↓
Cloudflare / network path
     ↓
Gateway
     ↓
Local service
```

The Gateway is deliberately not designed as a general-purpose public API server.

Its purpose is to provide controlled access to the user's own environment.

---

# 15. OpenCode Integration

HomePilot uses OpenCode as the Agent execution layer.

The important design decision was:

> **Use the actual OpenCode server behavior as the implementation specification.**

During development, the `/doc` API description was found to be insufficiently reliable for blindly implementing HomePilot.

Therefore the following process was used:

```text
OpenCode documentation
        ↓
Candidate API
        ↓
Actual request
        ↓
Actual response
        ↓
Confirm behavior
        ↓
Implement HomePilot integration
```

This approach was especially important for:

- Session
- Message
- SSE
- Question
- Permission

handling.

---

# 16. OpenCode API Verification

The verified HomePilot integration includes:

```text
GET  /session
GET  /session/{sessionID}
GET  /session/{sessionID}/message

SSE

GET  /question
POST /question/{questionID}/reply

Permission APIs
POST /session/{sessionID}/permissions/{permissionID}
```

The exact set of endpoints should be revalidated when upgrading OpenCode.

HomePilot should not assume that an API remains unchanged forever.

---

# 17. SSE Design

SSE is used to receive Agent-side state updates.

Observed events included:

```text
question.replied
message.part.updated
message.part.delta
message.updated
session.status
session.idle
session.updated
session.diff
```

A typical Agent operation can look like:

```text
session.status: busy
        ↓
assistant message
        ↓
reasoning stream
        ↓
tool execution
        ↓
permission request
        ↓
permission reply
        ↓
tool completion
        ↓
assistant response
        ↓
session.idle
```

This event-driven model is used to update the HomePilot UI.

---

# 18. Permission and Question Handling

Agent operations may require user interaction.

For example:

```text
Agent
 ↓
Tool
 ↓
Permission required
 ↓
HomePilot UI
 ↓
User decision
 ↓
OpenCode
 ↓
Continue
```

Question handling follows a similar pattern.

These flows were tested against the actual OpenCode server rather than being implemented solely from API documentation.

---

# 19. Agent Context

One of the important HomePilot features is providing the Agent with context from the Explorer.

For example:

```text
Current directory
Selected item/file
Source screen
File content
```

The context flow is:

```text
Explorer / FileViewer
        ↓
AgentService
        ↓
Agent Context
        ↓
Agent UI
        ↓
sendMessage()
        ↓
AgentContextFormatter
        ↓
OpenCode
```

For the PWA, context is built as close as possible to the actual send operation.

This prevents stale context.

For G2, context handling is adapted to the G2 navigation lifecycle.

---

# 20. Live Context vs Snapshot Context

The PWA and G2 use different approaches because their interaction models differ.

### PWA

The PWA builds live context at send time.

This means the Agent receives the current:

- Explorer path
- Items
- Selected item
- File content
- Current screen

rather than relying on an old snapshot.

### G2

G2 uses context appropriate to its current page/navigation state and can rebuild live context when a voice message is confirmed.

This distinction prevents unnecessary coupling between the two clients.

---

# 21. Voice Input Architecture

PWA voice input uses:

```text
Browser microphone
      ↓
MediaRecorder
      ↓
Audio data
      ↓
Gateway
      ↓
Speech Worker
      ↓
Whisper
      ↓
Transcript
      ↓
Agent input
```

The user confirms the transcript before sending it to the Agent.

This was intentionally chosen instead of automatically sending every transcription.

---

# 22. G2 Voice Input

G2 voice input uses the EvenHub audio API.

The flow is:

```text
Idle
 ↓
Long Press
 ↓
Recording
 ↓
Release
 ↓
Transcribing
 ↓
Confirmation
 ↓
Tap → Send
or
Double Tap → Cancel
```

The G2 microphone provides:

- signed 16-bit PCM
- 16kHz
- mono

The application buffers audio chunks and sends them through the Gateway to the Speech Worker.

The G2 application requires the appropriate microphone permission.

---

# 23. G2 Navigation Design

G2 interaction is intentionally minimal.

### Agent Session List

```text
Tap
 ↓
Open Session
```

```text
Double Tap
 ↓
Return to previous Explorer/FileViewer
```

```text
Context Menu
 ↓
Return to previous Explorer/FileViewer
```

### Agent Chat

```text
Long Press
 ↓
Voice Input
```

```text
Double Tap
 ↓
Return to Session List
```

The design was created around the actual available G2 gestures rather than attempting to reproduce desktop/mobile interaction patterns.

---

# 24. G2 Page Lifecycle

The G2 implementation required explicit page lifecycle management.

Important concepts include:

```text
lastAgentPage
lastAgentSessionID
agentReturnPage
sessionListPage
modelSelectPage
```

The purpose is to remember where the user was and restore the appropriate Agent page when re-entering the Agent area.

This became necessary because the G2 application's lifecycle differs from a normal React browser application.

---

# 25. Processing State

HomePilot distinguishes:

```text
○ = processing
● = unread
(no symbol) = normal
```

Processing takes priority over unread.

Therefore:

```text
processing + unread
        ↓
       ○
```

rather than:

```text
       ●
```

The state is displayed immediately before the session title.

---

# 26. Persistent Processing State

Processing state must survive G2 shutdown.

The persistent state is stored using:

```text
localStorage
```

The key is:

```text
homepilot-processing-sessions
```

Each processing session records a start timestamp.

Entries older than the processing TTL are discarded.

This allows the following scenario:

```text
G2 sends Agent request
       ↓
○ processing
       ↓
G2 closes
       ↓
Agent continues
       ↓
G2 restarts
       ↓
processing state restored
```

The implementation intentionally does not clear persistent processing merely because the client disappeared.

The server may still be processing.

---

# 27. Unread State

Unread has a different semantic meaning.

It means:

> **A new Agent result exists after the user's last confirmed check.**

It does not mean:

> "G2 sent this request."

This distinction is important because Agent operations can originate from:

- G2
- PC
- Smartphone
- Other clients using the same HomePilot/OpenCode environment

The intended behavior is therefore:

```text
PC sends Agent request
       ↓
Agent completes
       ↓
G2 refresh
       ↓
● unread
```

---

# 28. Shared Unread Synchronization

PWA and G2 share the same last-checked concept.

The shared storage key is:

```text
homepilot-session-lastChecked
```

G2 does not rely solely on requests initiated by G2.

When refreshing the Session List:

```text
GET /session
       ↓
Candidate sessions
       ↓
GET /session/{id}/message
       ↓
Find latest assistant result
       ↓
Check completion time
       ↓
Compare with lastChecked
       ↓
Unread / Normal
```

`session.time.updated` is used as a candidate filter rather than as the final definition of unread.

This reduces unnecessary message API requests while avoiding the assumption that `time.updated` is a perfect unread indicator.

---

# 29. Processing and Unread Must Remain Separate

Although both are displayed in the Session List, their semantics are different.

### Processing

```text
Is the Agent operation still running?
```

### Unread

```text
Has a new completed Agent result appeared since the user last confirmed the session?
```

Therefore these states should not be merged into a single state variable.

This separation also makes recovery behavior much easier to reason about.

---

# 30. Phase Development History

HomePilot evolved through several major phases.

---

## Phase 0 — Foundation

Initial project foundation.

Goals included:

- Repository structure
- Explorer concept
- Basic PWA
- Initial local filesystem access
- Initial EvenHub integration

---

## Phase 1 — Gateway / Remote Access

The local Gateway was introduced.

Major concepts:

- Local filesystem access
- Gateway authentication
- Token handling
- Cloudflare Tunnel
- Remote PWA access

The result was a functional remote Explorer.

---

## Phase 2 — Agent Integration

OpenCode was integrated as the Agent backend.

Major capabilities:

- Session list
- New session
- Existing session
- Messages
- Agent responses
- Model selection
- SSE
- Permission handling
- Question handling

This phase established HomePilot as an Explorer + Agent system rather than only a remote file browser.

---

# 31. Phase 3 — Explorer × Agent Integration

Phase 3 was formally defined as:

> **Explorer × Agent 統合UI / レスポンシブUX再設計**

The goal was to make the PWA a complete Explorer + Agent experience.

---

## Phase 3-A

Major changes:

- Desktop two-pane layout
- Mobile single-pane layout
- Resizable panes
- Pane ordering
- Pane swap
- Responsive behavior

Desktop:

```text
Explorer | Agent
```

Mobile:

```text
Explorer
   ↓
Agent
```

---

## Phase 3-B

Major changes:

- UI reorganization
- Unified Settings modal
- Removal of duplicated Agent settings
- Removal of obsolete SessionService
- Live PWA Agent context
- Separation of PWA and G2 context handling

The PWA became substantially more coherent as a desktop/mobile application.

---

## Phase 3-C

Phase 3-C completed the remaining PWA Agent UX and state handling.

Major areas included:

- New Session → Model Select
- Session / Chat UX
- Explorer selection restoration
- Context specification
- Processing state
- Unread handling
- SSE / Agent state synchronization
- Date/time metadata
- Regression testing

Unread semantics were refined to mean:

> New Agent result requiring user confirmation after the user's last confirmed state.

This definition became the basis for both PWA and G2.

---

# 32. Phase 4 — Even Realities G2

Phase 4 focused on bringing the HomePilot experience to physical G2 hardware.

Major areas:

- G2 Explorer
- G2 File Viewer
- Agent Session List
- Model Select
- Agent Chat
- Navigation
- Processing state
- Processing recovery
- Voice input
- Live Agent context
- Persistent state
- External unread synchronization

The important lesson from Phase 4 was:

> **Simulator success does not guarantee hardware success.**

Several issues only became visible on the physical G2.

---

# 33. G2 Hardware Lessons

The G2 implementation revealed several hardware-specific behaviors.

Examples included:

- Page lifecycle differences
- Container rebuild behavior
- Gesture limitations
- Microphone behavior
- Audio format requirements
- Display limitations
- SDK initialization timing
- Navigation state persistence

One notable issue was caused by initialization order.

The original flow allowed Gateway initialization to interfere with G2 SDK initialization.

The solution was to initialize the G2 SDK independently and make Gateway initialization fault tolerant.

The general lesson:

> Hardware initialization should not depend unnecessarily on network/backend availability.

---

# 34. EvenHub SDK Lessons

The EvenHub SDK documentation is useful but should not be treated as the only source of truth.

The development approach was:

```text
Documentation
    ↓
Minimal implementation
    ↓
Simulator
    ↓
Physical G2
    ↓
Actual behavior
    ↓
Adjustment
```

The same evidence-based approach used for OpenCode was applied to G2.

---

# 35. Local LLM

Local LLM support was originally considered as an additional capability because cloud LLM usage may be limited by provider quotas.

The eventual architecture became:

```text
HomePilot
   ↓
Gateway
   ↓
OpenCode
   ↓
Local LLM
```

LM Studio can act as the local model server.

The launcher can optionally load a configured local model.

Local LLM support is therefore already part of the practical HomePilot environment.

However, Local LLM stability is highly dependent on the local model and hardware.

For that reason, Local LLM errors should be investigated separately from the HomePilot application itself.

---

# 36. Testing Philosophy

HomePilot uses multiple levels of testing.

```text
Build
 ↓
Local browser
 ↓
Simulator
 ↓
Smartphone
 ↓
Physical G2
 ↓
End-to-end usage
```

Each level catches different problems.

### Build

Finds:

- TypeScript errors
- Missing imports
- Invalid configuration
- Packaging problems

### Browser

Finds:

- UI problems
- API integration problems
- Explorer problems
- Agent problems

### Simulator

Finds:

- G2 UI behavior
- Navigation
- Gesture handling
- Page lifecycle logic

### Physical G2

Finds:

- Hardware behavior
- Microphone
- Lifecycle
- Real display constraints
- Real SDK behavior
- Network conditions

### Long-term real use

Finds:

- State synchronization problems
- Recovery problems
- Unread behavior
- Restart problems
- UX issues that are difficult to reproduce artificially

---

# 37. Regression Testing

HomePilot is a system intended to be used continuously.

Therefore regression testing is not necessarily a single final event.

The preferred approach is:

```text
Implement
 ↓
Test
 ↓
Use
 ↓
Discover issue
 ↓
Fix
 ↓
Test again
 ↓
Continue using
```

Especially for:

- G2
- Processing state
- Unread state
- Voice input
- SSE
- Local LLM

long-term real-world usage is valuable.

The final regression state should therefore be considered a **living validation process** rather than a single checkbox.

---

# 38. Recommended Change Workflow

When implementing a new feature:

## Step 1 — Define the problem

Write down:

```text
Current behavior
Desired behavior
Reason
```

---

## Step 2 — Investigate

Determine:

- Existing implementation
- Relevant files
- Existing state
- Existing APIs
- Existing constraints

Do not immediately modify code.

---

## Step 3 — Design

Decide:

- Architecture
- State ownership
- Data flow
- Error handling
- UI behavior
- Backward compatibility

---

## Step 4 — Specify

Create a precise implementation request for the coding agent.

Include:

```text
Goal
Current behavior
Desired behavior
Constraints
Files
Do not change
Test cases
Acceptance criteria
```

---

## Step 5 — Implement

Give the implementation specification to OpenCode / MiMo.

Allow the coding agent to modify the repository.

---

## Step 6 — Build

Run the appropriate build.

For example:

```powershell
npm run build
```

---

## Step 7 — Test

Start with the smallest relevant test.

Then test the complete flow.

---

## Step 8 — Report Actual Results

Do not say:

> "It should work."

Instead report:

```text
Build: PASS
Simulator: PASS
G2: PASS
Case 1: PASS
Case 2: FAIL
```

This makes the next design/debugging step much more precise.

---

# 39. How to Write Good AI Implementation Requests

A good prompt should minimize ambiguity.

Example structure:

```text
## Goal

Implement ...

## Current behavior

...

## Desired behavior

...

## Constraints

- Do not change ...
- Keep ...
- Do not refactor ...

## Implementation requirements

1. ...
2. ...
3. ...

## Test cases

1. ...
2. ...
3. ...

## Acceptance criteria

- ...
- ...
```

This format worked particularly well for HomePilot because many features interacted with existing state management.

---

# 40. Protecting Existing Behavior

One of the most important lessons was:

> **When fixing one state machine, explicitly protect the others.**

For example, Processing and Unread look related, but they have different meanings.

A change to unread detection must not accidentally change processing recovery.

Therefore implementation prompts should explicitly state:

```text
Do not change processing recovery.
Do not change processing persistence.
Do not merge processing and unread.
```

This style of constraint is especially important when working with AI coding agents.

---

# 41. Small Changes Are Easier to Verify

HomePilot evolved through relatively small implementation steps.

Instead of:

```text
"Rewrite the entire Agent system."
```

the preferred approach was:

```text
Implement one behavior.
 ↓
Build.
 ↓
Test.
 ↓
Commit.
 ↓
Next behavior.
```

This makes regressions easier to identify.

It also makes AI-generated changes easier to review.

---

# 42. Git Workflow

The repository uses Git for incremental development.

A typical workflow is:

```powershell
git status
git diff
npm run build
git add .
git commit -m "..."
git status
```

For larger features, intermediate commits provide useful recovery points.

Before asking an AI coding agent to make a significant change, it is useful to have a clean working tree.

This makes it much easier to identify exactly what the agent changed.

---

# 43. Commit Discipline

A commit should ideally represent one coherent change.

Good:

```text
Add G2 unread synchronization
```

Less useful:

```text
Fix stuff
```

The exact commit naming convention can vary.

The important point is that the commit should explain the conceptual change.

---

# 44. Debugging Strategy

When a problem occurs, avoid immediately rewriting the affected component.

Use:

```text
Reproduce
 ↓
Observe
 ↓
Identify boundary
 ↓
Inspect actual data
 ↓
Form hypothesis
 ↓
Minimal change
 ↓
Test
```

For distributed systems, identify where the failure occurs:

```text
UI
 ↓
Client
 ↓
Gateway
 ↓
OpenCode
 ↓
LLM
```

or:

```text
G2
 ↓
EvenHub
 ↓
PWA
 ↓
Gateway
 ↓
Speech Worker
```

This prevents debugging the wrong layer.

---

# 45. Local LLM Debugging

Local LLMs require special care.

A failure may originate from:

```text
HomePilot
Gateway
OpenCode
LM Studio
Model
Quantization
Hardware
Context size
```

Therefore the first question should be:

> "At which layer did the failure actually occur?"

Do not automatically attribute a Local LLM failure to HomePilot.

---

# 46. Documentation Philosophy

Documentation should be separated by purpose.

### README.md

Answer:

> What is HomePilot?

### SETUP.md

Answer:

> How do I install and run it?

### DEVELOPMENT.md

Answer:

> How was it built, and how should I continue developing it?

This separation avoids turning README into an enormous operational manual.

---

# 47. Future Documentation Maintenance

When changing the architecture, update the appropriate document.

### New feature

Usually:

```text
README.md
DEVELOPMENT.md
```

### New setup requirement

Usually:

```text
SETUP.md
```

### New development convention

Usually:

```text
DEVELOPMENT.md
```

### Major user-visible behavior

Consider updating:

```text
README.md
```

Do not duplicate the same information unnecessarily across all three documents.

---

# 48. Future Development Areas

The core HomePilot goals have been implemented.

Future work is therefore expected to be evolutionary rather than foundational.

Possible areas include:

- Better Local LLM reliability
- Additional local models
- Better Agent UX
- More robust offline/reconnection handling
- Additional G2 capabilities
- More advanced voice interaction
- Performance improvements
- UI polish
- Automated testing
- Better deployment automation
- Additional integrations

These should be treated as future extensions rather than unfinished core requirements.

---

# 49. Current Completion Criteria

HomePilot's original major goals can be considered achieved when the following work:

```text
Explorer
   ✓
Gateway
   ✓
Remote access
   ✓
Agent
   ✓
Sessions
   ✓
Messages
   ✓
SSE
   ✓
Permissions
   ✓
Questions
   ✓
Responsive PWA
   ✓
Voice input
   ✓
G2 Explorer
   ✓
G2 File Viewer
   ✓
G2 Agent
   ✓
G2 navigation
   ✓
G2 voice
   ✓
Processing recovery
   ✓
Unread synchronization
   ✓
External Agent result detection
   ✓
Local LLM integration
   ✓
```

The remaining work is primarily:

- Real-world regression testing
- Maintenance
- Documentation
- UX refinement
- Future extensions

---

# 50. Final Development Principle

The most important lesson from HomePilot is not a particular framework or API.

It is the development loop:

```text
Human defines the goal
        ↓
AI helps investigate and design
        ↓
AI coding agent implements
        ↓
Human builds and tests
        ↓
Real behavior provides evidence
        ↓
AI helps analyze the result
        ↓
Repeat
```

The AI does not replace the developer.

The developer does not have to manually write every line.

Instead:

> **Human judgment + AI reasoning + AI implementation + real-world verification**

forms a highly effective development loop.

This approach allowed HomePilot to grow from a simple Explorer concept into a multi-device Agent system spanning:

- PC
- Smartphone
- Even Realities G2
- Home PC filesystem
- Cloud services
- OpenCode
- Cloud LLM
- Local LLM
- Voice input

while keeping the development cost extremely low.

---

# 日本語

## 1. このドキュメントの目的

`README.md`では「HomePilotとは何か」を説明します。

`SETUP.md`では「HomePilotをどう準備して動かすか」を説明します。

この`DEVELOPMENT.md`では、

- なぜこの構成にしたのか
- アーキテクチャがどう変化してきたか
- 各Phaseで何を実装したか
- ChatGPT / OpenCode / MiMo / 人間をどう使い分けたか
- どうやって実装内容を検証したか
- 今後どう拡張していくか
- 開発を通じて何が分かったか

を記録します。

目的は、全commitの履歴をここに書き写すことではありません。

**「HomePilotをどういう考え方で作ってきたのか」**を将来の自分が理解できる状態にすることが目的です。

---

# 2. 開発思想

HomePilotでは、

- 可能な限りゼロ円
- Free / Open Sourceの積極利用
- 小さな単位での実装
- 実機による検証
- APIの実測
- AI支援開発
- 分かりやすいアーキテクチャ
- 不要な複雑化を避ける

を重視してきました。

最も重要だった原則は、

> **「動くはず」を「動いた」に変える。**

です。

特に、

- OpenCode API
- Cloudflare Workers
- EvenHub
- Even Realities G2
- Browser microphone
- SSE
- Local LLM

では、この考え方が非常に重要でした。

ドキュメント、生成AIの回答、Simulatorなどは参考情報。

**最終的な正解は実際の実行結果。**

という方針です。

---

# 3. HomePilotの開発方式

HomePilot開発で非常に大きな意味を持ったのが、AIの役割分担です。

```text
┌───────────────────────┐
│                  人間                        │
│                                              │
│  目的 / 判断 / テスト / 実機検証             │
└───────────┬───────────┘
                        │
                        ▼
┌───────────────────────┐
│                 ChatGPT                      │
│                                              │
│  相談 / 調査 / 設計 / 仕様化 / デバッグ      │
└───────────┬───────────┘
                        │
                        ▼
┌───────────────────────┐
│              OpenCode / MiMo                 │
│                                              │
│  実装 / コード変更 / Build修正 / Refactor    │
└───────────────────────┘
```

この役割分担は意図的なものです。

---

# 4. 人間の役割

最終的な責任は人間が持ちます。

担当するのは、

- 何を作るか決める
- 期待する動作を定義する
- 設計を選択する
- AIの提案を評価する
- コマンドを実行する
- 実機をテストする
- UXを判断する
- 本当に直ったか確認する
- 完成と判断する

といった部分です。

AIを最終決定者にはしません。

---

# 5. ChatGPTの役割

ChatGPTは主に、

- 相談役
- 検討役
- 調査役
- 設計役
- デバッグ相談役
- コードレビュー役
- ドキュメント作成役

として利用しました。

実際の開発では、

```text
問題発生
 ↓
ChatGPTと相談
 ↓
原因候補を調査
 ↓
解決方法を検討
 ↓
設計
 ↓
実装仕様を作成
 ↓
MiMoへ依頼
 ↓
実装確認
 ↓
Build / Test
 ↓
実測結果を確認
 ↓
再度相談
```

という流れが中心でした。

つまりChatGPTは、**コードを書くことよりも「考えること」**に使っています。

---

# 6. OpenCode / MiMoの役割

OpenCodeとMiMoは主に実装担当です。

担当した作業は、

- TypeScript編集
- Reactコンポーネント実装
- Service実装
- State管理変更
- Build Error修正
- Refactoring
- G2 Page実装
- Voice Input実装
- Persistent State実装
- 既存機能を維持した上での仕様変更

などです。

特に、

> 「動くようにして」

ではなく、

> 「現在こう動いている。こうしたい。ただしここは絶対に変えるな」

という形で実装を依頼することを重視しました。

---

# 7. なぜ役割分担するのか

AI Coding Agentは、

**明確な仕様を実装すること**

には非常に強いです。

一方で、

**仕様そのものが曖昧な状態**

では意図しない変更が発生しやすくなります。

そのため、

```text
悪い例：

「いい感じに改善して」
```

ではなく、

```text
良い例：

現在の動作
 ↓
期待する動作
 ↓
制約
 ↓
変更してはいけないもの
 ↓
実装内容
 ↓
テストケース
 ↓
完了条件
```

という形にします。

HomePilotでは、この方式がかなり有効でした。

---

# 8. ゼロ円開発

HomePilotでは可能な限り無料のツール・サービスを利用しました。

主な構成：

- GitHub
- React
- Vite
- TypeScript
- Tailwind CSS
- Cloudflare
- Cloudflare Workers
- Workers AI
- EvenHub
- OpenCode
- LM Studio
- Local LLM
- AI支援開発

重要なのは、

> 「すべて永久無料」

という意味ではありません。

むしろ、

> **無料 / OSS / Free Tier / 手元のPC / AIを組み合わせれば、かなり本格的なシステムを低コストで作れる**

ことを実証できたことに意味があります。

```text
無料 / OSS
    +
Free Tier
    +
手元PC
    +
AI支援
    +
人間による検証
    =
低コストな個人AIシステム
```

---

# 9. 全体アーキテクチャ

HomePilotは大きく以下の構成です。

```text
                     ┌──────────┐
                     │   PC Browser       │
                     └────┬─────┘
                               │
                     ┌────▼─────┐
                     │ Smartphone Browser │
                     └────┬─────┘
                               │
                     ┌────▼─────┐
                     │   Even Realities   │
                     │        G2          │
                     └────┬─────┘
                               │
                               ▼
                     ┌──────────┐
                     │ HomePilot Client   │
                     │ PWA / EvenHub      │
                     └────┬─────┘
                               │
                               ▼
                     ┌──────────┐
                     │ HomePilot Gateway  │
                     └───┬──┬───┘
                             │    │
                 ┌─────┘    └──────┐
                 ▼                              ▼
        ┌─────────┐            ┌─────────┐
        │ Home PC Files    │            │ OpenCode Server  │
        └─────────┘            └──┬──────┘
                                                │
                                                ▼
                                          ┌─────────┐
                                          │ Cloud / Local    │
                                          │      LLM         │
                                          └─────────┘
```

音声入力：

```text
PWA / G2
   ↓
Gateway
   ↓
Cloudflare Speech Worker
   ↓
Whisper
   ↓
文字起こし
   ↓
Agent
```

---

# 10. Repository構成

主要構成：

```text
HomePilot/
├── explorer/
│   ├── cloudflare/
│   │   └── PWA
│   │
│   └── evenhub/
│       └── EvenHub / G2
│
├── gateway/
│   └── Local Gateway
│
├── launcher/
│   └── Windows起動制御
│
├── speech-worker/
│   └── Speech Worker
│
├── tools/
│   └── 開発ツール
│
├── README.md
├── SETUP.md
└── DEVELOPMENT.md
```

PWA、G2、Gateway、Speech Worker、Launcherをそれぞれ分離しています。

---

# 11. PWA

PWAは、

- Explorer
- File Viewer
- Agent
- Session List
- Agent Chat
- PC/Mobile Responsive UI
- Voice Input
- Gateway通信
- Agent State表示

を担当します。

Desktop：

```text
Explorer | Agent
```

Mobile：

```text
Explorer
   ↓
Agent
```

という構成です。

---

# 12. G2

G2側はPWAとは意図的に分離しています。

G2には、

- Tap
- Double Tap
- Long Press
- 狭い表示領域
- Hardware Microphone
- 独自Lifecycle
- 独自描画制約

があります。

そのため、

> G2 = 小さくしたPWA

ではありません。

**G2専用Client**

として設計しています。

---

# 13. PWAとG2を完全共通化しない理由

PWAとG2では、

- Agent Session
- Processing
- Unread
- Agent Context
- Gateway
- OpenCode

など共通する概念があります。

しかし、

```text
PWAのUI State
    ≠
G2のUI State
```

です。

また、

```text
PWA Context
    ≠
G2 Context
```

でもあります。

そのため、

> **意味は共通化するが、実装まで無理に共通化しない**

という方針です。

---

# 14. Gateway

GatewayはHomePilotのローカル側の境界です。

担当：

- Filesystem
- OpenCode
- Speech Worker

へのアクセス仲介。

基本的には、

```text
Remote Client
     ↓
Network / Cloudflare
     ↓
Gateway
     ↓
Local Service
```

です。

Gatewayは一般公開用APIサーバーではありません。

あくまで、

> **自分のPC環境へ安全にアクセスするための個人用Gateway**

です。

---

# 15. OpenCode連携

HomePilotではOpenCodeをAgent実行基盤として利用しています。

ここで非常に重要だったのが、

> **OpenCodeの実際の動作を基準にする**

という方針です。

開発当初、

```text
/docに書いてある
 ↓
そのまま実装
```

とはせず、

```text
ドキュメント
 ↓
候補API
 ↓
実際にHTTP Request
 ↓
Response確認
 ↓
動作確定
 ↓
HomePilot実装
```

としました。

---

# 16. OpenCode API実測

HomePilotで確認した主要API：

```text
GET  /session
GET  /session/{sessionID}
GET  /session/{sessionID}/message

SSE

GET  /question
POST /question/{questionID}/reply

Permission API
POST /session/{sessionID}/permissions/{permissionID}
```

OpenCodeをアップデートした場合は、これらの動作を再確認する必要があります。

---

# 17. SSE

Agent状態更新にはSSEを利用しています。

確認したイベント例：

```text
question.replied
message.part.updated
message.part.delta
message.updated
session.status
session.idle
session.updated
session.diff
```

典型的には、

```text
session.status: busy
 ↓
assistant message
 ↓
reasoning
 ↓
tool
 ↓
permission
 ↓
permission reply
 ↓
tool complete
 ↓
assistant response
 ↓
session.idle
```

という流れになります。

---

# 18. Permission / Question

Agentが処理途中でユーザー判断を必要とする場合があります。

例えば、

```text
Agent
 ↓
Tool
 ↓
Permission required
 ↓
HomePilot
 ↓
User decision
 ↓
OpenCode
 ↓
Continue
```

となります。

Questionも同様です。

これらもOpenCode実機で動作確認した上で実装しました。

---

# 19. Agent Context

ExplorerからAgentへ、

- Current directory
- Selected item/file
- Source screen
- File content

などのContextを渡します。

基本的な流れ：

```text
Explorer / FileViewer
        ↓
AgentService
        ↓
Agent Context
        ↓
Agent UI
        ↓
sendMessage()
        ↓
AgentContextFormatter
        ↓
OpenCode
```

---

# 20. Live Context

PWAでは送信時点でLive Contextを構築します。

つまり、

- 現在のExplorer path
- Items
- Selected item
- File content
- Current screen

などを、できるだけ最新状態で取得します。

古いSnapshotをAgentへ送らないことが目的です。

G2ではG2のNavigation Lifecycleに合わせたContext管理を行い、Voice送信確認時などにはLive Contextを再構築します。

---

# 21. Voice Input

PWA：

```text
Browser Microphone
      ↓
MediaRecorder
      ↓
Audio
      ↓
Gateway
      ↓
Speech Worker
      ↓
Whisper
      ↓
Transcript
      ↓
Agent Input
```

文字起こし結果を即送信するのではなく、

> **ユーザーが確認してから送信**

する設計にしています。

---

# 22. G2 Voice

G2ではEvenHub Audio APIを利用します。

```text
Idle
 ↓
Long Press
 ↓
Recording
 ↓
Release
 ↓
Transcribing
 ↓
Confirmation
 ↓
Tap → Send
or
Double Tap → Cancel
```

G2から取得するPCMは、

- signed 16-bit
- 16kHz
- mono

です。

---

# 23. G2 Navigation

### Agent Session List

```text
Tap
 ↓
Session Open
```

```text
Double Tap
 ↓
前のExplorer/FileViewerへ戻る
```

```text
Context Menu
 ↓
前のExplorer/FileViewerへ戻る
```

### Agent Chat

```text
Long Press
 ↓
Voice Input
```

```text
Double Tap
 ↓
Session List
```

G2で使える操作に合わせて設計しています。

---

# 24. G2 Lifecycle

G2ではPage Lifecycleを明示的に管理する必要がありました。

代表的な状態：

```text
lastAgentPage
lastAgentSessionID
agentReturnPage
sessionListPage
modelSelectPage
```

これにより、Agentへ再入場した際に、

> 「前回どこにいたか」

を復元できます。

---

# 25. Processing

Session Listでは、

```text
○ = processing
● = unread
何もなし = normal
```

としています。

Processingを優先します。

つまり、

```text
processing + unread
        ↓
       ○
```

です。

---

# 26. Processingの永続化

G2が終了してもProcessing状態を失わないよう、

```text
localStorage
```

を利用しています。

Key：

```text
homepilot-processing-sessions
```

Processing開始時刻も保存します。

そのため、

```text
G2送信
 ↓
○ processing
 ↓
G2終了
 ↓
Agent処理継続
 ↓
G2再起動
 ↓
processing復元
```

が可能です。

G2が終了したからといって、Server側のAgent処理が終了したとは限りません。

そのため、Client終了だけを理由にPersistent Processingを消さない設計にしています。

---

# 27. Unread

Unreadの意味は、

> **ユーザーが最後に確認した時点より後に、新しいAgent結果が存在すること**

です。

つまり、

> 「G2から送信された」

ではありません。

PC、スマートフォン、G2など、どこからAgentを実行しても同じ意味になります。

```text
PC
 ↓
Agent
 ↓
完了
 ↓
G2 Refresh
 ↓
● unread
```

となります。

---

# 28. Unread同期

PWAとG2では、

```text
homepilot-session-lastChecked
```

を共有します。

G2のSession List Refresh時には、

```text
GET /session
 ↓
候補Session抽出
 ↓
GET /session/{id}/message
 ↓
最新Agent結果確認
 ↓
完了時刻確認
 ↓
lastCheckedと比較
 ↓
Unread判定
```

という流れです。

`session.time.updated`は最終判定ではなく、

> **候補を絞るためのシグナル**

として利用しています。

---

# 29. ProcessingとUnreadは別物

両方ともSession Listに表示されますが、意味は違います。

### Processing

```text
Agent処理はまだ動いているか？
```

### Unread

```text
最後に確認した後に新しい完了Agent結果があるか？
```

したがって、

```text
processingSessionIDs
```

と、

```text
unreadSessionIDs
```

は分離しています。

---

# 30. Phase履歴

HomePilotは大きく複数Phaseに分けて開発しました。

---

## Phase 0 — Foundation

基礎構築。

主な内容：

- Repository構成
- Explorer
- PWA
- Local Filesystem
- EvenHub初期導入

---

## Phase 1 — Gateway / Remote Access

Gatewayを導入。

主な内容：

- Local Filesystem Access
- Gateway Authentication
- Token
- Cloudflare Tunnel
- Remote PWA

これにより、

> 自宅PCのファイルを外部端末から扱う

という基本目的を実現しました。

---

# 31. Phase 2 — Agent Integration

OpenCodeをAgent基盤として導入。

主な機能：

- Session List
- New Session
- Existing Session
- Messages
- Agent Response
- Model Selection
- SSE
- Permission
- Question

このPhaseによってHomePilotは、

> Explorer + Agent

というシステムになりました。

---

# 32. Phase 3 — Explorer × Agent Integration

正式名称：

> **Explorer × Agent 統合UI / レスポンシブUX再設計**

目的は、

> PC / Smartphoneで完成度の高いExplorer + Agent環境を作る

ことでした。

---

## Phase 3-A

- Desktop 2-pane
- Mobile 1-pane
- Resizable Pane
- Pane Order
- Pane Swap
- Responsive UI

Desktop：

```text
Explorer | Agent
```

Mobile：

```text
Explorer
   ↓
Agent
```

---

## Phase 3-B

- UI再編
- Settings統合
- Agent Settings整理
- 不要なSessionService削除
- PWA Live Context
- PWA / G2 Context分離

PWAとしてのExplorer + Agent UXが大きく整理されました。

---

## Phase 3-C

PWA Agent UXの仕上げ。

主な内容：

- New Session → Model Select
- Session / Chat UX
- Explorer Selection Restore
- Context仕様
- Processing
- Unread
- SSE / Agent State Sync
- Date / Time
- Regression

Unreadについて、

> **最後に確認した後に新しいAgent結果があればUnread**

という正式な意味付けが行われました。

この仕様が後のG2にも引き継がれています。

---

# 33. Phase 4 — Even Realities G2

G2実機への本格対応。

主な内容：

- G2 Explorer
- G2 File Viewer
- Agent Session List
- Model Select
- Agent Chat
- Navigation
- Processing
- Processing Recovery
- Voice Input
- Live Context
- Persistent State
- External Unread Synchronization

Phase 4で特に重要だったのは、

> **Simulatorで動いても、G2実機で動くとは限らない**

ということでした。

---

# 34. G2実機から得た知見

G2実装では、

- Page Lifecycle
- Container rebuild
- Gesture
- Microphone
- Audio Format
- Display
- SDK Initialization
- Navigation
- Network

など、Simulatorだけでは見えない問題が発生しました。

特に、

> Gateway initializationがG2 SDK initializationに影響する

という問題がありました。

これに対して、

```text
G2 SDK Initialization
        ↓
Gateway Initialization
```

と依存関係を分離し、

Gateway側もFault Tolerantにすることで解決しました。

一般化すると、

> **Hardware initializationをBackend availabilityに依存させない**

ことが重要でした。

---

# 35. EvenHub SDKから得た知見

EvenHub SDKについても、

```text
Documentation
 ↓
Minimal Implementation
 ↓
Simulator
 ↓
Real G2
 ↓
Actual Behavior
 ↓
Adjustment
```

という流れで確認しました。

OpenCode APIと同様、

> **Documentationより実測**

を重視しています。

---

# 36. Local LLM

当初は、

```text
OpenCode Cloud LLM
 ↓
利用制限
 ↓
Local LLMも使いたい
```

というところからLocal LLM対応を検討しました。

最終的な構成は、

```text
HomePilot
   ↓
Gateway
   ↓
OpenCode
   ↓
Local LLM
```

です。

LM StudioをLocal Model Serverとして利用できます。

LauncherからLocal ModelのLoadも可能です。

ただしLocal LLMの安定性は、

- Model
- Quantization
- Hardware
- RAM
- Context Size
- Backend
- LM Studio設定

などに大きく依存します。

したがって、

> Local LLMで発生したエラー = HomePilotのエラー

とは限りません。

---

# 37. テスト思想

HomePilotでは複数段階でテストします。

```text
Build
 ↓
Browser
 ↓
Simulator
 ↓
Smartphone
 ↓
Physical G2
 ↓
Real-world usage
```

それぞれ役割が違います。

### Build

- TypeScript
- Import
- Configuration
- Packaging

### Browser

- UI
- API
- Explorer
- Agent

### Simulator

- G2 UI
- Navigation
- Gesture
- Lifecycle

### Real G2

- Hardware
- Microphone
- Lifecycle
- Display
- SDK
- Network

### 実運用

- State Sync
- Restart
- Unread
- Processing Recovery
- UX
- Local LLM

---

# 38. Regression

HomePilotは継続的に使うシステムです。

そのためRegression Testは、

> 「最後に一度だけやるもの」

ではありません。

```text
実装
 ↓
Test
 ↓
使用
 ↓
問題発見
 ↓
修正
 ↓
Test
 ↓
使用
```

を繰り返します。

特に、

- G2
- Processing
- Unread
- Voice
- SSE
- Local LLM

は実際に使い続けることで見つかる問題があります。

したがって最終Regressionは、

> **一回の完了イベントではなく、継続的な実運用確認**

として扱います。

---

# 39. 新機能実装時の基本フロー

## Step 1 — 問題定義

```text
現在どうなっているか
 ↓
どうしたいか
 ↓
なぜ必要か
```

---

## Step 2 — 調査

確認：

- Existing implementation
- Relevant files
- State
- API
- Constraints

いきなりコードを書き換えません。

---

## Step 3 — 設計

決める：

- Architecture
- State ownership
- Data flow
- Error handling
- UI
- Compatibility

---

## Step 4 — 仕様化

MiMoへ渡すImplementation Promptを作ります。

含めるもの：

```text
Goal
Current behavior
Desired behavior
Constraints
Files
Do not change
Test cases
Acceptance criteria
```

---

## Step 5 — 実装

OpenCode / MiMoに実装を依頼します。

---

## Step 6 — Build

```powershell
npm run build
```

などを実行。

---

## Step 7 — Test

最小のテストから始めて、最後にEnd-to-Endを確認します。

---

## Step 8 — 実測結果を報告

重要なのは、

> 「動くはず」

ではなく、

```text
Build: PASS
Simulator: PASS
G2: PASS
Case 1: PASS
Case 2: FAIL
```

のように**実際の結果を返すこと**です。

---

# 40. AIへの実装依頼の書き方

基本形：

```text
## Goal

何を実装するか

## Current behavior

現在どうなっているか

## Desired behavior

どうしたいか

## Constraints

- 変更禁止
- 維持する仕様
- Refactor禁止など

## Implementation requirements

1. ...
2. ...
3. ...

## Test cases

1. ...
2. ...
3. ...

## Acceptance criteria

- ...
- ...
```

この形式はHomePilotでかなり有効でした。

---

# 41. 既存機能を守る

特に重要だった教訓：

> **一つのState Machineを変更するとき、他のState Machineを明示的に保護する。**

例えば、

ProcessingとUnreadは似ていますが別物です。

そのためUnread変更時には、

```text
Processing recoveryを変更しない
Processing persistenceを変更しない
ProcessingとUnreadを統合しない
```

と明示します。

AI Coding Agentを使う場合、このような制約を書くことが非常に重要です。

---

# 42. 小さく変更する

HomePilotは、

```text
巨大な変更
 ↓
全部確認
```

ではなく、

```text
小さな機能
 ↓
Build
 ↓
Test
 ↓
Commit
 ↓
次の機能
```

という進め方を基本としました。

これにより、

- Regression原因が分かりやすい
- AI変更のレビューがしやすい
- 問題を切り分けやすい

というメリットがあります。

---

# 43. Git Workflow

基本：

```powershell
git status
git diff
npm run build
git add .
git commit -m "..."
git status
```

大きな変更の前にはWorking TreeをCleanにしておくと、AIが何を変更したのか分かりやすくなります。

---

# 44. Commit

1つのCommitには、なるべく1つの意味を持たせます。

良い例：

```text
Add G2 unread synchronization
```

悪い例：

```text
Fix stuff
```

厳密な命名規則よりも、

> **「このCommitで何が変わったのか分かる」**

ことが重要です。

---

# 45. Debugging

問題が発生したら、いきなり大改修しません。

```text
再現
 ↓
観察
 ↓
境界を特定
 ↓
実データ確認
 ↓
仮説
 ↓
最小修正
 ↓
Test
```

特に複数サービスが絡む場合、

```text
UI
 ↓
Client
 ↓
Gateway
 ↓
OpenCode
 ↓
LLM
```

のどこで壊れているかを切り分けます。

Voiceなら、

```text
G2
 ↓
EvenHub
 ↓
PWA
 ↓
Gateway
 ↓
Speech Worker
```

です。

---

# 46. Local LLM Debugging

Local LLMでは、

```text
HomePilot
Gateway
OpenCode
LM Studio
Model
Quantization
Hardware
Context
```

のどこで問題が起きているかを切り分けます。

まず、

> **どのLayerで失敗したか？**

を確認します。

---

# 47. ドキュメント方針

3つのドキュメントを役割分担します。

### README.md

> HomePilotって何？

### SETUP.md

> どうやって動かす？

### DEVELOPMENT.md

> どうやって作った？どうやって今後開発する？

これによりREADMEが巨大な運用マニュアルになることを防ぎます。

---

# 48. 今後のドキュメント更新

### 新機能

```text
README.md
DEVELOPMENT.md
```

### セットアップ変更

```text
SETUP.md
```

### 開発ルール変更

```text
DEVELOPMENT.md
```

### 大きなユーザー向け機能変更

必要に応じて、

```text
README.md
```

も更新します。

同じ内容を3ファイルに重複して書かないことを基本とします。

---

# 49. 今後の拡張

HomePilotの当初の主要ゴールはほぼ達成しています。

今後は基盤を作り直すというより、発展・改善が中心です。

候補：

- Local LLM安定性向上
- Local Model追加
- Agent UX改善
- Offline / Reconnection改善
- G2機能追加
- Voice Interaction高度化
- Performance改善
- UI Polish
- Automated Test
- Deployment Automation
- 外部Integration追加

これらは、

> **未完成の必須機能**

ではなく、

> **今後の拡張候補**

として扱います。

---

# 50. 現在の完成基準

HomePilotの主要ゴールは、以下が動作することをもって達成とします。

```text
Explorer
   ✓
Gateway
   ✓
Remote access
   ✓
Agent
   ✓
Sessions
   ✓
Messages
   ✓
SSE
   ✓
Permissions
   ✓
Questions
   ✓
Responsive PWA
   ✓
Voice Input
   ✓
G2 Explorer
   ✓
G2 File Viewer
   ✓
G2 Agent
   ✓
G2 Navigation
   ✓
G2 Voice
   ✓
Processing Recovery
   ✓
Unread Synchronization
   ✓
External Agent Result Detection
   ✓
Local LLM Integration
   ✓
```

今後残るのは主に、

- 実運用Regression
- Maintenance
- Documentation
- UX改善
- Future Extensions

です。

---

# 51. 最後に

HomePilot開発で最も重要だったのは、特定のFrameworkやAPIではありません。

一番重要だったのは、

```text
人間が目的を決める
        ↓
AIと相談・調査する
        ↓
AIと設計する
        ↓
AI Coding Agentが実装する
        ↓
人間がBuild / Testする
        ↓
実際の結果を確認する
        ↓
AIと分析する
        ↓
また繰り返す
```

という開発ループです。

AIがDeveloperを完全に置き換えるわけではありません。

逆に、Developerがすべてのコードを手で書く必要もありません。

```text
人間の判断
    +
AIの思考支援
    +
AIによる実装
    +
実環境での検証
```

という組み合わせによって、

- PC
- Smartphone
- Even Realities G2
- Home PC Filesystem
- Cloud Services
- OpenCode
- Cloud LLM
- Local LLM
- Voice Input

まで含むシステムを、非常に低コストで構築できました。

HomePilotは、この開発方式そのものを実証するプロジェクトでもあります。


