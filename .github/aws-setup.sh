#!/bin/bash
# Run once to provision the ECR repository in AWS
# Usage: AWS_REGION=us-east-1 bash aws-setup.sh

REGION=${AWS_REGION:-us-east-1}
REPO_NAME=openclaw-crm

echo "Creating ECR repository: $REPO_NAME in $REGION"

aws ecr create-repository \
  --repository-name $REPO_NAME \
  --region $REGION \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE 2>&1 | grep -E "repositoryUri|already exists"

echo ""
echo "Add these secrets to GitHub (Settings > Secrets > Actions):"
echo "  AWS_ACCESS_KEY_ID"
echo "  AWS_SECRET_ACCESS_KEY"
echo "  AWS_REGION            (e.g. us-east-1)"
echo "  EC2_HOST              (EC2 public IP or hostname)"
echo "  EC2_USER              (e.g. ubuntu or ec2-user)"
echo "  EC2_SSH_KEY           (contents of your .pem key)"
