variable "name" {
  type    = string
  default = "campus"
}

output "name" { value = var.name }
