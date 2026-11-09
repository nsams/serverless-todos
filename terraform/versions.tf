terraform {
  required_version = ">= 1.7"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }

  # Local state (terraform.tfstate, not committed). It contains secrets (the Entra ID client secret), so for a team use a remote
  # backend instead, e.g. an R2 bucket (S3-compatible "s3" backend) or HCP Terraform.
}

# API token from the environment: CLOUDFLARE_API_TOKEN (see README.md for the required permissions)
provider "cloudflare" {}
