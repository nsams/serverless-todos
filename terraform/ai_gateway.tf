# The AI Gateway the chat assistant's model requests go through (logs, spend limit). Without Terraform it would be created
# automatically on first use.
resource "cloudflare_ai_gateway" "app" {
  account_id = var.account_id
  id         = var.ai_gateway_id

  collect_logs               = true
  cache_ttl                  = 0
  cache_invalidate_on_update = false
  rate_limiting_interval     = 0
  rate_limiting_limit        = 0

  spend_limits = var.ai_spend_limit_usd == null ? null : {
    enabled = true
    rules = [{
      limit_type = "cost"
      limit      = var.ai_spend_limit_usd
      window     = var.ai_spend_limit_window_seconds
      technique  = "fixed"
    }]
  }
}
