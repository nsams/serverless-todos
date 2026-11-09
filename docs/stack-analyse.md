# Stack-Analyse: Basis-Stack für zukünftige Projekte

Stand: 2026-11-09. Gesetzt sind Cloudflare Workers + D1, React, MUI (inkl. MUI X DataGrid und MUI X Chat), Drizzle und TypeScript. Zu entscheiden ist eine von 8 Varianten für API-Schicht, Routing und Data-Fetching.
Grundlage sind alle 8 Varianten-Worktrees (PRs #13–#19 plus `main`), je ein Detailbericht pro Variante und Querschnitts-Bewertungen pro Kategorie. Für die Querschnitts-Bewertungen wurden die Aussagen der Berichte im Code nachgeprüft und die Scores über alle Varianten hinweg kalibriert. Wo ein Bericht und eine Querschnitts-Bewertung voneinander abweichen, gilt die Querschnitts-Bewertung (siehe Anhang B).

---

## 1. Kurzfazit

**1. Wahl: `trpc-tsr-tq` (tRPC + TanStack Router als SPA + TanStack Query, PR #18).**
**2. Wahl: `trpc-rr-decl-tq` (tRPC + React Router declarative + TanStack Query, PR #17).**

- **API-Schicht und AI/MCP:** Die wichtigste Anforderung ist, dass AI-Chat und MCP für alle Module „eingebaut“ sein sollen. Dafür ist tRPC die beste API-Schicht. Eine Procedure ist bereits eine transportunabhängige Operation mit zod-Input, typisierbarer `.meta()` und `createCaller(ctx)`. Daraus lässt sich ein Tool für den Chat und für MCP ableiten, sodass eine Definition UI-API, Chat-Tool und MCP-Tool zugleich bedient.
- **Routing:** TanStack Router prüft Links, Params, Search-Params, Redirects und Loader-Daten typsicher gegen einen generierten Route-Tree. Zusammen mit TanStack Query (Cache, Preload, gezielte Invalidierung) ist das die Kombination, die für viele Module, Seiten und Entitäten am besten skaliert. Variante 8 hat diese Features als einzige SPA bereits aktiviert: `autoCodeSplitting`, Preload on intent und `staleTime`.
- **Cloudflare:** Als statische SPA mit einem reinen API/Chat/MCP-Worker (0,9 MB gz, kein React im Worker, Batched Requests) passt der Stack sehr gut zu Cloudflare. SSR bringt für eine Access-geschützte interne App nichts.
- **Variante 7 als Alternative:** Variante 7 teilt die tRPC-Vorteile. Sie kommt ohne Codegen und File-Routing aus und lässt sich deshalb am leichtesten als Library-Pakete extrahieren. Dafür hat sie keine Loader und kein Prefetch, und ihre Route-Typisierung ist selbstgebaut statt framework-gestützt. Wenn die Library-Extraktion ganzer Module sehr früh Priorität hat, ist Variante 7 die bessere Wahl.
- **Gemeinsame Baustellen:** Heute sind *alle* Varianten bei AI/MCP gleich gut bzw. gleich schwach. `tools.server.ts`, `mcp.server.ts` und die Repositories sind in allen 8 Worktrees byte-identisch. Jede Operation ist doppelt implementiert (UI-API und Tool). Die Entscheidung fällt deshalb über das **Potenzial**. Dort liegt tRPC klar vorn.
- **Vor der Freigabe als Template** muss Variante 8 noch um die Ableitung der Tools aus den Procedures, um typisierten Chat-Kontext und um gezielte Invalidierung ergänzt werden (Abschnitt 8).

---

## 2. Überblick der 8 Varianten

| # | Variante | PR | API-Schicht | Client-Routing | Data-Fetching / Cache | SSR/SPA |
|---|---|---|---|---|---|---|
| 1 | `tanstack-start` | main (Baseline) | TanStack Start `createServerFn` | TanStack Router (virtual file routes, im Framework) | isomorphe Route-Loader → Server Functions; kein Cache, `router.invalidate()` | SSR im Worker |
| 2 | `rr-framework` | #13 | RR Loader/Actions + eigener „Intents“-Layer | RR v8 framework mode, `routes.ts` + `react-router typegen` | Loader lesen Repos direkt (Single Fetch); Revalidate-all | SSR im Worker |
| 3 | `hono-rr-data` | #14 | Hono REST + `hc<Api>` | RR data mode (`createBrowserRouter`) | Loader + `revalidate()`; kein Cache | SPA (static assets) |
| 4 | `hono-rr-decl-tq` | #16 | Hono REST + `hc<Api>` | RR declarative (`<Routes>`) + `PathParam`-Helper | TanStack Query (`useQuery`, handgeschriebene Keys); keine Loader | SPA |
| 5 | `hono-tsr-tq` | #19 | Hono REST + `hc<Api>` | TanStack Router (virtual file routes) | Loader `fetchQuery` + `useSuspenseQuery` | SPA |
| 6 | `trpc-rr-data` | #15 | tRPC v11 + superjson + `httpBatchLink` | RR data mode | Loader + `revalidate()`; kein Cache | SPA |
| 7 | `trpc-rr-decl-tq` | #17 | tRPC + `@trpc/tanstack-react-query` | RR declarative + eigenes `defineRoute` (~48 LOC) | TanStack Query über Options-Proxy; keine Loader | SPA |
| 8 | `trpc-tsr-tq` | #18 | tRPC + `@trpc/tanstack-react-query` | TanStack Router (virtual file routes, `autoCodeSplitting`) | Loader `fetchQuery` + `useSuspenseQuery`, Preload on intent | SPA |

In allen Varianten gemeinsam und identisch:
- Cloudflare Access Auth.
- AIChatAgent als Durable Object pro User.
- Stateless MCP über `createMcpHandler`.
- `AppTool`-Abstraktion mit Adaptern für AI SDK (13 LOC) und MCP (47 LOC).
- Modulstruktur `src/modules/<m>/` mit `registry.ts` und `registry.server.ts`.
- `@cloudflare/vite-plugin` mit workerd im Dev-Betrieb.
- Größe von `src`: 3,8–4,1k LOC (ohne generierte Dateien).

---

## 3. Haupt-Bewertungstabelle

Skala 0–10. Jede Zelle hat das Format **aktuell / Potenzial**. „Potenzial“ meint, was innerhalb desselben Stacks mit realistischen Verbesserungen erreichbar ist (Helper, Operation-Layer, besseres Typing, Konfiguration).

**Gewichtung**

| Kategorie | Gewicht |
|---|---|
| Typsicherheit | 20 % |
| Einfachheit | 15 % |
| Unabhängige Module | 15 % |
| Wenig Duplikation | 10 % |
| AI/MCP-Integration | 15 % |
| Library-Extraktion | 10 % |
| Cloudflare & Reife | 7,5 % |
| Skalierbarkeit große Apps | 7,5 % |

| Variante | Typsicherheit | Einfachheit | Unabh. Module | Wenig Duplikation | AI/MCP | Library-Extraktion | Cloudflare & Reife | Skalierung | **Gesamt aktuell** | **Gesamt Potenzial** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 tanstack-start | 8 / 9 | 6,5 / 7,5 | 5,5 / 7 | 5,5 / 7 | 6,5 / 8 | 4 / 6 | 7 / 8 | 6 / 7,5 | 6,30 | 7,64 |
| 2 rr-framework | 6,5 / 8 | 6 / 7 | 5 / 6,5 | 5 / 6,5 | 6 / 7,5 | 4 / 6 | 7,5 / 8 | 5,5 / 7 | 5,72 | 7,12 |
| 3 hono-rr-data | 5,5 / 7 | 7,5 / 8 | 7 / 8,5 | 4,5 / 7 | 6 / 7 | 6 / 8 | 8 / 9 | 4,5 / 6,5 | 6,16 | 7,59 |
| 4 hono-rr-decl-tq | 6,5 / 7,5 | 6 / 7 | 7,5 / 9 | 4,5 / 6,5 | 6 / 7,5 | 7 / 8,5 | 8,5 / 9 | 6 / 7,5 | 6,46 | 7,76 |
| 5 hono-tsr-tq | 8,5 / 9 | 5,5 / 6,5 | 6 / 7,5 | 4 / 6,5 | 6,5 / 7,5 | 5 / 7 | 8,5 / 9 | 6,5 / 8 | 6,42 | 7,65 |
| 6 trpc-rr-data | 5 / 6,5 | 8 / 8 | 7 / 8,5 | 5,5 / 7,5 | 6 / 8 | 6 / 8 | 8 / 9 | 5 / 6,5 | 6,28 | 7,69 |
| 7 trpc-rr-decl-tq | 7 / 8 | 6,5 / 7 | 7,5 / 9 | 5 / 8 | 6 / 8,5 | 7 / 8,5 | 8,5 / 9 | 6,5 / 7,5 | 6,72 | **8,16** |
| **8 trpc-tsr-tq** | 8,5 / 9,5 | 6,5 / 7,5 | 6 / 7,5 | 5,5 / 8,5 | 6,5 / 9 | 5 / 7 | 8,5 / 9 | 7,5 / 8,5 | **6,80** | **8,36** |

**Rangfolge nach Potenzial (aktuell):**

| Rang | Variante | Potenzial | aktuell |
|---|---|---|---|
| 1 | `trpc-tsr-tq` | 8,36 | 6,80 |
| 2 | `trpc-rr-decl-tq` | 8,16 | 6,72 |
| 3 | `hono-rr-decl-tq` | 7,76 | 6,46 |
| 4 | `trpc-rr-data` | 7,69 | 6,28 |
| 5 | `hono-tsr-tq` | 7,65 | 6,42 |
| 6 | `tanstack-start` | 7,64 | 6,30 |
| 7 | `hono-rr-data` | 7,59 | 6,16 |
| 8 | `rr-framework` | 7,12 | 5,72 |

**Herkunft der Scores:**
- Für Typsicherheit, Einfachheit, Module, Duplikation, AI/MCP, Cloudflare und Skalierung wurden die kalibrierten Scores der Querschnitts-Bewertungen übernommen.
- Für Library-Extraktion gab es keine eigene Querschnitts-Bewertung. Diese Spalte ist aus den Berichten abgeleitet und nach der Achsen-Bewertung der Querschnitts-Bewertung Module/Library kalibriert. Dabei gilt: declarative ≥ data mode > TanStack Router (file routes) > Frameworks. Außerdem sind Varianten 4 und 7 strukturell gleich und bekommen deshalb den gleichen Score.

**Sensitivität:** Die Platzierung von 8 und 7 auf den ersten beiden Plätzen hängt nicht an der Gewichtung. Geprüft wurden drei alternative Gewichtungen:

| Gewichtung | Ergebnis (Potenzial) |
|---|---|
| alle Kategorien gleich | 8: 8,31 · 7: 8,19 · 4: 7,81 |
| Einfachheit und Library je 15–20 % | 8: 8,18 · 7: 8,12 · aktuell liegt 7 knapp vorn (6,67 vs. 6,55) |
| Typsicherheit 25 % und Skalierung 15 % | 8: 8,60 · 7: 8,12 · 5: 7,88 |

Auf den Plätzen 3–7 liegen die Varianten innerhalb von ±0,2. Diese Reihenfolge ist deshalb nicht belastbar.

**Lesehilfe:** Die aktuellen Werte liegen eng beieinander (5,7–6,8). Ein großer Teil des Codes ist in allen Varianten identisch: Tools, MCP, Repositories, Grid-Helper und ~80 % des Seiten-Codes. Unterschiede entstehen vor allem in der API-Schicht, im Routing und beim Data-Fetching. Diese Teile bestimmen, wie gut sich die gemeinsamen Schwächen beheben lassen.

---

## 4. Achsen-Analyse

### 4a. API-Schicht

| | Start Server Functions (1) | RR Loader/Actions/Intents (2) | Hono REST + `hc` (3, 4, 5) | tRPC (6, 7, 8) |
|---|---|---|---|---|
| End-to-End-Typen DB → Client | ja, inferiert; Dates bleiben Dates | Loader via typegen ja; Intents: Params `Record<string,string>`, Ergebnis gecastet (`useIntents.ts:54`) | ja, inferiert inkl. Status-Unions (typisierter 422-Body); `Date` → `string` | ja, inferiert; superjson erhält Dates; Fehler untypisiert (`error.data as …`) |
| Boilerplate pro Operation | gering (`createServerFn` + `useServerFn`) | Intent + `action`/`clientAction`-Exports pro Route, Host-Route nötig (`?index`) | hoch: Methode, Pfad, Statuscodes, 422-Zweige auf Server und Client (je 6×), handgeschriebene Query-Factories mit TQ | gering; mit TQ: Keys und Fetcher gratis (`trpc.x.queryOptions()`, `pathFilter()`) |
| Eine Definition → UI + Chat + MCP | mittel: Operation-Layer darunter nötig, plus Top-Level-Wrapper pro Op (Compiler-Constraint); Server Functions laufen nicht im DO | schwer: Intents hängen an Route-Params und werfen Redirects | mittel: eigenes `defineOperation`, das typisierte `.route()`-Ketten erzeugen muss, oder In-Process-`app.request()` mit User-Injection | **gut:** `.meta({tool})`, `_def.inputs`, `createCaller({user})` funktionieren im DO und im MCP-Handler |
| Request-Anzahl | N RPCs (unbatched) | 1 (Single Fetch) | N+2 (unbatched) | 1 (`httpBatchLink`) |
| TS-Check-Kosten (Instantiations) | 589k | 431k | 633k–772k (eine riesige verkettete `Api`) | 430k–580k |
| Externe API für Dritte | nein | nein | **ja, echtes REST** | eingeschränkt (tRPC-HTTP; OpenAPI nur über Zusatzlib); MCP deckt AI-Clients ab |
| Cloudflare | Teil des SSR-Frameworks | Teil des SSR-Frameworks | Workers-nativ, offiziell dokumentiert | fetch-Adapter Workers-nativ, 114 kB |
| Library-Extraktion | schlecht (Start-Compiler muss Paket-Source transformieren) | schlecht (an Routen gebunden) | gut (Sub-App hängt nur vom Env-Typ ab) | gut (braucht gemeinsame `t`-Instanz als Peer) |

**Fazit API:** tRPC > Start ≈ Hono > RR framework.
- **tRPC** liegt bei Duplikation, AI/MCP-Vereinheitlichung, Request-Batching und TS-Kosten vorn.
- **Hono** hat die beste Cloudflare-Story und typisierte Fehlercodes, ist aber pro Operation am wortreichsten. Die Vereinheitlichung mit Tools kämpft gegen die `hc`-Typinferenz.
- **Start** ist kompakt, aber an Compiler und Request-Kontext gebunden.
- **RR-Intents** sind eigener Glue-Code ohne Library-Rückhalt.

### 4b. Client-Routing und Daten

| | RR data mode (3, 6) | RR declarative + TQ (4, 7) | TanStack Router + TQ (5, 8) | Framework: Start (1) / RR framework (2) |
|---|---|---|---|---|
| Typisierte Params/Search/Links | kaum: `pathParam(params,'listId')` (3), `params.listId ?? ""` (6), Loader-Daten per Cast | nur mit eigenem Helper: `PathParam` (4), `defineRoute` mit `href`/Search (7); keine Existenzprüfung, Links bleiben `string` | **vollständig gegen generierten Tree**: Links, Params, Search, Redirect, Loader-Daten, Route-IDs auf dem Server | 1: wie TSR. 2: typegen für Params, `loaderData` und `href()`, aber `<Link to>` ist `string`, Action-Params sind untypisiert |
| Daten-UX | Loader, aber Revalidate-all; kein Cache | Cache, gezielte Invalidierung; aber render-then-fetch, keine Loader und kein Prefetch | Loader + Cache + Preload on intent + Batched Requests | Loader, kein Cache, Revalidate-all |
| Codegen | keins | keins | `routeTree.gen.ts` (committed; `lint:tsc` regeneriert ihn nicht) | 1: `routeTree.gen.ts`; 2: `+types` (in `lint:tsc` enthalten) |
| Code-Splitting | nein (RR `lazy` ungenutzt) | nein (`React.lazy` möglich, erzeugt ohne Loader aber Wasserfälle) | 8: `autoCodeSplitting: true`; 5: fehlt (1 Zeile) | automatisch |
| Module eigenständig | gut (RouteObject[]), aber Navigation über untypisierten Layout-Loader | **am besten** (`{path, Component}`, eigene Sidebar-Query) | 3 zentrale Dateien, `/_app`-Literale, Register-Augmentation | 3 zentrale Dateien; Codegen bzw. Compiler bindet Module an den Host |
| Library-Extraktion | gut | **am besten** | schwer für Client-Module (File-Routes, Generator schreibt in Dateien) | am schwersten |
| Konzepte | wenige | wenige im Router, Komplexität wandert in Seiten und eigene Helper | viele (Router-Kontext, `loaderDeps`, `notFound`, zwei Caches) | SSR, Hydration, Boundaries |

**Fazit Routing:** Für große Apps ist TanStack Router + TQ klar am stärksten, gefolgt von RR declarative + TQ ≈ Start, dann RR framework, dann RR data mode. Für Library-Extraktion gilt die umgekehrte Reihenfolge: declarative ist am besten, TSR und die Frameworks am schwersten.

### 4c. Welche Achse ist wichtiger?

**Die API-Achse ist die folgenreichere Entscheidung.**
- Der API-Stil bestimmt das Operationsmodell. Jede zukünftige Operation in jedem Modul wird in diesem Stil geschrieben, und genau daraus sollen Chat-Tool und MCP-Tool entstehen. Ein späterer Wechsel des API-Stils fasst jede Operation an.
- Gleichzeitig gewinnt hier eine Option klar: tRPC liegt in allen drei Routing-Klassen beim Potenzial vor Hono.

| Routing-Klasse | tRPC (Potenzial) | Hono (Potenzial) |
|---|---|---|
| TSR | 8,36 | 7,65 |
| declarative | 8,16 | 7,76 |
| data | 7,69 | 7,59 |

**Die Routing-Achse ist danach die Abwägung zwischen 8 und 7.**
- Variante 8 ist bei Typsicherheit, Daten-UX und Skalierung stärker.
- Variante 7 ist bei Codegen-Freiheit und Library-Extraktion stärker.
- Ein Router-Wechsel ist lokal auf die Seiten begrenzt und mechanisch. Der Umbau von 6 auf 8 umfasste 48 Dateien mit +1148/−517 Zeilen. Er berührt weder Server, Tools noch MCP.

RR data mode scheidet für große Apps aus: untypisierte Routen und kein Cache. Die SSR-Frameworks scheiden für diese App-Familie aus: SSR bringt keinen Nutzen, erhöht aber CPU-Last, Bundle-Größe und Komplexität. RR framework kann auf Cloudflare außerdem SSR nicht abschalten, weil der SPA-Modus mit dem Cloudflare-Vite-Plugin nicht unterstützt wird.

---

## 5. Varianten im Detail

### 5.0 Gemeinsame Befunde (alle 8 Varianten, keine Unterscheidungsmerkmale)

Diese Punkte betreffen jede Variante gleichermaßen und sollten im gewählten Template ohnehin behoben werden:

1. **Doppelte Operationen:** `src/modules/todos/tools.server.ts` (161 LOC), `notes/tools.server.ts` (173 LOC), `src/mcp/mcp.server.ts` und `src/modules/todos/db/todos.server.ts` sind in allen 8 Worktrees byte-identisch (md5 geprüft). Jede Operation existiert zweimal: einmal als UI-API (Server Function, Intent, Hono-Route oder Procedure) und einmal als AppTool, jeweils mit eigenem zod-Schema. Die Regeln weichen bereits voneinander ab:
   - leerer Titel → `{error}` in der API, aber `min(1)` im Tool;
   - Existenzprüfung nur im Tool;
   - `appendToNote` gibt es nur als Tool.
2. **`mutatingToolNames: string[]`** wird im Client von Hand gepflegt (z. B. `todos/module.ts:16–20`). Wird ein Tool umbenannt oder vergessen, kompiliert der Code trotzdem, und die UI aktualisiert nach Assistant-Aktionen nicht mehr. Mehrere Experimente haben das bestätigt.
3. **Chat-Page-Kontext** `{routeId: string, params: Record<string,string>}` (`src/chat/chat.ts`). `page.params.listId` wird in `module.server.ts` untypisiert gelesen. Wird ein Param umbenannt, geht der Kontext stillschweigend verloren.
4. **Bug im Repository:** `todos.server.ts:101–110` (`update`) gibt `true` zurück, auch wenn keine Zeile getroffen wurde. Ein Update auf eine fremde oder nicht existierende Todo-ID meldet in der UI-API Erfolg (No-op). Dasselbe gilt für `rename` bei Listen und Notebooks. Die Tools sind davon nicht betroffen, weil sie vorher `getTodo` aufrufen. Zur Korrektur `.returning()` verwenden, wie es Notes bereits tut.
5. **Spread-Conditional-PATCH-Body** `...(cond && { dueDate })` in allen List-Seiten (z. B. trpc-tsr-tq: `lists.$listId.tsx:189–192`). Die Excess-Property-Prüfung greift hier nicht: Wird ein API-Feld umbenannt, kompiliert der Code, zod entfernt das unbekannte Feld, und das Update wird zum stillen No-op.
6. **Grid-Search auf dem Wire untypisiert:** `z.looseObject`-`gridInputSchema` in 1, 6, 7, 8 (`gridSearch.ts:56`) bzw. `z.record`-`gridQueryValidator` in 3, 4, 5 (`hono.server.ts:16–17`). Hinzu kommen Filter-Casts in `todoSearch.ts:22` und `noteSearch.ts:36` sowie `GridColDef`-`field`-Strings, die nicht gegen den Row-Typ geprüft werden.
7. **Collection-Copy-Paste** zwischen Modulen: `lists.server.ts` vs. `notebooks.server.ts` (14 normalisierte Diff-Zeilen), Navigation-Komponenten, Default-Redirect, Header und CRUD-Tools.
8. **Eine Drizzle-Migrationshistorie** für alle Module (Glob `src/modules/*/db/schema.ts`). Für Library-Module braucht es eine Konvention pro Paket.
9. **Pre-1.0-Abhängigkeiten:** `@mui/x-chat 9.0.0-alpha.21`, `@cloudflare/ai-chat 0.12`, `agents 0.33`.
10. **Gleicher Worker-Großteil:** agents, AI SDK, MCP-SDK und zod machen ~0,9 MB gz aus, unabhängig von der API-Wahl.

### 5.1 `tanstack-start` (Baseline, main)

**Stärken**
- Wenigster Glue-Code aller Varianten (~220 LOC Plumbing).
- Die Server Function ist API und Client-Aufruf zugleich. Dates bleiben erhalten.
- Volle Typisierung durch TanStack Router. Eine Umbenennung des Route-Params ergab 12 Fehler, inklusive der Route-ID im Chat-Kontext (`todos/module.server.ts:7`, `keyof FileRoutesById`).
- Kleinste Codebasis (3771 LOC). Offizieller Cloudflare-Support. Gute README.

**Schwächen**
- SSR im Worker ohne Nutzen. Das bringt Hydration-Sonderfälle mit sich (`useToday` liefert auf dem Server `null`, `dates.ts:31`), isomorphe Loader und ein Server-Bundle von 1,78 MB gz, weil DataGrid und ChatPanel mitgerendert werden.
- Kein Cache: Jede Mutation, jeder Autosave (`notes.$notebookId.$noteId.tsx:129`) und jeder Tool-Call löst `router.invalidate()` aus.
- Navigation per N unbatched Server-Function-RPCs (`registry.ts:12–16`).
- Ein eigener Worker-Entry umgeht die Start-Middleware für Chat und MCP (`server.ts:37–63`).
- Start ist das jüngste und am schnellsten bewegte Framework im Vergleich.

**Typlücken**
- `todos/navigation.ts:9`: `as Awaited<ReturnType<typeof listLists>>`. `useNavigationData` liefert `unknown` (`modules/navigation.ts:6`), und ein falscher Loader kompiliert.
- `start.ts:13`: `context as unknown as RequestContext`.
- `ChatPanel.tsx:121`: `as Record<string,string>`.
- `lists.functions.ts:21–29`: ad-hoc-Union `{error, id}`.

**Duplikate**
- `todos.functions.ts:49–64` vs. `tools.server.ts:119–140`.
- `lists.functions.ts` vs. `notebooks.functions.ts` (8 Diff-Zeilen).

**Potenzial**
- TanStack-Query-Integration (offiziell unterstützt).
- Ein aggregierter Navigation-Call.
- Operation-Layer mit 3-Zeilen-`createServerFn`-Wrapper pro Op.
- `tsr generate` in `lint:tsc`.
- Selective SSR bzw. `ssr:false`.

Die AI-Vereinheitlichung bleibt umständlicher als bei tRPC. Tools laufen im Durable Object außerhalb der Start-Pipeline. Eine Server Function kann deshalb nicht selbst das Tool sein, es braucht einen Operation-Layer darunter. Die Korrektur senkt das AI-Potenzial des Berichts von 9 auf 8.

**Risiken**
- Ein veralteter `routeTree.gen.ts` kann `tsc` bestehen.
- `notes/tools.server.ts:116` kann `created: undefined` liefern (Race).

### 5.2 `rr-framework` (PR #13)

**Stärken**
- Lesezugriffe sind am einfachsten: Der Loader liest das Repository direkt, eine Lese-API gibt es nicht.
- Typegen (in `lint:tsc` enthalten, also nie stale) liefert Params, `loaderData` und `href()`.
- Single Fetch bündelt alle Loader zu einem Request.
- Code-Splitting pro Route automatisch.
- Geringste TS-Kosten (431k).
- RR ist reif und hat eine große Community.

**Schwächen**
- Der eigene Intents-Layer ist nicht standardisierter Glue: `intents.ts` (69) + `useIntents.ts` (67). Er erkennt Redirects über die Identität der Fetcher-Daten (`useIntents.ts:33`), nutzt eine Queue und ein separates `send()`.
- Mutationen hängen an Seitenrouten. Die Sidebar postet auf `` `${href("/lists")}?index` `` (`ListsNavigation.tsx:14`).
- Jede Action, auch der Note-Autosave im Sekundentakt, revalidiert die Navigation aller Module (`_app.tsx:21–23`).
- SSR ist Pflicht: Laut Cloudflare-Doku ist der SPA-Modus mit dem Vite-Plugin nicht unterstützt.
- Module sind über file-path-Strings relativ zu `src/` eingebunden. Typegen erzeugt nur für Dateien in `appDirectory` Typen, im Experiment entstanden für eine Route außerhalb keine `+types`.

**Typlücken**
- `intents.ts:16`: `params: Record<string,string|undefined>`. `params.listId ?? ""` in `todos/intents.server.ts:41,46,60` wird beim Rename nicht erkannt: stiller No-op bzw. 404.
- `useIntents<I>(action: string)` ist nicht an die URL gebunden.
- Layout-ID `"app"` als String (`navigation.ts:8`). Umbenennen führt zu 0 tsc-Fehlern und zu einem Laufzeit-Crash.
- `<Link to>` ist `string` (RR 8.5.1).

**Duplikate**
- `todos/intents.server.ts:66–81` vs. `tools.server.ts:119–140`.
- `export const action = intentAction(x); export const clientAction = clientIntentAction;` 5×.
- `useIntents<ListIntents>(href(…))` 3× pro Datei (`lists.$listId.tsx:65,217,235`).

**Potenzial**
- `intentAction<Route.ActionArgs>` und `useFetcher<typeof action>`.
- Resource-Routes statt Intents.
- Selektives `shouldRevalidate`.
- Generisches `AppModule<Nav>`.

Die SSR-Last bleibt in jedem Fall. Library-Extraktion ganzer Module bleibt schwach.

**Risiken**
- Kein Emotion-SSR-Cache bzw. kein angepasstes `entry.server`: FOUC und Style-Mismatch prüfen.
- Tools machen 3–4 sequentielle D1-Queries ohne Batch (gilt für alle Varianten).

### 5.3 `hono-rr-data` (PR #14)

**Stärken**
- Einfaches mentales Modell: REST plus SPA, kein Codegen außer `wrangler types`, keine SSR.
- `hc<Api>` typisiert Pfade, Bodies, Responses und Status-Unions.
- Die REST-API ist ein echter Vertrag, auch für Dritte nutzbar.
- Worker ohne React (888 kB gz).
- Hono ist Workers-nativ.

**Schwächen**
- Routing faktisch untypisiert:
  - `pathParam(params: Params, name: string)` (`client/params.ts:4`);
  - `useLoaderData<typeof loader>()` nicht an die Route gebunden (`ListPage.tsx:51`);
  - Links als `string`;
  - Navigation `Promise<unknown>` + Cast (`todos/navigation.ts:14`, `modules/navigation.ts:7`).
- Kein Cache und kein Batching: N+2 Worker-Invocations pro Revalidate.
- Der Note-Autosave revalidiert gar nicht, die Notizliste bleibt deshalb veraltet.
- `modulesApi` muss von Hand verkettet werden (`registry.server.ts:13–15`, „chain, don't loop“).
- TS-Kosten 633k.

**Duplikate**
- 422-Konvention je 6× auf Server (`, 422)`) und Client (`response.status === 422`, z. B. `ListsNavigation.tsx:28–31`, `ListPage.tsx:218–221`).
- `todos/api.server.ts:16–19,67–71,89–95` vs. `tools.server.ts:15–18,106–111,123–130`.

**Potenzial**
- Per-Modul-Clients `hc<typeof todosApi>`: beheben den Typzyklus, erlauben Registrierung per Loop und senken die TS-Kosten.
- `defineRoute`-Helper nach Art von Variante 7.
- `submitWithFieldError`.
- `defineOperation` → Route + AppTool.

Ohne TanStack Query bleibt die Decke bei der Daten-UX niedrig.

**Risiko:** `PATCH /api/todos/:todoId` liefert 204 statt 404 (siehe 5.0 Nr. 4).

### 5.4 `hono-rr-decl-tq` (PR #16)

**Stärken**
- Sehr wenig Magie im Router (`AppRoutes.tsx` 43 LOC).
- Module liefern `{path, Component}` und laden ihre Sidebar per eigener typisierter Query. Die `unknown`-Navigation aus Variante 3 entfällt.
- Gezielte Invalidierung per Modul-Präfix (`useMutate(todosQueryKey)`).
- Echtes Cache-Patching beim Note-Autosave (`setQueryData`, `NotePage.tsx:108`).
- Sehr gut für Library-Extraktion: Hono-Sub-Apps sind natürliche Paketgrenzen.

**Schwächen**
- Wie Variante 3 auf der API-Seite (422-Zweige, handverkettete `Api`, 647k Instantiations).
- Dazu handgeschriebene Query-Factories pro Modul (`notes/queries.ts` 37 LOC).
- Keine Loader und kein Prefetch: render-then-fetch.
- Weder `useBlocker` noch `ScrollRestoration` im declarative mode, daher ein eigener `ScrollToTop`.
- Eigene `ErrorBoundary`-Klasse (`errors.tsx`, 88 LOC).
- `DefaultRedirect` mit POST im `queryFn` (`pages.tsx:25`).
- Globales `throwOnError: true` (`queryClient.ts:13`) ersetzt Seiten trotz vorhandener Cache-Daten durch die Fehlerseite.
- Kein Code-Splitting (425 kB gz).

Die Querschnitts-Bewertung korrigiert die Einfachheit von 8 auf 6.

**Typlücken**
- `params.ts:11` (Cast mit Laufzeit-Match).
- Links und Navigate als Strings.
- Query-Keys als untypisierte Arrays (`queries.ts:16,23`).

**Potenzial**
- Per-Modul-Clients.
- `useApiMutation` mit 422-Handling.
- Collection-Kit.
- `React.lazy`-Seiten mit Prefetch.

Die handgeschriebenen Query-Keys bleiben ohne generischen `hc → queryOptions`-Helper bestehen.

### 5.5 `hono-tsr-tq` (PR #19)

**Stärken**
- Router-Layer wie in Variante 8: typisierter Tree, `LinkOptions` in der Sidebar, Route-ID-Konstanten als `keyof FileRoutesById` (`todos/module.server.ts:8`).
- Typisierte 422-Bodies.
- Ein einzelner Hono-Middleware-Stack für `/api`, `/mcp` und `/chat-agent` ist der natürlichste Worker-Entry aller Varianten.

**Schwächen**
- Größter Konzept-Stack: Hono + zValidator + `hc`/`parseResponse`/`DetailedError` + TSR + TQ.
- Kein Options-Proxy. Pro Seite sind deshalb eine `queryOptions`-Factory, eine Load-Funktion und ein `ReturnType`-Alias nötig (`lists.$listId.tsx:35–61`).
- `notFoundComponent` ist an jeder Route mit 404-Loader nötig (`errors.tsx:12–14`).
- `staleTime: 0` (`queryClient.ts:10`): Der Cache wirkt kaum, jede Navigation lädt neu. Diesen Punkt hatte keiner der Berichte gemeldet.
- Kein `autoCodeSplitting`, kein `defaultPreload`.
- Höchste TS-Kosten (772k Instantiations, 5,8 s).
- Einfachheit 5,5 statt der 6,5 aus dem Bericht.

**Typzyklen**
- `module.server.ts:1` importiert `~/client/routeTree.gen`.
- Module-Client → `~/api/client` (`Api` aller Module).

**Potenzial**
- Per-Modul-Clients.
- `autoCodeSplitting` (1 Zeile).
- `staleTime`.
- `defineOperation`.
- `apiQuery`-Helper.

Das ergibt praktisch die Hono-Version von Variante 8, aber mit mehr Zeremonie und einer schwierigeren Tool-Ableitung.

**Korrektur:** Mehrere Zeilenangaben im Bericht liegen außerhalb der jeweiligen Datei, etwa `mcp.server.ts:168` bei einer Datei mit 47 Zeilen. Inhaltlich stimmen die Befunde.

### 5.6 `trpc-rr-data` (PR #15)

**Stärken**
- Wenigste Konzepte aller Varianten: tRPC-Procedures plus `createBrowserRouter`-Objektbaum.
- Kein Codegen, keine SSR, kein Cache.
- `httpBatchLink` fasst Layout- und Seiten-Loader zu einem Request zusammen.
- Module sind reine Objekte und damit gut paketierbar.

**Schwächen**
- Schwächste Routing-Typisierung:
  - `params.listId ?? ""` (`list.tsx:34`); `:listId → :id` kompiliert;
  - handgebaute Pfade (`paths.ts`, `navigate('/lists')` in `list.tsx:219`);
  - Loader-Daten per Cast (`routing.ts:31`);
  - Navigation `unknown` + Cast (`todos/navigation.ts:8`); ein Tausch auf `api.notebooks.list` kompiliert.
- Revalidate-all nach jeder Mutation und jedem Autosave (`note.tsx:130`).
- Kein Code-Splitting.

**Duplikate**
- `todos.api.server.ts:51–66` vs. `tools.server.ts:119–140`.
- `lists.api.server.ts` vs. `notebooks.api.server.ts` (41 LOC, 12 Diff-Zeilen).
- Das Modul steht doppelt in `registry.server.ts:8,12`.

**Potenzial**
- Procedure → Tool-Ableitung (wie bei Variante 8).
- Eigene typisierte Route-Helper.
- RR `lazy`.

Feingranulares Caching würde de facto Variante 7 bedeuten. Die Typsicherheit wurde auf 5 korrigiert und liegt damit unter Variante 3, weil keinerlei Param-Namen-Prüfung stattfindet.

### 5.7 `trpc-rr-decl-tq` (PR #17), 2. Wahl

**Stärken**
- tRPC-Inferenz plus Options-Proxy: keine handgeschriebenen Keys, Invalidierung über `trpc.todos.pathFilter()`.
- Beste Invalidierungs-Disziplin aller Varianten: Der Note-Autosave invalidiert nur `trpc.notes`.
- `staleTime` 30 s, `keepPreviousData` für Grids, Batching.
- Kleiner, typisierter Route-Layer (`routeDefinition.ts`, 48 LOC) mit `href(params, search)`, `useRouteParams` und `useRouteSearch`. Er ist mit dem Server teilbar und braucht kein App-weites `Register`.
- Kein Codegen. Module als reine Objekte, dadurch die beste Ausgangslage für npm-Extraktion.
- Niedrige TS-Kosten (447k).

**Schwächen**
- Keine Loader und kein Prefetch: render-then-fetch, Spinner bei jeder Erstnavigation.
- Mit `React.lazy` entstehen Chunk-then-Data-Wasserfälle.
- Größtes Core-Plumbing (~480 LOC): eigene `ErrorBoundary` (`routes/root.tsx`), `useApiQuery`-Throw-Semantik und `RedirectTo` mit Mutation im Effect (`routing.tsx:53`, doppelte Default-Liste unter StrictMode möglich).
- 38 Invalidierungs-Referenzen (Varianten 6 und 8: 14).
- Flache Seitenliste ohne verschachtelte Layouts.
- Kein Code-Splitting (433 kB gz).

**Typlücken**
- `routing.tsx:31` `match.params as RouteParams<Path>` (Laufzeitprüfung).
- `<Link to>` und `NavigationItem.path` sind `string`.
- Eine fehlende `id` an `listRoute` kompiliert und schaltet den Chat-Kontext stillschweigend ab.
- `api/client.ts:24,29` (`error.data`-Casts).

**Kopplung:** `registry.ts:13` importiert `todos/paths` für `startPath` (Core → Modul).

**Potenzial**
- Tools aus Procedures.
- `route.matchChatPage(page)`.
- zod-Search-Schemas statt `looseObject`.
- `defineServerModules(...)` mit Tupel-Inferenz.
- Modul-lokale `createTRPCOptionsProxy`.
- `React.lazy` plus `prefetch`-Hooks.

**Wann 7 statt 8?** Wenn ganze Module früh als vorkompilierte npm-Pakete erscheinen sollen und das Team selbstgebaute Route-Typisierung statt Codegen bevorzugt.

### 5.8 `trpc-tsr-tq` (PR #18), 1. Wahl

**Stärken**
- Höchste Typsicherheit. `router.tsx:25` registriert den Router. Links, Params, `validateSearch`, Redirects und Loader-Daten werden geprüft.
- Server-Route-IDs werden über `CheckedRouteId` geprüft (`trpc-tsr-tq: src/chat/chat.ts:14–17`, `src/modules/todos/paths.ts:6–8`). Ein Rename der Route-Datei ergab 13 Fehler.
- Die Sidebar ist eine typisierte `useSuspenseQuery` ohne Cast.
- Als einzige SPA sind alle Skalierungs-Features aktiv:
  - `autoCodeSplitting: true` (`vite.config.ts:25`);
  - `defaultPreload: "intent"` (`router.tsx:17`);
  - `staleTime` 30 s (`api/query.ts:16`);
  - Batched Requests;
  - Route-Chunks 3–34 kB gz, Client gesamt ~600 kB gz.
- Worker 0,9 MB gz ohne UI-Code.
- Nur +24 LOC gegenüber Variante 6, dafür mit typisierter Navigation und Cache.

**Schwächen**
- Viele Konzepte: tRPC + TQ + Options-Proxy + TSR (virtual file routes, Codegen, `loaderDeps`, `beforeLoad`, `shouldReload`, `Register`).
- Zwei Client-Handles: `api` für Mutationen (`api/client.ts`) und `trpc` für Queries (`api/query.ts`).
- `queryOptions` steht in Loader und Komponente doppelt (`lists.$listId.tsx:38` und `:55`), mit dem Proxy aber je nur ein Ausdruck.
- Grobe Aktualisierung: `useRefresh` (`src/routing.ts:28–38`) markiert alle Queries als stale und führt die aktuellen Loader neu aus. Das passiert gebatcht und nur für die aktuellen Matches, also nicht als „Refetch-Storm“, ist aber grob.
- Der `_app`-Loader (`routes/_app.tsx:13–17`, `shouldReload: true`) blockiert den ersten Render, bis die Navigation aller Module geladen ist.
- 3 zentrale Dateien und 4 Listen pro neuem Modul: `registry.ts`, `registry.server.ts:8` und `:12` (doppelte Liste `serverModules`/`moduleApis`) sowie `routes.ts`.
- `routeTree.gen.ts` wird nur von Vite regeneriert. Es gibt keine `@tanstack/router-cli`, und `lint:tsc` regeneriert die Datei nicht.

**Typlücken**
- `ChatPanel.tsx:127` (`as Record<string,string>`).
- `module.server.ts:16` liest `page.params.listId` untypisiert.
- `types.ts:33` `mutatingToolNames?: string[]`.
- `client.ts:22` und `query.ts:32` (`error.data`-Casts).
- `gridSearch.ts:7–13`: Sort und Filter als `'field:op:value'`-Strings.
- `lists.$listId.tsx:246–248`: FormData-Felder untypisiert.

**Typzyklus:** `modules/types.ts` importiert `RouterContext` aus `~/api/query`. Dieses ist über `AppRouter` typisiert, der über `registry.server` wieder auf die Module verweist. `CheckedRouteId` ist bereits ein Workaround dafür.

**Bugs und Risiken**
- `api.lists.getDefault.mutate()` läuft in `beforeLoad` (`trpc-tsr-tq: src/modules/todos/routes/lists.index.tsx:10`). Mit `defaultPreload: "intent"` löst schon ein Hover über den Link einen Write aus.
- `todos.update` und `lists.rename` melden für nicht existierende IDs Erfolg (5.0 Nr. 4).
- Ein Spread von `values` ins Repository auf dem Server ignoriert umbenannte Felder stillschweigend.

**Potenzial (Typsicherheit 9,5, Duplikation 8,5, AI 9)**
- Tools aus Procedures (Abschnitt 6).
- Typisierter Chat-Kontext.
- Gezielte Invalidierung per `pathFilter`/`pathKey`.
- CRUD-Collection-Factory.
- `createGridRoute`-Helper.
- `tsr generate` in `lint:tsc`.
- Auto-Discovery der Registries mit typisiertem Router-Merge.
- Code-basierte Route-Factories für paketierte Module.

---

## 6. AI-Chat & MCP

### 6.1 Ist-Zustand (alle Varianten gleich)

`AppTool` (`src/modules/types.ts`) ist framework-neutral: `title`, `description`, `inputSchema`, `effect: read|write|delete` und `execute`. `registry.server.ts` sammelt die Tools pro User, erkennt Namenskollisionen und speist zwei Adapter:
- den AI SDK-Adapter (`chat/tools.server.ts`, `delete` → `needsApproval`);
- den MCP-Adapter (`mcp/mcp.server.ts`, `effect` → `readOnlyHint` bzw. `destructiveHint`).

Instructions und `chatContext` kommen aus den Modulen. Das ist eine gute Basis: Chat und MCP teilen sich bereits eine Definition.

**Warum es trotzdem wie ein Fremdkörper wirkt**
- Die Tools sind eine **zweite API** neben der UI-API, mit eigenen Schemas, eigenen Existenzprüfungen und eigener Fehler-Semantik.
- Der Client pflegt `mutatingToolNames` von Hand.
- Der Seitenkontext ist ein String-Protokoll.
- Nach jedem schreibenden Tool wird alles neu geladen. Die Variante lädt dabei entweder alle Loader neu (`router.invalidate`, `revalidate`) oder invalidiert alle Queries.

**Wichtig für jede Vereinheitlichung:** Die Chat-Tools laufen **im ChatAgent Durable Object** (`agent.server.ts`, `userId = this.name`), nicht in einem Request der App-Pipeline. Wiederverwendbare Operationen müssen deshalb ohne Request-Kontext aufrufbar sein.

### 6.2 Vereinheitlichung je API-Stil

| API-Stil | Muster „eine Definition → UI + Chat + MCP“ | Aufwand und Reibung | Potenzial |
|---|---|---|---|
| tRPC | `procedure.meta({ tool })` + Router-Introspektion (`_def.procedures`, `_def.inputs`, `_def.type`) + `createCaller({ user })` | ~80–120 LOC Core-Adapter. Query → read, Mutation → write, `delete` per Meta. Der Procedure-Pfad ist zugleich der TQ-Invalidierungs-Key | 8–9 |
| Start | gemeinsamer Operation-Layer `op = {input, effect, handler(ctx, input)}`; `defineTool(op)` + handgeschriebener Top-Level-`createServerFn(...).validator(op.input).handler(...)` pro Op | Wrapper pro Op (Compiler braucht statische Deklaration); keine Introspektion | 8 |
| Hono | `defineOperation({method, path, input, effect, handler})` erzeugt eine typisierte `.route()`-Kette und ein AppTool; alternativ `@hono/zod-openapi` als Schema-Quelle oder In-Process-`app.request()` | Generics für die `hc`-Typen sind heikel; In-Process-Aufrufe brauchen User-Injection und HTTP-Status-Mapping | 7–7,5 |
| RR framework | `defineIntent` um Tool-Metadaten erweitern | Intents müssen vorher von Route-Params und Redirects entkoppelt werden | ≤ 7,5 |

Externe Bibliotheken wie `trpc-to-mcp` oder Hono-MCP-Adapter gibt es, sie sind aber inoffiziell und wenig verbreitet. Realistisch ist ein eigener kleiner Adapter auf das bestehende `AppTool`-Interface. So bleiben die bestehenden Chat- und MCP-Adapter unverändert.

### 6.3 Empfohlenes Muster für `trpc-tsr-tq`

```ts
// src/api/trpc.server.ts – Meta-Typ registrieren
export type OperationMeta = {
    tool?: {
        title: string;
        description: string;
        effect?: "delete";      // query => read, mutation => write (Default)
        name?: string;          // sonst aus dem Pfad: "todos.update" -> "todos_update"
    };
};
const t = initTRPC.context<ApiContext>().meta<OperationMeta>().create({ transformer: superjson /* … */ });
export const router = t.router;
export const procedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
```

```ts
// src/modules/todos/todos.api.server.ts – EINE Definition für UI, Chat und MCP
const updateTodoInput = z.object({
    id: z.string(),
    title: z.string().trim().min(1).max(maxTodoTitleLength).optional(),
    description: descriptionSchema.optional(),
    dueDate: dueDateSchema.optional(),
    done: z.boolean().optional(),
    listId: z.string().optional().describe("Moves the todo to this list"),
});

export const todosApi = router({
    update: procedure
        .meta({ tool: { title: "Update todo", description: "Updates a todo … Omitted fields stay unchanged." } })
        .input(updateTodoInput)
        .mutation(async ({ input: { id, ...values }, ctx: { user } }) => {
            // Existenz-/Ownership-Prüfung genau einmal, hier (Repo mit .returning())
            const todo = await getTodoRepository().update(user.id, id, values);
            if (!todo) throw notFound();
            return todo;
        }),
});
```

```ts
// src/ai/toolsFromRouter.server.ts – Core-Adapter (einmalig)
import type { AnyRouter } from "@trpc/server";
import { TRPCError } from "@trpc/server";

export function toolsFromRouter(appRouter: AnyRouter, ctx: ApiContext): Record<string, AppTool> {
    const caller = createCallerFactory(appRouter)(ctx);
    const tools: Record<string, AppTool> = {};
    for (const [path, proc] of Object.entries(appRouter._def.procedures as Record<string, AnyProcedure>)) {
        const { meta, inputs, type } = proc._def;
        if (!meta?.tool) continue;
        const name = meta.tool.name ?? path.replaceAll(".", "_");
        tools[name] = {
            title: meta.tool.title,
            description: meta.tool.description,
            inputSchema: inputs[0],                              // zod-Schema der Procedure
            effect: type === "query" ? "read" : (meta.tool.effect ?? "write"),
            execute: async (input) => {
                try {
                    return await path.split(".").reduce<any>((node, key) => node[key], caller)(input);
                } catch (error) {
                    // TRPCError -> verständliche Meldung fürs Modell
                    throw new Error(error instanceof TRPCError ? `${error.code}: ${error.message}` : "Operation failed");
                }
            },
        };
    }
    return tools;
}

// registry.server.ts
export const createTools = (userId: string) => ({
    ...toolsFromRouter(appRouter, { user: { id: userId } }),
    ...aiOnlyTools(userId), // nur AI-spezifische Ops (findTodos, appendToNote) bleiben handgeschrieben
});
```

**Konsequenzen**
- Pro neuer Operation schreibt man **ein** Procedure-Objekt plus `meta`. Chat und MCP bekommen sie automatisch, die UI ruft sie typisiert über `trpc.todos.update.mutationOptions()` auf.
- Es gibt **ein** Schema und **eine** Fehler- und Existenzlogik. Die Abweichungen aus 5.0 Nr. 1 verschwinden.
- Voraussetzung für Validierungsfehler: Procedures **werfen** sie (`TRPCError` `BAD_REQUEST` bzw. zod), statt `{error}` zurückzugeben. Die UI mappt zod-Issues auf Formularfelder.
- Grid-Listen-Procedures mit `looseObject`-Input sind keine guten Tool-Kandidaten. Dafür gibt es die AI-spezifischen `find*`-Tools.
- `_def` ist eine interne tRPC-API. Deshalb einmal im Core kapseln und mit Tests absichern (Pfade, Typ, Meta).

### 6.4 Seitenkontext und UI-Refresh

**Typisierter Seitenkontext ohne Route-ID-Strings.** Jedes Modul definiert in einer geteilten Datei (nicht `.server`) ein zod-Schema für seinen Seitenkontext. Die Seite meldet, was sie zeigt, statt dass der Server Route-IDs parst:

```ts
// src/modules/todos/chatPage.ts (shared)
export const todosChatPage = z.object({ listId: z.string() });

// routes/lists.$listId.tsx – Params typisiert aus TanStack Router
const { listId } = Route.useParams();
useChatPage("todos", { listId });           // useChatPage<K extends keyof ChatPages>(module: K, page: ChatPages[K])

// module.server.ts
chatContext: async (userId, page?: z.infer<typeof todosChatPage>) => …
```

Wird ein Param umbenannt, bricht damit der Build in der Route. Der Server hängt nicht mehr vom Route-Tree ab, und der `CheckedRouteId`-Zyklus-Workaround entfällt.

**Refresh nach Tool-Calls.**
- Der Agent sendet nach jedem Tool mit `effect !== "read"` einen Data-Part, z. B. `data-invalidate: ["todos"]`. Den Namespace leitet er aus dem Procedure-Pfad ab.
- Der Client führt `queryClient.invalidateQueries(trpc.todos.pathFilter())` und anschließend `router.invalidate()` aus.
- Damit entfällt `mutatingToolNames` ganz.
- Fallback: Der Client invalidiert nach jedem Tool, das in einem vom Server generierten Manifest nicht als `read` markiert ist.

**Approval.** `delete` → `needsApproval` (Chat) bzw. `destructiveHint` (MCP) funktioniert unverändert über `effect`.

---

## 7. Library-Extraktion

### 7.1 Was paketierbar ist

| Teil | 1 Start | 2 RR fw | 3 Hono data | 4 Hono decl | 5 Hono TSR | 6 tRPC data | 7 tRPC decl | 8 tRPC TSR |
|---|---|---|---|---|---|---|---|---|
| Core-Shell (Layout, Auth, Komponenten) | mittel (SSR, Start-Kontext) | mittel | gut | gut | gut | gut | gut | gut |
| Chat (Agent-DO, ChatPanel, Adapter) | gut | gut | gut | gut | gut | gut | gut | gut |
| MCP-Handler + AppTool-Adapter | gut | gut | gut | gut | gut | gut | gut | gut |
| Grid-Helper (`gridSearch`, `useServerGrid`, `filters.server`) | gut | gut | gut | gut | gut (TSR-`useMatch`) | gut | gut | gut (TSR) |
| Server-Teil eines Moduls (API, Repos, Tools, Schema) | schlecht (Start-Compiler) | schlecht (Route-gebunden) | gut (Sub-App) | gut | gut | gut (braucht Core-`t`) | gut | gut |
| Client-Teil eines Moduls (Seiten, Navigation) | schlecht | schlecht | gut (RouteObject[]) | **sehr gut** | schwer | gut | **sehr gut** | schwer |

### 7.2 Blocker

| Blocker | betrifft | Bemerkung |
|---|---|---|
| File-Routes mit Generator, der `createFileRoute("/_app/...")`-Literale umschreibt; `physical()`-Pfade relativ ins App-Verzeichnis | 1, 5, 8 | In `node_modules` kann (und darf) der Generator nicht schreiben |
| `Register`-Augmentation der App für typisierte Links; `routeTree.gen` als Typquelle in `module.server.ts` | 1, 5, 8 | Module lassen sich nicht standalone typchecken |
| typegen nur für `appDirectory` (getestet) | 2 | Paket-Routen verlieren `+types` |
| Start-Compiler muss die Paket-Source transformieren | 1 | nur Workspace-Pakete mit TS-Source |
| globaler Client `hc<Api>` bzw. `trpc`/`api`, typisiert über die ganze App → Typzyklus | 3–8 | Lösung: modul-lokale Clients (`hc<typeof todosApi>("/api")` bzw. `createTRPCOptionsProxy<{lists, todos}>`); funktioniert, weil Modul-APIs auf Root-Ebene gemountet sind |
| `~/`-Alias-Importe in Core-Interna; `getDb()` an `env.DB` gebunden | alle | Core-Paket mit injizierter DB bzw. vereinbartem Binding-Namen als Vertrag |
| eine Migrationshistorie, Schema-Glob | alle | Konvention für Schema- und Migrations-Export pro Paket |
| Router-Komposition (`.route()`-Kette, `moduleApis`-Spread) muss für Typen von Hand geschrieben werden | 3–8 | per-Modul-Clients erlauben Loop bzw. Glob; bei tRPC alternativ ein `defineServerModules(...)` mit Tupel-Inferenz |

### 7.3 Empfohlener Weg für `trpc-tsr-tq`

1. **Monorepo mit Workspace-Paketen, die TS-Source exportieren.** Kurzfristig realistisch und ohne Typverlust. Der Generator verarbeitet Quell-Dateien im Workspace.
2. **Core-Paket:** `procedure`/`router`/`OperationMeta`, `toolsFromRouter`, AppTool-Adapter für AI SDK und MCP, ChatAgent-Basis, Grid-Helper, Shell-Komponenten, `getDb(binding)` und Typen (`AppModule`, `ServerModule`).
3. **Modul-Pakete exportieren:**
   - `serverModule` (Router, Schema, Instructions, Chat-Kontext-Schema);
   - `appModule` (Navigation, Suggestions);
   - einen modul-lokalen Options-Proxy;
   - Routen.
4. **Routen vorkompilierter npm-Module:** code-basierte Route-Factories `createTodosRoutes(parentRoute)` mit `createRoute({ getParentRoute })`. TanStack Router unterstützt das vollständig typisiert. Wie sich solche Teilbäume in einen file-basierten Host-Tree einhängen lassen, ist vor der Template-Freigabe per Spike zu verifizieren. Das ist der zentrale offene Punkt bei 8 gegenüber 7.
5. **Migrationen:** pro Paket ein eigener Ordner, App-Konfiguration aggregiert die Schemas.

Mit diesen Schritten steigt Library-Extraktion bei Variante 8 von 5 auf ~7. Variante 7 hat den Routing-Blocker gar nicht und erreicht deshalb ~8,5.

---

## 8. Empfehlung & nächste Schritte

### 8.1 Entscheidung

**`trpc-tsr-tq` (PR #18) wird Basis-Template.** `trpc-rr-decl-tq` ist die dokumentierte Ausweichoption, falls der Spike zu code-basierten Route-Factories (7.3 Schritt 4) scheitert und Library-Extraktion ganzer Module kurzfristig zwingend ist.

Die Server-Seite (tRPC, Tools, MCP, Agent) ist in 7 und 8 identisch. Ein späterer Wechsel des Routers ist auf die Seiten begrenzt.

### 8.2 Verbesserungen vor der Freigabe als Template (nach Priorität)

1. **Operation-Layer:** Tools aus Procedures ableiten (`OperationMeta`, `toolsFromRouter`, Abschnitt 6.3).
   - Handgeschriebene `tools.server.ts` nur noch für AI-spezifische Ops.
   - Procedures werfen Validierungsfehler, statt `{error}` zurückzugeben.
   - Tests für Introspektion und Namensbildung.
2. **Repository-Korrektheit:** `update`/`rename` mit `.returning()` und `notFound` bei 0 Zeilen (5.0 Nr. 4). Server-seitig explizite Felder statt Spread von `values`.
3. **`mutatingToolNames` entfernen:** Der Agent sendet `data-invalidate` mit den Namespaces, der Client invalidiert gezielt (`trpc[ns].pathFilter()`). `useRefresh` invalidiert ebenfalls gezielt, statt alles als stale zu markieren.
4. **Typisierter Chat-Seitenkontext** über modul-eigene zod-Schemas und `useChatPage(module, payload)` (6.4). `routeId`- und `params`-Strings entfallen.
5. **Registrierung vereinfachen:**
   - `defineServerModules(...)` bzw. typisierter Router-Merge (eine Liste statt `serverModules` plus `moduleApis`);
   - `import.meta.glob` für die Client-Registry;
   - `routes.ts` aus der Modulliste erzeugen;
   - Ziel: ein neues Modul ohne Edits in zentralen Dateien.
6. **Codegen in CI:** `@tanstack/router-cli` ergänzen, `tsr generate` in `lint:tsc` aufnehmen und in CI auf Diff prüfen.
7. **Generische Helper:**
   - `createGridRoute` (`validateSearch`, `loaderDeps`, Loader mit `loadOrNotFound`/`lastPageWithRows`, Wiederverwendung der Query in der Komponente);
   - `useApiMutation(trpc.x.mutationOptions(), { invalidates })` als einzige Client-Fassade (statt `api` und `trpc`);
   - Collection-Factory (Repo + Router + Navigation + Default-Redirect + Header) für „Container + Items“-Entitäten.
8. **Typisierte Grid-Suche:** zod-Search-Schema mit Sort-/Filter-Tupeln statt `'field:op:value'`, gemeinsam für Route und Procedure. Damit entfallen `looseObject` und die Filter-Casts. Optional `GridColDef`-Felder über einen Helper `col<Todo>("title", …)` absichern.
9. **Fehlertypen:** `TRPCClientError<AppRouter>` statt `error.data as …` (`client.ts:22`, `query.ts:32`).
10. **Default-Entity ohne Write im Preload:** `getDefault` nicht in `beforeLoad` ausführen bzw. vom Preload ausnehmen (`lists.index.tsx:10`). Alternativ eine Read-Query mit separater Create-Mutation.
11. **Navigation-Loading:** Navigationsdaten pro Modul nicht blockierend im `_app`-Loader laden (Prefetch statt `await`) oder in einer einzigen gebatchten Query bündeln. Das hält die Startzeit mit 20+ Modulen stabil.
12. **Library-Spike:** Monorepo-Struktur (Core-Paket plus ein Modul als Workspace-Paket) und code-basierte Route-Factory für ein Modul prototypisch umsetzen (7.3).
13. **README aktualisieren**, mit den Konzepten, die neue Entwickler lernen müssen: Procedure + Meta, `queryOptions` in Loader und Komponente, Invalidierung, Modul-Anatomie, Rezept „neue Operation“.

### 8.3 Worauf achten

- **TS-Performance:** Ein einzelner `AppRouter` plus der TSR-`Register` kostet heute 580k Instantiations (`tsc` ~10 s). Bei vielen Modulen früh modul-lokale Proxies einsetzen und die Instantiations in CI beobachten (`--extendedDiagnostics`).
- **Interne tRPC-API:** `_def.procedures` und `_def.meta` sind intern. Zugriff nur im Core-Adapter, bei Minor-Updates Tests laufen lassen.
- **Pre-1.0-Abhängigkeiten:** `@mui/x-chat` (alpha), `@cloudflare/ai-chat` und `agents` (0.x) pinnen und Upgrades bündeln.
- **Worker-Größe:** Der Worker wird vom AI-Stack dominiert (~0,9 MB gz). Das ist weit unter den Limits (3 MB free / 10 MB paid komprimiert), wächst aber mit Tools und Instructions.
- **Keine SSR:** Die erste Darstellung wartet auf JS und einen API-Batch. Für Access-geschützte interne Apps ist das akzeptabel. Für öffentliche Seiten wäre eine andere Lösung nötig.
- **Externe REST-API:** Falls Dritte eine klassische REST- oder OpenAPI-Schnittstelle brauchen, liefert tRPC sie nicht nativ. Optionen sind ein OpenAPI-Adapter oder separate Hono-Routen im selben Worker. Für AI-Clients deckt MCP den Bedarf bereits ab.
- **Disziplin bei Operationen:** Jede fachliche Operation wird genau einmal als Procedure definiert. Tools ohne Procedure gibt es nur, wenn sie AI-spezifisch sind. Am besten per Review-Checkliste bzw. Lint absichern.

---

## Anhang A: Gemessene Kennzahlen (Auszug)

| Variante | src-LOC | Worker gz | Client-Main gz | Route-Splitting | TS-Instantiations | Zentrale Edits / Modul |
|---|---|---|---|---|---|---|
| 1 tanstack-start | 3771 | 1,78 MB (SSR, gesamt) | 82 kB Entry | ja | 589k | 3 Dateien |
| 2 rr-framework | 3855 | 1,71 MB (SSR, gesamt) | ~600 kB gesamt, gesplittet | ja | 431k | 3 Dateien |
| 3 hono-rr-data | 3880 | 888 kB | 434 kB | nein | 633k | 2 Dateien / 3 Edits |
| 4 hono-rr-decl-tq | 4054 | 888 kB | 425 kB | nein | 647k | 2 / 3 |
| 5 hono-tsr-tq | 3934 | 888 kB | 437 kB | nein (1 Zeile) | 772k | 3 Dateien |
| 6 trpc-rr-data | 3943 | 901 kB | 439 kB | nein | 430k | 2 / 3 |
| 7 trpc-rr-decl-tq | 4117 | ~900 kB | 433 kB | nein | 447k | 2 / 3 |
| 8 trpc-tsr-tq | 3967 | 902 kB | ~600 kB gesamt, Routen 3–34 kB | ja | 580k | 3 Dateien / 4 Listen |

Bei den SSR-Varianten wird der SSR-Teil dynamisch importiert. Der eager ausgewertete `index.js` ist 765 kB bzw. 619 kB gz groß und damit nicht größer als der SPA-Worker. SSR verschlechtert also nicht den Cold Start für API, Chat und MCP. Es kostet CPU pro Dokument-Render und erhöht die Upload-Größe.

## Anhang B: Wesentliche Korrekturen der Querschnitts-Bewertungen an den Berichten

**Typsicherheit**
- Die Spread-Conditional-Lücke beim PATCH (Bericht 4) und das `looseObject`-Grid-Schema (Bericht 7) gibt es in allen Varianten. Sie sind kein Unterscheidungsmerkmal.
- Variante 8 liegt vor Variante 1, weil Variante 1 noch die `unknown`-Navigation und den `RequestContext`-Cast hat.
- Variante 6 liegt hinter Variante 3, weil Variante 6 keinerlei Prüfung der Param-Namen hat.
- „Typisierter Router mit RR unmöglich“ (Bericht 3) ist überzogen. Variante 7 zeigt mit ~50 LOC typisierte Params, Search und `href`. Was fehlt, ist nur die Existenzprüfung von Routen.

**Einfachheit**
- Variante 4: 8 → 6 (Fehlerbehandlung, `DefaultRedirect`, Query-Factories nicht mitgezählt).
- Variante 5: 6,5 → 5,5.
- Variante 7: Der Glue-Code umfasst ~230 und nicht ~150 LOC. Das Core-Plumbing ist mit ~480 LOC das größte aller Varianten.
- Start ist mit 6,5 einfacher als RR framework mit 6, weil RR framework den Intents-Layer braucht.

**Module und Library**
- Start (Bericht: 7) liegt auf einer gemeinsamen Skala unter den Varianten 3, 4, 6 und 7.
- Die Library-Scores von 4 und 7 müssen gleich sein.
- Typzyklen über den globalen Client bestehen in allen Hono- und tRPC-Varianten. In 1, 5 und 8 kommt ein zweiter Zyklus über `routeTree.gen` hinzu.

**Duplikation**
- `tools.server.ts` ist überall byte-identisch. Die „Hauptduplikation“ unterscheidet die Varianten also nicht.
- Die 422-Prüfung kommt in den Hono-Varianten 6× vor, nicht 4× bzw. 5×.
- Das Hono-Potenzial liegt bei 6,5 statt 7,5, weil es keinen Options-Proxy gibt.

**AI/MCP**
- Agent, Adapter und Tools sind in allen 8 Varianten identisch. Der Vorsprung, den Bericht 1 für Start aktuell sieht (7), ist unbegründet.
- Das AI-Potenzial von Start sinkt von 9 auf 8, weil Tools im Durable Object außerhalb der Start-Pipeline laufen.
- `trpc-to-mcp` ist ein Beleg dafür, dass das Muster funktioniert. Als Abhängigkeit ist es nicht geeignet.
- Laut Bericht 1 fehlt `min(1)` im updateTodo-Schema der Server Function. Tatsächlich ist es vorhanden. Die Divergenz betrifft nur create und die Namensschemas.

**Cloudflare**
- „SSR verschlechtert den Cold Start“ ist für API-, Chat- und MCP-Requests überzogen (dynamische Imports).
- „Best-in-class“-Aussagen einzelner SPA-Berichte sind nicht haltbar: Alle 6 SPAs haben eine byte-identische Asset-Konfiguration. tRPC hat dabei den Vorteil des Batchings.
- SSR lässt sich bei RR framework auf Cloudflare nicht abschalten.

**Skalierung**
- „Refetch-Storms“ sind überzogen. `invalidateQueries()` lädt nur aktive Queries neu, und `refetchType: "none"` zusammen mit `router.invalidate()` lädt nur die aktuellen Matches neu.
- Variante 5 hat `staleTime: 0` (in keinem Bericht erwähnt).
- Die TS-Kosten von tRPC sind niedriger als die von Hono. Das größte Risiko für die Typprüfungs-Performance ist die verkettete Hono-`Api`.
