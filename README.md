# serverless-todos

Minimal todo app (multiple lists, todos with description and due date, overdue todos are highlighted, notebooks with Markdown notes, AI chat assistant that manages the todos and notes, MCP server for external AI clients like Claude Desktop): React single-page app (React Router) with a tRPC API on Cloudflare Workers, MUI + DataGrid, Drizzle, login via Cloudflare Access (Entra ID), Cloudflare Agents SDK + AI Gateway + MUI X Chat, MCP TypeScript SDK.

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

The app is a single-page app (React Router in [data mode](https://reactrouter.com/start/data/routing): routes with loaders, client-side only) served as static assets, and a worker with the API ([tRPC](https://trpc.io)), the chat assistant and the MCP server. It consists of a core (app shell, API, authentication, chat assistant, MCP server, database connection) and feature modules. The todos and the notes are modules. Everything that belongs to a module lives in its folder `src/modules/<module>/`, the core only knows the modules through the registries and the interfaces in `src/modules/types.ts`.

Core:

- `src/server.ts`: worker entry: authenticates every request to its endpoints once (Cloudflare Access, `src/auth.server.ts`, the user is identified by email), rejects foreign origins (CSRF, cross-site WebSockets), and routes `/api/*` to the API, chat requests to the user's chat agent and MCP requests to the MCP server. All other paths are static assets (`assets` in `wrangler.jsonc`: only the worker's endpoints are in `run_worker_first`; unknown paths get `index.html` for the client-side routing)
- `src/api/`: the API ([tRPC](https://trpc.io), [superjson](https://github.com/flightcontrolhq/superjson) as transformer, so e.g. Dates stay Dates):
    - `trpc.server.ts`: procedures with the authenticated user as context; `query(operation)` / `mutation(operation)` turn an operation into a procedure (validated with the operation's schema, typed by it); the operations' errors are mapped once (`NotFoundError` → `NOT_FOUND`, `ValidationError` and invalid input → `BAD_REQUEST` with the schema's message)
    - `router.server.ts`: the app's router, composed at runtime: the core's procedures (`user`) and every module's router under the module's id (`ServerModule.api`, e.g. `todos.createList`); the fetch handler at `/api`
    - `client.ts`: the clients for the browser: `createModuleClient<Router>(moduleId)` gives a module a client typed by its own router (`todosApi.createList.mutate({ name })`), `api` is the core's. All clients share one batch link (the requests made at the same time, e.g. by the loaders of a page and the sidebar, are one HTTP request) and turn `NOT_FOUND` / `BAD_REQUEST` back into `NotFoundError` / `ValidationError`
- `index.html`, `src/main.tsx`: browser entry (theme, error snackbar, router)
- `src/router.tsx`: the route tree: start page (`src/routes/index.ts`, redirects to `startPath` of `src/modules/registry.ts`), app layout (`src/routes/app.tsx`: app bar, sidebar, chat panel; its loader loads the user), below it one pathless route per module that loads the module's navigation data, then the pages of the modules (`AppModule.routes`) and the error pages (`src/routes/root.tsx`: 404 and errors, shown within the layout). `src/routes/root.tsx` also renders `ChatPageProvider` (page context for the chat) around everything.
- `src/routing.ts`: typed routes for React Router's data mode (see [Data loading](#data-loading)): `defineRoute` (path, search params, loader → route object, `href`, `useParams`, `useSearch`, `useLoaderData`), `defineLoader`, `usePageTitle`; `src/navigation.tsx`: `defineNavigation` (a module's section in the sidebar, its data typed by its loader); `src/moduleData.ts`: reloading the data of changed modules only (`useRevalidateModule`, `useRevalidateModules`, `useNavigateAfterChange`, the modules' `shouldRevalidate`); `src/collections.ts`: helpers for the collection pages (`defaultCollectionId` for the index pages, `useCreateCollection` for the sidebar, `useCollectionHeaderActions` for rename/delete in the heading)
- `src/modules/types.ts`: the interfaces of a module: `AppModule` (app shell: routes, navigation, chat suggestions), `ServerModule` (the module's operations, its API router, instructions for the AI assistants, chat context), `AppTool`
- `src/operations.ts`: the operation layer (see [Operations](#operations-one-definition-for-ui-chat-and-mcp)): `defineOperation`, `runOperation`, `toolsFromOperations`; `src/errors.ts`: `NotFoundError`, `ValidationError`, `errorMessage` (independent of the stack, shared by server and client)
- `src/modules/registry.ts`: the modules of the app (app shell part, in the order of the sidebar), the only list of modules; `src/modules/registry.server.ts`: their server parts (the `serverModule` export of every `src/modules/<module>/module.server.ts`, found with `import.meta.glob`) with their API routers, tools, instructions and chat context
- `src/chat/`: chat assistant (see [Chat assistant](#chat-assistant)): the agent, its tools, the page context (`chatPage.ts`, `useChatPage.tsx`) and the reload after changes (`useChatChanges.ts`); `src/components/ChatPanel.tsx`: its UI
- `src/mcp/`: MCP server (see [MCP server](#mcp-server-external-ai-clients))
- `src/db/db.server.ts`: database connection; `src/dates.ts`: calendar dates (`YYYY-MM-DD`) without time zone, the user's local date; `src/searchParams.ts`: search params as objects (arrays as repeated keys); `src/gridSearch.ts`, `src/db/filters.server.ts`, `src/components/useServerGrid.ts`: DataGrids with server-side pagination, sorting and filtering, their state in the URL (one zod schema per grid for the search params and the operation's input, sorting and filters typed by the grid's fields, typed columns, the grid's props, the SQL for sorting and filtering); `src/components/`: shared components and hooks used by the modules (e.g. `NavigationList` for the sidebar, `CollectionHeader` (heading with rename and delete), `ConfirmDeleteDialog`, `NameDialog`, `useMutate` (a change without a form, then reloads the module's data), `useUnsavedChangesPrompt` (asks in a dialog, `UnsavedChangesDialog`, whether to save a form's unsaved changes before leaving the page: React Router's `useBlocker`))
- `scripts/`: Node scripts (run with Node's TypeScript support, no build step): test data (`fixtures.ts`, `seed.ts`) and Preview deployments (`preview.ts`)

Todos module (`src/modules/todos/`):

- `module.ts`, `module.server.ts`: the module's definition (`AppModule` with its routes and pages, `ServerModule` exported as `serverModule`); `moduleId.ts`: its id
- `operations.server.ts`: the module's operations (list, create, rename, delete lists; find, get, create, update, delete todos; a list's page of todos for the grid): one definition each for the UI and the AI assistants (the ones with AI metadata are the tools of the chat assistant and the MCP server)
- `api.server.ts`: the module's tRPC router, one line per operation the UI uses (`query(todoOperations.listTodos)`); `api.ts`: its client `todosApi` and the types of its results (`TodosApiOutputs`)
- `routes.ts`: the routes (`defineRoute`): `/lists` (redirects to the user's first list, creates a list "Todos" if the user has none), `/lists/:listId` (todos of a list; grid state (pagination, sorting, filtering) lives in the URL, `todoSearch.ts` with `src/gridSearch.ts`; the edit action opens the todo's detail page), `/lists/:listId/:todoId` (a todo's detail page: a form ([React Hook Form](https://react-hook-form.com)) saved with its Save button, not automatically; leaving it with unsaved changes asks whether to save them; changes made elsewhere (e.g. by the assistant) are taken over, except for the fields the user has changed; keeps the grid state for its back link); `pages/list.tsx`, `pages/todo.tsx`: the pages, loaded with their route (code splitting)
- `navigation.ts`, `components/ListsNavigation.tsx`: the user's lists in the sidebar (`defineNavigation`); the pages read them too (`listsNavigation.useLoaderData()`, e.g. for the "move to" menu)
- `db/`: database schema and repositories (`update`, `rename`, `delete` return the affected row, `undefined` if no row of the user matched); length limits in `limits.ts`
- `chatPage.ts`: what the module's pages tell the chat assistant (schema), see [Chat assistant](#chat-assistant)
- `overdue.ts`: whether a todo is overdue is decided in the browser with the user's local date

Notes module (`src/modules/notes/`), same structure:

- `routes.ts`, `pages/`: `/notes` (redirects to the user's first notebook, creates a notebook "Notes" if the user has none), `/notes/:notebookId` (the notebook's notes in a grid like the todos (`noteSearch.ts`), plus a search in title and body (`?q=`); a click on a row opens the note), `/notes/:notebookId/:noteId` (editor, keeps the grid state for its back link: title, body in Markdown with preview (`components/MarkdownPreview.tsx`, `markdown-to-jsx`, raw HTML isn't rendered), saved automatically shortly after typing stops and when leaving the note, move to another notebook, delete)
- `navigation.ts`, `components/NotebooksNavigation.tsx`: the user's notebooks in the sidebar
- `operations.server.ts`, `api.server.ts`, `api.ts`, `db/`, `chatPage.ts`, `limits.ts`: like in the todos module. The operations with AI metadata are the tools that manage notebooks and notes (find, read, create, update, append to, move, delete). Together with the todo tools the assistant can e.g. turn a note into todos, without the modules knowing each other.
- The editor takes over changes made elsewhere (e.g. by the assistant) when the note is reloaded, unless it has unsaved changes; it tells them from its own saves by `updatedAt`. Its autosave reloads nothing (the notebook's grid is loaded again when it is opened, the sidebar doesn't change). If the note is moved (in the editor or by the assistant) the route's loader redirects to its new URL, if it is deleted while open the page says so.

A new module gets its own folder with the same structure and one entry in `src/modules/registry.ts` (its `AppModule`, the position in the sidebar). Its server part (`module.server.ts`), its API router (mounted under the module's id) and its tables (`db/schema.ts`, `drizzle.config.ts`) are found by the folder structure. In short:

1. `moduleId.ts`, `db/schema.ts` (then `npm run db:generate`) and the repositories in `db/`.
2. `operations.server.ts`: the module's operations (see below) and the instructions for the model.
3. `api.server.ts`: `router({ ... })` with `query(...)` / `mutation(...)` for the operations the UI uses; `api.ts`: `createModuleClient<typeof router>(moduleId)`.
4. `routes.ts`: the routes with `defineRoute`; `pages/`: their pages (`export function Component()`, React Router's lazy route module); `navigation.ts`: `defineNavigation` for the sidebar; `chatPage.ts`: the schema of what the pages tell the assistant, reported with `useChatPage`.
5. `module.ts` (`AppModule`: `id`, `routes` (`{ ...route.route, lazy: () => import("./pages/...") }`), `navigation`, chat suggestions) and `module.server.ts` (`export const serverModule: ServerModule`: `id`, `operations`, `api`, `instructions`, `chatContext` with `defineChatContext`).

### Operations: one definition for UI, chat and MCP

Every domain operation is defined once in the module's `operations.server.ts` (`src/operations.ts`): its input schema (zod, `.describe()` texts are shown to the model), its effect (`read`, `write`, `delete`), optionally AI metadata (title and description) and the handler with the whole business logic, incl. existence and ownership checks. Handlers throw `NotFoundError` or `ValidationError` (`src/errors.ts`), whose messages reach the user (form) and the model (tool error).

- **UI**: the module's tRPC router wraps the operations the UI uses (`query`/`mutation` in `src/api/trpc.server.ts`: tRPC validates the input with the operation's schema, the client is typed by it and by the handler's result). Wrapping keeps the operations independent of tRPC; making the procedures themselves the operations (procedure meta plus `createCaller`) would need tRPC's internal router introspection for the tools and gain nothing.
- **Chat assistant and MCP server**: the operations with AI metadata are their tools, named like the operation's key (`toolsFromOperations`). An operation without AI metadata is only used by the UI (e.g. a grid's page of rows), one without a procedure only by the AI assistants (e.g. `findTodos`, `appendToNote`).
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
// src/modules/todos/api.server.ts, in todosRouter: only if the UI uses it
completeList: mutation(todoOperations.completeList),

// in a component: run it and reload the module's data (useMutate shows an error in the snackbar)
const mutate = useMutate(todosModuleId);
void mutate(todosApi.completeList.mutate({ listId }));
```

That's all: the chat assistant and the MCP server offer the tool `completeList` (deleting operations need the user's confirmation), and after the assistant ran it the chat panel reloads the todos module's data.

### Data loading

There is no client cache: the route loaders load a page's data from the API when the page is opened, and load it again after a change.

- **Routes** (`defineRoute`, `src/routing.ts`): React Router's data mode has no typed links, params or loader data, so a route is defined once with its absolute path (e.g. `"/lists/:listId"`), its search params (`validateSearch`, e.g. the grid's zod schema) and its loader, which gets the params typed by the path. The page and its links use what `defineRoute` returns: `listRoute.href({ listId })`, `listRoute.useLoaderData()` (typed by the loader), `useParams()`, `useSearch()`. Renaming a path param or changing the loader's result breaks the build at every use. A `NotFoundError` of a loader (e.g. the API's `NOT_FOUND` for a list that doesn't exist (anymore)) becomes a 404 of the route.
- **Pages** are lazy route modules (`lazy: () => import("./pages/list")`, exporting `Component` and optionally `ErrorBoundary`): each page is a chunk of its own, loaded in parallel with the route's loader (the DataGrid is only loaded with the grid pages, the chat panel when it is opened).
- **Sidebar**: each module's navigation data is loaded by a pathless route of its own above the pages (`defineNavigation`, its component gets the data typed by the loader). All loaders of a page run in parallel and the shared batch link sends their requests as one HTTP request.
- **Reloading after a change** (`src/moduleData.ts`): every route of a module (its pages and its navigation) only revalidates after a change of its own module: a change in the UI (`useRevalidateModule`, `useMutate`; `useNavigateAfterChange` when the change leads to another page, e.g. to the list just created: the sidebar is reloaded with the new page in one request) or by the assistant (the chat panel reloads the modules the agent reports) runs the loaders of exactly the changed modules again (e.g. marking a todo as done reloads the list and the lists in the sidebar, not the notebooks). Other search params of a page (e.g. a grid's filter) reload the page, not the sidebar.
- **Index pages** (`/lists`, `/notes`) read the user's collections and redirect to the first one; only if there is none they create it (`defaultCollectionId`).

## Authentication

There is no login logic in the app: Cloudflare Access sits in front of the worker like an authenticating reverse proxy, lets users sign in with Entra ID and only forwards authenticated requests. The static assets (the app's HTML, JS, CSS: no user data) are only protected by Access; the worker rejects requests to its endpoints (API, chat, MCP) not authenticated by Access (`src/auth.server.ts`) and uses the user's email as user id:

- In production it verifies the Access JWT in the `Cf-Access-Jwt-Assertion` header (signature against `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, issuer and audience `ACCESS_AUD`). [`ctx.access`](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) is not available there: workers with static assets run behind an internal router worker that doesn't pass it on.
- Locally it uses `ctx.access`, simulated by the Workers runtime (`access.dev`).

Denied requests are logged with the reason (Workers Logs).

## Chat assistant

The assistant (chat panel, robot button in the app bar) works with the tools of all modules, e.g. manages the user's lists and todos in natural language, e.g. "Lege ein Todo mit dem Titel „Milch holen“ an", or summarizes a note and turns it into todos.

- **Agent** (`src/chat/agent.server.ts`): an `AIChatAgent` ([Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)), a Durable Object per user (instance name = user id). It keeps the chat history in its SQLite storage, streams the answers over a WebSocket (resumed after reconnects, in sync across tabs) and calls the model with the [AI SDK](https://ai-sdk.dev) (`streamText`).
- **Tools** (the operations with AI metadata of the modules, e.g. `src/modules/todos/operations.server.ts`, as `AppTool`s (`toolsFromOperations`) and as AI SDK tools in `src/chat/tools.server.ts`): e.g. list/create/rename/delete lists, find/create/update/delete todos, find/read/create/update notes, the same operations the UI uses through the API (the agent runs in the same worker, it doesn't go through the API or the MCP server). The user id comes from the authentication, never from the model. Deleting needs the user's confirmation in the chat (`needsApproval`).
- **Page context**: the client sends its local date (for relative due dates) and the page shown with every message (`src/chat/chat.ts`). Each module describes what its pages show with a zod schema (`src/modules/<module>/chatPage.ts`, `defineChatPage`), a page reports it with `useChatPage(todosChatPage, { listId })` (`src/chat/useChatPage.tsx`, typed by the schema), and the server module turns it into context for the system prompt (`ServerModule.chatContext`, `defineChatContext` validates it with the schema), e.g. the current list as default list for new todos, or the open note. The server doesn't depend on routes.
- **Routing/auth** (`src/server.ts`): the client connects to `/chat-agent`; the worker authenticates the request like any other (Cloudflare Access), rejects foreign origins (WebSockets aren't protected by CORS) and forwards it to the agent of the authenticated user. The Agents SDK's default routes (`/agents/...`) are not exposed.
- **Model** (`src/chat/model.server.ts`, `AI_MODEL` in `wrangler.jsonc`, default `@cf/zai-org/glm-4.7-flash`): a [Workers AI](https://developers.cloudflare.com/workers-ai/) model with function calling ([catalog](https://developers.cloudflare.com/ai/models/), e.g. also `@cf/moonshotai/kimi-k2.6`): run by Cloudflare, billed through the Cloudflare account (Workers AI pricing), no provider API key. Via the AI binding (`createAI` from `agents/models/ai-sdk`); in development via the AI Gateway REST API (see [Development](#development)). Requests go through the AI Gateway `AI_GATEWAY_ID` (default `default`, created on first use): logs, spend limits, rate limits.
- **UI** (`src/components/ChatPanel.tsx`): [MUI X Chat](https://mui.com/x/react-chat/) (`ChatBox`, alpha) renders the conversation of `useAgentChat`: its messages are controlled by `useAgentChat`, its adapter forwards sending, stopping and tool approvals. After a tool whose operation writes or deletes, the agent adds a `changes` data part with the module's id to its answer (`src/chat/agent.server.ts`); `useChatChanges` reports it once and the loaders of exactly these modules run again (`useRevalidateModules`, see [Data loading](#data-loading)).

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
