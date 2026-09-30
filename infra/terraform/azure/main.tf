terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

module "vpc" {
  source              = "./modules/vpc"
  resource_group_name = var.resource_group_name
  location            = var.location
}

module "k8s" {
  source              = "./modules/k8s"
  resource_group_name = module.vpc.resource_group_name
  location            = var.location
}

module "postgres" {
  source                 = "./modules/postgres"
  resource_group_name    = module.vpc.resource_group_name
  location               = var.location
  administrator_password = var.postgres_admin_password
}

module "object_storage" {
  source              = "./modules/object_storage"
  resource_group_name = module.vpc.resource_group_name
  location            = var.location
}

module "secrets" {
  source              = "./modules/keyvault"
  resource_group_name = module.vpc.resource_group_name
  location            = var.location
  postgres_fqdn       = module.postgres.fqdn
  storage_account     = module.object_storage.account_name
}

variable "resource_group_name" { type = string }
variable "location" {
  type    = string
  default = "centralindia"
}

variable "postgres_admin_password" {
  type      = string
  sensitive = true
}
