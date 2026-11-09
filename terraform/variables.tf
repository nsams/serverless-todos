variable "account_id" {
  description = "Cloudflare account (Vivid Planet Sandbox)"
  type        = string
  default     = "e45f6c5d92148e7357863b7c79ce5763"
}

variable "worker_name" {
  description = "Name of the Worker, must match `name` in wrangler.jsonc"
  type        = string
  default     = "serverless-todos"
}

variable "d1_database_name" {
  description = "Name of the D1 database, must match `d1_databases[0].database_name` in wrangler.jsonc"
  type        = string
  default     = "serverless-todos"
}

# --- Cloudflare Access: Microsoft Entra ID as identity provider ---

variable "entra_identity_provider_name" {
  description = "Name of the identity provider, shown on the Access login page"
  type        = string
  default     = "Microsoft Entra ID"
}

variable "entra_directory_id" {
  description = "Entra ID: Directory (tenant) ID of the app registration"
  type        = string
}

variable "entra_client_id" {
  description = "Entra ID: Application (client) ID of the app registration"
  type        = string
}

variable "entra_client_secret" {
  description = "Entra ID: client secret of the app registration"
  type        = string
  sensitive   = true
}

variable "entra_support_groups" {
  description = "Load the user's Entra groups (needed for `allowed_entra_group_ids`)"
  type        = bool
  default     = true
}

# --- Cloudflare Access: who may use the app (a user needs to match one of them) ---

variable "allowed_email_domains" {
  description = "Email domains of the users allowed to use the app"
  type        = list(string)
  default     = ["vivid-planet.com"]
}

variable "allowed_emails" {
  description = "Single users allowed to use the app"
  type        = list(string)
  default     = []
}

variable "allowed_entra_group_ids" {
  description = "Object IDs of Entra groups whose members may use the app"
  type        = list(string)
  default     = []
}

variable "access_session_duration" {
  description = "How long a browser login is valid"
  type        = string
  default     = "24h"
}

# --- Cloudflare Access: managed OAuth for the MCP server (/mcp) ---

variable "mcp_oauth_allowed_redirect_uris" {
  description = "Redirect URIs of web-based MCP clients (dynamic client registration). Claude Desktop and claude.ai connect through Anthropic's servers."
  type        = list(string)
  default = [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
  ]
}

variable "mcp_oauth_access_token_lifetime" {
  description = "Lifetime of the OAuth access tokens (the client refreshes them in the background, Access re-evaluates its policies on each refresh)"
  type        = string
  default     = "15m"
}

variable "mcp_oauth_session_duration" {
  description = "Duration of an OAuth grant, afterwards the user signs in again"
  type        = string
  default     = "336h" # 2 weeks
}

# --- AI Gateway ---

variable "ai_gateway_id" {
  description = "AI Gateway the model requests go through, must match `AI_GATEWAY_ID` in wrangler.jsonc"
  type        = string
  default     = "default"
}

variable "ai_spend_limit_usd" {
  description = "Spend limit of the AI Gateway in USD per `ai_spend_limit_window_seconds`; null = no spend limit"
  type        = number
  default     = null
}

variable "ai_spend_limit_window_seconds" {
  description = "Time window of the spend limit in seconds"
  type        = number
  default     = 86400 # 1 day
}
