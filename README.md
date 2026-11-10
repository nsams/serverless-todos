# serverless-todos

Minimal todo app (multiple lists, todos with description and due date, overdue todos are highlighted, notebooks with Markdown notes, AI chat assistant that manages the todos and notes, MCP server for external AI clients like Claude Desktop): React single-page application (React Router data mode, MUI + DataGrid) with a REST API (Hono, typed clients `hc`) on Cloudflare Workers, Drizzle, login via Cloudflare Access (Entra ID), Cloudflare Agents SDK + AI Gateway + MUI X Chat, MCP TypeScript SDK.

The app runs only on Cloudflare (Workers + D1). Locally it runs in the real Workers runtime (workerd) via `@cloudflare/vite-plugin`, D1 is emulated by Miniflare as a local SQLite database in `.wrangler/state/` (no Docker or external database needed).

## Setup

```bash
./install.sh
```

## Development

```bash
npm run dev  # applies pending migrations to the local D1, starts the app (http://localhost:5180)
```

Processes are managed by [dev-process-manager](https://www.npmjs.com/package/dev-process-manager) (`npx dev-pm status`, `npx dev-pm logs`, `npx dev-pm stop`).

Cloudflare Access is simulated locally by the Workers runtime (`access.dev`, configured in `vite.config.ts`): every request is authenticated as `DEV_USER_EMAIL` (`.env`). To work as another user, set `DEV_USER_EMAIL` in `.env.local` and restart `npm run dev`. There is no login/logout locally (the logout button leads to a 404).

The chat assistant calls a real model also in development, through the AI Gateway REST API of the account in `CLOUDFLARE_AI_ACCOUNT_ID` (`.env`), with costs. It needs a Cloudflare API token with the permission _Account > Workers AI > Read_ in `.env.local`:

```bash
CLOUDFLARE_AI_API_TOKEN=...
```

No `wrangler login` needed: the AI binding (remote-only) isn't used in development. The worker sends the model requests to the dev server (`/__cloudflare-ai/...`), which forwards them from Node with the token (`cloudflareAiDevProxy.ts`). Not named `CLOUDFLARE_API_TOKEN`, as wrangler would use that one for deploying too.

In a sandbox whose egress proxy injects credentials (e.g. [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)), allow `api.cloudflare.com` in the environment's network settings and add the API token as network secret (credential injection) for that host; `CLOUDFLARE_AI_API_TOKEN` can then stay unset (a placeholder is sent and replaced by the proxy). This works because the dev server sends the requests from Node, which uses `HTTPS_PROXY`; the Workers runtime itself ignores it.

The local D1 database can be browsed and queried in the Cloudflare Local Explorer at http://localhost:5180/cdn-cgi/explorer (while `npm run dev` is running), or from the command line:

```bash
npx wrangler d1 execute DB --local --command "SELECT * FROM todos"
npm run db:reset  # delete the local database and re-apply all migrations
npm run db:seed   # insert test data (scripts/fixtures.ts) for DEV_USER_EMAIL
```

## Structure

The app consists of a core (app shell, authentication, chat assistant, MCP server, database connection) and feature modules. The todos and the notes are modules. Everything that belongs to a module lives in its folder `src/modules/<module>/`, the core only knows the modules through the registries and the interfaces in `src/modules/types.ts`.

Core:

The app is a single-page application: `index.html` and the JS/CSS built by Vite are served as static assets (`not_found_handling: "single-page-application"` in `wrangler.jsonc`: unknown paths get `index.html`, the client-side router shows the page). The worker only handles the REST API (`/api/*`), the chat (`/chat-agent`) and the MCP server (`/mcp`) (`run_worker_first`), so page loads don't invoke it. The page data comes from the REST API, loaded by the routes' loaders with the modules' typed clients (see [Data loading](#data-loading)).

- `src/server.ts`: worker entry ([Hono](https://hono.dev)): a middleware rejects foreign origins and every request not authenticated by Cloudflare Access (`src/auth.server.ts`, `ctx.access`) and sets the user (identified by email) as context variable; mounts the REST API at `/api`, routes chat requests to the user's chat agent and MCP requests to the MCP server
- `src/api/api.server.ts`: the REST API: the core's routes (`src/api/user.server.ts`: `GET /api/user`) and every module's API at `/api/<module id>`; maps the operations' errors once (`NotFoundError` → `404`, `ValidationError` → `422` with `{ error }`, anything else → `500`). `src/api/hono.server.ts`: `createApi()` (context: the user) and `operationRoute`, which turns an operation into a typed route (see [Operations](#operations-one-definition-for-ui-chat-and-mcp))
- `src/api/client.ts`: `createClient<typeof todosApi>(moduleId)`, the typed client of a module's API ([`hc`](https://hono.dev/docs/guides/rpc), type-only import of the module's API): paths, params, query, JSON bodies and responses are checked by TypeScript, `parseResponse` returns the body. Error responses throw the operations' errors (`404` → `NotFoundError`, `422` → `ValidationError`), so the forms show the message and the pages show "not found". Dates are ISO strings in the JSON (e.g. `createdAt`), also in the types.
- `src/client/main.tsx`: entry of the app in the browser (theme, error snackbar, router); `index.html`
- `src/client/router.tsx`: the routes ([React Router](https://reactrouter.com), data mode: `createBrowserRouter` with loaders): the start page (runs `startRoute`'s loader, `src/modules/registry.ts`) and the modules' redirecting pages, the app layout with every module's navigation data and the pages of the modules (`AppModule.routes`); `src/client/root.tsx`: root route (scroll restoration, chat page context, error and 404 pages)
- `src/client/routing.ts`: typed routes and module-scoped reloading (see [Data loading](#data-loading)): `defineRoute`, `defineNavigationData`, `reloadModules` / `useModuleRevalidator`, `redirectToLastPageWithRows`
- `src/client/AppLayout.tsx`: layout (app bar, the navigation of the modules in a sidebar, the chat panel, loaded on first open); its loader loads the user once
- `src/modules/types.ts`: the interfaces of a module: `AppModule` (app shell: pages (routes), navigation data and component with its heading in the sidebar, chat suggestions), `ServerModule` (the module's operations, its REST API, instructions for the AI assistants, chat context), `AppTool`
- `src/operations.ts`: the operation layer (see [Operations](#operations-one-definition-for-ui-chat-and-mcp)): `defineOperation`, `runOperation`, `toolsFromOperations`; `src/errors.ts`: `NotFoundError`, `ValidationError`, `errorMessage` (independent of the stack, shared by server and client)
- `src/modules/registry.ts`: the modules of the app (app shell part, in the order of the sidebar), the only list of modules; `src/modules/registry.server.ts`: their server parts (the `serverModule` export of every `src/modules/<module>/module.server.ts`, found with `import.meta.glob`): tools, instructions, chat context, REST APIs
- `src/chat/`: chat assistant (see [Chat assistant](#chat-assistant)): the agent, its tools, the page context (`chatPage.ts`, `useChatPage.tsx`) and the reload after changes (`useChatChanges.ts`); `src/components/ChatPanel.tsx`: its UI
- `src/mcp/`: MCP server (see [MCP server](#mcp-server-external-ai-clients))
- `src/db/db.server.ts`: database connection; `src/dates.ts`: calendar dates (`YYYY-MM-DD`) without time zone, the user's local date; `src/searchParams.ts`: search params serialization (repeated keys for arrays, also the API's query); `src/gridSearch.ts`, `src/db/filters.server.ts`, `src/components/useServerGrid.ts`: DataGrids with server-side pagination, sorting and filtering, their state in the URL (one zod schema per grid for the search params and the operation's input, sorting and filters typed by the grid's fields, typed columns, the grid's props, the SQL for sorting and filtering); `src/components/`: shared components and hooks used by the modules (e.g. `NavigationList` for the sidebar and `CollectionHeader` (heading with rename and delete), which reload their module's data after a change, `ConfirmDeleteDialog`, `NameDialog`, `useMutate` (a change without a form, then reloads the module's data), `useDocumentTitle`)
- `scripts/`: Node scripts (run with Node's TypeScript support, no build step): test data (`fixtures.ts`, `seed.ts`) and Preview deployments (`preview.ts`)

Todos module (`src/modules/todos/`):

- `module.ts`, `module.server.ts`: the module's definition (`AppModule` with its route objects, `ServerModule` exported as `serverModule`); `moduleId.ts`: its id (also the path of its API, `/api/todos`)
- `operations.server.ts`: the module's operations (list, create, rename, delete lists; find, create, update, delete todos; a list's page of todos for the grid): one definition each for the REST API and the AI assistants (the ones with AI metadata are the tools of the chat assistant and the MCP server)
- `api.server.ts`: the module's REST API, a route per operation the app uses (`/api/todos/lists`, `/api/todos/lists/:listId`, `/api/todos/lists/:listId/todos`, `/api/todos/todos/:id`); `api.ts`: its typed client (`todosClient`)
- `routes.ts`: the pages (`defineRoute`): `/lists` (redirects to the user's first list, creates a list "Todos" if the user has none), `/lists/:listId` (todos of a list; grid state (pagination, sorting, filtering) lives in the URL, `todoSearch.ts` with `src/gridSearch.ts`); `pages/ListPage.tsx`: its component (loaded when the page is opened)
- `navigation.ts`: the module's navigation data (the lists, `defineNavigationData`); `components/ListsNavigation.tsx`: the lists in the sidebar
- `db/`: database schema and repositories (`update`, `rename`, `delete` return the affected row, `undefined` if no row of the user matched); length limits in `limits.ts`
- `chatPage.ts`: what the module's pages tell the chat assistant (schema), see [Chat assistant](#chat-assistant)
- `overdue.ts`: whether a todo is overdue is decided in the browser with the user's local date

Notes module (`src/modules/notes/`), same structure:

- `routes.ts`, `pages/`: `/notes` (redirects to the user's first notebook, creates a notebook "Notes" if the user has none), `/notes/:notebookId` (`pages/NotebookPage.tsx`: the notebook's notes in a grid like the todos (`noteSearch.ts`), plus a search in title and body (`?q=`); a click on a row opens the note), `/notes/:notebookId/:noteId` (`pages/NotePage.tsx`: editor, keeps the grid state for its back link: title, body in Markdown with preview (`components/MarkdownPreview.tsx`, `markdown-to-jsx`, raw HTML isn't rendered), saved automatically shortly after typing stops and when leaving the note, move to another notebook, delete)
- `navigation.ts`, `components/NotebooksNavigation.tsx`: the user's notebooks in the sidebar
- `operations.server.ts`, `api.server.ts` (`/api/notes/notebooks`, `/api/notes/notebooks/:notebookId`, `/api/notes/notebooks/:notebookId/notes`, `/api/notes/notes/:id`), `api.ts`, `db/`, `chatPage.ts`, `limits.ts`: like in the todos module. The operations with AI metadata are the tools that manage notebooks and notes (find, read, create, update, append to, move, delete). Together with the todo tools the assistant can e.g. turn a note into todos, without the modules knowing each other.
- The editor takes over changes made elsewhere (e.g. by the assistant) when the note is reloaded, unless it has unsaved changes; it tells them from its own saves by `updatedAt`. Its autosave reloads nothing while the editor is open (the notes grid loads fresh data when the notebook is opened again; a save that finishes after leaving the editor reloads the page shown then), the tab title follows the saved title. If the note is moved (in the editor or by the assistant) the URL follows it, if it is deleted while open the page says so.

A new module gets its own folder with the same structure and one entry in `src/modules/registry.ts` (its `AppModule`, the position in the sidebar). Its server part (`module.server.ts`, with its REST API) and its tables (`db/schema.ts`, `drizzle.config.ts`) are found by the folder structure. In short:

1. `moduleId.ts`, `db/schema.ts` (then `npm run db:generate`) and the repositories in `db/`.
2. `operations.server.ts`: the module's operations (see below) and the instructions for the model.
3. `api.server.ts`: a route per operation the app uses (`operationRoute`); `api.ts`: `createClient<typeof myApi>(myModuleId)`.
4. `routes.ts`: the pages (`defineRoute`: path, search params, loader with the client), `pages/`: their components; `navigation.ts`: the sidebar's data (`defineNavigationData`); `chatPage.ts`: the schema of what the pages tell the assistant, reported with `useChatPage`.
5. `module.ts` (`AppModule`: route objects, navigation, chat suggestions) and `module.server.ts` (`export const serverModule: ServerModule`: `id`, `operations`, `api`, `instructions`, `chatContext` with `defineChatContext`).

### Operations: one definition for UI, chat and MCP

Every domain operation is defined once in the module's `operations.server.ts` (`src/operations.ts`): its input schema (zod, `.describe()` texts are shown to the model), its effect (`read`, `write`, `delete`), optionally AI metadata (title and description) and the handler with the whole business logic, incl. existence and ownership checks. Handlers throw `NotFoundError` or `ValidationError` (`src/errors.ts`), whose messages reach the user (form) and the model (tool error).

- **UI**: a route of the module's REST API runs the operation (`operationRoute(method, path, operation)` in `src/api/hono.server.ts`): its input is the path params plus the query (`GET`) or the JSON body, validated by the operation's schema; the response is the operation's result. The route's type (and so the typed client) is derived from the path and the operation: no second schema, no hand-written status handling.
- **Chat assistant and MCP server**: the operations with AI metadata are their tools, named like the operation's key (`toolsFromOperations`). An operation without AI metadata is only used by the UI (e.g. a grid's page of rows), one without a route only by the AI assistants (e.g. `findTodos`, `appendToNote`).
- **Reload after a tool changed data**: derived from the operation's module and effect (see [Chat assistant](#chat-assistant)).

Adding an operation, e.g. to mark all todos of a list as done:

```ts
// src/modules/todos/operations.server.ts, in todoOperations
completeList: defineOperation({
    input: z.object({ listId: z.string() }),
    effect: "write",
    // remove `ai` for an operation only the UI uses
    ai: { title: "Complete todo list", description: "Marks all todos of a list as done." },
    handler: async ({ userId }, { listId }) => {
        await getList(userId, listId); // NotFoundError → 404 in the UI, error message for the model
        // completeAll: a new repository method
        return { completed: await getTodoRepository().completeAll(userId, listId) };
    },
}),
```

```ts
// src/modules/todos/api.server.ts, in the chain of todosApi: only if the UI uses it
.on(...operationRoute("POST", "/lists/:listId/complete", todoOperations.completeList))

// in a component: run it and reload the module's data (useMutate shows an error in the snackbar)
const mutate = useMutate(todosModuleId);
void mutate(parseResponse(todosClient.lists[":listId"].complete.$post({ param: { listId } })));
```

That's all: the chat assistant and the MCP server offer the tool `completeList` (deleting operations need the user's confirmation), and after the assistant ran it the chat panel reloads the todos module's data.

### Data loading

The pages' data is loaded by React Router's loaders from the REST API (no client-side cache):

- **Typed routes** (`defineRoute`, `src/client/routing.ts`): a page's path, search params (`validateSearch`, e.g. the grid's schema) and loader are defined once in the module's `routes.ts`. The loader gets typed params and search params, `listRoute.href({ listId }, search)` builds typed links, and the page reads `listRoute.useLoaderData()`, `useParams()`, `useSearch()`, typed by the definition (the route's id is its path, so the data is the route's own). Renaming a path param or changing what a loader returns breaks the build. The route objects (`module.ts`) load the page components lazily, in parallel with the loader.
- **Reloading per module**: every route of a module is reloaded with its module's data only (`reloadModules`, `moduleShouldRevalidate`): after a change in the UI (`useMutate`, `useModuleRevalidator`, the shared collection components) and after the assistant changed it (the chat panel reloads the modules the agent reports). A new todo reloads the list page and the lists in the sidebar, not the notebooks. A navigation to a page loads its data fresh (e.g. the notes grid after editing a note).
- **Sidebar**: each module's navigation data (`defineNavigationData`) is loaded by a pathless route of its own around the pages, so the module's sidebar and pages read it typed (`useData`) and navigations between pages don't reload it.
- **Redirects**: the start page (runs the start route's loader) and the pages that only redirect (a loader without a component, e.g. `/lists`) are outside the app layout (React Router runs every loader again after a redirect on the initial load), so the user and the navigation data are loaded once, for the page they redirect to.
- **Errors**: a `404` of the API in a loader (e.g. a deleted list) shows the route's "not found" page; a `422` reaches the form as `ValidationError` (`errorMessage` shows its message).

## Authentication

There is no login logic in the app: Cloudflare Access sits in front of the worker and the static assets like an authenticating reverse proxy, lets users sign in with Entra ID and only forwards authenticated requests. The worker (REST API, chat, MCP server) rejects requests not authenticated by Access (`src/auth.server.ts`) and uses the user's email as user id:

- In production it verifies the Access JWT in the `Cf-Access-Jwt-Assertion` header (signature against `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, issuer and audience `ACCESS_AUD`). [`ctx.access`](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) is not available there: workers with static assets run behind an internal router worker that doesn't pass it on.
- Locally it uses `ctx.access`, simulated by the Workers runtime (`access.dev`).

Denied requests are logged with the reason (Workers Logs).

## Chat assistant

The assistant (chat panel, robot button in the app bar) works with the tools of all modules, e.g. manages the user's lists and todos in natural language, e.g. "Lege ein Todo mit dem Titel „Milch holen“ an", or summarizes a note and turns it into todos.

- **Agent** (`src/chat/agent.server.ts`): an `AIChatAgent` ([Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)), a Durable Object per user (instance name = user id). It keeps the chat history in its SQLite storage, streams the answers over a WebSocket (resumed after reconnects, in sync across tabs) and calls the model with the [AI SDK](https://ai-sdk.dev) (`streamText`).
- **Tools** (`src/chat/tools.server.ts`): the operations with AI metadata of all modules (`AppTool`, see [Operations](#operations-one-definition-for-ui-chat-and-mcp)) as AI SDK tools, e.g. list/create/rename/delete lists, find/create/update/delete todos, find/read/create/update notes, run directly (the agent runs in the same worker, it doesn't go through the REST API or the MCP server). The user id comes from the authentication, never from the model. Deleting needs the user's confirmation in the chat (`needsApproval`). After a tool that changes data (effect `write` or `delete`) the agent adds a `data-changes` part with the tool's module to its answer (`src/chat/chat.ts`), part of the persisted message, so a client reconnecting after a tool approval gets it too.
- **Page context** (`src/chat/chatPage.ts`): each module declares what its pages tell the assistant with a schema (`chatPage.ts`, e.g. `{ listId }`); a page reports what it shows with `useChatPage(todosChatPage, { listId })` (typed by the schema), the chat panel sends it with the user's local date (for relative due dates) with every message. The server validates it with the module's schema and the module turns it into context for the system prompt (`ServerModule.chatContext`, `defineChatContext`), e.g. the current list as default list for new todos, or the open note. No route ids: renaming a route or a context field breaks the build, not the assistant.
- **Routing/auth** (`src/server.ts`): the client connects to `/chat-agent`; the worker authenticates the request like any other (Cloudflare Access), rejects foreign origins (WebSockets aren't protected by CORS) and forwards it to the agent of the authenticated user. The Agents SDK's default routes (`/agents/...`) are not exposed.
- **Model** (`src/chat/model.server.ts`, `AI_MODEL` in `wrangler.jsonc`, default `@cf/zai-org/glm-4.7-flash`): a [Workers AI](https://developers.cloudflare.com/workers-ai/) model with function calling ([catalog](https://developers.cloudflare.com/ai/models/), e.g. also `@cf/moonshotai/kimi-k2.6`): run by Cloudflare, billed through the Cloudflare account (Workers AI pricing), no provider API key. Via the AI binding (`createAI` from `agents/models/ai-sdk`); in development via the AI Gateway REST API (see [Development](#development)). Requests go through the AI Gateway `AI_GATEWAY_ID` (default `default`, created on first use): logs, spend limits, rate limits.
- **UI** (`src/components/ChatPanel.tsx`): [MUI X Chat](https://mui.com/x/react-chat/) (`ChatBox`, alpha) renders the conversation of `useAgentChat`: its messages are controlled by `useAgentChat`, its adapter forwards sending, stopping and tool approvals. When the agent reports changed modules (`useChatChanges`, not for the history shown when the panel opens) it reloads exactly their data (`reloadModules`, see [Data loading](#data-loading)).

Setup (once per Cloudflare account): set a spend limit on the AI Gateway (dashboard → AI → AI Gateway). Some Workers AI models need the Workers Paid plan.

## MCP server (external AI clients)

The same tools as the chat assistant are available to external AI clients (Claude Desktop, claude.ai, Claude Code, ...) as [MCP](https://modelcontextprotocol.io) server at `https://<worker>.workers.dev/mcp`. The AI client brings its own model: no Workers AI costs.

- **Server** (`src/mcp/mcp.server.ts`): an `McpServer` of the [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/) (v2) with the tools of the modules, served stateless over Streamable HTTP with `createMcpHandler` of the Agents SDK (no Durable Object, no MCP session; current and 2025 protocol versions). Read-only tools are annotated as such, deleting tools as destructive: MCP clients ask the user for confirmation depending on their settings.
- **Login**: with Cloudflare Access [managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/), Access is the OAuth authorization server for MCP clients (discovery, dynamic client registration, tokens): the client opens the browser, the user signs in with Entra ID like in the app (same Access policies), the client gets an OAuth token. Access verifies the token on every request and forwards it with the Access JWT of the user, like a browser session. So the app has no OAuth code of its own: `src/server.ts` authenticates `/mcp` requests like all others (`src/auth.server.ts`), rejects foreign origins and passes the user to the MCP server; every tool is scoped to that user.

Setup (once, Zero Trust dashboard → Access controls → Applications → the application of the worker → Edit → Advanced settings):

1. Turn on **Managed OAuth**.
2. **Allowed redirect URIs**: `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback` (Claude Desktop and claude.ai connect through Anthropic's servers), plus the redirect URIs of other web-based MCP clients.
3. **Allow localhost clients** and **Allow loopback clients** for local clients like Claude Code or the MCP Inspector.
4. Recommended: **Access token lifetime** 15 minutes, **Grant session duration** e.g. 2 weeks (the client refreshes the token in the background, Access re-evaluates its policies on each refresh; afterwards the user signs in again).

Browser users aren't affected: Access only answers non-browser clients with `401` and OAuth discovery instead of the redirect to the login page.

Connect:

- Claude Desktop / claude.ai: Settings → Connectors → Add custom connector, URL `https://<worker>.workers.dev/mcp` → Connect (opens the Access login).
- Claude Code:

```bash
claude mcp add --transport http todos https://<worker>.workers.dev/mcp
```

Locally the MCP server is at http://localhost:5180/mcp, without login (authenticated as `DEV_USER_EMAIL` by the simulated Access), e.g. `claude mcp add --transport http todos-dev http://localhost:5180/mcp`. MCP clients that run in a browser page of another origin are rejected (foreign origin).

## Database

Cloudflare D1 (SQLite) with Drizzle: schema and repositories in the modules (`src/modules/<module>/db/`), migrations in `drizzle/` (one migration history for the database, generated from the schemas of all modules).

After changing the schema:

```bash
npm run db:generate  # generates a migration into drizzle/
npm run db:migrate   # applies it to the local D1 (also done on `npm run dev`)
```

Migrations are applied before the new code is deployed (`npm run deploy`), so the currently running code must keep working with the new schema: e.g. add a column (with a default) in one deployment, remove one only after the code no longer uses it.

## Deployment (Cloudflare)

Deploy with `npm run deploy` (build, apply pending D1 migrations, deploy, [delete databases of deleted Previews](#preview-deployments)), either locally or with [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) (Git integration): leave the build command empty and set the deploy command to `npm run deploy`.

1. The D1 database doesn't need to be created manually: `wrangler.jsonc` has no `database_id`, so the first `wrangler deploy` creates a database named `serverless-todos` (or connects to an existing one with that name). As `npm run deploy` applies the migrations before deploying, the very first deployment (no database yet) is done with `npm run build && npx wrangler deploy`, followed by `npm run deploy`.
2. Set up Cloudflare Access (Zero Trust dashboard):
    1. Add Microsoft Entra ID as identity provider (Settings → Authentication → Login methods), see the [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/entra-id/).
    2. Protect the `workers.dev` URL: Workers & Pages → serverless-todos → Settings → Domains & Routes → `workers.dev` → Enable Cloudflare Access. This creates an Access application for the URL (Preview URLs get their own, see [Preview deployments](#preview-deployments)).
    3. Edit that Access application (Zero Trust → Access → Applications): use Entra ID as the only login method and a policy that allows the intended users (e.g. an Entra group or email domain).
    4. For the MCP server: turn on managed OAuth on that Access application, see [MCP server](#mcp-server-external-ai-clients).
    5. Set `ACCESS_TEAM_DOMAIN` (`https://<team-name>.cloudflareaccess.com`, see Zero Trust → Settings → Team name and domain) and `ACCESS_AUD` (the Application Audience (AUD) Tag on the application's overview) in `wrangler.jsonc`.
3. Deploy: `npm run deploy`

## Preview deployments

Every branch (and so every pull request) gets its own [Worker Preview](https://developers.cloudflare.com/workers/previews/) with its own D1 database filled with test data, created by Workers Builds (no GitHub Actions or secrets in GitHub). The Cloudflare GitHub app comments the Preview URL (`https://<branch>-serverless-todos.<subdomain>.workers.dev`) on the pull request.

How it works (`scripts/preview.ts`):

- On every push to a branch other than `main`, Workers Builds runs `npm run preview:deploy`:
    1. Creates the D1 database `serverless-todos-preview-<branch>-<hash>` if it doesn't exist yet. The branch is stored in a table `_preview` in the database (not part of the Drizzle schema).
    2. Applies the pending migrations, like `npm run deploy` does in production. The database is kept between pushes, so testers' data survives a push and the migrations are tested on existing data.
    3. Inserts the test data (`scripts/fixtures.ts`) for every email in the build variable `PREVIEW_FIXTURE_USERS`, once per database. Data belongs to the Access user's email, so these are the emails of the people testing Previews.
    4. Builds with the database in the `previews` config (`vite.config.ts`) and deploys the Preview with `wrangler preview --name <branch>`. Previews use the `previews` block of `wrangler.jsonc`, not the production settings: new bindings and vars have to be added there too.
- The chat assistant works in Previews too (same model and AI Gateway as production, costs go to the same account). Every Preview gets its own Durable Object namespace from Cloudflare, so chat histories are separate per Preview and deleted with it.
- When the branch is deleted (GitHub deletes it after merging the pull request, see setup), Workers Builds deletes its Preview. Cloudflare doesn't delete the D1 database with it, so `npm run preview:cleanup` deletes the databases whose Preview no longer exists. As a safety net for branches that are never deleted, it also deletes Previews not deployed for 30 days (build variable `PREVIEW_TTL_DAYS`) together with their database; a later push to the branch creates them again, with fresh test data.
- Cleanup runs after every production deploy (= after every merge) and every Preview deploy, so nothing is cleaned up while there are no builds. It never fails the deployment, keeps a database whenever it can't tell whether its Preview exists, and skips databases created less than an hour ago (their Preview may not exist yet). It checks Previews with the Cloudflare API if `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set, otherwise with `wrangler preview secret list` (fails with "was not found" for a deleted Preview); the log says which one is used.

To reset a Preview's database, delete it (`npx wrangler d1 list` shows the name, `npx wrangler d1 delete <name>`) and retry the Preview's latest build in the dashboard.

A pull request closed without merging keeps its Preview and database until its branch is deleted (GitHub offers to delete it when closing the pull request) or the Preview expires.

### Setup

1. Protect the Preview URLs with Cloudflare Access: Workers & Pages → serverless-todos → Settings → Domains & Routes → Preview URLs → Enable Cloudflare Access. Configure that Access application like the production one (Entra ID, allowed users) and set its Application Audience (AUD) Tag as `previews.vars.ACCESS_AUD` in `wrangler.jsonc`. Without it the app rejects every request to a Preview (403). To use the MCP server of a Preview (`https://<branch>-serverless-todos.<subdomain>.workers.dev/mcp`), turn on managed OAuth on that Access application too (see [MCP server](#mcp-server-external-ai-clients)).
2. Workers Builds (Workers & Pages → serverless-todos → Settings → Build):
    1. Branch control: enable Preview builds. Workers connected to Builds before Worker Previews show a "Set up Worker Previews" banner first: the switch can't be undone.
    2. Preview command: `npm run preview:deploy` (build command stays empty).
    3. Variables and secrets: add `PREVIEW_FIXTURE_USERS` with the testers' emails (comma separated). Optionally `PREVIEW_TTL_DAYS` (default 30).
    4. The build token needs permission to edit D1 (it already applies the production migrations in `npm run deploy`).
3. GitHub (repository settings → General → Pull Requests): enable "Automatically delete head branches", so merging a pull request deletes its branch and with it the Preview.
