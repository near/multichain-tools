variable "project_id" {
  default     = "pagoda-discovery-platform-dev"
  description = "The default project id to use for resources in this directory."
}

terraform {
  backend "gcs" {
    bucket = "pagoda-discovery-platform-dev"
    prefix = "multichain-terraform-dev/state/tools/contract-ping"
  }
}

provider "google" {
  project = "pagoda-discovery-platform-dev"
}

provider "google" {
  project = "pagoda-shared-infrastructure"
  alias   = "something"
}
