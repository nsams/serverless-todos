# The Worker itself (name, workers.dev URL, observability). Its code, bindings, Durable Object migrations and vars are deployed by
# wrangler (`npm run deploy`, wrangler.jsonc), not by Terraform: Terraform only tracks that the Worker exists, so that other
# resources (the Access application) can reference it.
#
# Keep the settings below in sync with wrangler.jsonc: `wrangler deploy` applies `workers_dev`, `preview_urls` and `observability`
# from wrangler.jsonc on every deployment.
resource "cloudflare_worker" "app" {
  account_id = var.account_id
  name       = var.worker_name

  # served on workers.dev, preview URLs are disabled (they would need their own Access setup)
  subdomain = {
    enabled          = true
    previews_enabled = false
  }

  # Workers Logs
  observability = {
    enabled = true
  }

  lifecycle {
    # deleting the Worker deletes the chat histories (Durable Objects)
    prevent_destroy = true
  }
}
