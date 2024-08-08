terraform {
  backend "gcs" {
    bucket = "multichain-terraform-dev"
    prefix = "state/tools/contract-ping"
  }
}

provider "google" {
  project = "pagoda-discovery-platform-dev"
}

provider "google" {
  project = "pagoda-shared-infrastructure"
  alias   = "something"
}
