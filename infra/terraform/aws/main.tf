module "vpc" { source = "./modules/vpc" }
module "k8s" { source = "./modules/k8s" }
module "postgres" { source = "./modules/postgres" }
module "object_storage" { source = "./modules/object_storage" }
module "secrets" { source = "./modules/keyvault" }
