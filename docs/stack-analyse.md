# Stack-Analyse: Basis-Stack für zukünftige Projekte (Neubewertung)

Stand: 2026-11-10. Gesetzt sind Cloudflare Workers + D1, React, MUI (inkl. MUI X DataGrid und MUI X Chat), Drizzle und TypeScript. Offen ist eine von 8 Varianten für API-Schicht, Routing und Data-Fetching.

Diese Fassung ersetzt die Bewertung vom 2026-11-09. Seitdem wurde jede Variante gezielt verbessert, und alle 8 teilen jetzt einen stack-neutralen Kern (Abschnitt 2). Alle Scores wurden neu aus dem Code abgeleitet und nicht von gestern übernommen.

Grundlage:

- die 8 Worktrees auf ihrem aktuellen Branch-Head;
- je ein Detailbericht pro Variante;
- je eine Querschnitts-Bewertung pro Kategorie. Für diese wurden die Aussagen der Berichte im Code nachgeprüft, eigene Experimente in Scratch-Kopien gemacht (Rename-Tests, Paketierungstest, Skalierungstest mit 32 Modulen, Builds) und die Scores über alle Varianten kalibriert.

Bei Abweichungen gilt die Querschnitts-Bewertung (Anhang B).

Alle 8 Varianten bestehen `npm run lint`, `npm run build` und einen e2e-Smoke-Test mit 29 Checks (Playwright-UI + MCP). Das wurde unabhängig verifiziert.

---

## 1. Kurzfazit

**1. Wahl: `trpc-tsr-tq` (tRPC + TanStack Router als SPA + TanStack Query, PR #18).**
**2. Wahl: `trpc-rr-decl-tq` (tRPC + React Router declarative + TanStack Query, PR #17).**

- **Die Empfehlung von gestern bleibt bestehen, aber aus anderen Gründen.** Gestern war das Hauptargument für tRPC, dass sich Chat- und MCP-Tools aus Procedures ableiten lassen. Dieses Argument ist weggefallen. Operationen, Tools, MCP, Chat-Kontext und UI-Refresh-Signal sind jetzt in allen 8 Varianten derselbe stack-neutrale Code (Agent, Tools, MCP, Chat-Seitenkontext und Changes-Signal md5-identisch, die Modul-Operationen bis auf Kommentare gleich). Jede Variante integriert AI/MCP fast gleich gut (7,5–8,5); die Unterschiede kommen nur aus dem Refresh-Glue.
- **Warum Variante 8 trotzdem führt:**
    - tRPC hat den dünnsten typtreuen Adapter: 1 Zeile pro Operation, superjson, generierte `queryOptions`/Keys und Batching aller Loader eines Seitenaufrufs in einen Worker-Request.
    - TanStack Router liefert als einziger Router framework-seitige Typprüfung von Links, Params, Search und Redirects, dazu Loader über einen gemeinsamen Query-Cache, Preload on intent und automatisches Code-Splitting.
    - Variante 8 liegt deshalb bei Typsicherheit (8,5, gleichauf mit `tanstack-start`), Cloudflare (9) und Skalierung (8) vorn. Im Skalierungstest wuchsen die TS-Kosten bis 32 Module linear.
- **Variante 7 als Alternative:** Sie teilt die tRPC-Vorteile und lässt sich deutlich besser paketieren. Module sind reine Werte ohne Codegen und typchecken standalone mit 0 Fehlern (Library 7,5 vs. 6). Dafür ist ihre Routing-Typisierung selbstgebaut: `<Link to>` ist `string`, Route-Hooks sind Casts, Layouts sind flach.
- **Die Abstände sind klein geworden.**

    | Gesamtwert | 8    | 7    | 1 `tanstack-start` |
    | ---------- | ---- | ---- | ------------------ |
    | aktuell    | 7,78 | 7,71 | 7,56               |
    | Potenzial  | 8,68 | 8,48 | 8,41               |

    Die Spitzengruppe ist robust: 8 gewinnt in 3 von 4 Gewichtungen. Der 2. Platz hängt dagegen von der Gewichtung ab. Gewichtet man Einfachheit und Library stärker, liegt 7 vorn. Gewichtet man Typsicherheit und Skalierung stärker, rückt `tanstack-start` auf Platz 2.

- **Die wichtigere Achse ist jetzt das Routing, nicht mehr die API.** Das Operationsmodell ist stack-neutral, und ein API-Adapter ist 1–3 Zeilen pro Operation. Typsicherheit, Library-Extraktion und Skalierung werden heute vom Router entschieden.

---

## 2. Was sich seit der ersten Bewertung geändert hat

### 2.1 Gemeinsamer, stack-neutraler Kern (aus `main` in alle 8 gemergt)

| Baustein                       | Datei(en)                                                                                                                                                           | Was er ersetzt / bewirkt                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation-Layer                | `src/operations.ts` (`defineOperation`, `runOperation`, `toolsFromOperations`, `OperationInput/Output`)                                                             | Eine Operation = zod-Input + `effect` (`read`/`write`/`delete`) + optional `ai: {title, description}` + Handler. Schema, Existenzprüfung und Fehler-Semantik existieren genau einmal.                                               |
| Domänen-Operationen pro Modul  | `src/modules/<m>/operations.server.ts`                                                                                                                              | Ersetzen die handgeschriebenen `tools.server.ts` (161/173 LOC) und die doppelten Schemas in den UI-APIs. Die Abweichungen von gestern sind beseitigt (leerer Titel, Existenzprüfung nur im Tool, `appendToNote` nur als Tool).      |
| Abgeleitete Tools              | `toolsFromOperations` → `registry.server.ts createTools` → `chat/tools.server.ts` (`needsApproval` bei `delete`) und `mcp/mcp.server.ts` (Annotations aus `effect`) | Jede Operation mit `ai` ist automatisch Chat- und MCP-Tool. Doppelte Tool-Namen werfen beim Start.                                                                                                                                  |
| Fehlerklassen                  | `src/errors.ts` (`NotFoundError`, `ValidationError`)                                                                                                                | Ersetzen ad-hoc-`{error}`-Unions und 422-Zweige. Jede API-Schicht mappt sie einmal hin und zurück.                                                                                                                                  |
| Typisierter Chat-Seitenkontext | `src/chat/chatPage.ts` (`defineChatPage`, `defineChatContext`), `src/chat/useChatPage.tsx`                                                                          | Ersetzt `{routeId, params: Record<string,string>}`. Die Seite meldet `useChatPage(todosChatPage, { listId })`, der Server validiert mit demselben zod-Schema. Renames brechen den Build auf beiden Seiten (in allen 8 verifiziert). |
| Data-Changes-Signal            | `chat/agent.server.ts:36-38`, `chat/useChatChanges.ts`                                                                                                              | Nach jedem Tool mit `effect !== "read"` schreibt der Agent einen Part `data-changes {modules}`. Der Client lädt gezielt diese Module neu. `mutatingToolNames: string[]` entfällt.                                                   |
| Typisierte Grid-Suche          | `src/gridSearch.ts`                                                                                                                                                 | Typisierte Felder, Operatoren und `GridColumns<Row, Fields>`. `z.looseObject`/`z.record`-Grid-Inputs entfallen. `filterParam` (typisierter Preset-Filter) gibt es nur in 5 und 8.                                                   |
| Repository-Korrekturen         | z. B. `todos/db/todos.server.ts:91,106,113`                                                                                                                         | `update`/`rename`/`delete` liefern die Zeile per `.returning()`. Bei 0 Zeilen wirft die Operation `NotFoundError`. Der stille No-op-Bug von gestern ist behoben.                                                                    |

Belegt per md5-Vergleich: `agent.server.ts`, `tools.server.ts`, `mcp.server.ts`, `useChatChanges.ts`, `chatPage.ts` und `errors.ts` sind in allen 8 Worktrees byte-identisch. `operations.ts` unterscheidet sich nur in Kommentaren und im zusätzlichen `operationInput`-Helper von Variante 1.

### 2.2 Stack-spezifische Verbesserungen

| #   | Variante          | HEAD      | Wesentliche Verbesserungen                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tanstack-start`  | `d45be65` | `createServerFn` als 3-Zeiler über `operationHandler` (`a57a148`). TanStack Query mit modul-präfixierten Keys und gezielter Invalidierung (`97093e2`). `ssr: "data-only"` (`5e923bd`). Auth einmal im Worker-Entry (`2513b48`). Module per Ordner gefunden (`a85bd12`). Route-Tree in `lint:tsc` regeneriert (`97991b9`). Sidebar-Prefetch nur beim Betreten der App (`a8e39c2`).                                                                                |
| 2   | `rr-framework`    | `07f6f1f` | Intents-Layer entfernt. Eine generische Resource-Route `/api/:module/:operation` plus `useOperations<typeof serverModule>` (im Merge `7e0cf2b`; typisiertes Outcome in `dcda664`). Loader rufen Operationen in-process auf (`loadOperation`/`loadGridOperation`). Modul-Ordner-Discovery (`9da5f71`). `revalidateOnChangesOf(moduleId)` (`bef538b`). CSRF-Check auch für Resource-Routes (`21dc5f9`). Drei Revalidation-Fixes (`c60f9ef`, `13d74e1`, `07f6f1f`). |
| 3   | `hono-rr-data`    | `4341f1a` | `operationRoute` (1 Zeile pro Route, Typen aus der Operation). Modul-lokale `hc`-Clients, API-Mount per Schleife. Eigenes `defineRoute` mit typisierten Params/Search/Loader/`href` (`ceec5f4`). Modulweise Revalidierung und Navigation-Routes pro Modul. Lazy Pages (`8656f37`).                                                                                                                                                                               |
| 4   | `hono-rr-decl-tq` | `9f85a33` | Server-Schicht wie 3 (identisch). 47-Zeilen-`defineRoute`. Modul-präfixierte Query-Keys. Lazy Pages + lazy ChatPanel. Hover-Prefetch der Seitendaten (`98509bb`). Typisierte PATCH-Literale statt Spread-Conditional.                                                                                                                                                                                                                                            |
| 5   | `hono-tsr-tq`     | `0fda83e` | Server-Schicht wie 3/4. `autoCodeSplitting`, Preload on intent, `staleTime` 30 s. Typisierter Overdue-Filter (`filterParam`) und `InferResponseType`-Row-Typen (`b96ef33`). Gezielte Modul-Invalidierung.                                                                                                                                                                                                                                                        |
| 6   | `trpc-rr-data`    | `5e5494a` | `query(op)`/`mutation(op)` (1 Zeile pro Operation). Modul-lokale Clients. `defineRoute`. Modulweise Revalidierung mit gezählter Map (`5e5494a`). Navigation-Routes pro Modul. Lazy Pages.                                                                                                                                                                                                                                                                        |
| 7   | `trpc-rr-decl-tq` | `30dc958` | Server-Schicht wie 6/8. `createModuleApi` über `createTRPCOptionsProxy` mit `keyPrefix` (ohne Casts). Automatische Invalidierung pro Modul in `MutationCache.onSettled`. `defineRoute({ query, page })` lädt Code und Daten parallel, inklusive Hover-Preload und Transitions mit Progress-Bar (`9ef2f88`). Branded `Href`.                                                                                                                                      |
| 8   | `trpc-tsr-tq`     | `ac62e6c` | Server-Schicht wie 6/7. Modul-lokale Clients über einen kombinierten Call-/Options-Proxy. Gezielte Invalidierung statt `useRefresh` mit „stale before navigate“ (`1d20da6`). Collection-Helper (`a159d7e`). Typisierter Overdue-Filter (`8f6225c`). Route-Tree in `lint:tsc` regeneriert.                                                                                                                                                                        |

Die Server-Schicht ist innerhalb der Gruppen identisch:

- Hono 3/4/5: `hono.server.ts` und `api.server.ts` byte-identisch, `client.ts` unterscheidet sich nur in einem Kommentar.
- tRPC 6/7/8: `trpc.server.ts`, `router.server.ts` und die Modul-`api.server.ts` identisch. Nur `api/client.ts` unterscheidet sich.

In allen 8 Varianten muss ein neues Modul nur noch in **einer** zentralen Datei eingetragen werden (`src/modules/registry.ts`, Reihenfolge der Sidebar). Gestern waren es 2–3 Dateien.

### 2.3 Konsequenz: welche Unterschiede verschwunden sind und welche bleiben

**Verschwunden:**

- **Der AI/MCP-Vorsprung von tRPC.** Tools kommen in allen Varianten aus den Operationen, und der Chat-Kontext hängt nicht mehr an Routen. Die Tools laufen im ChatAgent-DO und rufen die Operationen direkt auf, an jeder API-Schicht vorbei. Damit sind auch die gestrigen Potenzial-Argumente hinfällig: `createCaller` als Tool-Quelle und typisierte Route-IDs für den Chat-Kontext.
- **Doppelte Operationen und Schemas.** Die Duplikations-Spanne schrumpfte von 4–5,5 auf 6,5–8.
- **Typisierte Fehler-Unions als Hono-Vorteil.** Alle Varianten mappen jetzt auf `NotFoundError`/`ValidationError`. Fehler-Bodies sind auch bei Hono nicht mehr Teil der `hc`-Typen.
- **Unterschiede bei der Modul-Registrierung.** Überall 1 zentrale Datei. In allen 8 verifiziert: Ordner löschen plus 1 Zeile → `tsc` (App-tsconfig) und Build grün. Nur `lint:tsc` bricht an `scripts/fixtures.ts` (Abschnitt 6).
- **Fehlendes Code-Splitting** (gestern in 3–7). Alle 8 splitten jetzt pro Route und laden das ChatPanel lazy.

**Geblieben (und jetzt entscheidend):**

1. **Router-Typisierung:** TanStack Router (1, 5, 8) prüft beliebige Links, Params und Search. Alle React-Router-Varianten akzeptieren `<Link to="/irgendwas">`.
2. **Client-Cache:** TanStack Query (1, 4, 5, 7, 8) vs. reine Loader ohne Cache (2, 3, 6).
3. **Request-Effizienz:** tRPC-Batching und RR Single Fetch stehen unbatched REST bzw. Server Functions gegenüber.
4. **Paketierbarkeit:** Code-basierte Route-Objekte (3, 4, 6, 7) stehen File-Routes mit Host-`Register` (1, 5, 8) und appDirectory-gebundenem Typegen (2) gegenüber.
5. **SSR im Worker (1, 2) vs. statische SPA (3–8).**

---

## 3. Überblick der 8 Varianten

| #   | Variante          | Branch / PR                          | API-Adapter über Operationen                                                                                   | Routing                                                             | Data-Fetching / Cache                                                                              | SSR/SPA                   |
| --- | ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | `tanstack-start`  | `main`                               | `createServerFn().validator(operationInput<…>).handler(operationHandler(op))`, 3 Zeilen pro UI-Op              | TanStack Router, virtual file routes (Ordner-Discovery), Codegen    | Loader `fetchQuery` + `usePageQuery`; TQ, Keys `[moduleId,…]` handgeschrieben; `staleTime` 30 s    | SSR `data-only` im Worker |
| 2   | `rr-framework`    | `react-router`, #13                  | generische Resource-Route `POST /api/:module/:operation` + `useOperations().run("op", input)`; 0 Zeilen pro Op | RR v8 framework mode, `routes.ts` pro Modul, `react-router typegen` | Loader rufen Operationen in-process auf (Single Fetch); kein Client-Cache; `revalidateOnChangesOf` | SSR im Worker (Pflicht)   |
| 3   | `hono-rr-data`    | `claude/hono-j27p9n`, #14            | Hono-Sub-App pro Modul, `.on(...operationRoute(METHOD, path, op))`; Client `createClient<typeof api>(id)`      | RR data mode + eigenes `defineRoute` (155 LOC)                      | Loader, kein Cache; `reloadModules` + `moduleShouldRevalidate`                                     | SPA (static assets)       |
| 4   | `hono-rr-decl-tq` | `hono-react-router-declarative`, #16 | wie 3                                                                                                          | RR declarative + `defineRoute` (47 LOC)                             | TQ in der Komponente (keine Loader), `queryOptions` handgeschrieben; Hover-Prefetch nur Daten      | SPA                       |
| 5   | `hono-tsr-tq`     | `hono-tanstack-router`, #19          | wie 3                                                                                                          | TanStack Router, virtual file routes, `autoCodeSplitting`           | Loader `loadPageQuery` + `usePageQuery`; TQ, `queries.ts` handgeschrieben; Preload on intent       | SPA                       |
| 6   | `trpc-rr-data`    | `trpc`, #15                          | tRPC-Router pro Modul, `x: query(op)`/`mutation(op)`; `createModuleClient<Router>(id)`; `httpBatchLink`        | RR data mode + `defineRoute` (86 LOC)                               | Loader, kein Cache; `moduleData.ts` (gezählte Map)                                                 | SPA                       |
| 7   | `trpc-rr-decl-tq` | `trpc-react-router-declarative`, #17 | wie 6; `createModuleApi` = `createTRPCOptionsProxy` mit `keyPrefix`                                            | RR declarative + `defineRoute({ query, page })` (179 LOC)           | TQ; Code und Daten parallel; Invalidierung automatisch in `MutationCache.onSettled`                | SPA                       |
| 8   | `trpc-tsr-tq`     | `trpc-tanstack-router`, #18          | wie 6; `createModuleApi` = kombinierter Call-/Options-Proxy                                                    | TanStack Router, virtual file routes, `autoCodeSplitting`           | Loader `loadPageQuery` + `usePageQuery`; TQ-Keys aus tRPC; Preload on intent                       | SPA                       |

Gemeinsam in allen 8 Varianten:

- Cloudflare Access (Auth einmal pro Request);
- AIChatAgent-DO pro User;
- stateless MCP über `createMcpHandler`;
- `@cloudflare/vite-plugin` 1.67 mit workerd;
- Previews mit eigener D1;
- eine Drizzle-Migrationshistorie;
- Größe von `src`: 4123–4495 LOC (ohne generierte Dateien).

---

## 4. Haupt-Bewertung

Skala 0–10, jede Zelle **aktuell / Potenzial**.

- **Potenzial** heißt: was im selben Stack mit realistischen Verbesserungen erreichbar ist (Helper, Typ-Constraints, Konfiguration), ohne Wechsel einer Stack-Komponente.
- **Herkunft der Scores:** Alle Spalten übernehmen die kalibrierten Scores der Querschnitts-Bewertungen. Library-Extraktion hat heute eine eigene Querschnitts-Bewertung mit Paketierungsexperiment.

Gewichtung: Typsicherheit 20 %, Einfachheit 15 %, Unabhängige Module 15 %, Wenig Duplikation 10 %, AI/MCP 15 %, Library-Extraktion 10 %, Cloudflare & Reife 7,5 %, Skalierung 7,5 %.

| Variante          | Typsicherheit | Einfachheit | Unabh. Module | Wenig Duplikation | AI/MCP    | Library-Extraktion | Cloudflare & Reife | Skalierung | **Gesamt aktuell** | **Gesamt Potenzial** |
| ----------------- | ------------- | ----------- | ------------- | ----------------- | --------- | ------------------ | ------------------ | ---------- | ------------------ | -------------------- |
| 1 tanstack-start  | 8,5 / 9,5     | 6,5 / 7,5   | 8,25 / 8,75   | 7 / 8             | 8,5 / 9   | 5,5 / 6,5          | 7,5 / 8,5          | 7,5 / 8,5  | 7,56               | 8,41                 |
| 2 rr-framework    | 6,5 / 8       | 7,5 / 8     | 8,5 / 9       | 8 / 8,5           | 7,5 / 8,5 | 5 / 6,5            | 7,5 / 8            | 6,5 / 7,5  | 7,18               | 8,09                 |
| 3 hono-rr-data    | 7 / 8         | 7 / 7,5     | 8,25 / 9      | 7 / 7,5           | 8 / 8,5   | 8 / 8,5            | 8 / 8,5            | 6 / 7,5    | 7,44               | 8,15                 |
| 4 hono-rr-decl-tq | 7 / 8         | 6,5 / 7,5   | 8 / 8,5       | 6,5 / 7,5         | 8,5 / 9   | 8 / 9              | 8 / 9              | 6,5 / 8    | 7,39               | 8,28                 |
| 5 hono-tsr-tq     | 8 / 9         | 6 / 7       | 8 / 8,75      | 6,5 / 7,5         | 8,5 / 9   | 6,5 / 7,5          | 8,5 / 9            | 7,5 / 8,5  | 7,48               | 8,33                 |
| 6 trpc-rr-data    | 7 / 8         | 7 / 7,5     | 8 / 8,75      | 7,5 / 8,5         | 8 / 8,5   | 7,5 / 8,5          | 8,5 / 9            | 6,5 / 7,5  | 7,48               | 8,25                 |
| 7 trpc-rr-decl-tq | 7,5 / 8,5     | 7 / 7,5     | 8 / 8,5       | 7,75 / 9          | 8,5 / 9   | 7,5 / 8,5          | 8,5 / 9            | 7 / 8      | 7,71               | 8,48                 |
| **8 trpc-tsr-tq** | **8,5 / 9,5** | 6,5 / 7,5   | 8 / 8,75      | 7,5 / 8,5         | 8,5 / 9   | 6 / 7,5            | **9 / 9,5**        | **8 / 9**  | **7,78**           | **8,68**             |

Exakte Werte (vor dem Runden auf 2 Stellen, kaufmännisch):

|           | 1      | 2      | 3      | 4      | 5     | 6     | 7      | 8     |
| --------- | ------ | ------ | ------ | ------ | ----- | ----- | ------ | ----- |
| aktuell   | 7,5625 | 7,175  | 7,4375 | 7,3875 | 7,475 | 7,475 | 7,7125 | 7,775 |
| Potenzial | 8,4125 | 8,0875 | 8,15   | 8,275  | 8,325 | 8,25  | 8,475  | 8,675 |

Variante 5 und 6 sind aktuell exakt gleichauf.

### 4.1 Rangfolge

| Rang | aktuell                        |      | Potenzial         |      |
| ---- | ------------------------------ | ---- | ----------------- | ---- |
| 1    | `trpc-tsr-tq`                  | 7,78 | `trpc-tsr-tq`     | 8,68 |
| 2    | `trpc-rr-decl-tq`              | 7,71 | `trpc-rr-decl-tq` | 8,48 |
| 3    | `tanstack-start`               | 7,56 | `tanstack-start`  | 8,41 |
| 4    | `hono-tsr-tq` / `trpc-rr-data` | 7,48 | `hono-tsr-tq`     | 8,33 |
| 5    | (geteilt)                      | –    | `hono-rr-decl-tq` | 8,28 |
| 6    | `hono-rr-data`                 | 7,44 | `trpc-rr-data`    | 8,25 |
| 7    | `hono-rr-decl-tq`              | 7,39 | `hono-rr-data`    | 8,15 |
| 8    | `rr-framework`                 | 7,18 | `rr-framework`    | 8,09 |

### 4.2 Sensitivität

Drei alternative Gewichtungen, jeweils exakt berechnet. Die Reihenfolge der Gewichte ist Typ / Einf / Module / Dup / AI / Lib / CF / Skal:

- **A** alle gleich: 12,5 % je Kategorie.
- **B** Einfachheit + Library schwerer: 15 / 25 / 15 / 10 / 10 / 20 / 2,5 / 2,5.
- **C** Typsicherheit + Skalierung schwerer: 30 / 10 / 15 / 7,5 / 12,5 / 7,5 / 5 / 12,5.

| Variante          | A aktuell | A Potenzial | B aktuell | B Potenzial | C aktuell | C Potenzial |
| ----------------- | --------- | ----------- | --------- | ----------- | --------- | ----------- |
| 1 tanstack-start  | 7,41      | 8,28        | 7,16      | 8,04        | 7,75      | 8,61        |
| 2 rr-framework    | 7,13      | 8,00        | 7,03      | 7,94        | 7,08      | 8,08        |
| 3 hono-rr-data    | 7,41      | 8,13        | 7,49      | 8,13        | 7,31      | 8,13        |
| 4 hono-rr-decl-tq | 7,38      | 8,31        | 7,34      | 8,23        | 7,31      | 8,24        |
| 5 hono-tsr-tq     | 7,44      | 8,28        | 7,10      | 8,00        | 7,60      | 8,48        |
| 6 trpc-rr-data    | 7,50      | 8,28        | 7,43      | 8,20        | 7,36      | 8,19        |
| 7 trpc-rr-decl-tq | 7,72      | 8,50        | **7,59**  | **8,35**    | 7,66      | 8,46        |
| 8 trpc-tsr-tq     | **7,75**  | **8,66**    | 7,33      | 8,33        | **7,93**  | **8,84**    |

Lesart:

- **8 führt bei Basis, A und C,** jeweils aktuell und im Potenzial.
- **Bei B führt 7.** Aktuell liegt 7 klar vorn (7,59; dahinter 3 mit 7,49 und 6 mit 7,43; 8 nur auf Platz 5 mit 7,33). Im Potenzial ist der Vorsprung knapp (8,35 vs. 8,33).
- **Platz 2 ist nicht stabil.** Bei C rückt `tanstack-start` mit 8,61 vor 7 (8,46) und 5 (8,48). Bei A liegt 4 im Potenzial auf Platz 3.
- **Die Plätze 3–7 liegen bei der Basisgewichtung innerhalb von 0,175 Punkten** (aktuell 7,39–7,56) und sind nicht belastbar geordnet.
- **Robust ist nur:** 8 und 7 gehören in die Spitzengruppe, 2 liegt in jeder Gewichtung hinten.

### 4.3 Gesamt aktuell gestern → heute

| Variante          | gestern aktuell | heute aktuell | Δ     | gestern Potenzial | heute Potenzial | Haupttreiber                                                                                                                                 |
| ----------------- | --------------- | ------------- | ----- | ----------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 tanstack-start  | 6,30            | 7,56          | +1,26 | 7,64              | 8,41            | Module 5,5→8,25 (Discovery, keine Navigation-Casts). AI 6,5→8,5. Skalierung 6→7,5 (TQ statt `router.invalidate()` von allem). Library 4→5,5. |
| 2 rr-framework    | 5,72            | 7,18          | +1,46 | 7,12              | 8,09            | Intents-Layer weg: Duplikation 5→8, Einfachheit 6→7,5, Module 5→8,5. Typsicherheit unverändert 6,5 (Loader-Input `unknown`).                 |
| 3 hono-rr-data    | 6,16            | 7,44          | +1,28 | 7,59              | 8,15            | AI 6→8, Library 6→8, Typsicherheit 5,5→7 (`defineRoute`). Einfachheit 7,5→7 (neuer eigener Routing-Layer).                                   |
| 4 hono-rr-decl-tq | 6,46            | 7,39          | +0,93 | 7,76              | 8,28            | AI 6→8,5, Duplikation 4,5→6,5. Cloudflare 8,5→8 (Code→Daten-Wasserfall, unbatched).                                                          |
| 5 hono-tsr-tq     | 6,42            | 7,48          | +1,06 | 7,65              | 8,33            | AI 6,5→8,5, Module 6→8, Skalierung 6,5→7,5. Typsicherheit 8,5→8: der Hono-Statuscode-Vorteil ist weg, GET-Query-Falle.                       |
| 6 trpc-rr-data    | 6,28            | 7,48          | +1,20 | 7,69              | 8,25            | Typsicherheit 5→7 (`defineRoute`), AI 6→8, Skalierung 5→6,5. Einfachheit 8→7.                                                                |
| 7 trpc-rr-decl-tq | 6,72            | 7,71          | +0,99 | 8,16              | 8,48            | Duplikation 5→7,75 (Auto-Invalidierung), AI 6→8,5, Skalierung 6,5→7.                                                                         |
| 8 trpc-tsr-tq     | 6,80            | 7,78          | +0,98 | 8,36              | 8,68            | Module 6→8, Duplikation 5,5→7,5, AI 6,5→8,5, Cloudflare 8,5→9.                                                                               |

**Warum der Vorsprung schrumpft:** Der gemeinsame Kern hob alle Varianten in AI/MCP und Duplikation um 1,5–3 Punkte. Am stärksten profitierten Varianten mit großem Rückstand (2: +1,46, 3: +1,28, 1: +1,26). Den gestrigen Potenzialvorsprung von tRPC hat der Kern weitgehend vorweggenommen und allen Varianten gegeben. Er ist heute zum Großteil in allen 8 realisiert.

---

## 5. Achsen-Analyse

### 5a. API-Schicht (alle über dieselben Operationen)

So sieht der Adapter pro Operation im Code aus:

```ts
// 1 tanstack-start: src/modules/todos/todos.functions.ts:19-21 (statische Top-Level-Deklaration, Compiler-Pflicht)
export const updateTodo = createServerFn({ method: "POST" })
    .validator(operationInput<typeof todoOperations.updateTodo>)
    .handler(operationHandler(todoOperations.updateTodo));

// 2 rr-framework: kein Adapter; Aufruf im Component über die generische Route /api/:module/:operation
const { run } = useTodoOperations();
await run("updateTodo", { id: row.id, done });

// 3/4/5 Hono: src/modules/todos/api.server.ts:18
.on(...operationRoute("PATCH", "/todos/:id", todoOperations.updateTodo))

// 6/7/8 tRPC: src/modules/todos/api.server.ts:15
updateTodo: mutation(todoOperations.updateTodo),
```

|                            | Start Server Functions (1)                                                                                                         | RR framework Resource-Route + Loader (2)                                                                                           | Hono `operationRoute` (3, 4, 5)                                                                                             | tRPC `query(op)`/`mutation(op)` (6, 7, 8)                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Zeilen pro UI-Operation    | 3, nicht generierbar (statisch)                                                                                                    | 0 für Writes; Reads 1 Zeile im Loader                                                                                              | 1 + Wahl von Methode/Pfad                                                                                                   | 1                                                                                              |
| Wire-Typtreue              | seroval: `Date`, `ValidationError`-Klasse bleiben                                                                                  | turbo-stream: `Date` bleibt                                                                                                        | JSON: `Date`→`string` korrekt typisiert; **GET-Query als Schema-Typen typisiert, real Strings → 422** (`hono.server.ts:29`) | superjson: `Date`, `boolean`/`number` auch in GET                                              |
| Bindung Client ↔ Operation | per Import; **Lücke:** Validator und Handler können verschiedene Ops nennen, kompiliert (`operationHandler.ts:14` `data: unknown`) | `run()` per Op-Name typisiert, Modul-ID gegen Server-Modul geprüft; **Loader-Input `unknown`** (`routeOperations.server.ts:35,53`) | `createClient<typeof api>(moduleId: string)`: ID nicht an Mount gebunden; Path-Params nicht gegen Input-Keys geprüft        | `createModuleApi<Router>(moduleId)`: ID nicht an Router gebunden (`AnyRouter`)                 |
| Query-Keys / Options       | handgeschrieben (`queries.ts`)                                                                                                     | – (kein Cache)                                                                                                                     | handgeschrieben (4, 5); keine (3)                                                                                           | **generiert** (`queryOptions`, `queryKey`, `pathFilter`)                                       |
| Request-Anzahl             | erster Load 1 (SSR-Dokument), Mutation ~3 (unbatched)                                                                              | 1 pro Navigation (Single Fetch), Mutation 2                                                                                        | erster Load N+2, Mutation 3                                                                                                 | erster Load 1 (Batch), Mutation 2                                                              |
| TS-Kosten pro Modul        | 37,9k Inst. / 0,25 s                                                                                                               | 26,4k / 0,14 s                                                                                                                     | 37,6–44,6k / 0,17–0,25 s                                                                                                    | 27,0–35,0k / 0,14–0,16 s                                                                       |
| Module eigene Endpunkte    | Server Routes möglich                                                                                                              | Resource-Routes möglich                                                                                                            | **ja**, beliebige unter `/api/<id>`                                                                                         | nein, nur Procedures (Core-Edit nötig)                                                         |
| Paketierung Server-Teil    | nur als Source (Compiler + `Register`)                                                                                             | einfach (kein Adapter)                                                                                                             | **beste Grenze** (eigene Sub-App-Instanz, `.d.ts`-Emit verifiziert)                                                         | gut; braucht Core-`initTRPC`-Instanz; Core-Client importiert heute die Registry (`CoreRouter`) |
| Externe API                | nein                                                                                                                               | nein                                                                                                                               | echtes REST (Cache-Control möglich)                                                                                         | tRPC-Wire, nicht CDN-cachebar                                                                  |

**Fazit API:** tRPC ≈ Start > Hono > RR framework, bei Typsicherheit und Skalierung. Für die Library-Extraktion ist es umgekehrt: Hono ≥ tRPC > RR framework ≈ Start.

Die Unterschiede sind kleiner als gestern. Jeder Adapter ist dünn, und keiner beeinflusst AI/MCP, weil Tools die Operationen direkt aufrufen.

### 5b. Client-Routing und Daten

|                                          | RR data mode (3, 6)                                                         | RR declarative + TQ (4, 7)                                                            | TanStack Router + TQ (5, 8)                                                     | Frameworks: Start (1) / RR framework (2)                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Link-/Navigate-Typprüfung                | `route.href()` typisiert; `<Link to>`/`navigate(string)` beliebig           | wie data; 7: branded `Href` an Shared-Props                                           | **vollständig** (`<Link to="/listz">` → TS2820, falsche Search/Params → Fehler) | 1: wie TSR; 2: `href()` typisiert, `<Link to>` beliebig, **Search untypisiert** |
| Route-Hooks                              | Casts (`useRouteLoaderData(id) as Data`); nicht gemountete Route kompiliert | Casts (`useParams() as …`); Seite nicht an Route gebunden (4)                         | Route-Objekt file-lokal per Konvention (Fremdaufruf kompiliert ebenfalls)       | 2: Route-gebundene `ComponentProps`                                             |
| Cache                                    | keiner                                                                      | TQ, `staleTime` 30 s                                                                  | TQ, `staleTime` 30 s                                                            | 1: TQ; 2: keiner                                                                |
| Laden                                    | Loader vor Render, Chunk parallel                                           | 7: Query parallel zum Lazy-Chunk; **4: Code→Daten-Wasserfall**                        | Loader parallel zu Route-Chunks, Preload on intent                              | 1: Daten im SSR-Dokument; 2: Single Fetch                                       |
| Layouts/Boundaries                       | `RouteObject` mit `children`, native `ScrollRestoration`/`errorElement`     | flach `{path, Component}`, ErrorBoundary/ScrollToTop selbst gebaut, kein `useBlocker` | verschachtelte File-Routes, `pendingComponent`, `notFound`, `scrollRestoration` | verschachtelt, nativ                                                            |
| Codegen                                  | keins                                                                       | keins                                                                                 | `routeTree.gen.ts` (committed, in `lint:tsc` regeneriert)                       | 1: `routeTree.gen.ts`; 2: `.react-router/types` (gitignored)                    |
| Paketierung Client-Teil                  | **standalone typcheckbar**                                                  | **standalone typcheckbar**                                                            | nur als Workspace-Source (Host-`Register`)                                      | 1: nur Source; 2: verliert Route-Typen außerhalb `appDirectory`                 |
| Eigene Glue-Zeilen (gesamt pro Variante) | 382 (3) / 437 (6)                                                           | 406 (4) / 502 (7)                                                                     | 344 (5) / 347 (8)                                                               | 252 (1) / 217 (2)                                                               |

### 5c. Welche Achse ist jetzt wichtiger?

**Die Routing-Achse.** Gestern hieß es noch: die API-Achse, weil der API-Stil das Operationsmodell bestimmt. Das gilt nicht mehr:

1. **Das Operationsmodell ist stack-neutral.** Ein API-Wechsel betrifft nur noch `api.server.ts`/`api.ts` pro Modul (≈ 1 Zeile pro Operation) und die Call-Sites. Operationen, Tools, MCP und Chat bleiben unberührt.
2. **Der Router entscheidet die meisten Kategorien.** In Typsicherheit, Skalierung und Library-Extraktion liegen die Spannen zwischen den Routing-Klassen bei 1,5–3 Punkten. Zwischen den API-Klassen sind es höchstens 0,5–1. Beispiele:
    - Typsicherheit: TSR-Varianten 8–8,5, RR-Varianten 6,5–7,5.
    - Library: code-basierte Routen 7,5–8, File-Routes 5,5–6,5.
    - Skalierung: TSR + TQ 7,5–8, ohne Cache 6–6,5.
3. **Ein Router-Wechsel fasst jede Seite an.** Ein API-Wechsel betrifft dagegen nur eine dünne Schicht.

Innerhalb jeder Routing-Klasse liegt tRPC beim Potenzial weiterhin vor Hono. Bei TSR und declarative ist der Abstand knapper als gestern (heute 0,35 bzw. 0,20), im data mode unverändert (0,10):

| Routing-Klasse  | tRPC (Potenzial) | Hono (Potenzial) | Abstand gestern |
| --------------- | ---------------- | ---------------- | --------------- |
| TanStack Router | 8,68 (8)         | 8,33 (5)         | 0,71            |
| declarative     | 8,48 (7)         | 8,28 (4)         | 0,40            |
| data            | 8,25 (6)         | 8,15 (3)         | 0,10            |

Damit ist die Wahl zwischen 8 und 7 im Kern eine Router-Wahl: **framework-typisiert + skalierend (TSR)** gegen **codegen-frei + paketierbar (declarative + `defineRoute`)**.

---

## 6. Varianten im Detail

Kennzahlen pro Variante:

- **LOC:** `src` roh / Code-Zeilen ohne Kommentare.
- **Glue:** stack-spezifische Code-Zeilen.
- **Op:** Zeilen pro neuer UI+AI-Operation.
- **TS:** Instantiations bei 2 Modulen / Zuwachs pro Modul / Check-Zeit bei 32 Modulen.
- **Bundle:** Worker gz / initiales Client-JS gz.

Gemeinsame Rest-Lücken des Kerns (alle 8, kein Unterscheidungsmerkmal):

- Modul-IDs sind `string` (z. B. `chat/chat.ts:28`).
- Tool-Namen stehen untypisiert in Instruction-Texten (`notes/operations.server.ts:199-203`).
- Entity-IDs sind nicht gebrandet.
- `if (!x) throw new NotFoundError` kommt 14× vor.
- `supportedOperators(...)` steht 9× pro Spalte.
- Die Navigation-Zwillinge `ListsNavigation`/`NotebooksNavigation` sind 32–38 LOC groß und unterscheiden sich in 4–8 Zeilen.
- `scripts/fixtures.ts` importiert das Notes-Schema, sodass `lint:tsc` nach dem Entfernen eines Moduls bricht.

### 6.1 `tanstack-start` (main, `d45be65`) – aktuell 7,56 / Potenzial 8,41

**Kennzahlen**

- LOC 4250 / 3383 (+ `routeTree.gen.ts` 204). Glue 252.
- Op: ~16 Zeilen in 3 Dateien (Operation 10–12, Server Function 3, Call 2); Reads zusätzlich 3 Zeilen `queries.ts` plus Loader und `usePageQuery`.
- TS: 605k / +37,9k / 11,5 s.
- Bundle: Worker 1.798 KiB gz gesamt, davon eager 1.059 KiB; Client 607 KiB gz gesamt.

**Stärken**

- Typsicherheit auf TSR-Niveau. Jeder Rename-Test (Route-Param, Input, Output, Chat-Feld, Grid-Feld, Op-Key) brach den Build an allen Verwendungsstellen. Der Generator schrieb Route-IDs selbst um.
- Kein Client-Fetch-Layer: `mutate(updateTodo({ data }))`. `ValidationError` überlebt die Serialisierung (`start.ts:34-39`), `NotFoundError` wird zu `notFound()` (`start.ts:22-31`).
- Bester erster Load aller 8: Data-only SSR (`_app.tsx:29`) liefert Daten inklusive Sidebar im Dokument-Request. Die Hydration-Fallen von gestern sind weg.
- Auth an einer Stelle (`server.ts:18`). Kleinster Core (1429 Code-Zeilen).

**Schwächen**

- Die meiste Framework-Magie:
    - Compiler-extrahierte Server Functions;
    - Request-/Function-Middleware und Serialization-Adapter;
    - `Register`-Augmentation an drei Stellen;
    - ein Skript, das den Plugin-Footer kopiert (`scripts/routeTree.ts:7-15`).
- Zwei Datenschichten: Loader `fetchQuery` (`lists.$listId.tsx:34`) plus `usePageQuery` (`:43`). `invalidateModules` = `invalidateQueries` + `router.invalidate()`. Mit 31 Invalidierungsreferenzen in den Modulen ist das der Höchstwert.
- 19 statische 3-Zeilen-Adapter (108 LOC in 4 `*.functions.ts`). Größter Modulcode aller 8 (1954 Code-Zeilen).
- Der Worker trägt die ganze UI (DataGrid 251 KiB gz im Server-Bundle), obwohl nie serverseitig gerendert wird. Server Functions sind unbatched.

**Typlücken**

- `operationHandler.ts:14`: Validator und Handler können verschiedene Ops nennen, ohne dass es auffällt (neu, verifiziert: `createTodo`-Validator + `deleteTodo`-Handler → 0 Fehler).
- `start.ts:15`: `as unknown as RequestContext`.
- `lists.$listId.tsx:156`: rohe Filter-Strings (kein `filterParam`).
- Handgeschriebene Query-Keys (`todos/queries.ts:14,23`).
- `useServerGrid.ts:32` liest die globale Location.

**Potenzial**

- `operationHandler` gegen den Validator typisieren (1 Zeile).
- `filterParam` und eine Key-Factory portieren.
- Ein `pageQueryRoute`-Helper (Loader + `usePage` aus einer Deklaration).
- `appModules` per Glob finden.
- SPA/Client-only-Modus prüfen, damit die UI nicht im Worker-Bundle landet.

**Risiken**

- Jüngstes und am schnellsten bewegtes Framework (1.169.x). Der Routegen-Footer hängt an Plugin-Interna.
- Höchste TS-Check-Kosten pro Modul (0,25 s, 951 MB bei 32 Modulen). Ursache ist Start (`createServerFn`/`Register`), nicht TSR.

### 6.2 `rr-framework` (PR #13, `07f6f1f`) – 7,18 / 8,09

**Kennzahlen**

- LOC 4123 / 3269 (kleinster Code). Glue 217 (kleinster).
- Op: 0 Adapterzeilen; ~25 Zeilen in 2–3 Dateien inklusive Repo-Methode.
- TS: 431k / +26,4k / 6,6 s (günstigstes).
- Bundle: Worker 1.675 KiB gz gesamt, eager 896 KiB; Client 597 KiB gz.

**Stärken**

- Für Modul-Autoren am einfachsten:
    - Lesen: `loadGridOperation(todoOperations.listTodos, …)` in-process im Loader (`lists.$listId.tsx:32`).
    - Schreiben: `run("updateTodo", …)`.
    - Revalidierung nach Actions ist automatisch. Mit nur 3 Invalidierungsreferenzen in den Modulen ist das der Bestwert.
- Einzige Variante, deren Client↔Server-Modul-Bindung per ID typgeprüft ist: `useOperations<typeof serverModule>(moduleId: Module['id'])`.
- Modul-eigene Route-Config mit `prefix()`, Typegen gitignored. Reifer Stack mit offiziellem Cloudflare-Template.

**Schwächen**

- Der Lesepfad ist untypisiert: `loadOperation(…, input: unknown)` und `loadGridOperation(params: Record<string,string>)` (`routeOperations.server.ts:35,53`). Verifiziert: Ein Rename von `listTodos.listId` liefert 0 Fehler und zur Laufzeit einen 500er.
- Search-Params sind nicht router-typisiert. Sie werden von Hand geparst, und Links verketten `stringifySearch` (`notes.$notebookId.index.tsx:55`).
- Nicht offensichtlicher Write-Glue: eine modulglobale Outcome-Map pro Call-Zähler, Fehler kommen mit HTTP 200 und werden in `clientAction` umgemappt (`client.ts:21-65`, `api.ts:36-54`).
- Revalidierung ist subtil: drei Fix-Commits (`c60f9ef`, `13d74e1`, `07f6f1f`).
- Kein Client-Cache. Der Layout-Loader lädt nach jeder Action die Navigation **aller** Module (`registry.server.ts:25-28`, `_app.tsx:25-27`): O(N) D1-Queries pro Mutation.
- Der Chat-Refresh ignoriert die Modulliste (`ChatPanel.tsx:39` `() => revalidate()`).
- SSR ist Pflicht (SPA-Modus mit dem Cloudflare-Plugin nicht unterstützt, README:92). Einzige Variante mit hydration-sensitivem Code (`dates.ts:30-35`).
- Auth an drei Stellen.

**Typlücken**

- `client.ts:46,73,104`: Casts.
- `api.ts:22`: kaputtes JSON gibt 500 statt 422.
- `revalidateOnChangesOf(moduleId: string)`.
- `lists.$listId.tsx:154`: Filter-Strings.

**Potenzial**

- Loader-Input als `OperationInput<Op>` (1 Zeile, schließt die größte Lücke).
- Navigation pro Modul laden.
- Modul-gezielter Chat-Refresh.
- `Link prefetch="intent"` nutzen (bisher nirgends verwendet).

Die Obergrenze bleibt durch die fehlende Search-Typisierung, den fehlenden Cache und die Pflicht-SSR bestimmt.

**Risiken**

- Revalidierungs-Regressionen beim Hinzufügen von Seiten.
- Die Outcome-Map ist anfällig bei RR-Upgrades.
- Komponenten können keine Read-Operationen aufrufen (`api.ts:17`), sodass Comboboxen und Lazy-Dialoge neue Resource-Routes brauchen.

### 6.3 `hono-rr-data` (PR #14, `4341f1a`) – 7,44 / 8,15

**Kennzahlen**

- LOC 4360 / 3447. Glue 382 (Client-Routing davon 163).
- Op: ~13–17 Zeilen in 3 Dateien (1 `operationRoute`-Zeile).
- TS: 611k / +37,6k / 9,3 s.
- Bundle: Worker 895 KiB gz; initial 210 KiB gz.

**Stärken**

- Einfachstes Laufzeitmodell: REST plus statische SPA, keine SSR, kein Codegen. Der Worker-Entry hat 55 LOC, eine Hono-Middleware deckt `/api`, `/mcp` und `/chat-agent` ab.
- Module sind reine Werte: `RouteObject[]` mit `children` und eigener Navigation-Data-Route. Die Hono-Sub-App kann beliebige Endpunkte besitzen. Standalone typcheckbar, `.d.ts`-Emit sauber (Library 8).
- Typisierte Routen ohne Codegen (`defineRoute`, `client/routing.ts`). Die Rename-Tests werden alle gefangen.

**Schwächen**

- 22 `parseResponse(todosClient.lists[":listId"]…)`-Aufrufe. Methode und Pfad als zweiter Name pro Operation.
- Kein Cache, kein Batching: erster Load N+2 Requests, Mutation 3. Damit ist das die request-ineffizienteste SPA (Skalierung 6).
- Modulglobales `reloadingModules`-Set ohne Zähler, im `finally` geleert (`routing.ts:114-126`): fragil bei überlappenden UI- und Chat-Reloads. Variante 6 macht es mit einer gezählten Map richtig.
- Implizite Regel: Eine Route ohne `Component` ist ein Redirect außerhalb des Layouts (`router.tsx:17`).

**Typlücken**

- `routing.ts:75,93-97`: `useLoaderData` fremder Routen kompiliert.
- `types.ts:23`: Eine nicht registrierte Route kompiliert.
- `hono.server.ts:29`: GET-Query-Falle (boolean/number kompiliert, 422 zur Laufzeit).
- `client.ts:14`: ID nicht an den Mount gebunden.
- `useMutate("todo")` kompiliert und lädt still nichts neu.

**Potenzial**

- `defineRoute` als Registrierungseinheit.
- Typisierte Modul-IDs.
- `parseResponse` in den Client falten.
- TanStack Query nachrüsten. Damit konvergiert die Variante gegen 4/5.

**Risiken**

- Der eigene Routing-Layer muss gepflegt werden (`client/routing.ts` + `router.tsx`: 163 Code-Zeilen; stack-spezifischer Glue gesamt 382, ohne das in allen 8 vorhandene `useServerGrid`).
- `readSearch` ist toter Code (`searchParams.ts:26`).

### 6.4 `hono-rr-decl-tq` (PR #16, `9f85a33`) – 7,39 / 8,28

**Kennzahlen**

- LOC 4459 / 3511. Glue 406.
- Op: ~15–25 Zeilen (1 Route-Zeile; Reads zusätzlich eine `queryOptions`-Factory).
- TS: 621k / +40,0k / 10,5 s.
- Bundle: Worker 896 KiB gz; initial 201 KiB gz (kleinstes).

**Stärken**

- Beste Paketgrenze aller 8, verifiziert: `todos` nach `packages/todos` verschoben, 4 Host-Config-Edits, 0 Zeilen Modulcode geändert. `tsc`, Build und drizzle-kit grün, Standalone-Check 0 Fehler (Library 8 / 9).
- Seiten sind `{path, Component}`. Modul-Präfix-Invalidierung bildet sich 1:1 auf `data-changes` ab (`ChatPanel.tsx:40`).

**Schwächen**

- Code→Daten-Wasserfall: Die Query startet erst in der Lazy-Komponente, nach dem Page-Chunk und dem DataGrid-Chunk. Der Hover-Prefetch wärmt nur Daten.
- Unbatched REST.
- Selbstgebaute Router-Features: `errors.tsx` (Class-ErrorBoundary mit Pathname-Reset), `DefaultRedirect.tsx`, `usePageQuery` mit `useDeferredValue` + `useStableValue`, `useLeavePage`/`flushSync`. Glue 406, mehr als bei 3/5/8.
- Handgeschriebene `queries.ts`. Höchste Zahl an Modul-ID-Referenzen (25). 22× `parseResponse`.
- Flache Seitenliste: keine Modul-Layouts, doppelte Pfade überschatten sich still.

**Typlücken**

- `routing.ts:33`: `useParams() as RouteParams<Path>`.
- `NavigationList.tsx:14`: `link: string`.
- `hono.server.ts:29`: GET-Falle (E15).
- `hono.server.ts:40-44`: Path-Param nicht gegen den Input geprüft (E17).
- `ListPage.tsx:154`: Filter-String-Tippfehler wird still ignoriert (E16).
- `client.ts:13-14`: `createClient<typeof notesApi>(todosModuleId)` kompiliert.

**Potenzial**
Variante 7s `defineRoute({ query, page })` übernehmen (paralleles Laden, Seite an Route gebunden), dazu eine `apiQuery`-Helper über `hc`, typisierte `RouteLink` und den Batch-Endpunkt. Das ist realistisch, weil es derselbe Stack ist.

**Risiken**

- Die `flushSync`-Leave-before-invalidate-Regel muss jeder Delete-Flow kennen.
- Der ErrorBoundary-Reset greift nur bei Pfadwechsel.

### 6.5 `hono-tsr-tq` (PR #19, `0fda83e`) – 7,48 / 8,33

**Kennzahlen**

- LOC 4429 / 3510 (+ `routeTree.gen.ts` 215). Glue 344.
- Op: Write 12–17 Zeilen; Read 18–24 Zeilen in 3–4 Dateien.
- TS: 772k / +44,6k / 9,2 s. Meiste Instantiations, aber moderate Check-Zeit.
- Bundle: Worker 895 KiB gz; initial 214 KiB gz.

**Stärken**

- TSR-Routing-Typen (Param-Rename: 8 korrekte Fehler) und `filterParam`.
- Nur ~6 Casts in `src`.
- Volle TSR-Daten-UX: Preload, `autoCodeSplitting`, Cache.
- Echtes REST, auch für Dritte nutzbar.

**Schwächen**
Die höchste Konzeptlast:

- Hono, `hc`, `parseResponse` (21×) und die bedingten Typen von `operationRoute`;
- TSR-Generator, `Register` und `loaderDeps`;
- die TQ-Choreografie (`moduleQueries.ts:28-44`);
- handgeschriebene `queries.ts` (30/44 LOC) und die Wahl von REST-Methode und Pfad pro Operation.

Dazu kommt keine Request-Bündelung: N Sidebar-Requests beim Betreten der App.

**Typlücken**

- GET-Query-Falle und ungeprüfte Path-Params (`hono.server.ts:22-30`).
- `client.ts:14`: `Hono<any,any,any>`.
- `client.ts:28`: Fehler-Bodies nicht typisiert.
- `gridSearch.ts:145-147`: `GridColumns` akzeptiert `keyof Fields`, deshalb kompilierte die Spalte `done` nach dem Output-Rename weiter.
- Shared Core: Der Handler reicht `...values` ohne Excess-Check ans Repo weiter (`operations.server.ts:148-153`).

**Potenzial**

- `apiQuery`-Helper statt `queries.ts`.
- `pageQuery`-Helper.
- Typ-Constraints für GET-Inputs und Path-Params.
- Ein Batch- bzw. Navigation-Endpunkt.

**Risiken**

- Committeter `routeTree.gen.ts` verursacht Merge-Churn.
- Nach einem neuen Modulordner ist vermutlich ein Dev-Restart nötig (gilt ebenso für 1 und 8).

### 6.6 `trpc-rr-data` (PR #15, `5e5494a`) – 7,48 / 8,25

**Kennzahlen**

- LOC 4356 / 3455. Glue 437 (Routing/Invalidierung davon 163: `routing.ts` 58, `moduleData.ts` 50, `navigation.tsx` 26, `router.tsx` 29).
- Op: ~12 Zeilen Definition + 1 Router-Zeile + 1–2 UI-Zeilen.
- TS: 440k / +27,0k / 6,7 s.
- Bundle: Worker 909 KiB gz; initial 215 KiB gz.

**Stärken**

- 1-Zeilen-Procedures. Kein Codegen, keine generierten Dateien.
- Günstiger Typcheck.
- Loader-Batching (Seite + Modul-Sidebars = 1 GET).
- Gezählte Revalidierungs-Map, robust bei Überlappung.
- Kleinste Note-Seite (260 Code-Zeilen). Module sind standalone typcheckbar.

**Schwächen**

- Kein Cache, keine Dedupe, kein Preload.
- Home-grown `defineRoute`/`defineNavigation`/`moduleData.ts` (Glue 437).
- Der `lastPageWithRows`-Block ist pro Grid-Route kopiert (`todos/routes.ts:28-31`, `notes/routes.ts:29-32`).
- Modul-ID wird 21× von Hand durchgereicht.
- Client-Hack auf semi-internen tRPC-APIs: `httpBatchLink(...)({})` mit Fake-Runtime und `TRPCUntypedClient`-Subklasse (`client.ts:15,19-37`).
- Veraltete TanStack-Start-Kommentare in 5 Dateien.

**Typlücken**

- `routing.ts:30`: `useRouteLoaderData(id) as Data` (E12: fremde Route kompiliert, `undefined` zur Laufzeit).
- Nicht gemountete Route kompiliert (E9).
- `createModuleClient<TodosRouter>('notes')` kompiliert (E5/E6).
- `moduleData.ts:47`: `to: string`.
- Server-Code-Leak wird nur zufällig vom Build abgefangen, über `cloudflare:workers` (E14).

**Potenzial**

- `routerFromOperations` (Query/Mutation aus `effect`).
- `defineModuleApi`.
- An das Modul gebundene Hooks.
- `defineGridRoute`.
- Optional ein Cache-Layer. Damit konvergiert die Variante gegen 7.

**Risiken**

- Upgrade-Bruch des tRPC-Client-Hacks.
- Jeder `BAD_REQUEST` wird zu `ValidationError` und erscheint als Formulartext (`client.ts:48-53`).

### 6.7 `trpc-rr-decl-tq` (PR #17, `30dc958`) – 7,71 / 8,48 (2. Wahl)

**Kennzahlen**

- LOC 4495 / 3556 (größter `src`; Core 1675 Code-Zeilen). Glue 502 (größter).
- Op: ~21–25 Zeilen, davon 1 stack-spezifisch; Invalidierung 0 Zeilen.
- TS: 464k / +33,1k / 7,3 s.
- Bundle: Worker 909 KiB gz; initial 211 KiB gz.

**Stärken**

- Die schlanksten Seiten und Mutations-Sites. Eine Route ist 6 Zeilen (`todos/routes.tsx:27-32`: `path`, `validateSearch`, `query: … todosApi.listTodos.queryOptions(…)`, `page: () => import(…)`).
- `MutationCache.onSettled` invalidiert automatisch pro Modul (`client.ts:97-106`). 8 Modul-ID-Referenzen, Bestwert aller 8 (2: 13, sonst 18–25).
- Cast-freier tRPC-Client (`createTRPCOptionsProxy` mit `keyPrefix`, `client.ts:115`). Der Key-Präfix ist erzwungen und identisch mit dem Mount-Pfad, deshalb ist der Chat-Refresh strukturell sicher.
- Code und Daten laden parallel (`routing.tsx:122-126`), Hover-Preload für beides.
- Module sind Werte und standalone typcheckbar, `.d.ts`-Emit sauber.
- Größtes Duplikations-Potenzial (9): Leitet man `api.server.ts` aus den Operationen ab, ist der Adapter 0 Zeilen.

**Schwächen**

- Selbstgebautes Mini-Framework: mit 502 Code-Zeilen der größte stack-spezifische Glue aller 8 (u. a. `routing.tsx` 179 LOC, `routes/root.tsx` 112, `api/client.ts` 120, dazu `collections`, `searchParams`, `useMutate`). Es hat keine verschachtelten Layouts, keine Route-Boundaries und keine Route-Metadaten, und `useBlocker`/`ScrollRestoration` fehlen (nur in RR data mode verfügbar). Der Note-Editor verlässt sich auf Save-on-unmount.
- `list.tsx:33/35` deklariert `updateTodo` zweimal als Mutation-Hook.
- Der Client-Teil nutzt eine `TRPCUntypedClient`-Subklasse mit Fake-Link-Runtime.

**Typlücken**

- `routing.tsx:100`: `useParams() as …`. `listRoute.useParams()` in einer fremden Seite kompiliert (E11).
- RR `<Link to="/listz">` und `navigate(string)` kompilieren (E13). Die `Href`-Brand schützt nur Shared-Props.
- `createModuleApi<TodosRouter>('notes')` und fehlendes `api` kompilieren (E8/E10). Der resultierende `NOT_FOUND` erscheint als normale 404-Seite und verdeckt den Verdrahtungsfehler.
- `meta.invalidates: QueryKey[]` (E14).
- Flache Routen mit Key = Pfad: doppelte Pfade überschatten sich still.

**Potenzial**

- Page-Props statt globaler Route-Hooks.
- `defineModule`, das Router-Typ und ID bindet.
- Eine typisierte `navigate`-Hülle plus Lint-Regel.
- `api.server.ts` aus den Operationen ableiten.
- Verschachtelte `defineRoute`-Children.

**Risiken**

- Wachsende Eigenverantwortung für Router-Features bei 100+ Seiten.
- Grobe Modul-Invalidierung. `mutateAsync` resolved erst nach dem Refetch.
- Server-Code-Grenze nur über den Build abgesichert.
- Veraltete Start-Kommentare.

### 6.8 `trpc-tsr-tq` (PR #18, `ac62e6c`) – 7,78 / 8,68 (1. Wahl)

**Kennzahlen**

- LOC 4406 / 3504 (+ `routeTree.gen.ts` 215). Glue 347. Modul-Glue 73 (zweitkleinster).
- Op: ~22–25 Zeilen in 3–4 Dateien, 1 Router-Zeile, keine Keys und keine Tool-Registrierung.
- TS: 615k / +35,0k / 8,0 s.
- Bundle: Worker 909 KiB gz (kein React/MUI); initial 222 KiB gz.

**Stärken**

- Stärkste Typabdeckung, verifiziert:
    - `<Link to="/listz">` → TS2820, `search {page:'x'}` → TS2322, `params {id}` → TS2353.
    - Route-Param-Rename: 8 Fehler. Grid-Feld-Rename: 13 Fehler.
    - superjson erhält `Date` und GET-Typen. `filterParam` typisiert den Preset-Filter (`gridSearch.ts:134`).
- tRPC generiert `queryOptions`/`queryKey`/`pathFilter`, deshalb gibt es kein `queries.ts`.
- Vollständiges Skalierungs-Toolkit:
    - Cache mit `staleTime` 30 s (`client.ts:25`);
    - Preload on intent (`router.tsx:18`) und `autoCodeSplitting`;
    - `pendingComponent`, `scrollRestoration`, `notFound`-Mapping (`moduleQueries.ts:58`);
    - Batching von Seite und Sidebars in 1 Request, Mutation = 2 Worker-Aufrufe.
- Lineare TS-Kosten bis 32 Module (1,67M Instantiations, 8,0 s).

**Schwächen**

- Drei Bibliotheken mit zwei Cache-Schichten. Die Koordination in `moduleQueries.ts:21-45` ist der schwierigste Teil: `invalidateQueries` + `router.invalidate()`, `refetchType: "none"` vor dem Navigieren, `defaultPreloadStaleTime` 0.
- Loader und Komponente bauen die `queryOptions` doppelt (`lists.$listId.tsx:33` vs. `:42`).
- Kombinierter Call-/Options-Proxy mit `as unknown as` (`client.ts:48-60`), keine dokumentierte tRPC-Nutzung.
- Client-Routen sind an den Host-Tree gebunden (Library 6).

**Typlücken**

- `client.ts:56`: `createModuleApi<NotesRouter>(todosModuleId)` kompiliert.
- `client.ts:70`: `.subscribe` landet am falschen Proxy.
- `trpc.server.ts:58`: `input as z.output<Input>`.
- `types.ts:43`: `api?: AnyRouter`.
- `useServerGrid.ts:32`: globale Location statt Route-Search.
- `lists.$listId.tsx:233-235`: `FormData`-Feldnamen untypisiert.
- Client-Seiten importieren Typen aus Server-Dateien (`lists.$listId.tsx:25`).

**Potenzial**

- `defineModuleApi`/Modul-ID-Union, Proxy von Variante 7 übernehmen (siehe 9.2).
- `pageQuery`-Helper.
- Spalten aus Feldart ableiten, Collection-Kit.
- Entity-Level-Invalidierung über `pathFilter`.
- Code-basierte Route-Factories für Pakete.

**Risiken**

- Index-Loader schreiben (`getDefaultList`), nur über das Preload-Flag geschützt (`collections.ts:25`).
- Committeter Route-Tree.
- tRPC-Wire ist nicht REST/OpenAPI.

---

## 7. AI-Chat & MCP

### 7.1 Das gemeinsame Muster

Alle 8 Varianten verwenden denselben Code:

- Eine Operation mit `ai`-Metadaten ist automatisch Chat-Tool und MCP-Tool.
- `effect: "delete"` setzt `needsApproval` im Chat (`chat/tools.server.ts:14`) und `destructiveHint` in MCP (`mcp/mcp.server.ts:14-19`).
- Modul-Instructions fließen in den System-Prompt und in die MCP-Instructions.
- Die Tools laufen im ChatAgent-DO (`userId = this.name`) und rufen die Operation direkt auf, ohne HTTP.

**Eine Operation hinzufügen** (Variante 8, Stil aus `src/modules/todos/operations.server.ts`):

```ts
// 1) src/modules/todos/operations.server.ts – die einzige fachliche Definition
completeList: defineOperation({
    input: z.object({ listId: z.string() }),
    effect: "write",                                   // read | write | delete (delete: Bestätigung im Chat, destructiveHint in MCP)
    ai: { title: "Complete todo list", description: "Marks all open todos of a list as done." },
    handler: async ({ userId }, { listId }) => {
        await getList(userId, listId);                 // Existenz-/Ownership-Prüfung genau einmal (wirft NotFoundError)
        const count = await getTodoRepository().completeAll(userId, listId);
        return { completed: count };
    },
}),
// → ab hier: Chat-Tool "completeList", MCP-Tool mit Annotations, UI-Refresh des Moduls nach dem Tool-Call

// 2) src/modules/todos/api.server.ts – nur wenn die UI sie aufruft (1 Zeile, Typen aus der Operation)
completeList: mutation(todoOperations.completeList),

// 3) Seite – typisierter Aufruf, Invalidierung des Moduls über useMutate
const mutate = useMutate(todosModuleId);
void mutate(todosApi.completeList.mutate({ listId }));
```

Zum Vergleich: Schritt 2 ist in 1 ein `createServerFn`-3-Zeiler, in 3/4/5 eine `operationRoute`-Zeile mit Methode und Pfad und in 2 entfällt er ganz. Schritt 1 ist in allen 8 identisch.

**Seitenkontext** (in allen 8 identisch, je 1 Zeile pro Seite):

```ts
// src/modules/todos/chatPage.ts
export const todosChatPage = defineChatPage(todosModuleId, z.object({ listId: z.string() }));
// Seite (8: routes/lists.$listId.tsx:60)
useChatPage(todosChatPage, { listId: list.id });
// src/modules/todos/module.server.ts:16 – serverseitig mit demselben Schema validiert
chatContext: defineChatContext(todosChatPage, async (userId, page) => { /* page.listId typisiert */ }),
```

**Refresh nach Tool-Calls:**

1. `createChatTools(userId, onChange)` meldet nach Tools mit `effect !== "read"` das Modul.
2. Der Agent schreibt `{ type: "data-changes", data: { modules: [module] } }` (`agent.server.ts:36-38`).
3. `useChatChanges` dedupliziert und ruft den stack-spezifischen Refresh auf.

### 7.2 Was noch stack-abhängig ist

| Variante | Refresh-Zeile im ChatPanel                        | Wirkung                                                                                       |
| -------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1, 5, 8  | `invalidateModules(queryClient, router, modules)` | TQ-Präfix-Invalidierung des Moduls, danach `router.invalidate()` (Loader lesen aus dem Cache) |
| 4        | `invalidateModules(queryClient, modules)`         | nur TQ, Präfix per Konvention (handgeschriebene Keys)                                         |
| 7        | `invalidateModules(modules)`                      | nur TQ, Präfix durch `keyPrefix` erzwungen = Mount-ID                                         |
| 6        | `revalidateModules(modules)`                      | Loader-Revalidierung pro Modul (gezählte Map, robust)                                         |
| 3        | `reloadModules(modules, revalidate)`              | wie 6, aber nicht gezähltes Set (fragil bei Überlappung)                                      |
| 2        | `() => revalidate()`                              | Modulliste ignoriert: Seite + Navigation **aller** Module neu                                 |

Weitere Unterschiede:

- **UI-Adapter pro AI-fähiger Operation:** 0 (2), 1 (6/7/8), 1 + Pfad (3/4/5), 3 (1).
- **Worker-Entry:** Hono hat eine Middleware für API, MCP und Chat. Bei 1 und 6/7/8 läuft `getUser` einmal oben im Fetch-Switch. Bei 2 liegt die Auth an drei Stellen.
- **Spielraum nach oben:** Feinerer Refresh als auf Modul-Ebene oder `setQueryData` aus Tool-Ergebnissen gibt es nur mit TanStack Query. Am leichtesten geht es mit tRPC + TQ (7, 8): Procedure-Name = Operation-Name = Tool-Name, und `pathFilter`/`pathKey` sind typisiert.

**Gemeinsame offene Punkte** (alle 8):

- Modul-IDs in `data-changes` sind `string`.
- Tool-Namen in Prompt-Texten sind untypisiert.
- MCP-Ergebnisse sind JSON-Text ohne `outputSchema`.
- Alle Tools gehen bei jedem Request ans Modell, ohne Filter pro Seite. Das wird bei 20+ Modulen relevant.

---

## 8. Library-Extraktion

Paketierungstest der Querschnitts-Bewertung: `src/modules/todos` nach `packages/todos` verschoben, nur Host-Config geändert. Danach wurde das Paket standalone typgecheckt (nur `packages/todos`, Env-Typen gestubbt).

Zwei Szenarien sind zu unterscheiden:

- **(a) Workspace-Source-Paket:** Der Host kompiliert das Paket mit.
- **(b) Vorkompiliertes Paket:** JS + `.d.ts`, eigenständig test- und publizierbar.

| Variante          | Server-Teil paketierbar           | Client-Teil paketierbar                  | (a) Workspace-Source                                                              | (b) vorkompiliert                               | Hauptblocker                                                                                                  | Score     |
| ----------------- | --------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 1 tanstack-start  | ja (Operationen neutral)          | Routen + `*.functions.ts` nur als Source | ✓ verifiziert (Server Functions weiter extrahiert, Client nur `/_serverFn`-Stubs) | ✗ (TS2345 in Routen und `ServerFn<Register,…>`) | Start-Compiler + Host-`Register`                                                                              | 5,5 / 6,5 |
| 2 rr-framework    | **am einfachsten** (kein Adapter) | Route-Module verlieren Typen             | läuft, aber **untypisiert** (keine `+types` außerhalb `appDirectory`)             | ✗                                               | Typegen nur für `appDirectory`; Core-`client.ts` typisiert gegen `Register['routeFiles']` und `~/routes/_app` | 5 / 6,5   |
| 3 hono-rr-data    | ja (Sub-App)                      | ja (`RouteObject[]`)                     | ✓                                                                                 | ✓ (0 Fehler, `.d.ts` ok)                        | breiterer Host-Vertrag (Revalidierungsprotokoll, `isRedirect`-Regel)                                          | 8 / 8,5   |
| 4 hono-rr-decl-tq | ja (Sub-App)                      | ja (`{path, Component}`)                 | ✓ verifiziert, 0 Zeilen Modulcode geändert                                        | ✓                                               | nur gemeinsame Blocker                                                                                        | **8 / 9** |
| 5 hono-tsr-tq     | ja                                | File-Routes an Host-Tree gebunden        | ✓ verifiziert (`physical()` ohne Rewrite, Splitting ok)                           | ✗ (TS2345 `createFileRoute`)                    | Host-`routeTree.gen`/`Register`                                                                               | 6,5 / 7,5 |
| 6 trpc-rr-data    | ja (braucht Core-`initTRPC`)      | ja                                       | ✓                                                                                 | ✓                                               | Core-`client.ts` → `CoreRouter` → `registry.server`                                                           | 7,5 / 8,5 |
| 7 trpc-rr-decl-tq | ja (braucht Core-`initTRPC`)      | ja (`defineRoute`-Objekte)               | ✓ verifiziert                                                                     | ✓                                               | wie 6; `routing.tsx` importiert App-Singleton `queryClient`                                                   | 7,5 / 8,5 |
| 8 trpc-tsr-tq     | ja (braucht Core-`initTRPC`)      | File-Routes an Host-Tree gebunden        | ✓ (analog 5)                                                                      | ✗                                               | Host-`Register` + `CoreRouter`-Kante                                                                          | 6 / 7,5   |

Gemeinsame Blocker in allen 8:

- `~/`-Alias-Importe (~20 Core-Dateien pro Modul) müssen zu `@acme/core/...` werden.
- Die `import.meta.glob`-Discovery sieht keine Pakete. Pro Paket ist 1 expliziter Eintrag nötig.
- Eine Drizzle-Migrationshistorie.
- `worker-configuration.d.ts` enthält `import('./src/server')`, sodass jeder `env`-Nutzer gegen die ganze App typcheckt. Ein Core-Paket braucht ein eigenes `Env`-Interface.
- `chat/agent.server.ts`, `chat/tools.server.ts` und `mcp.server.ts` importieren die Registry direkt und müssen parametrisiert werden (`createTools(modules)`).

**Empfohlener Weg für `trpc-tsr-tq`:**

1. **Kurzfristig: Monorepo mit Workspace-Source-Paketen.** Das funktioniert in TSR ohne Typverlust (in 5 verifiziert, 8 ist strukturell gleich). Routen werden per `physical('<pkg>/routes')` eingehängt. Die IDs bleiben layout-relativ (`/_app/...`) und damit gültig.
2. **Core-Paket schneiden:**
    - `coreRouter` aus `api/router.server.ts` in eine eigene Datei, damit `api/client.ts` nicht mehr die Registry importiert;
    - eigenes `Env`;
    - Chat/MCP mit injizierten Modulen;
    - `@acme/core`-Pfade statt `~/`.
3. **Modul-Paket:**
    - `./server`: `serverModule`, `todosRouter`, `type TodosRouter`;
    - `./client`: `todosModule`, `todosApi`, Navigation, `chatPage`;
    - `./routes` als TS-Source;
    - `./schema` und ein eigener Migrationsordner. Die Host-Config aggregiert die Schemas.
4. **Nur für vorkompilierte npm-Pakete:** Spike mit code-basierten Factories `createTodosRoutes(getParentRoute)` und `createRoute`. Das kostet File-Route-Ergonomie, und Links bleiben global typisiert.

Ist (b) früh Pflicht, ist Variante 7 die bessere Wahl. Dort ist der Client-Teil heute schon standalone typcheckbar.

---

## 9. Empfehlung & nächste Schritte

### 9.1 Entscheidung

**`trpc-tsr-tq` (PR #18) wird Basis-Template. `trpc-rr-decl-tq` (PR #17) ist die dokumentierte Ausweichoption.** Auf 7 umzusteigen lohnt sich, wenn eine dieser Bedingungen eintritt:

- vorkompilierte Modul-Pakete werden kurzfristig Pflicht;
- das Team gewichtet Codegen-Freiheit und Einfachheit der Seiten höher als framework-seitige Routing-Typisierung.

Die Server-Seite ist in 6/7/8 identisch. Ein Router-Wechsel zwischen 7 und 8 betrifft nur Seiten und Client-Glue.

`tanstack-start` ist bei Typsicherheit ebenbürtig (8,5) und bei Skalierung knapp dahinter (7,5 vs. 8), aber nicht empfohlen:

- Library-Extraktion 5,5: Vorkompilieren ist unmöglich (Compiler + `Register`).
- Der Worker trägt die ganze UI (1,8 MB gz), Server Functions sind unbatched.
- Es ist das jüngste Framework mit der meisten Magie.
- Data-only SSR bringt für Access-geschützte interne Apps nur einen schnelleren ersten Paint.

Wer SSR künftig braucht (öffentliche Seiten), sollte 1 neu prüfen.

### 9.2 Verbesserungen vor der Freigabe als Template (nach Priorität)

1. **Modul-API typsicher binden.**
    - `createModuleApi` auf Variante 7s cast-freien `createTRPCOptionsProxy({ keyPrefix: moduleId })` umstellen. Damit entfallen die `as unknown as`-Casts in `client.ts:48-60` und die `.subscribe`-Falle. Vanilla-Calls laufen über `mutationOptions`/`useMutation` oder einen getypten `TRPCClient`.
    - Einen `defineModule({ id: "todos" as const, router })` einführen, aus dem Server-Mount und Client entstehen. Dazu eine Modul-ID-Union für `useMutate`, `invalidateModules` und `ChatDataParts`.
2. **Eine Seitendeklaration statt zwei.** Ein `pageQuery(route, (params, search) => todosApi.x.queryOptions(...))` liefert `loader`, `loaderDeps` und `usePage()`. Das entfernt die doppelte Deklaration in allen 3 Seiten.
3. **Automatische Invalidierung** nach Variante 7: `MutationCache.onSettled` invalidiert das Modul der Mutation, danach `router.invalidate()`. Dadurch fallen die meisten der 17 manuellen Invalidierungsreferenzen weg. `useInvalidateModule(navigate)` bleibt für Navigation nach Delete.
4. **Optional `routerFromOperations`.** `api.server.ts` würde damit aus den Operationen abgeleitet (`read` → query, sonst mutation; Opt-in per `ui: true`). Abzuwägen ist der Verlust der expliziten UI-Liste.
5. **Grid-Spalten aus den Feldern ableiten:** `gridColumn(todoFields, "dueDate", {...})` setzt `filterOperators` und Typ. Das spart 9× `supportedOperators`.
6. **Collection-Kit** für Navigation, Index-Route und Header. Index-Loader sollen nicht mehr schreiben: Default-Collection lesen und nur bei Bedarf explizit anlegen (`collections.ts:25`).
7. **Server/Client-Grenze erzwingen:**
    - ESLint `no-restricted-imports`, damit Client-Dateien nur `import type` aus `*.server.ts` nutzen;
    - getrennte `tsconfig` für Worker und Browser;
    - UI-Typen aus `TodosApiOutputs` statt aus `operations.server.ts`.
8. **Library-Vorbereitung:**
    - `coreRouter` aus `router.server.ts` lösen;
    - eigenes `Env`;
    - Chat/MCP mit injizierter Modulliste;
    - `scripts/fixtures.ts` modul-lokal machen;
    - Spike für Workspace-Paket und code-basierte Route-Factory (8, Schritt 4).
9. **Kern-Typlücken schließen** (betrifft alle Varianten):
    - Tool-Namen in Instructions über `keyof typeof todoOperations`;
    - Excess-Property-Schutz zwischen Handler und Repository;
    - gebrandete Entity-IDs, wo es sich lohnt.
10. **Skalierung vorbereiten:**
    - Entity-Hinweise in `data-changes` und `pathFilter`-genaue Invalidierung für große Module;
    - Tool-Filter pro Seite oder Modul;
    - Instantiations in CI messen (`--extendedDiagnostics`, aktuell +35k pro Modul).
11. **README:** Rezept „neue Operation“ und „neues Modul“, Cache-Choreografie, Grenzen des Proxys (die README ist schon gut, nach 1–3 aktualisieren).

### 9.3 Worauf achten

- **Zwei Cache-Schichten** (TSR-Loader + TQ): die gefährlichste Fehlerquelle für neue Entwickler. Bis Punkt 2/3 umgesetzt sind, muss das Muster aus `moduleQueries.ts` strikt eingehalten werden.
- **Committeter `routeTree.gen.ts`:** Konflikte durch Regenerieren lösen (`npm run routegen`), nicht von Hand. Bei neuen Modulordnern den Dev-Server neu starten.
- **tRPC ist kein REST:** Batch-URLs sind nicht CDN-cachebar, und es gibt kein OpenAPI. Brauchen Dritte eine REST-Schnittstelle, Hono-Routen im selben Worker über dieselben Operationen ergänzen (`operationRoute` existiert in 3/4/5). Für AI-Clients reicht MCP.
- **Keine SSR:** Der erste Paint wartet auf ~222 KiB gz JS plus einen Batch-Request. Für interne Access-Apps ist das ok.
- **Pre-1.0-Abhängigkeiten** (alle Varianten): `@mui/x-chat` (alpha), `@cloudflare/ai-chat`, `agents`. Pinnen und Upgrades bündeln.
- **Modul-Invalidierung ist grob:** In großen Modulen werden alle aktiven Queries neu geladen. Entity-Keys früh einplanen.
- **Tool-Anzahl:** Alle Tools gehen an jedes Modell-Request. Ab ~20 Modulen filtern.
- **Disziplin:** Jede fachliche Operation genau einmal in `operations.server.ts` definieren. Keine Logik im Adapter oder in Komponenten.

---

## Anhang A: Gemessene Kennzahlen

### A.1 Code und Glue

Legende:

- „Code“ = Zeilen ohne Kommentare und Leerzeilen.
- „Glue“ = stack-spezifische Zeilen ohne Worker-Entry, Shared Core und `useServerGrid`.
- „Modul-Glue“ = `functions`/`api`/`queries`/`routes`/`client`/`navigation`/`module.ts` beider Module.

| Variante          | src-LOC roh | Code gesamt | Code Core | Code Module | Glue | Modul-Glue | Zeilen pro UI-Op (Adapter) | Inval.-Refs in Modulen | Modul-ID-Refs | `parseResponse` |
| ----------------- | ----------- | ----------- | --------- | ----------- | ---- | ---------- | -------------------------- | ---------------------- | ------------- | --------------- |
| 1 tanstack-start  | 4250        | 3383        | 1429      | 1954        | 252  | 125        | 3                          | 31                     | 21            | 0               |
| 2 rr-framework    | 4123        | 3269        | 1469      | 1800        | 217  | 57         | 0                          | 3                      | 13            | 0               |
| 3 hono-rr-data    | 4360        | 3447        | 1546      | 1901        | 382  | 146        | 1 + Pfad                   | 14                     | 20            | 22              |
| 4 hono-rr-decl-tq | 4459        | 3511        | 1569      | 1942        | 406  | 147        | 1 + Pfad (+ queryOptions)  | 20                     | 25            | 22              |
| 5 hono-tsr-tq     | 4429        | 3510        | 1570      | 1940        | 344  | 105        | 1 + Pfad (+ queryOptions)  | 19                     | 23            | 21              |
| 6 trpc-rr-data    | 4356        | 3455        | 1571      | 1884        | 437  | 153        | 1                          | 16                     | 21            | 0               |
| 7 trpc-rr-decl-tq | 4495        | 3556        | 1675      | 1881        | 502  | 121        | 1                          | 9                      | 8             | 0               |
| 8 trpc-tsr-tq     | 4406        | 3504        | 1610      | 1894        | 347  | 73         | 1                          | 17                     | 18            | 0               |

### A.2 TypeScript-Kosten

Messung: `tsc --extendedDiagnostics -p tsconfig.cloudflare.json`, nicht inkrementell. Skalierungstest: das todos-Modul K-mal geklont (eigene ID, eigener URL-Präfix), Route-Tree bzw. Typegen neu erzeugt, 0 Fehler. Der Zuwachs war in allen 8 Varianten streng linear.

| Variante | Instantiations (2 Module) | Check (s) | pro Modul Inst. | pro Modul Check (s) | 32 Module Inst. | 32 Module Check / RAM |
| -------- | ------------------------- | --------- | --------------- | ------------------- | --------------- | --------------------- |
| 1        | 604.818                   | 3,90      | 37,9k           | 0,25                | 1,74M           | 11,46 s / 951 MB      |
| 2        | 431.220                   | 2,47      | 26,4k           | 0,14                | 1,22M           | 6,55 s / 822 MB       |
| 3        | 610.539                   | 2,91      | 37,6k           | 0,21                | 1,74M           | 9,30 s / 909 MB       |
| 4        | 621.436                   | 3,03      | 40,0k           | 0,25                | 1,82M           | 10,53 s / 952 MB      |
| 5        | 772.215                   | 4,14      | 44,6k           | 0,17                | 2,11M           | 9,23 s / 1008 MB      |
| 6        | 439.660                   | 2,65      | 27,0k           | 0,14                | 1,25M           | 6,74 s / 858 MB       |
| 7        | 464.368                   | 2,71      | 33,1k           | 0,15                | 1,46M           | 7,29 s / 944 MB       |
| 8        | 614.762                   | 3,15      | 35,0k           | 0,16                | 1,67M           | 8,00 s / 981 MB       |

### A.3 Bundles und Requests

Gemessen auf den heutigen Builds (gzip level 6). Request-Anzahl aus dem Code abgeleitet.

| Variante | Worker gesamt raw / gz | Worker eager gz | Client gesamt gz | initiales JS gz (SPA) | Requests erster Load   | Requests pro Mutation |
| -------- | ---------------------- | --------------- | ---------------- | --------------------- | ---------------------- | --------------------- |
| 1        | 7.850 / 1.798 KiB      | 1.059 KiB       | 607 KiB          | – (SSR)               | 1 (Dokument mit Daten) | ~3 (unbatched)        |
| 2        | 7.474 / 1.675 KiB      | 896 KiB         | 597 KiB          | – (SSR)               | 1 (SSR)                | 2                     |
| 3        | 3.816 / 895 KiB        | ~863 KiB        | 582 KiB          | 210 KiB               | N+2                    | 3                     |
| 4        | 3.821 / 896 KiB        | ~863–876 KiB    | 573 KiB          | 201 KiB               | N+2                    | 3                     |
| 5        | 3.818 / 895 KiB        | ~863–876 KiB    | 594 KiB          | 214 KiB               | N+2                    | 3                     |
| 6        | 3.875 / 909 KiB        | ~863–876 KiB    | 586 KiB          | 215 KiB               | 1 (Batch)              | 2                     |
| 7        | 3.879 / 909 KiB        | ~863–876 KiB    | 581 KiB          | 211 KiB               | 1 (Batch)              | 2                     |
| 8        | 3.877 / 909 KiB        | ~863–876 KiB    | 602 KiB          | 222 KiB               | 1 (Batch)              | 2                     |

Lazy-Chunks in allen 8: DataGrid ~157–159 KiB gz, ChatPanel ~142–143 KiB gz (≈ 147 kB).

Versionen: TanStack Start 1.169.4, react-router 8.5.1, hono 4.13.17, @trpc/server 11.19.0, @tanstack/react-router 1.170.46, @tanstack/react-query 5.107.1, @cloudflare/vite-plugin 1.67.0, vite 8.3.5.

### A.4 Feature-Matrix Daten-UX (im Code verifiziert)

| Feature                                         | 1       | 2             | 3   | 4             | 5   | 6   | 7                | 8   |
| ----------------------------------------------- | ------- | ------------- | --- | ------------- | --- | --- | ---------------- | --- |
| Client-Cache (`staleTime` 30 s)                 | ✓       | –             | –   | ✓             | ✓   | –   | ✓                | ✓   |
| Laden vor/parallel zum Render (kein Wasserfall) | ✓       | ✓             | ✓   | –             | ✓   | ✓   | ✓                | ✓   |
| Preload Code + Daten on hover                   | ✓       | – (ungenutzt) | –   | nur Daten     | ✓   | –   | ✓ (`route.link`) | ✓   |
| Request-Batching                                | SSR-1st | Single Fetch  | –   | –             | –   | ✓   | ✓                | ✓   |
| ScrollRestoration                               | ✓       | ✓             | ✓   | selbst gebaut | ✓   | ✓   | selbst gebaut    | ✓   |
| Optimistic Updates                              | –       | –             | –   | –             | –   | –   | –                | –   |
| `useBlocker`                                    | –       | –             | –   | –             | –   | –   | –                | –   |
| Modul-Ordner-Discovery, 1 zentrale Datei        | ✓       | ✓             | ✓   | ✓             | ✓   | ✓   | ✓                | ✓   |
| Duplicate-Modul-ID-Check                        | –       | Ordner = ID   | –   | –             | –   | ✓   | ✓                | ✓   |

## Anhang B: Korrekturen der Querschnitts-Bewertungen an den Berichten

**Typsicherheit**

- **1:** Die neue Adapter-Lücke war im Bericht nicht erfasst: `.validator(operationInput<typeof ops.createTodo>).handler(operationHandler(ops.deleteTodo))` kompiliert (`operationHandler.ts:14`). 9 → 8,5.
- **2:** 7,5 → 6,5. Der Loader-Input ist `unknown` (Rename → 0 Fehler, 500 zur Laufzeit), Search-Params sind komplett untypisiert. Richtig erkannt hat der Bericht die einzigartige ID-Bindung von `useOperations`.
- **5:** 8,5 → 8. Hono-spezifische Lücken, die tRPC nicht hat: GET-Query-Falle, ungeprüfte Path-Params, handgeschriebene Keys.
- **7:** 8 → 7,5. „No casts“ gilt nur für `api/client.ts`. `routing.tsx:93,96,100,140` sind Casts, und RR `<Link to="/listz">` kompiliert.
- **Route-Hooks:** „Hooks nicht an die rendernde Route gebunden“ gilt auch für TSR. Ein importiertes fremdes `Route.useParams()` kompiliert in 8 ebenfalls. Der Unterschied ist die Konvention file-lokaler Route-Objekte.
- **Fehlertypen:** Der Hono-Vorteil typisierter 422-Unions von gestern ist entfallen.
- **`filterParam`:** Gibt es nur in 5 und 8, nicht im gemeinsamen Kern.

**Einfachheit**

- **4:** 8 → 6,5. Nicht mitgezählt waren `errors.tsx`, `DefaultRedirect.tsx`, `client/queries.ts`, die `queries.ts`-Dateien, 22× `parseResponse` und 20 Invalidierungsreferenzen. Glue 406.
- **5:** 7 → 6. Alles aus 8, zusätzlich `queries.ts`, REST-Pfade und `parseResponse`.
- **2:** Sie ist die einzige Variante mit hydration-sensitivem Code, hat aber den kleinsten Glue (217) und nur 3 Invalidierungsreferenzen. Deshalb 7,5, Rang 1.
- **7:** Das „~400 LOC Mini-Framework“ ist mit 502 Glue-Zeilen das größte.
- **1:** „Query doppelt deklariert“ ist keine Start-Eigenheit. 5 und 8 haben das Muster genauso.

**Unabhängige Module**

- Der 0,5-Abstand der Berichte (4/7/8 bei 8,5, die anderen bei 8) ist nicht gedeckt. Registry und Discovery sind in allen 8 gleich geformt.
- `startPath` koppelt in allen 8 den Core an todos, ist aber überall typgeprüft. Das ist kein Unterscheidungsmerkmal.
- In 2 bleibt ein type-only-Zyklus zwischen Core und Modulen (`modules/client.ts:7` → `~/routes/_app` → `registry.ts`). Der Bericht hatte ihn nicht erfasst.
- Doppelte Modul-IDs bleiben in 1/3/4/5 unentdeckt. In Hono überschattet das zweite `api.route` still.
- Allen Berichten fehlte, dass `scripts/fixtures.ts` das Notes-Schema importiert.

**Library-Extraktion** (erstmals mit eigener Querschnitts-Bewertung und Experiment)

- **1/5:** „Generator kann nicht in `node_modules` schreiben“ ist überzogen. Workspace-Pakete funktionieren ohne Rewrite. Unmöglich ist nur das Vorkompilieren.
- **4/3:** Die Sorge um `.d.ts`-Emit von `hc`-Typen ist unbegründet. Der Emit ist fehlerfrei.
- **6/7/8:** Die Berichte übersehen die Kante Core-Client → `CoreRouter` → `registry.server`.
- **2:** 5,5 → 5. `client.ts` hängt an `Register['routeFiles']` und `_app`, ein Standalone-Check zieht das ganze Notes-Modul mit.
- **Alle Varianten:** `worker-configuration.d.ts` importiert `./src/server`. Ein Core-Paket braucht ein eigenes `Env`.

**Duplikation**

- **2:** `chatPage.ts` ist Shared Core. Der stack-spezifische Modul-Glue sind nur 57 Code-Zeilen (Bestwert).
- **1:** 7,5 → 7 (größter Modulcode, 19 statische Adapter, doppelte Query).
- **4:** 7,5 → 6,5.
- **5:** 7 → 6,5.
- **7:** 8 → 7,75 (größter Core, doppelte `updateTodo`-Mutation in `list.tsx:33/35`).
- Die Navigation-Zwillinge gibt es in allen 8 und unterscheiden die Varianten nicht.

**AI/MCP**

- Alle Berichte gaben unkalibriert 8,5 / 9, obwohl die AI-Schicht byte-identisch ist.
- **2:** 8,5 → 7,5. Der Refresh ignoriert die Module und lädt die Navigation aller Module neu. Die Auth liegt an drei Stellen.
- **3:** Das nicht gezählte `reloadingModules`-Set kann Markierungen bei Überlappung verlieren (8).
- **1/5/8:** „Nur das geänderte Modul“ gilt für Queries. `router.invalidate()` läuft trotzdem für alle aktiven Loader (billig, aus dem Cache).
- **7:** Der Präfix ist strukturell erzwungen (`keyPrefix` = Mount-ID), in 4 nur Konvention.

**Cloudflare**

- **3:** 9 → 8. Die Asset-Konfiguration ist identisch mit den anderen SPAs. Es ist die einzige SPA ohne Batching und ohne Cache.
- **2:** 8,5 → 7,5. Pflicht-SSR der MUI-Seiten, kein Cache, O(N)-Navigation pro Action.
- **1:** 8 → 7,5. Der eager Graph umfasst 1.059 KiB gz (~20 % mehr Parse-Arbeit für API/Chat/MCP-Cold-Starts), Server Functions sind unbatched. Die gestrige Aussage „SSR verschlechtert den Cold Start nicht“ gilt für 1 nicht mehr, für 2 weiterhin (`server-build` wird dynamisch importiert).
- **4:** 8,5 → 8 (Wasserfall, unbatched).
- **7:** 8 → 8,5 (Batching + paralleles Laden).
- Hono vs. tRPC ist bei der Bundle-Größe vernachlässigbar (895 vs. 909 KiB gz). Hono gewinnt bei Reife und REST-Semantik, nicht bei der Laufzeit.

**Skalierung**

- **TSR-Typkosten:** Die Sorge, der Route-Tree „explodiere“, ist widerlegt. Das Wachstum ist linear. Die höheren Check-Kosten von 1 kommen von Start, nicht von TSR (8 mit demselben Router: 0,16 s pro Modul).
- **Instantiations vs. Check-Zeit:** Instantiations allein sortieren falsch. 5 hat die meisten Instantiations, aber eine geringere Check-Zeit als 1, 3 und 4.
- **4 und 5:** Ihre Berichte verschweigen, dass jede Modul-Navigation ein eigener Request ist.
- **2:** `Link prefetch="intent"` ist im Framework vorhanden, wird aber nirgends genutzt.
- **Optimistic Updates** hat keine Variante. Das ist kein Unterscheidungsmerkmal.
- **Gestrige Aussagen zu 1 und 5 sind veraltet:** Gestern hieß es, Variante 1 habe keinen Cache und lade nach jeder Änderung alles neu (`router.invalidate()`). Für Variante 5 hieß es, ihr fehle `autoCodeSplitting` und sie habe `staleTime` 0. Beides trifft nicht mehr zu.
