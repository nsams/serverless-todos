# Cloudflare Access in front of the Worker: users sign in with Microsoft Entra ID, Access only forwards authenticated requests
# and adds the Access JWT, which the app verifies (src/auth.server.ts with ACCESS_TEAM_DOMAIN and ACCESS_AUD in wrangler.jsonc).
#
# Not managed here: the Zero Trust organization (team name "vivid-planet-sandbox", account-wide settings shared with other apps).

resource "cloudflare_zero_trust_access_identity_provider" "entra_id" {
  account_id = var.account_id
  name       = var.entra_identity_provider_name
  type       = "azureAD"

  config = {
    directory_id   = var.entra_directory_id
    client_id      = var.entra_client_id
    client_secret  = var.entra_client_secret
    support_groups = var.entra_support_groups
  }

  lifecycle {
    # the identity provider is account-wide and may be used by other Access applications too
    prevent_destroy = true
  }
}

# Who may use the app (reusable policy, like the one created by "Enable Cloudflare Access" in the dashboard)
resource "cloudflare_zero_trust_access_policy" "app" {
  account_id = var.account_id
  name       = "${var.worker_name} - Production"
  decision   = "allow"

  include = concat(
    [for domain in var.allowed_email_domains : { email_domain = { domain = domain } }],
    [for email in var.allowed_emails : { email = { email = email } }],
    [for group_id in var.allowed_entra_group_ids : {
      azure_ad = {
        id                   = group_id
        identity_provider_id = cloudflare_zero_trust_access_identity_provider.entra_id.id
      }
    }],
  )
}

resource "cloudflare_zero_trust_access_application" "app" {
  account_id = var.account_id
  name       = var.worker_name
  type       = "self_hosted"

  # the Worker on all its hostnames (workers.dev, and custom domains or routes if added later)
  destinations = [{
    type      = "worker"
    worker_id = cloudflare_worker.app.id
  }]

  # Entra ID as the only login method, without the selection page
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.entra_id.id]
  auto_redirect_to_identity = true
  session_duration          = var.access_session_duration

  policies = [{
    id         = cloudflare_zero_trust_access_policy.app.id
    precedence = 1
  }]

  # Managed OAuth for the MCP server (/mcp): Access is the OAuth authorization server for MCP clients (discovery, dynamic client
  # registration, tokens). Browser users aren't affected: Access only answers non-browser clients with 401 and OAuth discovery.
  oauth_configuration = {
    enabled = true
    dynamic_client_registration = {
      enabled                = true
      allowed_uris           = var.mcp_oauth_allowed_redirect_uris
      allow_any_on_localhost = true # local MCP clients like Claude Code or the MCP Inspector
      allow_any_on_loopback  = true
    }
    grant = {
      access_token_lifetime = var.mcp_oauth_access_token_lifetime
      session_duration      = var.mcp_oauth_session_duration
    }
  }
}
