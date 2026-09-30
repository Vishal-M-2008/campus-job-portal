variable "resource_group_name" { type = string }
variable "location" { type = string }

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_virtual_network" "main" {
  name                = "campus-vnet"
  address_space       = ["10.20.0.0/16"]
  location            = var.location
  resource_group_name = azurerm_resource_group.main.name
}

output "resource_group_name" { value = azurerm_resource_group.main.name }
