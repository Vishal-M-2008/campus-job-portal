variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "administrator_password" { type = string }

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "campus-pg"
  resource_group_name    = var.resource_group_name
  location               = var.location
  version                = "16"
  administrator_login    = "campusadmin"
  administrator_password = var.administrator_password
  sku_name               = "B_Standard_B1ms"
  storage_mb             = 32768
}

output "fqdn" { value = azurerm_postgresql_flexible_server.main.fqdn }
