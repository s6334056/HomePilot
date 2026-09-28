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
- How ChatGPT, Kilo, OpenCode, MiMo, and the human developer were used
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
- Local LLMs

Documentation, generated API definitions, simulators, and AI suggestions were treated as references.

Actual runtime behavior was treated as the final authority.

---

# 3. The HomePilot Development Model

One of the most important outcomes of the project was the development workflow itself.

HomePilot was developed using three major roles.

```text
┌─────────────────────────────────────────────┐
│                  Human                      │
│                                             │
│  Goals / Decisions / Testing / Validation  │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 ChatGPT                     │
│                                             │
│  Consultation / Investigation / Design     │
│  Architecture / Debugging / Review         │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 Kilo                        │
│                                             │
│  Implementation / Code Modification         │
│  Test and Build Support / Debugging         │
└─────────────────────────────────────────────┘
```

The important point is that these roles were intentionally separated.

Note that the Kilo box above is the coding agent used to develop this repository. It is
unrelated to the OpenCode server that HomePilot itself runs on; see
[Section 6](#6-coding-agent-role).

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
- Committing and pushing changes
- Deployment

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
Give prompt to Kilo
  ↓
Review implementation
  ↓
Human builds / tests
  ↓
Human verifies on the real device
  ↓
Human commits / pushes
  ↓
Report actual result
  ↓
Continue discussion
```

ChatGPT was therefore used primarily for **thinking**, rather than directly modifying the repository.

---

# 6. Coding Agent Role

Kilo is the current main coding agent for developing this repository.

Typical tasks include:

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
- Running tests and builds, and investigating failures

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

## OpenCode and MiMo, historically

OpenCode and MiMo were the main coding agents during the earlier phases of the project.
The techniques recorded in this document — the API verification, the specification-first
prompts, the review step — were developed while working with them and still apply to Kilo.

Kilo replaced them as the main coding agent. They were not removed from the system, because
OpenCode is still used by HomePilot itself: it is the Agent execution layer that HomePilot
talks to at runtime, through the Gateway, in order to run an Agent session. The OpenCode API
investigation and integration work documented in [Section 16](#16-opencode-api-verification)
and the following sections is therefore still current, not historical.

The two must not be confused:

```text
Coding agent for developing this repository  →  Kilo
Agent execution layer inside HomePilot       →  OpenCode
```

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
                     ┌───────────────────┐
                     │   PC Browser      │
                     └─────────┬─────────┘
                               │
                     ┌─────────▼─────────┐
                     │ Smartphone Browser│
                     └─────────┬─────────┘
                               │
                     ┌─────────▼─────────┐
                     │   Even Realities  │
                     │        G2         │
                     └─────────┬─────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ HomePilot Client  │
                     │ PWA / EvenHub     │
                     └─────────┬─────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ HomePilot Gateway │
                     └───────┬─────┬─────┘
                             │     │
                 ┌───────────┘     └────────────┐
                 ▼                              ▼
        ┌─────────────────┐            ┌─────────────────┐
        │ Home PC Files   │            │ OpenCode Server │
        └─────────────────┘            └────────┬────────┘
                                                │
                                                ▼
                                        ┌─────────────────┐
                                        │ Cloud / Local   │
                                        │      LLM        │
                                        └─────────────────┘
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
┌──────────────────────┬─────────────────────┐
│                      │                     │
│      Explorer        │        Agent        │
│                      │                     │
│                      │                     │
└──────────────────────┴─────────────────────┘
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

POST /session/{sessionID}/message

GET  /question
POST /question/{questionID}/reply

Permission APIs
POST /session/{sessionID}/permissions/{permissionID}
```

The exact set of endpoints should be revalidated when upgrading OpenCode.

HomePilot should not assume that an API remains unchanged forever.

---

# 17. Agent State Update Method (Historical SSE Investigation)

> **Historical.** The SSE-based event model described in this section was investigated and
> implemented during an earlier phase. HomePilot does **not** use SSE today. It is kept
> because the API investigation itself is still valuable, and because it explains why the
> current fetch-based design looks the way it does.

## What was investigated

SSE was explored as the way to receive Agent-side state updates. The events that were
observed on the OpenCode server were:

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

The Agent operation they described looked like this:

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

## What HomePilot does now

The current implementation does not open a streaming connection. Agent state is read
through the ordinary REST endpoints listed in
[Section 16](#16-opencode-api-verification):

```text
POST /session/{sessionID}/message   → send, then GET the message list
GET  /session/{sessionID}/message   → read the current state
GET  /question                       → read pending questions
```

In the PWA, `useOpenCode` sends the message and then fetches the authoritative message
state with a single `getMessages()` call, clearing the Processing flag once the last
assistant message has `finish === 'stop'`. In the G2, `g2-agent-controller` reads the same
message list when it rebuilds Processing and Unread state, and decides completion from the
last message in the list.

The result is a request/response model rather than a streaming one. The Processing and
Unread states described in this document are still accurate; what drives them is a fetch
of current state, not a push.

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

The same pattern was later applied to History, which added:

```text
historyReturnPage
historyPage
```

`historyReturnPage` records where History was opened from, so Double Tap can go back
there. When History was entered at startup there is no such page, and Double Tap goes to
Home instead. This case distinction is deliberate; do not collapse it.

`G2RuntimeManager.navigateToHome()` clears every return page at once
(`historyReturnPage`, `agentReturnPage`, `historyPage`, `sessionListPage`,
`modelSelectPage`). Reaching Home is therefore a reset of navigation state, not just a
screen change.

### Home as the root page

The Home screen is the root. It does not browse anything and only returns the selected
file system to the runtime. Two consequences:

- The choice is not persisted. `connectionMode` is reset to `'gateway'` on shutdown, so
  the next launch starts from the home PC side whenever a Gateway is configured.
- Every other page injects a **"ホーム画面へ"** entry as the **first** item of its
  context menu, via `BasePage.addHomeMenuItem()`. The mechanism is `unshift` on the menu
  array, so a page only declares its own items. Home itself does not register the entry,
  because `handleCommonMenuItem` only shows it when `onNavigateToHome` is set.

Per-page context menus are pinned by tests in
`src/hud/__tests__/g2-home-navigation.test.ts`. Add the new page to those expectations
when you add a page, or the ordering contract silently drifts.

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
- Agent state updates over the OpenCode API
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
- Agent state synchronization
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

## Phase 5 — Real-world Operation

The phases above describe reaching the planned feature set. Everything after them
happened during actual daily use, and is grouped here because it does not belong to the
original plan.

Two themes run through this phase.

**A second file system.** The Local FileSystem was added so the app is useful when the
Gateway is unreachable. It brought a second implementation of every file operation, a
second history and reading-position store, and the need to keep the two from mixing.
See [Section 51](#51-the-filesystem-abstraction).

**Navigation that matches the real device.** The G2 gained a Home screen, a History
screen, and a context menu entry for going home on every page. The Gateway gained a
hidden-file filter and moved its viewer state out of the exposed directory.

Other areas worked on in this phase:

- History page, with PC and app-local sources
- File creation, folder creation, rename, move, copy, delete, upload, download, ZIP
- In-place text editing in the File Viewer
- Sort order toggle
- Color theme, auto-scroll settings, G2 startup screen setting
- Copy between the home PC and the app, from both the Explorer and the File Viewer
- Local storage usage display
- Request-level error handling and longer timeouts in the Gateway
- Timeouts reduced to make the Agent feel more responsive

The main lesson of this phase:

> **A feature that works on one client is not finished until the other client agrees
> with it about storage, navigation and state.**

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

Create a precise implementation request for the coding agent (Kilo).

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

Give the implementation specification to Kilo.

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

# 46. Cloudflare Worker Deployment

Cloudflare Worker development has an important distinction between local source code and deployed runtime code.

A change in the local source code does not automatically mean that the deployed Worker has changed.

Therefore, when debugging a Cloudflare Worker:

    `Source code
         ↓
      Deploy
         ↓
    Deployed Worker
         ↓
      Verify
    `

After modifying the Worker, deploy it explicitly:

    `npx wrangler deploy`

If the behavior still appears inconsistent, verify the deployment history:

    `npx wrangler deployments list`

A source-level fix is not sufficient evidence that the running Worker contains that fix.

This lesson was particularly important during HomePilot voice input development, where local code, Cloudflare deployment state, and actual runtime behavior had to be treated as separate layers.

The general debugging principle is:

> Do not debug the deployed system based only on the local source code. Verify the actual deployed state.

---

# 47. Documentation Philosophy

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

# 48. Future Documentation Maintenance

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

# 49. Future Development Areas

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

# 50. Current Completion Criteria

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
Local FileSystem
   ✓
Copy between home PC and app
   ✓
G2 Home screen and History
   ✓
```

The remaining work is primarily:

- Real-world regression testing
- Maintenance
- Documentation
- UX refinement
- Future extensions

---

# 51. The FileSystem Abstraction

Both the PWA and the G2 talk to files through one interface,
`src/services/FileSystemService.ts`. It covers listing, reading, writing, creating
folders, renaming, deleting, moving and copying, and it takes an optional sort mode.

There are three implementations:

| Implementation | Backing | Used when |
|---|---|---|
| `GatewayFileSystemService` | The Gateway, over HTTP | "自宅PC" is selected |
| `LocalFileSystemService` | `localStorage` | "アプリ" is selected |
| `MockFileSystemService` | In-memory sample data | Only when `VITE_FILE_SERVICE_MODE=mock` |

`services/FileSystemSelection.ts` holds the factory and the two labels
(`local → アプリ`, `gateway → 自宅PC`). `HomeScreen.tsx` (PWA) and `home-page.ts` (G2)
render the choice; neither persists it.

### The rule that keeps the two apart

Anything that persists to the Gateway **must not** fall back to `localStorage`, and vice
versa. `SharedPositionStore.ts` and `hud/services/g2-shared-position-store.ts` therefore
swallow their errors and return `null` instead of falling back — a missing Gateway means
"no position", never "a different position".

`LocalReadingPositionStore.ts` is pinned against this by test: it asserts that the key
`homepilot.fileViewerPositions` is never written, so a `/pc/a.txt` position can never
leak into a `/local/a.txt` position.

Keep this invariant when adding a store. A silent fallback is the failure mode that
produces "it worked on my device and showed nonsense on the other one".

### `resolveExplorerBackTarget`

Back at the root of a file system, the PWA returns to Home rather than staying. This is
a small function (`FileSystemSelection.ts`) with a dedicated test; keep it that way.

---

# 52. Local FileSystem Internals

`src/services/LocalFileSystemService.ts`.

Everything lives in one `localStorage` value:

```text
key:    homepilot.localFileSystem
value:  a flat JSON map keyed by absolute '/' separated path
```

There is no IndexedDB anywhere in the project. A file entry carries its content inline:

```text
{ type, name, parent, content?, size?, mimeType?, modifiedAt? }
```

### Constraints to respect when changing it

- **Every mutation rewrites the whole JSON.** This is what makes it simple, and also what
  makes it slow as the data grows. Do not add a "read one entry" optimization without
  accepting a full rewrite on write.
- **Write order matters.** `persist()` assigns `this.entries` only after
  `localStorage.setItem` succeeds. If you swap those two lines, a quota failure will
  leave the in-memory file system out of sync with what is actually stored.
- **Quota errors are expected, not exceptional.** `isQuotaExceededError` recognizes
  `QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED` and `/quota/i`, and the user sees
  `LOCAL_FS_QUOTA_MESSAGE`. Keep that message stable; tests assert on it.
- **A corrupt or unrecognized payload resets to an empty root only.** `isEntries()` is
  strict, so a partially written value will not half-load.
- **Text only.** `readFile` returns `''` for content-less entries and uploads go through
  `File.text()`. `getDownloadUrl` and `downloadItems` are stubs returning `null` / `{}`.
  If you implement downloads here, remember there is no binary to download.
- **MIME is a fixed 8-entry extension table.** Unknown extensions get `undefined`.

### Reading the size back out

`src/services/StorageUsage.ts` reports three separate numbers, and they are not
interchangeable:

| Value | Source | Meaning |
|---|---|---|
| `fileSystemBytes` | `localStorage` raw string length (UTF-8) | Space taken by the whole structure |
| `fileContentBytes` | sum of `size`, falling back to content length | Space taken by file contents, folders excluded |
| `siteUsageBytes` | `navigator.storage.estimate().usage` | The browser's estimate for the whole origin |

`quota` is deliberately **not** read. It is not the remaining `localStorage` capacity,
so displaying it would mislead. There is no remaining-space or warning-threshold display.

`siteUsageBytes` is tri-state on purpose: `undefined` = still loading, `null` = could not
be read (no `navigator.storage`, insecure context, or the API rejected). On some devices
the third value is simply unavailable, and the UI shows "取得できません". Do not treat
`null` as a bug to fix.

---

# 53. Copying Between the Home PC and the App

`src/services/FileSystemCopy.ts`, orchestrated from `App.tsx`.

The copy runs **in the client**: it reads from one service and writes to the other. It is
not a Gateway operation, which is why a copy into the app needs no Gateway while a copy
into the home PC does.

Menu availability is asymmetric on purpose (`App.tsx`):

```text
"アプリへコピー"    isGatewayService(fileService)
"自宅PCへコピー"   fileService instanceof LocalFileSystemService
                  && resolveConfig().mode === 'gateway'
```

The mirror-image conditions are intentional. "自宅PCへコピー" additionally needs
`createInitializedGatewayService()`, which throws if the Gateway cannot be reached — the
home PC has to be reachable for the copy to land.

Both entries are rendered twice: once in the Explorer menu (for the selection) and once
in the File Viewer menu (for the file being viewed). The File Viewer variants act on the
current file only.

`CopyInProgressIndicator` is shown from before the first `await` until the copy
finishes, because a copy of a large tree can take a noticeable time with no other
feedback.

---

# 54. ViewerState on the Gateway

The Gateway owns view history and reading positions for the home PC files. It matters
that both the PWA and the G2 read and write the same place, so that a file opened on one
resumes on the other.

### Storage location and migration

```text
new:    %LOCALAPPDATA%\HomePilot\.HomePilotViewerState.json
        (override with HOMEPILOT_VIEWER_STATE_DIR)
legacy: <ROOT_PATH>/.HomePilotViewerState.json
```

`viewerStateReadPaths()` returns `[new, legacy]` and the reader takes the first one that
exists. Only `ENOENT` falls through to the next candidate; a file that exists but cannot
be parsed, or a payload with an unexpected `version`, resets to
`DEFAULT_VIEWER_STATE`.

Consequences that are intentional and should not be "fixed":

- **The legacy file is never written to and never deleted.** The migration is
  read-through, not a move. Users keep a stale file under their root until they remove
  it themselves.
- **Keeping it outside the root is the point.** The file is internal state; if it lived
  under the exposed root it would appear in the user's own listings.

Shape: `{ version: 1, positions: { [path]: { progress, updatedAt } }, history: [{ path, lastViewedAt }] }`.

`positions` is a 0.0–1.0 ratio, not a pixel offset. `history` is newest-first and
trimmed to `HISTORY_MAX_ENTRIES` (default 30). Position writes are last-writer-wins by
`updatedAt`. Neither has a TTL.

### Client-side position stores

- Gateway: `SharedPositionStore.ts` (PWA) and `hud/services/g2-shared-position-store.ts`
  (G2). Identical logic, separate modules, because the G2 HUD must not import from the
  React tree.
- App: `LocalReadingPositionStore.ts`, key `homepilot.localFileViewerPositions`, max 100
  entries, no TTL. Read and written by both PWA and G2.

Debounce differs by client: 400 ms in the PWA `FileViewer`, 2000 ms in the G2
`FileViewerPage` (the G2 writes over a tunnel, so it batches harder).

### Dead code you may find

`FileViewerPositionStore.ts` (key `homepilot.fileViewerPositions`) stores raw pixel
positions under `g2|path` / `pwa|path` keys and has a 180-day TTL. **Nothing imports
it.** Data written under that key by an older build is not read by any current code path
and will not migrate. Leave it alone or delete it deliberately; do not wire it back up.

---

# 55. Gateway Behaviors That Are Easy to Break

### One request must not kill the process

`createServer` wraps the handler in a promise rejection handler
(`gateway/src/index.js`). A handler that throws returns HTTP 500 for that request and
nothing else. If headers were already sent — streaming uploads, downloads, the OpenCode
proxy — the socket is destroyed instead.

This is a reliability requirement, not a style choice. The Gateway is the only thing
holding up the Cloudflare tunnel, so a single bad request that terminates the Node
process takes down every client at once. `gateway/test/server-resilience.test.js` exists
to protect it; keep passing it.

When you add a route, make sure its failure path returns an error rather than escaping
the handler.

### Timeouts

`server.timeout`, `headersTimeout` and `requestTimeout` are all set to 3 hours
(`gateway/src/index.js`). Node's default `headersTimeout` is short enough to break long
OpenCode proxied commands. Lowering these will reintroduce that failure.

### Hidden files

`gateway/src/hiddenFiles.js` runs a PowerShell probe
(`Get-ChildItem -Force -Attributes Hidden`) per directory listing and filters the result.

Details that matter:

- **Windows only.** On other platforms it returns an empty set.
- **Fail-open.** Any error resolves to an empty set, so the listing is unfiltered. This
  is deliberate: a missing `powershell.exe` should not make the Explorer unusable. The
  cost is that a failure looks like "the hidden files are showing".
- **Not an access control.** Nothing stops a client from reading a hidden file by path.
  It only keeps them out of listings.
- The path is passed through an environment variable, not the command line, and the
  command is `-EncodedCommand`. Do not build the script by string interpolation; that
  was a deliberate injection fix, and `hidden-files.test.js` covers it.

The probe is started before `readdir` and awaited after, so the PowerShell startup and
the directory read overlap. Keep that ordering if you touch the handler.

### Path validation

`pathValidator.js` rejects relative paths, normalizes and resolves, checks the relative
path against the root, and then **re-checks after `realpath`**. The second check is what
prevents a symlink inside the root from escaping it. Do not remove the `realpath` step
as redundant.

### Upload

Busboy is configured with `files: 100` but `fileSize: Infinity` — there is no per-file
size limit on upload. `MAX_FILE_SIZE` (10 MB) applies to the read/write endpoint, not to
upload. Uploads stage into a temp directory under the root and clean it up on both
success and failure.

---

# 56. G2 Voice Input Limits

Shared by both clients and enforced in different places.

| Limit | Value | Enforced in |
|---|---|---|
| Recording length | 60 s | `useSpeechRecognition.ts`, `g2-agent-controller.ts` |
| Audio payload | 5 MB | `gateway/src/config.js` |
| Accepted content types | `audio/webm`, `audio/mp4`, `audio/wav` | `gateway/src/speech.js` |
| Speech Worker timeout | 60 s | `gateway/src/config.js` |

The G2 records signed 16-bit PCM at 16 kHz mono and wraps it in WAV itself. The PWA uses
`MediaRecorder` and negotiates the type through `MediaRecorder.isTypeSupported`, so the
actual format depends on the browser.

`cancelVoiceInput()` increments a request id so a late response from a cancelled
recording is discarded. If you touch the voice flow, keep that guard.

---

# 57. Storage Keys

Everything HomePilot persists in the browser, and where it lives.

| Key | Written by | Scope |
|---|---|---|
| `homepilot.localFileSystem` | `LocalFileSystemService` | App file system |
| `homepilot.localFileHistory` | `LocalHistoryStore` | App history, 30 entries |
| `homepilot.localFileViewerPositions` | `LocalReadingPositionStore` | App positions, 100 entries |
| `homepilot-connection` | `ConnectionConfig` | Gateway URL and token |
| `homepilot.g2StartupScreen` | `G2StartupScreenSettings` | `explorer` (default), `home`, `agent`, `history` |
| `homepilot.autoScroll` | `AutoScrollSettings` | Interval and amount |
| `homepilot.colorTheme` | `ColorThemeSettings` | `system`, `light`, `dark` (default `dark`) |
| `homepilot-agent-settings` | `useOpenCode` | Selected project, provider, model |
| `homepilot-session-lastChecked` | `useOpenCode`, G2 agent state store | Unread baseline, shared PWA/G2 |
| `homepilot-processing-sessions` | `useOpenCode`, G2 agent state store | Processing recovery, 24 h TTL |
| `homepilot.fileViewerPositions` | — | **Unused.** See [Section 54](#54-viewerstate-on-the-gateway) |

Two things are deliberately **not** persisted: the sort mode (React state / class field
only) and the G2 file system choice (reset to `'gateway'` on shutdown). Both are
intentional session-level settings; do not add persistence without a reason.

`resolveConfig()` falls back to `{ mode: 'mock' }` when no connection is stored and
`VITE_FILE_SERVICE_MODE` is not `gateway`. That is why the Home screen hides "自宅PC",
the Agent pane is hidden, and copy-to-PC is unavailable on an unconfigured PWA.

---

# 58. Tests and Build

| Project | Command | Runner |
|---|---|---|
| `gateway` | `npm test` | `node --test` (`gateway/test/*.test.js`) |
| `explorer/cloudflare` | `npm test` | `vitest` (`src/**/__tests__/*.test.ts`) |
| `speech-worker` | `npm run test` | `vitest` (watch mode) |

The PWA tests sit next to the code they cover, in `__tests__` folders named after the
module. There is no `tests/` directory at the repository root, and no root-level npm
workspace — each project installs independently.

The G2 behavior that is easiest to break silently is pinned by
`src/hud/__tests__/g2-home-navigation.test.ts`, which asserts the full context menu of
every G2 page. When you add a page or a menu entry, update those expectations.

Builds are `npm run build` (`tsc -b && vite build`) for both frontends, and
`npm run pack` for the EvenHub package.

---

# 59. Final Development Principle

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
- ChatGPT / Kilo / OpenCode / MiMo / 人間をどう使い分けたか
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
- Local LLM

では、この考え方が非常に重要でした。

ドキュメント、生成AIの回答、Simulatorなどは参考情報。

**最終的な正解は実際の実行結果。**

という方針です。

---

# 3. HomePilotの開発方式

HomePilot開発で非常に大きな意味を持ったのが、AIの役割分担です。

```text
┌─────────────────────────────────────────────┐
│                  人間                        │
│                                             │
│  目的 / 判断 / テスト / 実機検証            │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 ChatGPT                     │
│                                             │
│  相談 / 調査 / 設計 / 仕様化 / デバッグ     │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 Kilo                        │
│                                             │
│  実装 / コード変更 / テスト・Build支援      │
└─────────────────────────────────────────────┘
```

この役割分担は意図的なものです。

上のKiloは、このリポジトリを開発するCoding Agentです。HomePilot自身が実行時に
利用するOpenCodeサーバーとは別物です。[6章](#6-coding-agentの役割) を
参照してください。

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
- commit・push
- デプロイ

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
Kiloへ依頼
  ↓
実装確認
  ↓
人間がBuild / Test
  ↓
人間が実機で確認
  ↓
人間がcommit / push
  ↓
実測結果を確認
  ↓
再度相談
```

という流れが中心でした。

つまりChatGPTは、**コードを書くことよりも「考えること」**に使っています。

---

# 6. Coding Agentの役割

Kiloは、このリポジトリを開発する現在のメインCoding Agentです。

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
- テスト・Buildの実行と失敗の調査

などです。

特に、

> 「動くようにして」

ではなく、

> 「現在こう動いている。こうしたい。ただしここは絶対に変えるな」

という形で実装を依頼することを重視しました。

## OpenCode / MiMoについて（歴史）

OpenCodeとMiMoは、初期のPhaseで主要的Coding Agentとして使用されていました。この
ドキュメントに記録したAPI調査、仕様書を先に渡す方式、レビューという手順は、その
取り組みから得られたもので、Kiloでもそのまま有用です。

現在はKiloがメインCoding Agentに置き換わっています。ただしOpenCodeをシステムから
廃止したわけではありません。OpenCodeは現在もHomePilotが実行時に利用しているAgent
実行基盤です。HomePilotはGateway経由でOpenCodeサーバーと通信し、Agent Sessionを
実行します。したがって[16章](#16-opencode-apiの実測)以降に残っているOpenCode APIの
調査・実装知見は、現在の仕様として依然として有効です。

この2つは混同してはいけません。

```text
このリポジトリを開発するCoding Agent  →  Kilo
HomePilot内部のAgent実行基盤            →  OpenCode
```

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
                    ┌─────────────────┐
                    │   PC Browser    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Smartphone      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Even Realities  │
                    │       G2        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ HomePilot Client │
                    │ PWA / EvenHub   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ HomePilot       │
                    │ Gateway         │
                    └──────┬─────┬────┘
                           │     │
                 ┌─────────┘     └──────────┐
                 ▼                          ▼
        ┌─────────────────┐        ┌─────────────────┐
        │ Home PC Files   │        │ OpenCode Server │
        └─────────────────┘        └────────┬────────┘
                                            │
                                            ▼
                                    ┌─────────────────┐
                                    │ Cloud / Local   │
                                    │      LLM        │
                                    └─────────────────┘
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

POST /session/{sessionID}/message

GET  /question
POST /question/{questionID}/reply

Permission API
POST /session/{sessionID}/permissions/{permissionID}
```

OpenCodeをアップデートした場合は、これらの動作を再確認する必要があります。

---

# 17. Agent状態更新方式（SSE調査の履歴）

> **過去の内容です。** この節のSSEによるイベントモデルは、初期のPhaseで調査・実装した
> ものです。現在のHomePilotはSSEを使用していません。API調査そのものは現在も価値が
> あり、現在の方式がなぜ今の形になっているかを理解する手がかりにもなるため、残して
> います。

## 調査したこと

Agent状態更新の手段としてSSEを検討しました。OpenCodeサーバー上で確認したイベントは、

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

で、典型的なAgent処理の流れは、

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

## 現在のHomePilotの方式

現在の実装はストリーミング接続を開かず、[16章](#16-opencode-api実測)に挙げた通常の
REST APIでAgent状態を取得します。

```text
POST /session/{sessionID}/message   → 送信後、メッセージ一覧を取得
GET  /session/{sessionID}/message   → 現在の状態を取得
GET  /question                       → 保留中のQuestionを取得
```

PWAの `useOpenCode` は、メッセージ送信後に `getMessages()` を1回呼んで権威のある
メッセージ状態を取得し、最後のassistantメッセージの `finish === 'stop'` を条件に
Processingフラグを解除します。G2の `g2-agent-controller` も同様に、ProcessingとUnread
状態を組み立てるときにメッセージ一覧を取得し、最後のメッセージから完了を判定します。

結果として、現在の方式はイベント配信ではなくリクエスト／レスポンスです。この
ドキュメントで説明しているProcessing / Unreadの仕様はそのまま有効ですが、それらを
駆動しているのは状態のpushではなく取得です。

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

その後、履歴画面にも同じ仕組みが適用され、次が増えました。

```text
historyReturnPage
historyPage
```

`historyReturnPage` は履歴を開いた元の画面を保持し、Double Tapでそこへ戻れるように
しています。起動時から履歴を開いた場合はこの値がないため、その場合のDouble Tapは
ホームへ移動します。この分岐は意図的なものです。まとめないようにしてください。

`G2RuntimeManager.navigateToHome()` は戻り先をすべて一度に破棄します
（`historyReturnPage`、`agentReturnPage`、`historyPage`、`sessionListPage`、
`modelSelectPage`）。ホームへ戻ることは、画面の切り替えではなくナビゲーション状態の
リセットであることを意味します。

### ルートとしてのホーム画面

ホーム画面がルートです。ファイルを閲覧する機能ではなく、どのファイルシステムを
使うかを選ぶだけの画面です。ここから2つの帰結があります。

- 選択は保存されません。シャットダウン時に `connectionMode` は `'gateway'` へ戻され、
  Gatewayが設定されていれば次の起動は自宅PC側から始まります。
- 他のすべての画面は、`BasePage.addHomeMenuItem()` によってコンテキストメニューの
  **先頭** に「ホーム画面へ」を追加します。実装はメニュー配列への `unshift` なので、
  各画面は自分の項目だけを宣言します。ホーム自身は `onNavigateToHome` を設定しない
  ため、この項目は表示されません。

画面ごとのメニュー内容は `src/hud/__tests__/g2-home-navigation.test.ts` で固定され
ています。画面やメニュー項目を追加するときは、その期待値も更新してください。放置
すると契約が静かに崩れます。

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

## Phase 2 — Agent Integration

OpenCodeをAgent基盤として導入。

主な機能：

- Session List
- New Session
- Existing Session
- Messages
- Agent Response
- Model Selection
- Agent状態更新
- Permission
- Question

このPhaseによってHomePilotは、

> Explorer + Agent

というシステムになりました。

---

# 31. Phase 3 — Explorer × Agent Integration

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
- Agent State Sync
- Date / Time
- Regression

Unreadについて、

> **最後に確認した後に新しいAgent結果があればUnread**

という正式な意味付けが行われました。

この仕様が後のG2にも引き継がれています。

---

# 32. Phase 4 — Even Realities G2

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

## Phase 5 — 実運用

ここまでのPhaseは、当初の計画された機能セットに到達するまでのものです。それ以降の
作業は実際の日常利用の中で行われたもので、当初の計画には含まれていなかったため、
別途まとめています。

このPhaseを貫くテーマが2つあります。

**2つ目のファイルシステム。** Gatewayに到達できないときもHomePilotが使えるように
Local FileSystemを追加しました。すべてのファイル操作に2つ目の実装、履歴と既読位置に
2つ目の保存先、そして両者が混ざらないようにする仕組みが必要になりました。
[51章](#51-filesystem抽象化) を参照してください。

**実機に合うナビゲーション。** G2にホーム画面と履歴画面が追加され、すべての画面から
ホームへ戻れるコンテキストメニュー項目が加わりました。GatewayにはHiddenファイルの
フィルタが入り、ViewerStateは公開ディレクトリの外へ移動しました。

このPhaseで扱った主な領域：

- 履歴画面（自宅PCとアプリローカルの両方）
- ファイル作成、フォルダ作成、名前変更、移動、複製、削除、アップロード、ダウンロード、ZIP
- File Viewer上でのテキスト編集
- 並び順切替
- カラーテーマ、自動スクロール設定、G2の起動画面設定
- 自宅PCとアプリ間のコピー（ExplorerとFile Viewerの両方から）
- ローカルストレージ使用量の表示
- Gatewayのリクエスト単位のエラー処理とタイムアウトの延長
- Agentの応答性を高めるためのタイムアウト見直し

このPhaseの主要な教訓は次のとおりです。

> **片方のクライアントで動いた機能は、もう片方が保存場所・ナビゲーション・状態に
> 同意するまで完成ではない。**

---

# 33. G2実機から得た知見

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

# 34. EvenHub SDKから得た知見

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

# 35. Local LLM

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

# 36. テスト思想

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

# 37. Regression

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
- Local LLM

は実際に使い続けることで見つかる問題があります。

したがって最終Regressionは、

> **一回の完了イベントではなく、継続的な実運用確認**

として扱います。

---

# 38. 新機能実装時の基本フロー

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

Kiloへ渡すImplementation Promptを作ります。

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

Kiloに実装を依頼します。

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

# 39. AIへの実装依頼の書き方

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

# 40. 既存機能を守る

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

# 41. 小さく変更する

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

# 42. Git Workflow

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

# 43. Commit

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

# 44. Debugging

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

# 45. Local LLM Debugging

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

# 46. Cloudflare Workerのデプロイ確認

Cloudflare Workerでは、

> ローカルのソースコードが正しい
> ＝
> 実際に動いているWorkerが最新

とは限りません。

ローカルのソースコードと、Cloudflare上にデプロイされているWorkerは、別の状態として扱う必要があります。

    `ソースコード
         ↓
       Deploy
         ↓
    デプロイ済みWorker
         ↓
       Verify
    `

Workerを変更したら、明示的にDeployします。

    `npx wrangler deploy
    `

必要に応じて、デプロイ履歴を確認します。

    `npx wrangler deployments list
    `

ローカルのコードを修正しただけでは、実際に動作しているWorkerが修正済みだという証拠にはなりません。

HomePilotのVoice Input開発では、

* ローカルのソースコード
* Cloudflareへのデプロイ状態
* 実際に動作しているWorker
* 実際のレスポンス

を別々のLayerとして確認することが重要でした。

今回の開発から得た一般的な教訓は、

> **ローカルのソースコードだけを見て、デプロイ済みシステムを判断しない。実際に動いている環境を確認する。**

ということです。

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
Local FileSystem
   ✓
Copy between home PC and app
   ✓
G2 Home screen and History
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

# 51. FileSystem抽象化

PWAとG2は、どちらも1つのインターフェース `src/services/FileSystemService.ts` を
通してファイルへアクセスします。実体は次の3つの実装です。

| Implementation | Backing | Used when |
|---|---|---|
| `GatewayFileSystemService` | The Gateway, over HTTP | 「自宅PC」を選択しているとき |
| `LocalFileSystemService` | `localStorage` | 「アプリ」を選択しているとき |
| `MockFileSystemService` | In-memory sample data | `VITE_FILE_SERVICE_MODE=mock` のときのみ |

インターフェースは、一覧・読み取り・書き込み・フォルダ作成・名前変更・削除・移動・複製
をカバーし、任意の並び順を受け取ります。

`services/FileSystemSelection.ts` がファクトリと2つのラベル
（`local → アプリ`、`gateway → 自宅PC`）を持ちます。選択肢を描画するのは
`HomeScreen.tsx`（PWA）と `home-page.ts`（G2）で、どちらも保存しません。

### 2つを分離し続けるルール

Gatewayへ永続化するものは **一切 `localStorage` へフォールバックしてはいけません**。
逆も同様です。そのため `SharedPositionStore.ts` と
`hud/services/g2-shared-position-store.ts` は、エラーを握りつぶして `null` を返します。
Gatewayが無いのは「位置が無い」であって、「別の位置がある」わけではありません。

`LocalReadingPositionStore.ts` はテストでこのルールが固定されています。
キー `homepilot.fileViewerPositions` には一切書き込まないことを表明しているので、
`/pc/a.txt` の位置が `/local/a.txt` の位置に漏れることはありません。

Storeを追加するときは、この不変条件を保ってください。沈黙したフォールバックが、
「自分の端末では動いたのに、別の端末ではおかしい値が出る」という障害の原因になります。

### `resolveExplorerBackTarget`

ファイルシステムのルートにいるとき、PWAはそのまま残らずホームへ戻ります。これは
`FileSystemSelection.ts` の小さな関数のまま、専用のテストを維持しています。

---

# 52. Local FileSystemの内部構造

`src/services/LocalFileSystemService.ts`。

すべては1つの `localStorage` の値に収まっています。

```text
key:    homepilot.localFileSystem
value:  a flat JSON map keyed by absolute '/' separated path
```

プロジェクト全体にIndexedDBはありません。ファイルの中身はエントリの中に直接持ちます。

```text
{ type, name, parent, content?, size?, mimeType?, modifiedAt? }
```

### 変更時に守るべき制約

- **変更のたびにJSON全体を書き直します。** これが simplicity の理由であり、データ量が
  増えると遅くなる理由でもあります。「1件だけ読む」最適化を入れるなら、書き込み時の
  全体書き直しを受容してからにしてください。
- **書き込みの順序が重要です。** `persist()` は `localStorage.setItem` が成功して
  からのち初めて `this.entries` を代入します。この2行を入れ替えると、quota超過時に
  メモリ上のファイルシステムと実際の保存内容がずれます。
- **Quotaエラーは例外ではなく想定内です。** `isQuotaExceededError` は
  `QuotaExceededError`、`NS_ERROR_DOM_QUOTA_REACHED`、`/quota/i` を認識し、
  ユーザーには `LOCAL_FS_QUOTA_MESSAGE` が表示されます。このメッセージは
  テストで表明されているため、安定を保ってください。
- **壊れた、または認識できないpayloadは、空のrootへリセットするだけ。**
  `isEntries()` は厳格なので、一部だけ書き込まれた値は中途半端に読み込まれません。
- **テキストのみ。** `readFile` は内容を持たないエントリに対して `''` を返し、
  uploadは `File.text()` を通します。`getDownloadUrl` と `downloadItems` は
  `null` / `{}` を返すスタブです。ここにdownloadを実装する場合も、
  ダウンロードすべきバイナリは存在しないことを覚えておいてください。
- **MIMEは8項目の拡張子テーブルの固定です。** 未知の拡張子は `undefined` になります。

### 使用量を取り出す

`src/services/StorageUsage.ts` は3つの別の数値を報告します。それらは相互に
置き換え可能ではありません。

| Value | Source | Meaning |
|---|---|---|
| `fileSystemBytes` | `localStorage` の生文字列長（UTF-8） | 構造全体が占める場所 |
| `fileContentBytes` | `size` の合計（無ければ内容長） | ファイルの内容が占める場所（フォルダは含まない） |
| `siteUsageBytes` | `navigator.storage.estimate().usage` | origin全体に対するブラウザの概算 |

`quota` は **意図的に読みません。** それは `localStorage` の残り容量ではないため、
表示すると誤解を招きます。残容量や警告しきい値の表示はありません。

`siteUsageBytes` は意図的に3状態あります。`undefined` は読み込み中、`null` は
取得できなかった（`navigator.storage` が無い、非secure context、またはAPIが拒否した）
場合です。ある端末では3つ目がただ取得できず、UIには「取得できません」と表示されます。
`null` を直すべきバグとして扱わないでください。

---

# 53. 自宅PCとアプリ間のコピー

`src/services/FileSystemCopy.ts`。`App.tsx` から呼ばれます。

コピーは **クライアント内で** 実行されます。一方のserviceから読み、もう一方へ
書き込みます。Gatewayの処理ではないため、アプリへのコピーにはGatewayが不要ですが、
自宅PCへのコピーには必要です。

メニューの表示条件は意図的に非対称です（`App.tsx`）。

```text
"アプリへコピー"    isGatewayService(fileService)
"自宅PCへコピー"   fileService instanceof LocalFileSystemService
                  && resolveConfig().mode === 'gateway'
```

鏡像になっている条件は意図的です。「自宅PCへコピー」はさらに
`createInitializedGatewayService()` が必要で、これはGatewayに到達できない場合に
throwします。コピーが着地する先である自宅PCには、到達できる必要があるからです。

どちらの項目も2箇所で描画されます。Explorerのメニュー（選択中の項目用）と
File Viewerのメニュー（閲覧中のファイル用）です。File Viewer側は現在のファイルだけを
対象にします。

`CopyInProgressIndicator` は最初の `await` の前からコピーが終わるまで表示します。
大きなツリーのコピーは、それ以外のフィードバックがないまま相当時間かかることがあるためです。

---

# 54. GatewayのViewerState

閲覧履歴と既読位置の自宅PC側をGatewayが保持します。PWAとG2が同じ場所をread/writeする
ことが重要で、それによって片方で開いたファイルがもう片方で続きから開けるようになります。

### 保存場所と移行

```text
new:    %LOCALAPPDATA%\HomePilot\.HomePilotViewerState.json
        (HOMEPILOT_VIEWER_STATE_DIR で上書き可)
legacy: <ROOT_PATH>/.HomePilotViewerState.json
```

`viewerStateReadPaths()` は `[new, legacy]` を返し、readerは存在した最初のものを
使います。`ENOENT` の場合だけ次の候補に進みます。存在するのにparseできない場合や、
`version` が想定外のpayloadは `DEFAULT_VIEWER_STATE` にリセットされます。

意図的で「直すべきではない」帰結：

- **legacyファイルに書き込むことも、削除することもありません。** 移行はread-throughで
  あって移動ではありません。root配下に古いファイルが残るのは、ユーザーが自分で
  削除するまでのことです。
- **rootの外に置いていることが本質です。** このファイルは内部状態です。公開している
  root配下にあったら、ユーザーの一覧に出現してしまいます。

Shape: `{ version: 1, positions: { [path]: { progress, updatedAt } }, history: [{ path, lastViewedAt }] }`。

`positions` はピクセルオフセットではなく 0.0〜1.0 の比率です。`history` は新しい順で
`HISTORY_MAX_ENTRIES`（既定30）で切り詰められます。positionの書き込みは `updatedAt`
によるlast-writer-winsです。どちらにもTTLはありません。

### クライアント側のposition store

- Gateway側: `SharedPositionStore.ts`（PWA）と
  `hud/services/g2-shared-position-store.ts`（G2）。ロジックは同じですがモジュールは
  分れています。G2のHUDはReactツリーからimportしてはいけないためです。
- アプリ側: `LocalReadingPositionStore.ts`、キー `homepilot.localFileViewerPositions`、
  最大100件、TTLなし。PWAとG2の両方がread/writeします。

Debounceはクライアントで異なります。PWAの `FileViewer` は400 ms、G2の
`FileViewerPage` は2000 msです（G2はトンネル経由の書き込みなので、よりまとめて書きます）。

### 見つかるかもしれないdead code

`FileViewerPositionStore.ts`（キー `homepilot.fileViewerPositions`）は、生のピクセル
positionを `g2|path` / `pwa|path` キーで保持し、180日のTTLを持ちます。
**これをimportしているものはありません。** 古いビルドがこのキーに書いたデータは現在の
どのコードパスからも読まれず、移行もしません。放置するか意図的に削除するかしてください。
再度つなぎ直さないでください。

---

# 55. Gatewayで壊れやすい挙動

### 1リクエストでプロセスを落とさない

`createServer` はハンドラをpromise rejection handlerで包んでいます
（`gateway/src/index.js`）。ハンドラがthrowした場合、そのリクエストにHTTP 500を
返すだけで、ほかの何かは起きません。すでにヘッダを送信済みの場合（ストリーミングの
upload、download、OpenCodeプロキシ）はsocketを破棄します。

これはスタイルではなく信頼性の要件です。GatewayはCloudflareトンネルを支えている唯一の
要素なので、Nodeプロセスを終了させる1件のリクエストがあれば、すべてのクライアントが
同時に落ちます。`gateway/test/server-resilience.test.js` がこれを保護しています。
通し続けるようにしてください。

routeを追加するときは、failure pathがハンドラの外へ漏れるのではなくエラーを返すように
してください。

### タイムアウト

`server.timeout`、`headersTimeout`、`requestTimeout` はいずれも3時間
（`gateway/src/index.js`）です。Nodeの既定の `headersTimeout` は、OpenCode経由の
長時間コマンドを壊すには短すぎます。下げるとその障害が再発します。

### Hiddenファイル

`gateway/src/hiddenFiles.js` は、ディレクトリ一覧ごとにPowerShellのprobe
（`Get-ChildItem -Force -Attributes Hidden`）を実行し、結果をフィルタします。

重要な詳細：

- **Windowsのみ。** 他のプラットフォームでは空の集合を返します。
- **Fail-open。** エラーはすべて空の集合に解決されるので、一覧はフィルタされません。
  これは意図的です。`powershell.exe` が無いだけでExplorerが使えなくなるのは
  望ましくありません。代償は、失敗が「Hiddenファイルが表示されている」に
  見えることです。
- **アクセス制御ではありません。** パスでHiddenファイルを読み取ることを止めるものが
  ありません。一覧から隠すだけです。
- パスはコマンドラインではなく環境変数で渡し、コマンドは `-EncodedCommand` です。
  スクリプトを文字列連結で作らないでください。意図的なinjection対策であり、
  `hidden-files.test.js` がそれを検証しています。

probeは `readdir` より前に開始し、後でawaitします。これによりPowerShellの起動と
ディレクトリ読み込みが重なります。ハンドラを触るときは、この順序を保ってください。

### パスの検証

`pathValidator.js` は相対パスを拒否し、正規化して解決し、rootに対する相対パスを
確認し、**さらに `realpath` の後に再確認します。** 2回目の確認が、root内の
シンボリックリンクの脱出を防ぎます。`realpath` の手順は、冗長であるからという理由で
削除しないでください。

### Upload

Busboyは `files: 100` ですが `fileSize: Infinity` です。uploadに1ファイルあたりの
サイズ制限はありません。`MAX_FILE_SIZE`（10 MB）が適用されるのはread/write側の
エンドポイントで、uploadではありません。uploadはroot配下のtempディレクトリに
ステージし、成功・失敗のどちらもクリーンアップします。

---

# 56. G2の音声入力の制限

両クライアント共通で、異なる場所で強制されています。

| Limit | Value | Enforced in |
|---|---|---|
| 録音時間 | 60 s | `useSpeechRecognition.ts`, `g2-agent-controller.ts` |
| 音声ペイロード | 5 MB | `gateway/src/config.js` |
| 受け付けるContent-Type | `audio/webm`, `audio/mp4`, `audio/wav` | `gateway/src/speech.js` |
| Speech Workerタイムアウト | 60 s | `gateway/src/config.js` |

G2はsigned 16-bit PCMを16 kHz monoで録音し、WAV化は自身で行います。PWAは
`MediaRecorder` を使い、`MediaRecorder.isTypeSupported` でtype交渉するため、実際の
formatはブラウザに依存します。

`cancelVoiceInput()` はrequest idをインクリメントするので、キャンセルした録音に
遅れて届いた応答は破棄されます。音声フローを触るときは、このガードを保ってください。

---

# 57. ストレージのキー

HomePilotがブラウザに永続化するものすべてと、その保存先。

| Key | Written by | Scope |
|---|---|---|
| `homepilot.localFileSystem` | `LocalFileSystemService` | アプリのファイルシステム |
| `homepilot.localFileHistory` | `LocalHistoryStore` | アプリ履歴、30件 |
| `homepilot.localFileViewerPositions` | `LocalReadingPositionStore` | アプリのposition、100件 |
| `homepilot-connection` | `ConnectionConfig` | GatewayのURLとtoken |
| `homepilot.g2StartupScreen` | `G2StartupScreenSettings` | `explorer`（既定）, `home`, `agent`, `history` |
| `homepilot.autoScroll` | `AutoScrollSettings` | 間隔と量 |
| `homepilot.colorTheme` | `ColorThemeSettings` | `system`, `light`, `dark`（既定 `dark`） |
| `homepilot-agent-settings` | `useOpenCode` | 選択中のproject, provider, model |
| `homepilot-session-lastChecked` | `useOpenCode`, G2 agent state store | Unreadの基準、PWA/G2で共有 |
| `homepilot-processing-sessions` | `useOpenCode`, G2 agent state store | Processing復旧、24 h TTL |
| `homepilot.fileViewerPositions` | — | **未使用。** [54章](#54-gatewayのviewerstate) を参照 |

意図的に **永続化していない** ものが2つあります。並び順（Reactのstate / class
フィールドのみ）と、G2のファイルシステムの選択（シャットダウン時に `'gateway'` へ
戻す）です。どちらもセッションレベルの設定として意図されたものなので、理由なしに
永続化を追加しないでください。

接続情報が保存されておらず `VITE_FILE_SERVICE_MODE` が `gateway` でもない場合、
`resolveConfig()` は `{ mode: 'mock' }` にフォールバックします。設定していないPWAで
「自宅PC」がホーム画面に出てこず、Agentペインが隠れ、自宅PCへのコピーが使えないのは
このためです。

---

# 58. テストとBuild

| Project | Command | Runner |
|---|---|---|
| `gateway` | `npm test` | `node --test` (`gateway/test/*.test.js`) |
| `explorer/cloudflare` | `npm test` | `vitest` (`src/**/__tests__/*.test.ts`) |
| `speech-worker` | `npm run test` | `vitest` (watch mode) |

PWAのテストは、対象コードの隣の `__tests__` フォルダに置かれ、名前は対象のmoduleに
従っています。リポジトリのルートに `tests/` ディレクトリはなく、ルートレベルのnpm
workspaceもありません。各projectが独立してinstallします。

G2の挙動のうち、静かに壊れやすいものは
`src/hud/__tests__/g2-home-navigation.test.ts` が固定しています。このテストは
すべてのG2画面のcontext menu全体を表明します。画面やメニュー項目を追加するときは、
その期待値も更新してください。

Buildは両フロントエンドで `npm run build`（`tsc -b && vite build`）、EvenHubの
packageは `npm run pack` です。

---

# 59. 最後に

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
