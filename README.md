# serverless-todos

Minimal todo app (multiple lists, todos with description and due date, overdue todos are highlighted, notebooks with Markdown notes, AI chat assistant that manages the todos and notes, MCP server for external AI clients like Claude Desktop): TanStack Start, MUI + DataGrid, Drizzle, login via Entra ID, AI SDK + MUI X Chat with a model of any OpenAI-compatible API, MCP TypeScript SDK.

The app runs on two platforms with the same code, only the server entry differs (`src/platform/platform.server.ts`):

|                   | Cloudflare (default)                                                                                                   | [bunny.net](https://bunny.net)                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime           | Cloudflare Workers (`src/server.cloudflare.ts`)                                                                        | [Edge Scripting](https://docs.bunny.net/scripting) (Deno), a standalone script (`src/server.bunny.ts`) |
| Database          | D1                                                                                                                     | libSQL: [Bunny Database](https://docs.bunny.net/database)                                              |
| Static files      | Workers static assets                                                                                                  | Storage Zone, served by the script                                                                     |
| Login             | Cloudflare Access (Entra ID)                                                                                           | OpenID Connect in the app (Entra ID), `src/platform/oidc.server.ts`                                    |
| Deployment        | `npm run deploy`, Workers Builds, Worker Previews                                                                      | GitHub Actions (`.github/workflows/bunny.yml`)                                                         |
| Local development | `npm run dev`: Workers runtime (workerd) via `@cloudflare/vite-plugin`, D1 emulated by Miniflare in `.wrangler/state/` | `npm run dev:bunny`: in Node, SQLite file `.data/app.db`                                               |

The bunny.net platform uses no Cloudflare service; neither does the chat assistant on either platform: its model is called with an API key (`AI_API_KEY`), without one there is no chat assistant (see [Chat assistant](#chat-assistant)). No external database is needed for development.

## Setup

```bash
./install.sh
```

## Development

```bash
npm run dev       # Cloudflare platform: applies pending migrations to the local D1, starts the app (http://localhost:5180)
npm run dev:bunny # bunny.net platform (in Node): applies pending migrations to the local SQLite file .data/app.db, starts the app (http://localhost:5180)
```

Processes are managed by [dev-process-manager](https://www.npmjs.com/package/dev-process-manager) (`npx dev-pm status`, `npx dev-pm logs`, `npx dev-pm stop`).

Every request is authenticated as `DEV_USER_EMAIL` (`.env`): on the Cloudflare platform Cloudflare Access is simulated by the Workers runtime (`access.dev`, configured in `vite.config.ts`), on the bunny.net platform the server entry uses it as long as `OIDC_ISSUER` isn't set (only in development). To work as another user, set `DEV_USER_EMAIL` in `.env.local` and restart. There is no login/logout locally (the logout button leads to a 404). To try the login of the bunny.net platform locally, set the `OIDC_*` variables in `.env.local` (see [Deployment (bunny.net)](#deployment-bunnynet), redirect URI `http://localhost:5180/auth/callback`).

The chat assistant calls a real model also in development, with costs. It needs an API key in `.env.local` (without one there is no chat button), optionally another API or model:

```bash
AI_API_KEY=...
# AI_BASE_URL=https://<resource>.openai.azure.com/openai/v1  # default https://api.openai.com/v1
# AI_MODEL=gpt-5-mini                                         # Azure: the deployment name
```

On the Cloudflare platform the worker sends the model requests to the dev server (`/__ai/...`), which forwards them from Node with the API key (`aiDevProxy.ts`). In a sandbox whose egress proxy injects credentials (e.g. [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)), allow the API's host in the environment's network settings and add the API key as network secret (credential injection) for that host; `AI_API_KEY` can then be any value (it is replaced by the proxy). This works because the requests are sent from Node, which uses `HTTPS_PROXY`; the Workers runtime itself ignores it. On the bunny.net platform the server (Node in development) sends them itself.

The local D1 database can be browsed and queried in the Cloudflare Local Explorer at http://localhost:5180/cdn-cgi/explorer (while `npm run dev` is running), or from the command line:

```bash
npx wrangler d1 execute DB --local --command "SELECT * FROM todos"
npm run db:reset  # delete the local database and re-apply all migrations
npm run db:seed   # insert test data (scripts/fixtures.ts) for DEV_USER_EMAIL
```

On the bunny.net platform: `npm run db:reset:bunny`, `npm run db:seed:bunny` (the database is the file `.data/app.db`, e.g. `sqlite3 .data/app.db`).

## Structure

The app consists of a core (app shell, platforms with authentication and database connection, chat assistant, MCP server) and feature modules. The todos and the notes are modules. Everything that belongs to a module lives in its folder `src/modules/<module>/`, the core only knows the modules through the registries and the interfaces in `src/modules/types.ts`.

Core:

- `src/server.cloudflare.ts`, `src/server.bunny.ts`: the server entries of the platforms (selected by `PLATFORM` in `vite.config.ts`): register the platform (`src/platform/platform.server.ts`: database, environment variables, logout) and authenticate every request (`src/platform/cloudflareAccess.server.ts`, `src/platform/oidc.server.ts`; the user is identified by email, `src/user.ts`) before `src/server.ts` routes it: the app gets the user as request context, chat requests go to the chat assistant, MCP requests to the MCP server (both also reject foreign origins). So an endpoint added later is authenticated too.
- `src/start.ts`: the TanStack Start instance: CSRF check of the server functions, passes the user on to the server functions (`context.user`), maps the errors of the operations once for all server functions (`NotFoundError` → the router's not found, `ValidationError` → reaches the client as `ValidationError`, the form shows its message)
- `src/router.tsx`: the router with TanStack Query (see [Data loading](#data-loading)); `src/routes.ts`: the route tree ([virtual file routes](https://tanstack.com/router/latest/docs/framework/react/routing/virtual-file-routes), configured in `tsr.config.json`): the core routes in `src/routes/`, the routes of each module mounted from its folder `src/modules/<module>/routes/` (file-based routing within the folder; the module folders with a `routes/` folder are found automatically). `src/routeTree.gen.ts` is generated by the TanStack Start Vite plugin on `dev`/`build` and by `npm run routegen` (`scripts/routeTree.ts`), which `npm run lint:tsc` runs first, so `tsc` never checks a stale route tree (committed)
- `src/routes/index.tsx`: start page, redirects to `startPath` (`src/modules/registry.ts`)
- `src/routes/_app.tsx`: layout (app bar, the navigation of the modules in a sidebar); its pages are rendered in the browser only (`ssr: "data-only"`, see [Data loading](#data-loading))
- `src/modules/types.ts`: the interfaces of a module: `AppModule` (app shell: navigation with its heading in the sidebar, chat suggestions), `ServerModule` (the module's operations, instructions for the AI assistants, chat context), `AppTool`
- `src/operations.ts`: the operation layer (see [Operations](#operations-one-definition-for-ui-chat-and-mcp)): `defineOperation`, `runOperation`, `operationInput`, `toolsFromOperations`; `src/operationHandler.ts`: the handler of a server function that wraps an operation; `src/errors.ts`: `NotFoundError`, `ValidationError`, `errorMessage` (independent of the stack, shared by server and client)
- `src/modules/registry.ts`: the modules of the app (app shell part, in the order of the sidebar), the only list of modules; `src/modules/registry.server.ts`: their server parts (the `serverModule` export of every `src/modules/<module>/module.server.ts`, found with `import.meta.glob`)
- `src/moduleQueries.ts`: reloading a module's data (`invalidateModules`, `useInvalidateModule`), a page's main query (`usePageQuery`); `src/collections.ts`: the default collection of a module's index page (`defaultCollectionId`)
- `src/chat/`: chat assistant (see [Chat assistant](#chat-assistant)): the endpoint, the model, its tools, the history (`db/`), the page context (`chatPage.ts`, `useChatPage.tsx`) and the reload after changes (`useChatChanges.ts`); `src/components/ChatPanel.tsx`: its UI
- `src/mcp/`: MCP server (see [MCP server](#mcp-server-external-ai-clients))
- `src/db/db.server.ts`: database connection (D1 or libSQL, from the platform); `src/dates.ts`: calendar dates (`YYYY-MM-DD`) without time zone, the user's local date; `src/searchParams.ts`: search params serialization; `src/gridSearch.ts`, `src/db/filters.server.ts`, `src/components/useServerGrid.ts`: DataGrids with server-side pagination, sorting and filtering, their state in the URL (one zod schema per grid for the search params and the operation's input, sorting and filters typed by the grid's fields, typed columns, the grid's props, the SQL for sorting and filtering); `src/components/`: shared components and hooks used by the modules (e.g. `NavigationList` for the sidebar, `CollectionHeader` (heading with rename and delete), `ConfirmDeleteDialog`, `NameDialog`, `useMutate` (a change without a form, then reloads the module's data))
- `scripts/`: Node scripts (run with Node's TypeScript support, no build step): test data (`fixtures.ts`, `seed.ts`), Preview deployments (`preview.ts`), migrations of the libSQL database (`migrate.ts`)

Todos module (`src/modules/todos/`):

- `module.ts`, `module.server.ts`: the module's definition (`AppModule`, `ServerModule` exported as `serverModule`); `moduleId.ts`: its id
- `operations.server.ts`: the module's operations (list, create, rename, delete lists; find, create, update, delete todos; a list's page of todos for the grid): one definition each for the UI and the AI assistants (the ones with AI metadata are the tools of the chat assistant and the MCP server)
- `routes/`: `/lists` (redirects to the user's first list, creates a list "Todos" if the user has none), `/lists/$listId` (todos of a list; grid state (pagination, sorting, filtering) lives in the URL, `todoSearch.ts` with `src/gridSearch.ts`)
- `queries.ts`: the module's queries (the lists for the sidebar, a page of todos), their keys start with the module's id
- `components/ListsNavigation.tsx`: the user's lists in the sidebar (prefetched by the app layout, read with the lists query)
- `todos.functions.ts`, `lists.functions.ts`: server functions, thin adapters over the operations (length limits in `limits.ts`)
- `db/`: database schema and repositories (`update`, `rename`, `delete` return the affected row, `undefined` if no row of the user matched)
- `chatPage.ts`: what the module's pages tell the chat assistant (schema), see [Chat assistant](#chat-assistant)
- `overdue.ts`: whether a todo is overdue is decided in the browser with the user's local date

Notes module (`src/modules/notes/`), same structure:

- `routes/`: `/notes` (redirects to the user's first notebook, creates a notebook "Notes" if the user has none), `/notes/$notebookId` (the notebook's notes in a grid like the todos (`noteSearch.ts`), plus a search in title and body (`?q=`); a click on a row opens the note), `/notes/$notebookId/$noteId` (editor, keeps the grid state for its back link: title, body in Markdown with preview (`components/MarkdownPreview.tsx`, `markdown-to-jsx`, raw HTML isn't rendered), saved automatically shortly after typing stops and when leaving the note, move to another notebook, delete)
- `components/NotebooksNavigation.tsx`: the user's notebooks in the sidebar
- `operations.server.ts`, `queries.ts`, `notebooks.functions.ts`, `notes.functions.ts`, `db/`, `chatPage.ts`, `limits.ts`: like in the todos module. The operations with AI metadata are the tools that manage notebooks and notes (find, read, create, update, append to, move, delete). Together with the todo tools the assistant can e.g. turn a note into todos, without the modules knowing each other.
- The editor takes over changes made elsewhere (e.g. by the assistant) when the note is reloaded, unless it has unsaved changes; it tells them from its own saves by `updatedAt`. Its autosave updates the note's query and marks the grids stale, so typing reloads nothing. If the note is moved (in the editor or by the assistant) the URL follows it, if it is deleted while open the page says so.

A new module gets its own folder with the same structure and one entry in `src/modules/registry.ts` (its `AppModule`, the position in the sidebar). Its routes (`routes/`), its server part (`module.server.ts`) and its tables (`db/schema.ts`, `drizzle.config.ts`) are found by the folder structure. In short:

1. `moduleId.ts`, `db/schema.ts` (then `npm run db:generate`) and the repositories in `db/`.
2. `operations.server.ts`: the module's operations (see below) and the instructions for the model.
3. `*.functions.ts`: a server function per operation the UI uses; `queries.ts`: queries over them, with keys starting with the module's id; `routes/`: the pages (the route files are created by the dev server or `npm run routegen`); `chatPage.ts`: the schema of what the pages tell the assistant, reported with `useChatPage`.
4. `module.ts` (`AppModule`: navigation, chat suggestions) and `module.server.ts` (`export const serverModule: ServerModule`: `id`, `operations`, `instructions`, `chatContext` with `defineChatContext`).

### Operations: one definition for UI, chat and MCP

Every domain operation is defined once in the module's `operations.server.ts` (`src/operations.ts`): its input schema (zod, `.describe()` texts are shown to the model), its effect (`read`, `write`, `delete`), optionally AI metadata (title and description) and the handler with the whole business logic, incl. existence and ownership checks. Handlers throw `NotFoundError` or `ValidationError` (`src/errors.ts`), whose messages reach the user (form) and the model (tool error).

- **UI**: a server function wraps the operation (`operationHandler`, `runOperation` validates the input; errors are mapped once in `src/start.ts`).
- **Chat assistant and MCP server**: the operations with AI metadata are their tools, named like the operation's key (`toolsFromOperations`). An operation without AI metadata is only used by the UI (e.g. a grid's page of rows), one without a server function only by the AI assistants (e.g. `findTodos`, `appendToNote`).
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
// src/modules/todos/lists.functions.ts: only if the UI uses it
export const completeList = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.completeList>)
    .handler(operationHandler(todoOperations.completeList));

// in a component: run it and reload the module's data (useMutate shows an error in the snackbar)
const mutate = useMutate(todosModuleId);
void mutate(completeList({ data: { listId } }));
```

That's all: the chat assistant and the MCP server offer the tool `completeList` (deleting operations need the user's confirmation), and after the assistant ran it the chat panel reloads the todos module's data.

### Data loading

The pages' data lives in [TanStack Query](https://tanstack.com/query)'s cache, with the router's official integration (`@tanstack/react-router-ssr-query`, `src/router.tsx`):

- **Queries** (`src/modules/<module>/queries.ts`): typed `queryOptions` over the server functions. Every key starts with the module's id (e.g. `["todos", "lists"]`), so a change reloads exactly its module's data (`invalidateModules`, `src/moduleQueries.ts`): after a change in the UI (`useInvalidateModule`, `useMutate`) and after the assistant changed it (the chat panel reloads the modules the assistant reports).
- **Loaders** get the page's data with `queryClient.fetchQuery` (from the cache while it is fresh, `staleTime` 30 seconds: changes made in the app reload right away, the staleness is for changes made elsewhere, e.g. by an MCP client), the components read it with the same query (`usePageQuery`: if a reload doesn't find the page's entity anymore, the route's not found page is shown right away: a not found error isn't retried). Links preload the page's data on hover. Loaders don't change data: the index pages (`/lists`, `/notes`) create the default collection only when they are opened, not when preloaded (`defaultCollectionId`).
- **Sidebar**: when the app is opened, the layout starts loading every module's navigation data without waiting for it; each module's navigation reads its query (shown when loaded, `Suspense`), which keeps itself up to date (reloaded with its module's data).
- **Rendering**: the app's pages (`src/routes/_app.tsx`) are rendered in the browser only (`ssr: "data-only"`, [selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)); their loaders still run on the server in the same request, and the queries they loaded reach the browser with the page (no request on the first load). An app behind a login gains nothing from server-rendered pages, and the components needn't be hydration-safe (e.g. dates in the user's time zone).

## Authentication

The user is identified by their email, used as user id for all data (`src/user.ts`). Every request is authenticated by the server entry of the platform before it is routed (`src/server.ts`).

**Cloudflare**: there is no login logic in the app: Cloudflare Access sits in front of the worker like an authenticating reverse proxy, lets users sign in with Entra ID and only forwards authenticated requests. The app rejects requests not authenticated by Access (`src/platform/cloudflareAccess.server.ts`):

- In production it verifies the Access JWT in the `Cf-Access-Jwt-Assertion` header (signature against `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, issuer and audience `ACCESS_AUD`). [`ctx.access`](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) is not available there: workers with static assets run behind an internal router worker that doesn't pass it on.
- Locally it uses `ctx.access`, simulated by the Workers runtime (`access.dev`).

**bunny.net** (`src/platform/oidc.server.ts`): the app signs users in itself with OpenID Connect (authorization code flow with PKCE, e.g. Entra ID): `/auth/login` redirects to the identity provider, `/auth/callback` verifies the ID token and sets a session cookie (a JWT signed with `SESSION_SECRET`, 24 hours, `HttpOnly`, `SameSite=Lax`), `/auth/logout` deletes it and signs out at the identity provider. Pages without a session redirect to the login, other requests (server functions, chat) get `401`. Who may sign in is decided by the identity provider (Entra ID: the app registration's users, "Assignment required"). The static files (`/assets/`, the app's JavaScript, styles and fonts) are served without login, like on Cloudflare.

Denied requests are logged with the reason (Workers Logs, the Edge Script's logs).

## Chat assistant

The assistant (chat panel, robot button in the app bar) works with the tools of all modules, e.g. manages the user's lists and todos in natural language, e.g. "Lege ein Todo mit dem Titel „Milch holen“ an", or summarizes a note and turns it into todos.

- **Endpoint** (`src/chat/chat.server.ts`, `POST /api/chat`): calls the model with the [AI SDK](https://ai-sdk.dev) (`streamText`) and streams the answer (UI message stream). The chat history is kept in the database per user (`src/chat/db/`, the last 200 messages): the client sends only the new message (the user's message, or the assistant's last message with the user's tool approvals), the server adds it to the history and saves the answer when it is finished. Stopping the answer (or closing the page) aborts the model request.
- **Tools** (the operations with AI metadata of the modules, e.g. `src/modules/todos/operations.server.ts`, as `AppTool`s (`toolsFromOperations`) and as AI SDK tools in `src/chat/tools.server.ts`): e.g. list/create/rename/delete lists, find/create/update/delete todos, find/read/create/update notes, the same operations the UI uses (the assistant runs in the same server, it doesn't go through the MCP server). The user id comes from the authentication, never from the model. Deleting needs the user's confirmation in the chat (`needsApproval`).
- **Page context**: the client sends its local date (for relative due dates) and the page shown with every message (`src/chat/chat.ts`). Each module describes what its pages show with a zod schema (`src/modules/<module>/chatPage.ts`, `defineChatPage`), a page reports it with `useChatPage(todosChatPage, { listId })` (`src/chat/useChatPage.tsx`, typed by the schema), and the server module turns it into context for the system prompt (`ServerModule.chatContext`, `defineChatContext` validates it with the schema), e.g. the current list as default list for new todos, or the open note. The server doesn't depend on routes.
- **Routing/auth** (`src/server.ts`): the server entry authenticates the request like any other and rejects foreign origins; the user id comes from the authentication, never from the client.
- **Model** (`src/chat/model.server.ts`): a model with function calling of any provider with an OpenAI-compatible Chat Completions API (OpenAI, Azure OpenAI, Mistral, OpenRouter, ...), with an API key, on both platforms (no Cloudflare service):
    - `AI_API_KEY` (secret): **without it there is no chat assistant**: the app shell hides the chat button (`getAppSession`, `src/user.functions.ts`), the endpoint answers `503`.
    - `AI_BASE_URL`: default `https://api.openai.com/v1`; Azure OpenAI: `https://<resource>.openai.azure.com/openai/v1`.
    - `AI_MODEL`: default `gpt-5-mini` (Azure: the deployment name).
- **UI** (`src/components/ChatPanel.tsx`): [MUI X Chat](https://mui.com/x/react-chat/) (`ChatBox`, alpha) renders the conversation of the AI SDK's `useChat` (history loaded when the panel is opened): its messages are controlled by `useChat`, its adapter forwards sending, stopping and tool approvals (after an approval the assistant continues automatically). After a tool whose operation writes or deletes, the assistant adds a `changes` data part with the module's id to its answer (`src/chat/chat.server.ts`); `useChatChanges` reports it once and the data of exactly these modules is reloaded (`invalidateModules`, see [Data loading](#data-loading)).

Setup: set the API key as secret (Cloudflare: `npx wrangler secret put AI_API_KEY`, for Previews in the dashboard; bunny.net: a secret of the Edge Script), `AI_BASE_URL` and `AI_MODEL` as variables (Cloudflare: `wrangler.jsonc`, also in `previews.vars`). Set a spend limit at the provider.

## MCP server (external AI clients)

The same tools as the chat assistant are available to external AI clients (Claude Desktop, claude.ai, Claude Code, ...) as [MCP](https://modelcontextprotocol.io) server at `https://<app>/mcp`. The AI client brings its own model: no model costs for the app.

- **Server** (`src/mcp/mcp.server.ts`): an `McpServer` of the [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/) (v2) with the tools of the modules, served stateless over Streamable HTTP with the SDK's `createMcpHandler` (no MCP session; current and 2025 protocol versions). Read-only tools are annotated as such, deleting tools as destructive: MCP clients ask the user for confirmation depending on their settings.
- **Login on Cloudflare**: with Cloudflare Access [managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/), Access is the OAuth authorization server for MCP clients (discovery, dynamic client registration, tokens): the client opens the browser, the user signs in with Entra ID like in the app (same Access policies), the client gets an OAuth token. Access verifies the token on every request and forwards it with the Access JWT of the user, like a browser session. So the app has no OAuth code of its own: `src/server.ts` authenticates `/mcp` requests like all others (`src/auth.server.ts`), rejects foreign origins and passes the user to the MCP server; every tool is scoped to that user.

Setup on Cloudflare (once, Zero Trust dashboard → Access controls → Applications → the application of the worker → Edit → Advanced settings):

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

**Login on bunny.net**: the app is an OAuth resource server of the identity provider (`src/platform/oidc.server.ts`, only when `MCP_OAUTH_AUDIENCE` is set, otherwise `/mcp` answers `404`): MCP clients send an access token of the identity provider as Bearer token, the app verifies it (signature, issuer `OIDC_ISSUER`, audience `MCP_OAUTH_AUDIENCE`) and takes the user's email from it (`email`, `preferred_username` or `upn`). Without a token it answers `401` with a link to its [Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) (`/.well-known/oauth-protected-resource/mcp`), which names the identity provider as authorization server, so the client signs the user in there. Entra ID has no dynamic client registration: the MCP client needs a client id of an app registration (e.g. claude.ai: Add custom connector → Advanced settings → OAuth Client ID/Secret). Setup in Entra ID:

1. In the app's registration (or a separate one for the API): Expose an API → Application ID URI (e.g. `api://<client-id>`, = `MCP_OAUTH_AUDIENCE`; with access token version 2 (Manifest: `requestedAccessTokenVersion: 2`) the audience is the client id) and a scope (e.g. `mcp`, `MCP_OAUTH_SCOPE=api://<client-id>/mcp`).
2. An app registration for the MCP client with the redirect URIs of the client (e.g. `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`; for local clients `http://localhost`) and the permission for that scope.

This setup is not tested with every MCP client yet.

Locally the MCP server is at http://localhost:5180/mcp, without login (authenticated as `DEV_USER_EMAIL` by the simulated Access), e.g. `claude mcp add --transport http todos-dev http://localhost:5180/mcp`. MCP clients that run in a browser page of another origin are rejected (foreign origin).

## Database

SQLite with Drizzle: Cloudflare D1 or libSQL (Bunny Database) on bunny.net. Schema and repositories in the modules (`src/modules/<module>/db/`, the chat history in `src/chat/db/`), migrations in `drizzle/` (one migration history for the database, generated from the schemas of all modules; applied with wrangler on D1, with `scripts/migrate.ts` (Drizzle's migrator) on libSQL).

After changing the schema:

```bash
npm run db:generate  # generates a migration into drizzle/
npm run db:migrate   # applies it to the local D1 (also done on `npm run dev`; bunny.net platform: `npm run db:migrate:bunny`)
```

Migrations are applied before the new code is deployed (`npm run deploy`; on bunny.net by the GitHub workflow), so the currently running code must keep working with the new schema: e.g. add a column (with a default) in one deployment, remove one only after the code no longer uses it.

## Deployment (Cloudflare)

The production deployment on Cloudflare (Workers + D1 + Access). The chat assistant needs the secret `AI_API_KEY` (`npx wrangler secret put AI_API_KEY`), see [Chat assistant](#chat-assistant).

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
- The chat assistant works in Previews if they have the secret `AI_API_KEY` (Previews don't inherit the production secrets); the chat histories are in the Preview's database.
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

## Deployment (bunny.net)

The app runs as a standalone script on [bunny.net Edge Scripting](https://docs.bunny.net/scripting) with a [Bunny Database](https://docs.bunny.net/database) (libSQL), without any Cloudflare service. Every push to `main` runs `.github/workflows/bunny.yml`: it builds the script, applies the pending migrations to the database (`scripts/migrate.ts`), uploads the static files to a Storage Zone and deploys the script (bunny.net's [GitHub Action](https://docs.bunny.net/scripting/github-actions)).

```bash
npm run build:bunny  # PLATFORM=bunny vite build: dist/server/server.bunny.js (the script), dist/client/assets (the static files)
```

How it fits into Edge Scripting's [limits](https://docs.bunny.net/scripting/limits):

- **One script file**, minified, all dependencies bundled, about 1.8 MB (500 KB gzip). The script contains no page components: the app's pages are rendered in the browser only (`ssr: "data-only"`), so the server build drops them (`deleteNodes` in `vite.config.ts`). libSQL is used over HTTP (`@libsql/client/web`).
- **Startup** (limit 500 ms): loading the script takes about 230 ms (measured locally in Deno).
- **Static files**: they don't fit into the script. They are in a Storage Zone; the script serves `/assets/...` from its Pull Zone (`ASSETS_URL`) with `Cache-Control: immutable`, so the script's own Pull Zone caches them. All other responses get `Cache-Control: private, no-store` (pages, server functions, chat and MCP are per user).
- **Long chat answers** are no problem: the answer is streamed, the CPU time limit (30 s) counts only computing, not waiting for the model, there is no limit on how long a response may take (the first bytes must come within 60 s).
- **Subrequests** (limit 50 per request): every database query and every model request is one. A chat message with one or two tools takes about 10–15; very long tool chains (up to 10 steps) could come near the limit.

Setup (once):

1. Bunny Database: create a database (dashboard → Database), generate tokens (Access → Generate Tokens). Note the URL and the token (`BUNNY_DATABASE_URL`, `BUNNY_DATABASE_AUTH_TOKEN`): the script needs them and the GitHub workflow (migrations). The first run of the workflow creates the tables.
2. Storage Zone for the static files, with a Pull Zone (its URL, e.g. `https://todos-assets.b-cdn.net`, is `ASSETS_URL`). The workflow uploads to it with the Storage Zone's password.
3. Edge Scripting: create a standalone script (its Pull Zone is the app's URL; a custom hostname can be added there). Environment variables and secrets of the script:
    - `BUNNY_DATABASE_URL`, `BUNNY_DATABASE_AUTH_TOKEN` (secret)
    - `ASSETS_URL`: the Storage Zone's Pull Zone
    - `OIDC_ISSUER` (Entra ID: `https://login.microsoftonline.com/<tenant-id>/v2.0`), `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (secret)
    - `SESSION_SECRET` (secret): at least 32 random characters (e.g. `openssl rand -base64 32`), signs the session cookies; changing it signs everybody out
    - `APP_URL` (optional): the app's public URL, if the script sees another one (e.g. behind a custom hostname); used for the login's redirect URI, the origin checks and secure cookies
    - Chat assistant (optional, without `AI_API_KEY` there is none): `AI_API_KEY` (secret), `AI_BASE_URL`, `AI_MODEL`, see [Chat assistant](#chat-assistant)
    - MCP server (optional): `MCP_OAUTH_AUDIENCE`, `MCP_OAUTH_SCOPE`, see [MCP server](#mcp-server-external-ai-clients)
4. Entra ID (or another OpenID Connect provider): an app registration (single tenant) with the redirect URI `https://<app>/auth/callback` (platform "Web") and a client secret; optional claim `email` for the ID token. To allow only some users of the tenant: Enterprise applications → the app → Properties → Assignment required, then assign users or groups.
5. GitHub (repository settings → Secrets and variables → Actions):
    - secrets `BUNNY_SCRIPT_ID`, `BUNNY_DEPLOY_KEY` (the script → Deployments → Settings), `BUNNY_STORAGE_PASSWORD` (the Storage Zone → FTP & API Access), `BUNNY_DATABASE_URL`, `BUNNY_DATABASE_AUTH_TOKEN`
    - variables `BUNNY_STORAGE_ZONE` (its name; the workflow only runs when it is set), optionally `BUNNY_STORAGE_HOST` (the Storage Zone's region endpoint, default `storage.bunnycdn.com`)

There are no Preview deployments per branch on bunny.net.
