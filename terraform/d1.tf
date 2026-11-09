# The app's database. The schema is migrated by wrangler (`npm run deploy`, drizzle/), not by Terraform.
resource "cloudflare_d1_database" "app" {
  account_id = var.account_id
  name       = var.d1_database_name

  lifecycle {
    prevent_destroy = true
  }
}
