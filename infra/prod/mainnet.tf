locals {
  static_envs_mainnet = {
    "NEXT_PUBLIC_NETWORK_ID": "mainnet"
  }

}

resource "google_service_account" "service_account_mainnet" {
  account_id   = "contract-ping-mainnet"
  display_name = "contract-pinger-mainnet"
}

resource "google_project_iam_member" "sa-roles_mainnet" {
  for_each = toset([
    "roles/run.invoker",
    "roles/secretmanager.admin",
    "roles/storage.objectAdmin",
    "roles/logging.logWriter",
  ])

  role     = each.key
  member   = "serviceAccount:${google_service_account.service_account_mainnet.email}"
   project = var.project_id
}

resource "google_cloud_run_service" "contract_ping_mainnet" {
  provider                   = google-beta
  name                       = "contract-pinger-mainnet"
  location                   = "us-central1"
  project                    = var.project_id
  autogenerate_revision_name = true

  template {
    spec {
      service_account_name = "contract-ping-mainnet@pagoda-discovery-platform-prod.iam.gserviceaccount.com"
      containers {
        args  = ["node", "dist/server.js"]
        image = "us-east1-docker.pkg.dev/pagoda-discovery-platform-prod/multichain/tools/contract-ping:latest"
        ports {
          name           = "http1"
          container_port = 3000
        }
        dynamic "env" {
          for_each = local.static_envs_mainnet
          content {
            name  = env.key
            value = env.value
          }
        }
        env {
          name = "NEXT_PUBLIC_NEAR_ACCOUNT_ID"
          value_from {
            secret_key_ref {
              name = "contract_ping_near_account_id_mainnet"
              key  = "latest"
            }
          }
        }
        env {
          name = "NEXT_PUBLIC_NEAR_PRIVATE_KEY"
          value_from {
            secret_key_ref {
              name = "contract_ping_near_private_key_mainnet"
              key  = "latest"
            }
          }
        }
        env {
          name = "NEXT_PUBLIC_CHAIN_SIGNATURE_CONTRACT"
          value_from {
            secret_key_ref {
              name = "contract_ping_chain_sig_contract_mainnet"
              key  = "latest"
            }
          }
        }
      }
    }
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale"        = "1"
        "run.googleapis.com/cpu-throttling"       = false
        # "run.googleapis.com/vpc-access-connector" = "projects/pagoda-shared-infrastructure/locations/us-central1/connectors/dev-connector"
        # "run.googleapis.com/vpc-access-egress"    = "all-traffic"
      }
    }
  }
  traffic {
    percent         = 100
    latest_revision = true
  }

  lifecycle {
    # List of fields we don't want to see a diff for in terraform. Most of these fields are set
    # by GCP and is metadata we don't want to account when considering changes in the service.
    ignore_changes = [
      template[0].metadata[0].labels["client.knative.dev/nonce"],
      template[0].metadata[0].labels["run.googleapis.com/startupProbeType"],
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
    ]
  }
  depends_on = [ google_service_account.service_account_mainnet ]
}

data "google_iam_policy" "noauth_mainnet" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "noauth_mainnet" {
  location    = google_cloud_run_service.contract_ping_mainnet.location
  project     = google_cloud_run_service.contract_ping_mainnet.project
  service     = google_cloud_run_service.contract_ping_mainnet.name

  policy_data = data.google_iam_policy.noauth_mainnet.policy_data
}