# outputs.tf – surfaces the most useful information after apply

output "dinodns_private_ips" {
  description = "Private IP addresses of the DinoDNS instances."
  value       = aws_instance.dinodns[*].private_ip
}

output "coredns_private_ips" {
  description = "Private IP addresses of the CoreDNS instances."
  value       = aws_instance.coredns[*].private_ip
}

output "dnsperf_dinodns_private_ip" {
  description = "Private IP of the DNSperf instance targeting DinoDNS."
  value       = aws_instance.dnsperf_dinodns.private_ip
}

output "dnsperf_coredns_private_ip" {
  description = "Private IP of the DNSperf instance targeting CoreDNS."
  value       = aws_instance.dnsperf_coredns.private_ip
}

output "results_s3_bucket" {
  description = "S3 bucket where DNSperf result files are uploaded."
  value       = aws_s3_bucket.results.bucket
}

output "ecr_repository_url" {
  description = "ECR repository URL used for the DinoDNS image."
  value       = aws_ecr_repository.dinodns.repository_url
}
