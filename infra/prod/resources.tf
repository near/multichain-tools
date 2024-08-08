terraform {
  backend "gcs" {
    bucket = "terraform-prod-multichain"
    prefix = "state/tools/contract-ping"
  }
}

provider "google" {
  project = "pagoda-discovery-platform-prod"
}

provider "google" {
  project = "pagoda-shared-infrastructure"
  alias   = "something"
}
