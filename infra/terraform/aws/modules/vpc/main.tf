# AWS module names match Azure so a later provider swap keeps the same interface.
# These stubs do not create resources.

variable "name" {
  type    = string
  default = "campus"
}

output "name" { value = var.name }
