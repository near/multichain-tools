locals {
  static_envs = {
  }
}

resource "google_service_account" "service_account" {
  account_id   = "contract-ping-dev"
  display_name = "contract-pinger-dev"
}

resource "google_project_iam_member" "sa-roles" {
  for_each = toset([
    "roles/run.invoker",
    "roles/secretmanager.admin",
    "roles/storage.objectAdmin",
    "roles/logging.logWriter",
  ])

  role     = each.key
  member   = "serviceAccount:${google_service_account.service_account.email}"
   project = var.project_id
}

resource "google_cloud_run_service" "contract_ping" {
  provider                   = google-beta
  name                       = "contract-pinger-dev"
  location                   = "us-central1"
  project                    = var.project_id
  autogenerate_revision_name = true

  template {
    spec {
      service_account_name = "contract-ping-dev@pagoda-discovery-platform-dev.iam.gserviceaccount.com"
      containers {
        args  = ["node", "dist/server.js"]
        image = "us-east1-docker.pkg.dev/pagoda-discovery-platform-dev/multichain/tools/contract-ping:latest"
        ports {
          name           = "http1"
          container_port = 3000
        }
        dynamic "env" {
          for_each = local.static_envs
          content {
            name  = env.key
            value = env.value
          }
        }
        env {
          name = "NEXT_PUBLIC_NEAR_ACCOUNT_ID"
          value_from {
            secret_key_ref {
              name = "contract_ping_near_account_id"
              key  = "latest"
            }
          }
        }
        env {
          name = "NEXT_PUBLIC_NEAR_PRIVATE_KEY"
          value_from {
            secret_key_ref {
              name = "contract_ping_near_private_key"
              key  = "latest"
            }
          }
        }
        env {
          name = "NEXT_PUBLIC_CHAIN_SIGNATURE_CONTRACT"
          value_from {
            secret_key_ref {
              name = "contract_ping_chain_sig_dev_contract_testnet"
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
  depends_on = [ google_service_account.service_account ]
}

data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "noauth" {
  location    = google_cloud_run_service.contract_ping.location
  project     = google_cloud_run_service.contract_ping.project
  service     = google_cloud_run_service.contract_ping.name

  policy_data = data.google_iam_policy.noauth.policy_data
}