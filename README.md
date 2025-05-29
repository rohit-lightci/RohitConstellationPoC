# TypeScript Monorepo with pnpm and Turborepo

This is a monorepo setup using pnpm workspaces and Turborepo.

## Structure

- `/apps/*` - Applications
  - `/apps/api` - Example API using Nest.js
- `/packages/*` - Shared packages
  - `/packages/tsconfig` - Shared TypeScript configurations
- `/infrastructure` - AWS CDK infrastructure code

## Features

- **pnpm Workspaces**: Manages dependencies across multiple packages
- **Turborepo**: Optimizes the build system for monorepos
- **Husky**: Runs Git hooks to ensure code quality
- **lint-staged**: Runs linters on staged git files
- **GitHub Workflows**: Automated CI processes for pull requests
- **AWS CDK**: Infrastructure as Code for AWS cloud resources

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Run development server:

   ```bash
   pnpm dev
   ```

3. Build all packages:
   ```bash
   pnpm build
   ```

## Commands

- `pnpm dev` - Run development servers for all apps
- `pnpm build` - Build all apps and packages
- `pnpm lint` - Lint all apps and packages
- `pnpm test` - Run tests for all apps and packages
- `pnpm format` - Format code with Prettier

### Infrastructure Commands

- `pnpm cdk -- -c config=<env> <command>` - Run any CDK command (e.g., `pnpm cdk -- -c config=dev list`)
- `pnpm cdk:bootstrap -- -c config=<env>` - Bootstrap your AWS environment for CDK
- `pnpm cdk:synth -- -c config=<env>` - Synthesize CloudFormation templates
- `pnpm cdk:deploy -- -c config=<env>` - Deploy infrastructure to AWS
- `pnpm cdk:diff -- -c config=<env>` - Show differences between local and deployed stack
- `pnpm cdk:destroy -- -c config=<env>` - Destroy deployed infrastructure

## Infrastructure Deployment

The project uses AWS CDK to define and deploy infrastructure.

### Prerequisites

- AWS CLI installed and configured with appropriate credentials
- AWS account and region configured

### Configuration

All CDK commands require a configuration parameter that specifies the environment:

```bash
-c config=<env>
```

Where `<env>` is the environment name (e.g., dev, staging, prod).

### Deployment Steps

These commands can be run either from the root or from the infrastructure folder.

1. Bootstrap your AWS environment (first-time only):

   ```bash
   pnpm cdk bootstrap -c config=development
   ```

2. Synthesize the CloudFormation templates:

   ```bash
   pnpm cdk synth -c config=development
   ```

3. Deploy the infrastructure:

   ```bash
   pnpm cdk deploy -c config=development
   ```

4. To remove all deployed resources:
   ```bash
   pnpm cdk destroy -c config=development
   ```

## Code Quality

This project uses:

- **Husky**: Automatically runs lint-staged on pre-commit
- **lint-staged**: Runs ESLint and Prettier on staged files before commit

## Continuous Integration

GitHub Actions workflows run on all pull requests to the main branch:

- **Linting**: Ensures code meets quality standards by running `pnpm lint`

## Secrets Management

The infrastructure deployment requires certain secrets to be configured. At minimum, you will need the following secrets that are defined in `.github/workflows/cicd.yml`:

- **AWS_ACCESS_KEY_ID**: Your AWS access key with permissions to deploy resources
- **AWS_SECRET_ACCESS_KEY**: Your AWS secret access key
- **AWS_REGION**: The AWS region to deploy to
- **OPENAI_API_KEY**: API key for OpenAI services (if your application uses OpenAI)

### Setting Up Secrets

#### For Local Development

Store these secrets as environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=your_region
export OPENAI_API_KEY=your_openai_key
```

You can create a `.env` file in the project root (make sure it's in `.gitignore`) and load it using a tool like `dotenv`.

#### For GitHub Actions

Configure these secrets in your GitHub repository:

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add each required secret

These secrets will be securely accessed during the CI/CD pipeline when deploying to AWS.

## Application Overview

This section provides a comprehensive walkthrough of the application's architecture and end-to-end user/system flows.

## End-to-End Application Workflow

This document outlines the event flow and service responsibilities within the real-time collaborative session application.

**Core Components:**

*   **Frontend (UI):** React application (likely using Vite) for Admin and Participant interfaces.
*   **Backend (API):** NestJS application.
    *   **`SessionController`:** Handles HTTP requests for session management.
    *   **`SessionService`:** Core logic for session creation, participant management, answer submission, and session lifecycle.
    *   **`SessionGateway`:** Manages WebSocket connections, rooms, and basic event handling (join, leave, start, end).
    *   **`SessionEventsService`:** Dedicated service (used by `SessionService` and `OrchestratorService`) to emit standardized WebSocket events.
    *   **`OrchestratorService`:** Manages the question queue for each participant, decides on next questions (base or follow-up), and triggers evaluations.
    *   **`EvaluationService`:** Evaluates participant answers for sufficiency (currently mock, planned for LLM).
    *   **`AnswerService`:** Manages CRUD operations for answers and handles embedding generation and similarity searches.
    *   **`EmbeddingService`:** Generates embeddings for text (currently using OpenAI).
    *   **`SessionCacheService`:** Caches session and participant queue data (e.g., using in-memory cache or Redis).
*   **Shared Types (`packages/types`):** TypeScript interfaces for `Session`, `Participant`, `Question`, `Answer`, DTOs, WebSocket events, etc., ensuring type safety across frontend and backend.
*   **Database (PostgreSQL with `pgvector`):** Stores session data, participant information, questions, answers, and answer embeddings.
*   **WebSockets (`socket.io`):** For real-time communication.

**I. Admin: Session Setup & Launch**

1.  **Admin UI Interaction (`SessionStepper.tsx` or similar):**
    *   Admin navigates through a multi-step form to define session parameters:
        *   Title, description, type (e.g., "Retro" - Mad, Sad, Glad).
        *   Expiry, anonymity settings, participation rules.
        *   (Future: Customize sections and base questions).
    *   Admin defines who can participate (e.g., invite-only, open).
    *   Admin reviews the setup.

2.  **Session Creation Request (HTTP):**
    *   **UI (`SessionStepper.tsx`) -> API (`SessionController.createSession`)**
    *   The UI sends a DTO (e.g., `CreateSessionDto`) to the backend.

3.  **Session Initialization (`SessionService.createSession`):**
    *   Validates the DTO.
    *   Creates a new `Session` entity in the database with a `DRAFT` status.
    *   For a "Retro" template, it pre-populates the session with:
        *   Sections: "Mad", "Sad", "Glad" (with defined order).
        *   Base Questions: e.g., "What made you mad?", "What made you sad?", "What made you glad?" associated with their respective sections.
    *   The `Session` entity (including its nested sections and questions) is saved to the database via TypeORM.
    *   Returns the created `Session` object (or its ID) to the UI.

4.  **Admin UI Displays Draft Session:**
    *   The admin sees the created session, typically with a unique session ID/link to share.
    *   A list of (currently empty) participants is shown.

5.  **Participants Joining (Pre-Launch):**
    *   (Covered in Section II, can happen before or after session activation by Admin)

6.  **Admin Starts/Activates Session (WebSocket):**
    *   **Admin UI (`SessionStepper.tsx`) -> `websocketService.startSession(sessionId)`**
    *   Frontend emits a `SESSION_EVENT.START` (e.g., `session:start`) WebSocket event with the `sessionId`.
    *   **`SessionGateway.handleSessionStart(sessionId)`:**
        *   Receives the event.
        *   Calls `SessionService.activateSession(sessionId)`.
        *   **`SessionService.activateSession(sessionId)`:**
            *   Fetches the session from the database.
            *   Updates the session status to `ACTIVE`.
            *   Saves the updated session.
            *   Calls `SessionEventsService.emitSessionStatus(sessionId, 'ACTIVE')` (or a more comprehensive session state update).
            *   **Crucially, for each *joined* participant:** It calls `OrchestratorService.getNextQuestionForParticipant(sessionId, participantId)`. (This part ensures participants get their first question immediately upon session activation if they've already joined).
        *   **`SessionGateway` (after `activateSession` succeeds):**
            *   Possibly emits a `SESSION_EVENT.STATE` or `SESSION_EVENT.STATUS` event to all clients in the `session:<sessionId>` room to inform them the session is now active.

**II. Participant: Joining a Session & Receiving First Question**

1.  **Participant UI Interaction (`JoinSession.tsx` or via direct link):**
    *   Participant enters a session ID (if not in link) and their name.
    *   On component mount or form submission, `websocketService.connect(sessionId, participantName)` is called.

2.  **WebSocket Connection & Joining:**
    *   **`websocketService.connect()`:**
        *   Establishes a WebSocket connection to the `/sessions` namespace.
        *   On successful connection, it emits a `SESSION_EVENT.JOIN` (e.g., `session:join`) event with `sessionId` and participant details (name).
    *   **`SessionGateway.handleSessionJoin(client, payload)`:**
        *   Receives the `session:join` event.
        *   Calls `SessionService.addParticipant(sessionId, participantName)`.
        *   **`SessionService.addParticipant()`:**
            *   Creates a new `Participant` entity associated with the session.
            *   Sets participant status to `ACTIVE`.
            *   Assigns a role (e.g., `PARTICIPANT`).
            *   Saves the updated `Session` (with the new participant in its `participants` array).
            *   Returns the updated `Session` and the new `Participant`'s ID.
        *   **`SessionGateway` (after `addParticipant` succeeds):**
            *   Adds the client's socket to the `session:<sessionId>` room.
            *   Adds the client's socket to a participant-specific room: `participant:<participantId>`.
            *   Stores a mapping of `socket.id` to `participantId` for disconnect handling.
            *   Emits `SESSION_EVENT.PARTICIPANT_JOINED` to the joining client with their `participantId`.
            *   Emits `SESSION_EVENT.STATE` (e.g., `session:state`) with the updated session data (including the new participant list) to *all* clients in the `session:<sessionId>` room.
            *   If the session is already `ACTIVE`: Calls `OrchestratorService.getNextQuestionForParticipant(sessionId, newParticipantId)` (to prepare the participant's state).

3.  **Participant UI Receives Session State & First Question:**
    *   **`JoinSession.tsx` or `ActiveSession.tsx` listens for `SESSION_EVENT.STATE`:** Updates its local state with the session details (status, participant list). Navigates to `ActiveSession.tsx` if session is active and participant ID is known.
    *   **`ActiveSession.tsx` (upon mount, if `sessionId` and `participantId` are available):**
        *   Emits `SESSION_EVENT.GET_QUESTION` to the backend.
    *   **`SessionGateway.handleGetQuestion(client, payload)`:**
        *   Retrieves the participant's current question (e.g., from `Participant.currentQuestionId` which was set by `OrchestratorService` or defaults).
        *   Emits `SESSION_EVENT.QUESTION_READY` (e.g., `question:ready`) back to the specific requesting client. Payload includes the `Question` object.
    *   **`ActiveSession.tsx` listens for `SESSION_EVENT.QUESTION_READY`:**
        *   The UI displays the received question.

**III. Participant: Answering a Question**

1.  **Participant UI Interaction (`ActiveSession.tsx`):**
    *   Participant types their answer or selects an option.
    *   Clicks "Submit".
    *   Frontend calls `websocketService.submitAnswer(sessionId, participantId, questionId, responseValue)`. (The `participantId` is sent from the client).

2.  **Answer Submission (WebSocket):**
    *   Frontend emits `SESSION_EVENT.QUESTION_ANSWER` (e.g., `session:question:answer`) with the answer details, including `participantId`.
    *   **`SessionGateway.handleQuestionAnswer(client, payload)`:**
        *   Receives the event. Uses `participantId` from payload and `sessionId` from handshake/query.
        *   Calls `SessionService.submitAnswer(sessionId, participantId, questionId, responseValue)`.
        *   Returns an acknowledgment (e.g., `{ status: 'received', answerId: savedAnswer.id }`) to the calling client.
        *   Logic for determining and emitting the next question or participant completion events has been decoupled from this handler for now.

3.  **Answer Processing & Embedding (`SessionService.submitAnswer` & `AnswerService`):**
    *   **`SessionService.submitAnswer()`:**
        *   Validates the session, participant, and that the `questionId` being answered is the participant's current question.
        *   Calls `AnswerService.create(answerData)` where `answerData` includes `sessionId`, `participantId`, `questionId`, and `response`.
        *   The primary responsibility of this method is now to validate the submission and persist the answer using `AnswerService`.
        *   It returns the saved `Answer` entity (e.g., `Promise<Answer>`).
        *   It **does not** call `OrchestratorService.processParticipantAnswer()` directly.
    *   **`AnswerService.create(answerData)`:**
        *   Creates an `Answer` entity (using TypeORM, relating it to the `Session` via `sessionId`).
        *   Saves it to the database (this is an atomic `INSERT` operation).
        *   **Asynchronously (e.g., `await`ed or as a background task):** Calls `this.generateAndStoreEmbedding(savedAnswer.id, responseText)`.
        *   **`AnswerService.generateAndStoreEmbedding(answerId, textToEmbed)`:**
            *   Calls `EmbeddingService.generateEmbedding(textToEmbed)`.
            *   **`EmbeddingService.generateEmbedding(text)`:**
                *   Initializes OpenAI client (using API key from `ConfigService`).
                *   Calls OpenAI API (e.g., `text-embedding-ada-002`) to get the vector embedding.
                *   Converts the numeric array embedding to its SQL string representation using `pgvector.toSql()`.
                *   Returns the string embedding.
            *   `AnswerService` takes the string embedding and updates the corresponding `Answer` entity in the database, saving the embedding string to the `embedding` column.
        *   `AnswerService.create()` returns the `Answer` (potentially with the embedding, if awaited and successful).

**IV. Orchestration: Evaluation, Follow-ups, Next Question & Similarity Search**

*The following section describes the planned workflow for processing a submitted answer and determining the next steps for a participant. Currently, the invocation of `OrchestratorService.processParticipantAnswer()` immediately following an answer submission is deferred. The system first ensures the answer is saved (as described in Section III), and the logic for triggering this orchestration flow will be integrated subsequently.*

1.  **`OrchestratorService.processParticipantAnswer(..., answerId)`:**
    *   This is the brain of the question flow. It's a complex method, often involving a retry loop for optimistic locking.
    *   **Fetch State:** Retrieves the current `Session`, `Participant`, and the participant's `ParticipantQueueCache` (from `SessionCacheService` or initializes it).
    *   **Validate:** Checks if the participant is already `COMPLETED` or if the `answeredQuestionId` matches the current question in their queue. If not, handles appropriately (e.g., re-sends current question).
    *   **Evaluate Answer:** Calls `EvaluationService.evaluateAnswer(session, participant, answeredQuestionObject, response)`.
        *   **`EvaluationService.evaluateAnswer()` (Current Mock):**
            *   Logs the evaluation.
            *   Returns a mock `{ isSufficient: true/false, feedback: "..." }`.
            *   **(Future LLM Implementation):**
                *   Constructs a prompt with question, answer, section goal, (optionally) context from similar answers.
                *   Calls OpenAI API.
                *   Parses LLM response to determine `isSufficient` and `feedback`.
    *   **Decision Logic based on Evaluation:**
        *   **If `isSufficient: true`:**
            *   Logs sufficiency.
            *   Advances `participantQueue.currentQuestionIndex`.
            *   If more questions exist in the queue, `nextQuestion` is set.
            *   Else, `participantCompletedSession` is set to `true`.
        *   **If `isSufficient: false`:**
            *   Logs insufficiency.
            *   Checks `MAX_FOLLOW_UPS` for the current base question.
            *   **If follow-ups allowed:**
                *   Generates a new `Question` object for the follow-up (e.g., "Please elaborate..."). (TODO: LLM can generate this prompt).
                *   Assigns `intent: 'FOLLOW_UP'`, `parentQuestionId`.
                *   Inserts this follow-up question into `participantQueue.questions` immediately after the current question.
                *   Increments follow-up count for the base question.
                *   Advances `participantQueue.currentQuestionIndex` to the new follow-up.
                *   `nextQuestion` is set to this follow-up question.
                *   The `newFollowUpQuestionForSessionPersistence` is stored to be added to the main `Session` object.
            *   **If max follow-ups reached:**
                *   Logs max follow-ups reached.
                *   Advances `participantQueue.currentQuestionIndex` past the current base question and its follow-ups (or to the next base question using `findNextBaseQuestionInQueue`).
                *   If more questions exist, `nextQuestion` is set.
                *   Else, `participantCompletedSession` is set to `true`.
    *   **Similarity Search (New Logic):**
        *   Calls `AnswerService.findOne(answerId)` to get the full answer entity (which should now have the embedding if the `await` in `AnswerService.create` is in place).
        *   If `currentAnswerEntity.embedding` is valid:
            *   Calls `AnswerService.findSimilarAnswers(embedding, limit, sessionId, answerId)`.
            *   Logs the IDs of found similar answers. (Future: This context will be passed to the LLM for generating more insightful follow-up questions or for real-time admin analytics).
        *   If no valid embedding, logs and skips.
    *   **Persist State Changes:**
        *   If `newFollowUpQuestionForSessionPersistence` exists, it's added to the appropriate section's `questions` array within the main `session` object (which is then persisted).
        *   If `participantCompletedSession`, updates `participant.status = 'COMPLETED'`.
        *   Else, updates `participant.currentQuestion` to `nextQuestion.id`.
        *   Increments `session.version` (for optimistic locking).
        *   Calls `this.persistSession(session)` (which saves to DB and updates cache).
        *   Calls `this.setParticipantQueue(...)` to save the updated participant queue to cache.
    *   **Emit Events (via `SessionEventsService`):**
        *   `emitParticipantStatus(sessionId, participant.id, participant.status)` (with the potentially new status and current question).
        *   If `participantCompletedSession`:
            *   Checks if *all* participants are `COMPLETED`.
            *   If so, calls `SessionService.completeSession(sessionId)`.
            *   **`SessionService.completeSession()`:** Sets session status to `COMPLETED`, saves, and emits a session status/state update.
        *   Else if `nextQuestion` exists:
            *   `emitQuestionReady(sessionId, participant.id, nextQuestion)`.
        *   Else (error case, should have a next question or be completed): Logs an error and emits current participant status.
    *   Handles `OptimisticLockVersionMismatchError` by retrying the whole `processParticipantAnswer` logic a few times. If retries fail, logs an error (previously `emitErrorToParticipant`).

**V. Participant: Receiving Next/Follow-up Question or Completion**

1.  **Participant UI (`ActiveSession.tsx`):**
    *   If `SESSION_EVENT.QUESTION_READY` is received: Displays the new `nextQuestion`.
    *   If `SESSION_EVENT.PARTICIPANT_STATUS` is received with `status: 'COMPLETED'`:
        *   UI displays a "Session Completed" message for that participant (e.g., "Great job!").
    *   If `SESSION_EVENT.STATE` indicates the overall session is `COMPLETED`:
        *   Participant UI might navigate to a session ended/summary page (if applicable for participants).

**VI. Admin: Monitoring & Ending Session**

1.  **Admin UI (`SessionStepper.tsx` or a dedicated monitoring view):**
    *   Listens for `SESSION_EVENT.STATE` to get updates on session status, participant list, and participant statuses.
    *   Listens for `SESSION_EVENT.PARTICIPANT_STATUS` for individual participant updates.
    *   (Future: Display real-time themes, clusters from answers based on similarity search and LLM analysis).

2.  **Admin Ends Session (Manually, WebSocket):**
    *   Admin clicks "End Session".
    *   Frontend emits `SESSION_EVENT.END` (e.g., `session:end`) with `sessionId`.
    *   **`SessionGateway.handleSessionEnd(client, payload)`:**
        *   Calls `SessionService.completeSession(sessionId)`.
        *   **`SessionService.completeSession()`:**
            *   Sets session status to `COMPLETED` in the database.
            *   Emits appropriate events via `SessionEventsService` (e.g., a final `SESSION_EVENT.STATE` or specific "session ended" event) to all clients in the room.
            *   All participants will see the session as ended.
            *   Admin UI navigates to a results/summary page (currently a placeholder).

**VII. Disconnection Handling (`SessionGateway`)**

*   **`handleDisconnect(client)`:**
    *   Retrieves `participantId` mapped to the `client.socket.id`.
    *   If found:
        *   Calls `SessionService.updateParticipantStatus(sessionId, participantId, 'INACTIVE')` (if such a method exists, or updates the session directly).
        *   Emits `SESSION_EVENT.PARTICIPANT_STATUS` to the session room indicating the participant is now `INACTIVE`.
        *   Removes the `socketId` to `participantId` mapping.

