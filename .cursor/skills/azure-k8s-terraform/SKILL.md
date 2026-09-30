---
name: azure-k8s-terraform
description: Defines Azure-first Terraform modules and Kubernetes manifests for AKS, Postgres, Blob, and Key Vault, with an AWS stub. Use when editing infra/terraform, infra/k8s, or cloud pipelines.
---

# Azure, Kubernetes, Terraform

## Layout

- `infra/terraform/azure` modules: `vpc`, `k8s`, `postgres`, `object_storage`, `secrets`.
- `infra/terraform/aws` same module names as stubs.
- `infra/k8s` Deployment, Service, Ingress, and a migrate Job.

## Migrate Job

The Job uses the API image and command `npm run migrate`. The API Deployment uses an init container or a documented Helm hook so the Job finishes first.

## Secrets

Manifests reference secret names only. Terraform writes Key Vault ids, not secret values. `*.tfvars` stays gitignored. Commit `terraform.tfvars.example` with placeholders.

Azure Blob is the object-storage implementation behind the same adapter interface as local disk.
