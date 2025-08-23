#!/bin/bash
set -euo pipefail

# Remote Deployment Script for Claude Discord Bridge
# This script deploys the application to the production server

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVER_IP="10.10.10.210"
SERVER_USER="ubuntu"
SERVER_PASS="ubuntu2025"
REMOTE_DIR="/opt/claude-discord-bridge"
LOCAL_DIR="$(pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     Claude Discord Bridge - Remote Deployment${NC}"
echo -e "${BLUE}     Server: $SERVER_IP${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Function to execute remote commands
remote_exec() {
    sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP "$1"
}

# Function to copy files to remote
remote_copy() {
    sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no -r "$1" $SERVER_USER@$SERVER_IP:"$2"
}

# Check dependencies
check_dependencies() {
    echo -e "${BLUE}[1/10] Checking local dependencies...${NC}"
    
    if ! command -v sshpass &> /dev/null; then
        echo -e "${YELLOW}Installing sshpass...${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install hudochenkov/sshpass/sshpass
        else
            sudo apt-get install -y sshpass
        fi
    fi
    
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Git is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Dependencies checked${NC}"
}

# Prepare deployment package
prepare_package() {
    echo -e "${BLUE}[2/10] Preparing deployment package...${NC}"
    
    # Create deployment directory
    DEPLOY_DIR="/tmp/claude-discord-deploy-$TIMESTAMP"
    mkdir -p $DEPLOY_DIR
    
    # Copy necessary files
    cp -r src package*.json tsconfig.json $DEPLOY_DIR/
    cp -r scripts migrations public $DEPLOY_DIR/ 2>/dev/null || true
    cp docker-compose.production.yml $DEPLOY_DIR/docker-compose.yml
    cp .env.production $DEPLOY_DIR/.env
    cp -r nginx monitoring k8s $DEPLOY_DIR/ 2>/dev/null || true
    
    # Copy documentation
    cp README.md SETUP_GUIDE.md LAUNCH_GUIDE.md $DEPLOY_DIR/ 2>/dev/null || true
    
    # Create tarball
    cd /tmp
    tar -czf claude-discord-deploy-$TIMESTAMP.tar.gz claude-discord-deploy-$TIMESTAMP
    
    echo -e "${GREEN}✓ Package prepared${NC}"
}

# Upload package to server
upload_package() {
    echo -e "${BLUE}[3/10] Uploading package to server...${NC}"
    
    # Create remote directory
    remote_exec "sudo mkdir -p $REMOTE_DIR && sudo chown $SERVER_USER:$SERVER_USER $REMOTE_DIR"
    
    # Upload tarball
    remote_copy "/tmp/claude-discord-deploy-$TIMESTAMP.tar.gz" "/tmp/"
    
    # Extract on remote
    remote_exec "cd /tmp && tar -xzf claude-discord-deploy-$TIMESTAMP.tar.gz"
    remote_exec "cp -r /tmp/claude-discord-deploy-$TIMESTAMP/* $REMOTE_DIR/"
    remote_exec "rm -rf /tmp/claude-discord-deploy-$TIMESTAMP*"
    
    echo -e "${GREEN}✓ Package uploaded${NC}"
}

# Install dependencies on server
install_server_dependencies() {
    echo -e "${BLUE}[4/10] Installing server dependencies...${NC}"
    
    remote_exec "echo '$SERVER_PASS' | sudo -S apt-get update -qq"
    remote_exec "echo '$SERVER_PASS' | sudo -S apt-get install -y -qq docker.io docker-compose nginx certbot python3-certbot-nginx postgresql-client redis-tools"
    
    # Install Node.js
    remote_exec "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    remote_exec "echo '$SERVER_PASS' | sudo -S apt-get install -y nodejs"
    
    # Add user to docker group
    remote_exec "echo '$SERVER_PASS' | sudo -S usermod -aG docker $SERVER_USER"
    
    echo -e "${GREEN}✓ Dependencies installed${NC}"
}

# Setup Docker containers
setup_docker() {
    echo -e "${BLUE}[5/10] Setting up Docker containers...${NC}"
    
    # Start Docker service
    remote_exec "echo '$SERVER_PASS' | sudo -S systemctl start docker"
    remote_exec "echo '$SERVER_PASS' | sudo -S systemctl enable docker"
    
    # Build and start containers
    remote_exec "cd $REMOTE_DIR && docker-compose build"
    remote_exec "cd $REMOTE_DIR && docker-compose up -d"
    
    # Wait for containers to be healthy
    echo "Waiting for containers to be healthy..."
    sleep 30
    
    echo -e "${GREEN}✓ Docker containers running${NC}"
}

# Setup database
setup_database() {
    echo -e "${BLUE}[6/10] Setting up database...${NC}"
    
    # Run migrations
    remote_exec "cd $REMOTE_DIR && docker-compose exec -T app npm run migrate || true"
    
    # Seed initial data if needed
    remote_exec "cd $REMOTE_DIR && docker-compose exec -T app npm run seed || true"
    
    echo -e "${GREEN}✓ Database configured${NC}"
}

# Configure Nginx
configure_nginx() {
    echo -e "${BLUE}[7/10] Configuring Nginx...${NC}"
    
    # Copy nginx configuration
    remote_exec "echo '$SERVER_PASS' | sudo -S cp $REMOTE_DIR/nginx/nginx.conf /etc/nginx/nginx.conf"
    
    # Create site configuration
    remote_exec "echo '$SERVER_PASS' | sudo -S tee /etc/nginx/sites-available/claude-discord > /dev/null << 'EOF'
server {
    listen 80;
    server_name $SERVER_IP;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_cache_bypass \\\$http_upgrade;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
    
    location /health {
        proxy_pass http://localhost:3001/health;
    }
    
    location /metrics {
        proxy_pass http://localhost:9090/metrics;
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        deny all;
    }
}
EOF"
    
    # Enable site
    remote_exec "echo '$SERVER_PASS' | sudo -S ln -sf /etc/nginx/sites-available/claude-discord /etc/nginx/sites-enabled/"
    remote_exec "echo '$SERVER_PASS' | sudo -S rm -f /etc/nginx/sites-enabled/default"
    
    # Restart Nginx
    remote_exec "echo '$SERVER_PASS' | sudo -S nginx -t"
    remote_exec "echo '$SERVER_PASS' | sudo -S systemctl restart nginx"
    
    echo -e "${GREEN}✓ Nginx configured${NC}"
}

# Setup firewall
setup_firewall() {
    echo -e "${BLUE}[8/10] Configuring firewall...${NC}"
    
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw --force enable"
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw default deny incoming"
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw default allow outgoing"
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw allow 22/tcp"
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw allow 80/tcp"
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw allow 443/tcp"
    remote_exec "echo '$SERVER_PASS' | sudo -S ufw reload"
    
    echo -e "${GREEN}✓ Firewall configured${NC}"
}

# Setup monitoring
setup_monitoring() {
    echo -e "${BLUE}[9/10] Setting up monitoring...${NC}"
    
    # Check if Prometheus is running
    remote_exec "cd $REMOTE_DIR && docker-compose ps | grep prometheus"
    
    # Check if Grafana is running
    remote_exec "cd $REMOTE_DIR && docker-compose ps | grep grafana"
    
    echo -e "${GREEN}✓ Monitoring services running${NC}"
}

# Health check
health_check() {
    echo -e "${BLUE}[10/10] Running health checks...${NC}"
    
    # Check application health
    HEALTH_RESPONSE=$(remote_exec "curl -s http://localhost:3001/health || echo 'FAILED'")
    
    if [[ "$HEALTH_RESPONSE" == *"FAILED"* ]]; then
        echo -e "${RED}✗ Health check failed${NC}"
        echo "Response: $HEALTH_RESPONSE"
        
        # Show container logs
        echo -e "${YELLOW}Container logs:${NC}"
        remote_exec "cd $REMOTE_DIR && docker-compose logs --tail=50 app"
        
        exit 1
    else
        echo -e "${GREEN}✓ Application is healthy${NC}"
        echo "$HEALTH_RESPONSE" | python3 -m json.tool
    fi
    
    # Check all containers
    echo -e "${BLUE}Container status:${NC}"
    remote_exec "cd $REMOTE_DIR && docker-compose ps"
}

# Cleanup
cleanup() {
    echo -e "${BLUE}Cleaning up...${NC}"
    rm -rf /tmp/claude-discord-deploy-$TIMESTAMP*
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Rollback function
rollback() {
    echo -e "${RED}Rolling back deployment...${NC}"
    remote_exec "cd $REMOTE_DIR && docker-compose down"
    remote_exec "cd $REMOTE_DIR && git checkout HEAD~1 || true"
    remote_exec "cd $REMOTE_DIR && docker-compose up -d"
    echo -e "${YELLOW}Rollback completed${NC}"
}

# Main execution
main() {
    # Trap errors for rollback
    trap 'rollback' ERR
    
    check_dependencies
    prepare_package
    upload_package
    install_server_dependencies
    setup_docker
    setup_database
    configure_nginx
    setup_firewall
    setup_monitoring
    health_check
    cleanup
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}     Deployment Successful!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Access Points:${NC}"
    echo -e "  Web Interface:  http://$SERVER_IP"
    echo -e "  Health Check:   http://$SERVER_IP/health"
    echo -e "  Metrics:        http://$SERVER_IP/metrics (restricted)"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "  1. Configure DNS to point to $SERVER_IP"
    echo -e "  2. Set up SSL certificates with Let's Encrypt"
    echo -e "  3. Update Discord bot token in .env file"
    echo -e "  4. Configure monitoring alerts"
    echo -e "  5. Test all bot commands in Discord"
    echo ""
    echo -e "${GREEN}Deployment completed at $(date)${NC}"
}

# Parse command line arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback
        ;;
    health)
        health_check
        ;;
    logs)
        remote_exec "cd $REMOTE_DIR && docker-compose logs -f --tail=100 ${2:-app}"
        ;;
    restart)
        remote_exec "cd $REMOTE_DIR && docker-compose restart ${2:-}"
        ;;
    stop)
        remote_exec "cd $REMOTE_DIR && docker-compose stop"
        ;;
    start)
        remote_exec "cd $REMOTE_DIR && docker-compose start"
        ;;
    status)
        remote_exec "cd $REMOTE_DIR && docker-compose ps"
        ;;
    shell)
        sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|logs|restart|stop|start|status|shell}"
        exit 1
        ;;
esac