output "access_aud" {
  description = "Application Audience (AUD) Tag of the Access application: `ACCESS_AUD` in wrangler.jsonc"
  value       = cloudflare_zero_trust_access_application.app.aud
}

output "d1_database_id" {
  description = "ID of the D1 database: `d1_databases[0].database_id` in wrangler.jsonc"
  value       = cloudflare_d1_database.app.id
}

output "worker_id" {
  value = cloudflare_worker.app.id
}
