import handler from "@tanstack/react-start/server-entry";

// Custom worker entry to pass Cloudflare Access (`ctx.access`, set by the runtime on requests that matched an Access application) to the app
export default {
    fetch(request, _env, ctx) {
        return handler.fetch(request, { context: { access: ctx.access } });
    },
} satisfies ExportedHandler<Env>;

export type RequestContext = { access: CloudflareAccessContext | undefined };

declare module "@tanstack/react-router" {
    interface Register {
        server: { requestContext: RequestContext };
    }
}
