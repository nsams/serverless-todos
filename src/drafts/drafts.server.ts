import { getAgentByName } from "agents";
import { env } from "cloudflare:workers";
import type { Context } from "hono";
import { z } from "zod";

import { forwardToAgent } from "~/agents.server";
import type { ApiEnv } from "~/api/hono.server";
import { NotFoundError } from "~/errors";
import { defineOperation, inputValidationError, type Operation, type OperationContext } from "~/operations";

import { type DraftDefinition, draftFields, type DraftServerMessage, type DraftValues, pickDraftValues } from "./draft";
import { deletedCloseCode, type DraftState, draftUserHeader } from "./draftAgent.server";

// The server part of a shared draft (draft.ts) of an entity (e.g. a todo): how the entity is loaded, validated and saved. Gives
// - the route of the forms' WebSocket (connect),
// - the operations of the draft for the AI assistants (and the UI): get, update, publish,
// - the notifications for changes of the entity made without the draft (stored, deleted, deletedMany), e.g. saved directly in a grid,
//   or deleted with its parent.
//
//     const todoDrafts = serverDraft(todoDraft, { load, revision, changes: todoChangesSchema, check, save, view })
//     api.get("/todos/:id/draft", (c) => todoDrafts.connect(c))
//     const { get, update, publish } = todoDrafts.operations({ get: { title, description }, update: {...}, publish: {...} })

type AiMetadata = NonNullable<Operation["ai"]>;

const idInput = z.object({ id: z.string() });

// The changes schema of a draft: an object schema of exactly the draft's fields, each optional, its output a valid value of the field
// (e.g. a trimmed string, not a Date). A schema that doesn't match the draft's values doesn't compile.
type ChangesSchemaFor<Values extends DraftValues, Changes extends z.ZodObject> = [z.output<Changes>] extends [Partial<Values>]
    ? [Exclude<keyof Values, keyof z.output<Changes>> | Exclude<keyof z.output<Changes>, keyof Values>] extends [never]
        ? Partial<Values> extends z.output<Changes>
            ? Changes
            : never
        : never
    : never;

export type ServerDraftOptions<Values extends DraftValues, Changes extends z.ZodObject, Entity extends Values, View> = {
    // The stored entity (at least the draft's fields), for the authenticated user. Throws NotFoundError if it doesn't exist or isn't
    // the user's: the draft is only reachable for entities that pass.
    load(ctx: OperationContext, id: string): Promise<Entity>;
    // The entity's revision: increases with every save (e.g. a column incremented by every UPDATE). Orders the snapshots of the
    // entity the draft gets (a snapshot loaded before a save can arrive after it).
    revision(entity: Entity): number;
    // The changes of the entity's fields (each optional), validated like any input: the input of update (with the field descriptions
    // for the model) and the draft's changes when it is published (e.g. an empty title typed into the form is rejected)
    changes: ChangesSchemaFor<Values, Changes>;
    // Checks of changes beyond the schema (e.g. that a referenced entity exists and is the user's), before the draft is changed or
    // published. Throws NotFoundError or ValidationError.
    check?(ctx: OperationContext, changes: z.output<Changes>): Promise<void>;
    // Saves validated changes to the database (increasing the revision): the saved entity. Without notifying the draft (publish does).
    save(ctx: OperationContext, id: string, changes: z.output<Changes>): Promise<Entity>;
    // What the UI and the model get to see of the entity (e.g. without the user id)
    view(entity: Entity): View;
};

export function serverDraft<Values extends DraftValues, Changes extends z.ZodObject, Entity extends Values, View>(
    definition: DraftDefinition<Values>,
    options: ServerDraftOptions<Values, Changes, Entity, View>,
) {
    const { load, revision, check, save, view } = options;
    const changesSchema = options.changes as Changes;
    // (the types check it too)
    if (Object.keys(changesSchema.shape).sort().join() !== draftFields(definition).sort().join()) {
        throw new Error(`The changes schema of the draft ${definition.name} must have exactly its fields`);
    }
    const values = (entity: Entity) => pickDraftValues(definition, entity);

    // The entity's Durable Object. Only for an entity load() returned (checked to be the user's).
    function agent(id: string) {
        return getAgentByName(env.DraftAgent, `${definition.name}:${id}`);
    }

    // The draft, opened (started or updated from the stored entity); NotFoundError if the entity was deleted meanwhile
    async function getDraft(entity: Entity, id: string) {
        const state = (await (await agent(id)).getDraft(definition, values(entity), revision(entity))) as DraftState<Values>;
        if (!state) {
            throw new NotFoundError(`${id} not found`);
        }
        return state;
    }

    function draftView(id: string, { draft, changedFields }: NonNullable<DraftState<Values>>) {
        return { draft: { id, ...draft }, unpublishedChanges: changedFields };
    }

    // The input of update: the changes plus the entity's id
    const updateInput = changesSchema.extend({ id: z.string() });

    // A notification after the entity was saved or deleted: best effort (the save is done; the draft also takes over the stored
    // entity whenever it is opened)
    async function notify(id: string, action: (draft: Awaited<ReturnType<typeof agent>>) => Promise<unknown>) {
        try {
            await action(await agent(id));
        } catch (error) {
            console.error(`Notifying the draft ${definition.name}:${id} failed`, error);
        }
    }

    return {
        definition,

        // The route of a form's WebSocket to the draft (a GET route with an `:id` param): forwarded to the draft's Durable Object once
        // the entity is found to be the user's, with the user for the others' cursors. An entity that doesn't exist (anymore) gets a
        // WebSocket that says so and closes for good (a 404 would make the client reconnect forever).
        async connect(c: Context<ApiEnv>) {
            if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
                return c.text("Expected a WebSocket upgrade", 426);
            }
            const id = c.req.param("id");
            const entity = id ? await load({ userId: c.var.user.id }, id).catch(notFoundAsUndefined) : undefined;
            if (!id || !entity) {
                return deletedSocket();
            }
            const draft = await agent(id);
            // takes over changes of the stored entity the draft may have missed
            if (!(await draft.openDraft(definition, values(entity), revision(entity)))) {
                return deletedSocket();
            }
            return forwardToAgent(draft, c.req.raw, { [draftUserHeader]: c.var.user.email });
        },

        // The operations of the draft; ai: their metadata for the AI assistants (tool titles and descriptions)
        operations(ai: { get: AiMetadata; update: AiMetadata; publish: AiMetadata }) {
            return {
                // the draft: its values and the fields that differ from the stored entity
                get: defineOperation({
                    input: idInput,
                    effect: "read",
                    ai: ai.get,
                    handler: async (ctx, { id }) => draftView(id, await getDraft(await load(ctx, id), id)),
                }),
                // changes fields of the draft (the forms show it right away)
                update: defineOperation({
                    input: updateInput,
                    effect: "write",
                    ai: ai.update,
                    handler: async (ctx, input) => {
                        const { id, ...changes } = input as { id: string } & z.output<Changes>;
                        const entity = await load(ctx, id);
                        await check?.(ctx, changes as z.output<Changes>);
                        const state = (await (
                            await agent(id)
                        ).updateDraft(definition, values(entity), revision(entity), changes as unknown as Partial<Values>)) as DraftState<Values>;
                        if (!state) {
                            throw new NotFoundError(`${id} not found`);
                        }
                        return draftView(id, state);
                    },
                }),
                // saves the draft's changes (made by anyone) to the entity
                publish: defineOperation({
                    input: idInput,
                    effect: "write",
                    ai: ai.publish,
                    handler: async (ctx, { id }) => {
                        const entity = await load(ctx, id);
                        const { draft, changedFields } = await getDraft(entity, id);
                        if (changedFields.length === 0) {
                            return { published: view(entity), publishedFields: changedFields };
                        }
                        // the draft's changes, validated like any input
                        const parsed = changesSchema.safeParse(Object.fromEntries(changedFields.map((field) => [field, draft[field]])));
                        if (!parsed.success) {
                            throw inputValidationError(parsed.error.issues);
                        }
                        const changes = parsed.data as z.output<Changes>;
                        await check?.(ctx, changes);
                        const saved = await save(ctx, id, changes);
                        await notify(id, (draftAgent) => draftAgent.entityStored(definition, values(saved), revision(saved), draft));
                        return { published: view(saved), publishedFields: changedFields.filter((field) => field in changes) };
                    },
                }),
            };
        },

        // The entity was saved without the draft (e.g. directly in a grid): the draft takes the changes over for the fields it doesn't
        // change
        async stored(id: string, saved: Entity) {
            await notify(id, (draftAgent) => draftAgent.entityStored(definition, values(saved), revision(saved)));
        },

        // The entity was deleted: the forms say so, the draft is deleted
        async deleted(id: string) {
            await notify(id, (draftAgent) => draftAgent.entityDeleted());
        },

        // Entities were deleted, e.g. with their parent (a cascading delete): call it with the ids of all of them
        async deletedMany(ids: readonly string[]) {
            await Promise.all(ids.map((id) => notify(id, (draftAgent) => draftAgent.entityDeleted())));
        },
    };
}

function notFoundAsUndefined(error: unknown): undefined {
    if (error instanceof NotFoundError) {
        return undefined;
    }
    throw error;
}

// The WebSocket for an entity that doesn't exist (anymore): says so and closes for good (the client doesn't reconnect)
function deletedSocket() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.send(JSON.stringify({ type: "deleted" } satisfies DraftServerMessage));
    server.close(deletedCloseCode, "Deleted");
    return new Response(null, { status: 101, webSocket: client });
}
