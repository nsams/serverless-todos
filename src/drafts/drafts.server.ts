import { getAgentByName } from "agents";
import { env } from "cloudflare:workers";
import type { Context } from "hono";
import { z } from "zod";

import type { ApiEnv } from "~/api/hono.server";
import { NotFoundError } from "~/errors";
import { defineOperation, inputValidationError, type Operation, type OperationContext } from "~/operations";

import { type DraftDefinition, type DraftValues, pickDraftValues } from "./draft";
import { type DraftState, draftUserHeader } from "./draftAgent.server";

// The server part of a shared draft (draft.ts) of an entity (e.g. a todo): how the entity is loaded and saved. Gives
// - the route of the forms' WebSocket (connect),
// - the operations of the draft for the AI assistants (and the UI): get, update, publish,
// - the notifications for changes of the entity made without the draft (stored, deleted), e.g. saved directly in a grid.
//
//     const todoDrafts = serverDraft(todoDraft, { load, changes: todoChangesSchema, save, check, view })
//     api.get("/todos/:id/draft", todoDrafts.connect)
//     const { get, update, publish } = todoDrafts.operations({ get: { title, description }, update: {...}, publish: {...} })

type AiMetadata = NonNullable<Operation["ai"]>;

const idInput = z.object({ id: z.string() });

export type ServerDraftOptions<Values extends DraftValues, Changes extends z.ZodObject, Entity extends Values, View> = {
    // The stored entity (at least the draft's fields), for the authenticated user. Throws NotFoundError if it doesn't exist or isn't
    // the user's: the draft is only reachable for entities that pass.
    load(ctx: OperationContext, id: string): Promise<Entity>;
    // The changes of the entity's fields (all optional), validated like any input: the input of update (with the field descriptions
    // for the model) and the draft's changes when it is published (e.g. an empty title typed into the form is rejected)
    changes: Changes;
    // Checks of changes beyond the schema (e.g. that a referenced entity exists and is the user's), before the draft is changed or
    // published. Throws NotFoundError or ValidationError.
    check?(ctx: OperationContext, changes: z.output<Changes>): Promise<void>;
    // Saves validated changes to the database: the saved entity. Without notifying the draft (publish does).
    save(ctx: OperationContext, id: string, changes: z.output<Changes>): Promise<Entity>;
    // What the UI and the model get to see of the entity (e.g. without the user id)
    view(entity: Entity): View;
};

export function serverDraft<Values extends DraftValues, Changes extends z.ZodObject, Entity extends Values, View>(
    definition: DraftDefinition<Values>,
    options: ServerDraftOptions<Values, Changes, Entity, View>,
) {
    const { load, changes: changesSchema, check, save, view } = options;
    const values = (entity: Entity) => pickDraftValues(definition, entity);

    // The entity's Durable Object. Only for an entity load() returned (checked to be the user's).
    async function agent(id: string) {
        return getAgentByName(env.DraftAgent, `${definition.name}:${id}`);
    }

    // The draft, opened (started or updated from the stored entity)
    async function getDraft(entity: Entity, id: string) {
        return (await (await agent(id)).getDraft(definition, values(entity))) as DraftState<Values>;
    }

    function draftView(id: string, { draft, changedFields }: DraftState<Values>) {
        return { draft: { id, ...draft }, unpublishedChanges: changedFields };
    }

    // The input of update: the changes plus the entity's id
    const updateInput = changesSchema.extend({ id: z.string() });

    return {
        definition,

        // The route of a form's WebSocket to the draft (a GET route with an `:id` param): forwarded to the draft's Durable Object once
        // the entity is found to be the user's (404 otherwise), with the user for the others' cursors
        async connect(c: Context<ApiEnv>) {
            if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
                return c.text("Expected a WebSocket upgrade", 426);
            }
            const id = c.req.param("id");
            if (!id) {
                throw new NotFoundError("Not found");
            }
            const entity = await load({ userId: c.var.user.id }, id);
            const draft = await agent(id);
            // takes over changes of the stored entity the draft may have missed
            await draft.openDraft(definition, values(entity));
            const headers = new Headers(c.req.raw.headers);
            headers.set(draftUserHeader, c.var.user.email);
            return draft.fetch(new Request(c.req.raw, { headers }));
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
                        const state = await (await agent(id)).updateDraft(definition, values(entity), changes as unknown as Partial<Values>);
                        return draftView(id, state as DraftState<Values>);
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
                        await check?.(ctx, parsed.data);
                        const saved = await save(ctx, id, parsed.data);
                        await (await agent(id)).entityStored(definition, values(saved), draft);
                        return { published: view(saved), publishedFields: changedFields };
                    },
                }),
            };
        },

        // The entity was saved without the draft (e.g. directly in a grid): the draft takes the changes over for the fields it doesn't
        // change
        async stored(id: string, saved: Entity) {
            await (await agent(id)).entityStored(definition, values(saved));
        },

        // The entity was deleted: the forms say so, the draft is deleted
        async deleted(id: string) {
            await (await agent(id)).entityDeleted();
        },
    };
}
