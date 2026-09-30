variable "resource_group_name" { type = string }
variable "location" { type = string }

resource "azurerm_storage_account" "main" {
  name                     = "campusjobuploads"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "uploads" {
  name                  = "uploads"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

output "account_name" { value = azurerm_storage_account.main.name }
