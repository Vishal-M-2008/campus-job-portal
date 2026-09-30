variable "resource_group_name" { type = string }
variable "location" { type = string }

resource "azurerm_kubernetes_cluster" "main" {
  name                = "campus-aks"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = "campus"
  default_node_pool {
    name       = "system"
    node_count = 1
    vm_size    = "Standard_B2s"
  }
  identity { type = "SystemAssigned" }
}
