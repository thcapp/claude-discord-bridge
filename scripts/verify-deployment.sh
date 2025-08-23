#!/bin/bash
set -euo pipefail

# Deployment Verification Script
# This script verifies that all components are properly configured for deployment

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     Claude Discord Bridge - Deployment Verification${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0

# Function to check if a file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $2 - File not found: $1"
        ((CHECKS_FAILED++))
    fi
}

# Function to check if a directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $2 - Directory not found: $1"
        ((CHECKS_FAILED++))
    fi
}

# Function to check if a command exists
check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $2 - Command not found: $1"
        ((CHECKS_FAILED++))
    fi
}

# Function to check environment variable
check_env() {
    if [ ! -z "${!1:-}" ]; then
        echo -e "${GREEN}✓${NC} Environment variable: $1"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}!${NC} Environment variable not set: $1"
        ((CHECKS_FAILED++))
    fi
}

echo -e "${BLUE}Checking Core Files...${NC}"
check_file "package.json" "Package configuration"
check_file "tsconfig.json" "TypeScript configuration"
check_file "docker-compose.production.yml" "Docker Compose production config"
check_file "Dockerfile" "Docker build file"
check_file ".env.production" "Production environment config"
check_file "README.md" "Documentation"

echo ""
echo -e "${BLUE}Checking Source Code...${NC}"
check_dir "src" "Source code directory"
check_file "src/index.ts" "Main application entry"
check_dir "src/discord" "Discord commands"
check_dir "src/claude" "Claude integration"
check_dir "src/monitoring" "Monitoring components"
check_dir "src/database" "Database adapters"
check_dir "src/cache" "Cache implementation"

echo ""
echo -e "${BLUE}Checking Configuration...${NC}"
check_dir "nginx" "Nginx configuration"
check_file "nginx/nginx.conf" "Nginx main config"
check_dir "monitoring" "Monitoring configuration"
check_file "monitoring/prometheus.yml" "Prometheus config"
check_file "monitoring/alerts.yml" "Alert rules"

echo ""
echo -e "${BLUE}Checking Scripts...${NC}"
check_dir "scripts" "Scripts directory"
check_file "scripts/deploy-production.sh" "Production deployment script"
check_file "scripts/remote-deploy.sh" "Remote deployment script"
check_file "scripts/backup.sh" "Backup script"

echo ""
echo -e "${BLUE}Checking Static Assets...${NC}"
check_dir "static" "Static files directory"
check_file "static/status.html" "Status page"

echo ""
echo -e "${BLUE}Checking Dependencies...${NC}"
check_command "node" "Node.js"
check_command "npm" "NPM"
check_command "git" "Git"
check_command "docker" "Docker" || echo -e "${YELLOW}  Docker will be installed on server${NC}"
check_command "docker-compose" "Docker Compose" || echo -e "${YELLOW}  Docker Compose will be installed on server${NC}"

echo ""
echo -e "${BLUE}Checking Node Modules...${NC}"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} Node modules installed"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}!${NC} Node modules not installed - run: npm install"
    ((CHECKS_FAILED++))
fi

echo ""
echo -e "${BLUE}Checking TypeScript Build...${NC}"
if [ -d "dist" ]; then
    echo -e "${GREEN}✓${NC} TypeScript compiled"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}!${NC} TypeScript not compiled - run: npm run build"
    ((CHECKS_FAILED++))
fi

echo ""
echo -e "${BLUE}Checking Environment Variables...${NC}"
if [ -f ".env.production" ]; then
    source .env.production
    check_env "DISCORD_TOKEN"
    check_env "DISCORD_CLIENT_ID"
    check_env "DB_PASSWORD"
    check_env "REDIS_PASSWORD"
    check_env "SESSION_SECRET"
    check_env "GRAFANA_PASSWORD"
fi

echo ""
echo -e "${BLUE}Checking Docker Images...${NC}"
if command -v docker &> /dev/null; then
    if docker images | grep -q "claude-discord-bridge"; then
        echo -e "${GREEN}✓${NC} Docker image exists"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}!${NC} Docker image not built - will build on deployment"
        ((CHECKS_FAILED++))
    fi
fi

echo ""
echo -e "${BLUE}Checking Ports...${NC}"
for port in 3000 3001 9090; do
    if lsof -i :$port &> /dev/null; then
        echo -e "${YELLOW}!${NC} Port $port is already in use"
        ((CHECKS_FAILED++))
    else
        echo -e "${GREEN}✓${NC} Port $port is available"
        ((CHECKS_PASSED++))
    fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     Verification Results${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Checks Passed: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Checks Failed: ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready for deployment.${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Update .env.production with your actual credentials"
    echo "2. Run: chmod +x scripts/remote-deploy.sh"
    echo "3. Run: ./scripts/remote-deploy.sh deploy"
    echo "4. Configure your Discord bot in the Discord Developer Portal"
    echo "5. Update DNS to point to server IP: 10.10.10.210"
    exit 0
else
    echo -e "${YELLOW}⚠ Some checks failed. Please address the issues above.${NC}"
    echo ""
    echo -e "${BLUE}Required Actions:${NC}"
    
    if [ ! -d "node_modules" ]; then
        echo "• Run: npm install"
    fi
    
    if [ ! -d "dist" ]; then
        echo "• Run: npm run build"
    fi
    
    if [ ! -f ".env.production" ] || [ $CHECKS_FAILED -gt 0 ]; then
        echo "• Update .env.production with valid credentials"
    fi
    
    exit 1
fi