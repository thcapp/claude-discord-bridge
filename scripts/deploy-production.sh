#!/bin/bash
set -euo pipefail

# Production Deployment Script for Claude Discord Bridge
# Server: 10.10.10.210
# This script sets up a complete production environment

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_IP="10.10.10.210"
SERVER_USER="ubuntu"
SERVER_PASSWORD="ubuntu2025"
DOMAIN="bot.claude-discord.com"
REPO_URL="https://github.com/yourusername/claude-discord-bridge.git"
APP_DIR="/opt/claude-discord-bridge"
BACKUP_DIR="/var/backups/claude-discord"

# Logging
LOG_FILE="/var/log/claude-discord-deployment.log"
exec 1> >(tee -a ${LOG_FILE})
exec 2>&1

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     Claude Discord Bridge - Production Deployment${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Function to print colored messages
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Update system
update_system() {
    print_info "Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq
    apt-get autoremove -y -qq
    apt-get autoclean -qq
    print_status "System updated"
}

# Install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    
    # Essential packages
    apt-get install -y -qq \
        curl \
        wget \
        git \
        vim \
        htop \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        ufw \
        fail2ban \
        unzip \
        jq \
        net-tools \
        dnsutils \
        traceroute \
        mtr \
        iftop \
        iotop \
        sysstat \
        ncdu
    
    print_status "Dependencies installed"
}

# Install Docker
install_docker() {
    print_info "Installing Docker..."
    
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
        
        # Add user to docker group
        usermod -aG docker $SERVER_USER
        
        # Configure Docker daemon
        cat > /etc/docker/daemon.json <<EOF
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "50m",
        "max-file": "10"
    },
    "storage-driver": "overlay2",
    "metrics-addr": "127.0.0.1:9323",
    "experimental": true
}
EOF
        
        systemctl restart docker
        systemctl enable docker
        print_status "Docker installed"
    else
        print_warning "Docker already installed"
    fi
}

# Install Docker Compose
install_docker_compose() {
    print_info "Installing Docker Compose..."
    
    if ! command -v docker-compose &> /dev/null; then
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
            -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        print_status "Docker Compose installed"
    else
        print_warning "Docker Compose already installed"
    fi
}

# Install Node.js
install_nodejs() {
    print_info "Installing Node.js 20..."
    
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        
        # Install global packages
        npm install -g pm2 typescript tsx
        
        print_status "Node.js installed"
    else
        print_warning "Node.js already installed"
    fi
}

# Install PostgreSQL
install_postgresql() {
    print_info "Installing PostgreSQL 15..."
    
    if ! command -v psql &> /dev/null; then
        # Add PostgreSQL APT repository
        sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
        apt-get update -qq
        apt-get install -y postgresql-15 postgresql-client-15 postgresql-contrib-15
        
        # Configure PostgreSQL
        systemctl start postgresql
        systemctl enable postgresql
        
        # Create database and user
        sudo -u postgres psql <<EOF
CREATE USER claude WITH PASSWORD 'claudepass2025';
CREATE DATABASE claude_discord OWNER claude;
GRANT ALL PRIVILEGES ON DATABASE claude_discord TO claude;
ALTER USER claude CREATEDB;
EOF
        
        # Configure PostgreSQL for performance
        cat >> /etc/postgresql/15/main/postgresql.conf <<EOF

# Performance Tuning
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 4MB
min_wal_size = 1GB
max_wal_size = 4GB
EOF
        
        systemctl restart postgresql
        print_status "PostgreSQL installed and configured"
    else
        print_warning "PostgreSQL already installed"
    fi
}

# Install Redis
install_redis() {
    print_info "Installing Redis..."
    
    if ! command -v redis-server &> /dev/null; then
        apt-get install -y redis-server
        
        # Configure Redis
        cat >> /etc/redis/redis.conf <<EOF

# Custom Configuration
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
tcp-keepalive 60
timeout 300
EOF
        
        systemctl restart redis-server
        systemctl enable redis-server
        print_status "Redis installed and configured"
    else
        print_warning "Redis already installed"
    fi
}

# Install Nginx
install_nginx() {
    print_info "Installing Nginx..."
    
    if ! command -v nginx &> /dev/null; then
        apt-get install -y nginx certbot python3-certbot-nginx
        
        # Remove default site
        rm -f /etc/nginx/sites-enabled/default
        
        systemctl start nginx
        systemctl enable nginx
        print_status "Nginx installed"
    else
        print_warning "Nginx already installed"
    fi
}

# Configure firewall
configure_firewall() {
    print_info "Configuring firewall..."
    
    # Enable UFW
    ufw --force enable
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow monitoring ports from local network
    ufw allow from 10.0.0.0/8 to any port 3001  # Health
    ufw allow from 10.0.0.0/8 to any port 9090  # Prometheus
    ufw allow from 10.0.0.0/8 to any port 3002  # Grafana
    
    ufw reload
    print_status "Firewall configured"
}

# Configure fail2ban
configure_fail2ban() {
    print_info "Configuring fail2ban..."
    
    # Create jail configuration
    cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-noscript]
enabled = true
port = http,https
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 6

[nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 2

[nginx-noproxy]
enabled = true
port = http,https
filter = nginx-noproxy
logpath = /var/log/nginx/error.log
maxretry = 2
EOF
    
    systemctl restart fail2ban
    systemctl enable fail2ban
    print_status "Fail2ban configured"
}

# Setup application
setup_application() {
    print_info "Setting up application..."
    
    # Create application directory
    mkdir -p $APP_DIR
    cd $APP_DIR
    
    # Clone repository
    if [ ! -d ".git" ]; then
        git clone $REPO_URL .
    else
        git pull origin main
    fi
    
    # Create necessary directories
    mkdir -p data logs backups sandbox static nginx/sites-enabled monitoring/prometheus monitoring/grafana/dashboards
    
    # Set permissions
    chown -R $SERVER_USER:$SERVER_USER $APP_DIR
    chmod -R 755 $APP_DIR
    
    # Copy production configuration
    if [ ! -f ".env" ]; then
        cp .env.example .env
        print_warning "Please edit .env file with production values"
    fi
    
    print_status "Application setup complete"
}

# Setup SSL certificates
setup_ssl() {
    print_info "Setting up SSL certificates..."
    
    # Create nginx configuration for domain
    cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    server_name $DOMAIN grafana.$DOMAIN status.$DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF
    
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    
    # Obtain certificates
    certbot --nginx -d $DOMAIN -d grafana.$DOMAIN -d status.$DOMAIN \
        --non-interactive --agree-tos --email admin@$DOMAIN \
        --redirect --expand
    
    # Setup auto-renewal
    cat > /etc/cron.d/certbot <<EOF
0 0,12 * * * root certbot renew --quiet --no-self-upgrade --post-hook "systemctl reload nginx"
EOF
    
    print_status "SSL certificates configured"
}

# Deploy with Docker Compose
deploy_application() {
    print_info "Deploying application with Docker Compose..."
    
    cd $APP_DIR
    
    # Build images
    docker-compose -f docker-compose.production.yml build
    
    # Start services
    docker-compose -f docker-compose.production.yml up -d
    
    # Wait for services to be healthy
    sleep 30
    
    # Run database migrations
    docker-compose -f docker-compose.production.yml exec -T app npm run migrate
    
    # Register Discord commands
    docker-compose -f docker-compose.production.yml exec -T app npm run register
    
    print_status "Application deployed"
}

# Setup monitoring
setup_monitoring() {
    print_info "Setting up monitoring..."
    
    cd $APP_DIR
    
    # Create Prometheus configuration
    cat > monitoring/prometheus.yml <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

rule_files:
  - "alerts.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'app'
    static_configs:
      - targets: ['app:9090']
EOF
    
    # Create alert rules
    cat > monitoring/alerts.yml <<EOF
groups:
  - name: claude_discord
    interval: 30s
    rules:
      - alert: HighCPUUsage
        expr: rate(process_cpu_seconds_total[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High CPU usage detected
          
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 / 1024 > 1.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High memory usage detected
          
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Service is down
EOF
    
    print_status "Monitoring configured"
}

# Setup backups
setup_backups() {
    print_info "Setting up automated backups..."
    
    # Create backup script
    cat > $APP_DIR/scripts/backup-production.sh <<'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/claude-discord"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.tar.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker exec claude-discord-postgres pg_dump -U claude claude_discord | gzip > $BACKUP_DIR/db_${DATE}.sql.gz

# Backup application data
tar -czf $BACKUP_DIR/data_${DATE}.tar.gz -C /opt/claude-discord-bridge data/

# Backup Redis
docker exec claude-discord-redis redis-cli --rdb /tmp/redis_backup.rdb
docker cp claude-discord-redis:/tmp/redis_backup.rdb $BACKUP_DIR/redis_${DATE}.rdb

# Create combined backup
cd $BACKUP_DIR
tar -czf $BACKUP_FILE db_${DATE}.sql.gz data_${DATE}.tar.gz redis_${DATE}.rdb
rm -f db_${DATE}.sql.gz data_${DATE}.tar.gz redis_${DATE}.rdb

# Upload to S3 (if configured)
if [ ! -z "${S3_BACKUP_BUCKET:-}" ]; then
    aws s3 cp $BACKUP_FILE s3://$S3_BACKUP_BUCKET/
fi

# Clean old backups (keep last 30 days)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
EOF
    
    chmod +x $APP_DIR/scripts/backup-production.sh
    
    # Setup cron job for daily backups
    cat > /etc/cron.d/claude-discord-backup <<EOF
0 2 * * * root $APP_DIR/scripts/backup-production.sh >> /var/log/claude-discord-backup.log 2>&1
EOF
    
    print_status "Automated backups configured"
}

# Create systemd service
create_systemd_service() {
    print_info "Creating systemd service..."
    
    cat > /etc/systemd/system/claude-discord.service <<EOF
[Unit]
Description=Claude Discord Bridge
After=docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose -f docker-compose.production.yml up
ExecStop=/usr/local/bin/docker-compose -f docker-compose.production.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable claude-discord
    print_status "Systemd service created"
}

# Final setup
final_setup() {
    print_info "Performing final setup..."
    
    # Create swap file if needed
    if [ ! -f /swapfile ]; then
        fallocate -l 4G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        print_status "Swap file created"
    fi
    
    # Optimize system settings
    cat >> /etc/sysctl.conf <<EOF

# Network optimizations
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 10
net.ipv4.ip_local_port_range = 1024 65535

# Memory optimizations
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF
    
    sysctl -p
    
    print_status "System optimizations applied"
}

# Health check
health_check() {
    print_info "Running health checks..."
    
    # Check Docker services
    docker-compose -f $APP_DIR/docker-compose.production.yml ps
    
    # Check application health
    curl -s http://localhost:3001/health | jq '.'
    
    # Check database connection
    docker exec claude-discord-postgres pg_isready -U claude
    
    # Check Redis
    docker exec claude-discord-redis redis-cli ping
    
    print_status "Health checks completed"
}

# Main execution
main() {
    check_root
    
    echo -e "${BLUE}Starting deployment at $(date)${NC}"
    echo ""
    
    update_system
    install_dependencies
    install_docker
    install_docker_compose
    install_nodejs
    install_postgresql
    install_redis
    install_nginx
    configure_firewall
    configure_fail2ban
    setup_application
    setup_ssl
    deploy_application
    setup_monitoring
    setup_backups
    create_systemd_service
    final_setup
    health_check
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}     Deployment completed successfully!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Access points:${NC}"
    echo -e "  Main App:    https://$DOMAIN"
    echo -e "  Grafana:     https://grafana.$DOMAIN"
    echo -e "  Status:      https://status.$DOMAIN"
    echo -e "  Health:      https://$DOMAIN/health"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Edit .env file with production values"
    echo -e "  2. Configure Discord bot token and permissions"
    echo -e "  3. Setup monitoring alerts"
    echo -e "  4. Test all functionality"
    echo -e "  5. Configure backups to S3"
    echo ""
    echo -e "${GREEN}Deployment log saved to: $LOG_FILE${NC}"
}

# Run main function
main "$@"