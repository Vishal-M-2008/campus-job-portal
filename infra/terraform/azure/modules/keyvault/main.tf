variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "postgres_fqdn" { type = string }
variable "storage_account" { type = string }

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                       = "campus-job-kv"
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
}

output "vault_id" { value = azurerm_key_vault.main.id }
output "postgres_fqdn" { value = var.postgres_fqdn }
output "storage_account" { value = var.storage_account }
