# Deployment Guide

## Table of Contents
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [VPS Deployment](#vps-deployment)
- [Docker Deployment](#docker-deployment)
- [Cloud Platforms](#cloud-platforms)
- [Environment Configuration](#environment-configuration)
- [Security Best Practices](#security-best-practices)
- [Monitoring & Maintenance](#monitoring--maintenance)

## Local Development

### Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/claude-discord-bridge.git
cd claude-discord-bridge

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Initialize database
npm run db:init

# Register Discord commands
npm run register

# Start in development mode
npm run dev
```

### Development Tools

Use these tools for local development:

```bash
# Watch mode with auto-reload
npm run dev

# Run specific file
npx tsx src/test-script.ts

# Debug mode
NODE_ENV=development LOG_LEVEL=debug npm run dev

# Test bot commands
npm run test:cli
```

## Production Deployment

### Prerequisites

- Node.js 18+ installed
- Claude Code CLI configured
- Discord bot token
- PM2 for process management (recommended)
- Nginx for reverse proxy (optional)

### Basic Production Setup

```bash
# Build TypeScript
npm run build

# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name claude-discord

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'claude-discord',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
```

Start with ecosystem file:
```bash
pm2 start ecosystem.config.js
```

## VPS Deployment

### Ubuntu/Debian Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build essentials
sudo apt install -y build-essential git tmux

# Install Claude Code CLI
# Follow instructions from https://claude.ai/code

# Clone repository
cd /opt
sudo git clone https://github.com/yourusername/claude-discord-bridge.git
sudo chown -R $USER:$USER claude-discord-bridge
cd claude-discord-bridge

# Install dependencies
npm install

# Build
npm run build

# Setup environment
cp .env.example .env
nano .env  # Configure your settings

# Initialize database
npm run db:init

# Register commands
npm run register

# Install PM2
sudo npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save
sudo pm2 startup
```

### Systemd Service (Alternative to PM2)

Create `/etc/systemd/system/claude-discord.service`:

```ini
[Unit]
Description=Claude Discord Bridge Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/claude-discord-bridge
ExecStart=/usr/bin/node /opt/claude-discord-bridge/dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/claude-discord/bot.log
StandardError=append:/var/log/claude-discord/error.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable claude-discord
sudo systemctl start claude-discord
sudo systemctl status claude-discord
```

## Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-slim

# Install dependencies for node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    tmux \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build TypeScript
RUN npm run build

# Create data and logs directories
RUN mkdir -p data logs

# Expose metrics port (optional)
EXPOSE 9090

# Run the bot
CMD ["node", "dist/index.js"]
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  claude-discord:
    build: .
    container_name: claude-discord-bridge
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - /usr/bin/claude-code:/usr/bin/claude-code:ro
    environment:
      - NODE_ENV=production
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Build and run:
```bash
# Build image
docker-compose build

# Start container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

## Cloud Platforms

### AWS EC2

1. **Launch EC2 Instance**
   - Choose Ubuntu 22.04 LTS
   - Select t2.micro or larger
   - Configure security group (no inbound rules needed)

2. **Connect and Setup**
```bash
# Connect to instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Follow VPS deployment steps above
```

3. **Optional: Use AWS Systems Manager for logs**
```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

### DigitalOcean Droplet

1. **Create Droplet**
   - Choose Ubuntu 22.04
   - Select Basic plan ($6/month minimum)
   - Add SSH keys

2. **Initial Setup**
```bash
# Connect
ssh root@your-droplet-ip

# Create user
adduser claude
usermod -aG sudo claude
su - claude

# Follow VPS deployment steps
```

3. **Setup Firewall**
```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

### Google Cloud Platform

1. **Create Compute Engine Instance**
   - Choose e2-micro (free tier eligible)
   - Select Ubuntu 22.04 LTS
   - Allow HTTPS traffic

2. **Deploy Application**
```bash
# SSH into instance
gcloud compute ssh instance-name

# Follow VPS deployment steps
```

3. **Setup Logging**
```bash
# Logs automatically available in Cloud Logging
# View with: gcloud logging read
```

### Heroku (Limited Support)

Note: Heroku's ephemeral filesystem makes SQLite challenging. Consider external database.

```bash
# Create app
heroku create claude-discord-bridge

# Set buildpacks
heroku buildpacks:add heroku/nodejs

# Set environment variables
heroku config:set DISCORD_TOKEN=your_token
heroku config:set DISCORD_CLIENT_ID=your_client_id

# Deploy
git push heroku main
```

## Environment Configuration

### Production Environment Variables

```env
# Required
DISCORD_TOKEN=your_production_token
DISCORD_CLIENT_ID=your_client_id

# Security
ALLOWED_USER_IDS=comma,separated,ids
ALLOWED_ROLE_IDS=role1,role2

# Performance
MAX_SESSIONS=20
DEFAULT_TIMEOUT=600
SESSION_TYPE=tmux

# Features
ENABLE_STREAMING=true
ENABLE_PERSISTENCE=true
ENABLE_THREADING=true
AUTO_CREATE_THREADS=false

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/claude-discord/bot.log

# Database
DATABASE_PATH=/var/lib/claude-discord/sessions.db
```

### Secrets Management

**Never commit secrets!** Use environment variables or secret management services:

```bash
# Using dotenv for local development
npm install dotenv

# Using AWS Secrets Manager
aws secretsmanager create-secret --name claude-discord --secret-string file://.env

# Using HashiCorp Vault
vault kv put secret/claude-discord @.env
```

## Security Best Practices

### 1. User Restrictions

Always restrict bot access in production:

```env
ALLOWED_USER_IDS=123456789,987654321
ALLOWED_ROLE_IDS=admin_role_id
```

### 2. File Permissions

```bash
# Restrict file permissions
chmod 600 .env
chmod 700 data/
chmod 700 logs/

# Set proper ownership
chown -R claude:claude /opt/claude-discord-bridge
```

### 3. Network Security

- Don't expose unnecessary ports
- Use firewall rules
- Consider VPN for management access

```bash
# UFW firewall setup
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw enable
```

### 4. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js dependencies
npm audit
npm update

# Update bot code
git pull
npm install
npm run build
pm2 restart claude-discord
```

### 5. Backup Strategy

```bash
# Backup script (backup.sh)
#!/bin/bash
BACKUP_DIR="/backup/claude-discord"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp data/sessions.db $BACKUP_DIR/sessions_$DATE.db

# Backup environment
cp .env $BACKUP_DIR/env_$DATE

# Compress old backups
find $BACKUP_DIR -type f -mtime +7 -name "*.db" -exec gzip {} \;

# Delete backups older than 30 days
find $BACKUP_DIR -type f -mtime +30 -delete
```

Add to crontab:
```bash
0 2 * * * /opt/claude-discord-bridge/backup.sh
```

## Monitoring & Maintenance

### Health Checks

Create `healthcheck.js`:

```javascript
const http = require('http');
const { Client } = require('discord.js');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    // Check bot status
    const isReady = client.isReady();
    const status = isReady ? 200 : 503;
    res.writeHead(status);
    res.end(JSON.stringify({ 
      status: isReady ? 'healthy' : 'unhealthy',
      timestamp: Date.now()
    }));
  }
});

server.listen(9090);
```

### Monitoring with PM2

```bash
# Install PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5

# View metrics
pm2 monit

# Web dashboard
pm2 install pm2-webui
pm2 conf pm2-webui:port 8080
```

### Log Management

```bash
# Rotate logs with logrotate
sudo nano /etc/logrotate.d/claude-discord
```

```
/var/log/claude-discord/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 claude claude
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Monitoring Services

1. **UptimeRobot** - Free uptime monitoring
2. **Better Stack** - Log management and uptime
3. **Datadog** - Comprehensive monitoring
4. **New Relic** - Application performance monitoring

### Alerts

Set up alerts for:
- Bot offline
- High error rate
- Database size
- Memory usage
- Disk space

Example alert script:
```bash
#!/bin/bash
# Check if bot is running
if ! pm2 list | grep -q "online.*claude-discord"; then
    # Send alert (email, Discord webhook, etc.)
    curl -X POST $WEBHOOK_URL -H "Content-Type: application/json" \
        -d '{"content":"⚠️ Claude Discord Bot is offline!"}'
fi
```

## Troubleshooting Deployment

### Common Issues

1. **Bot not starting**
   - Check logs: `pm2 logs`
   - Verify token: `node -e "console.log(process.env.DISCORD_TOKEN)"`
   - Check Node version: `node --version`

2. **Database errors**
   - Check permissions: `ls -la data/`
   - Verify disk space: `df -h`
   - Reinitialize: `npm run db:init`

3. **Command registration failed**
   - Verify client ID
   - Check bot permissions
   - Try guild-specific registration first

4. **High memory usage**
   - Limit sessions: `MAX_SESSIONS=5`
   - Restart periodically: `pm2 restart claude-discord --cron "0 */6 * * *"`
   - Monitor with: `pm2 monit`

### Recovery Procedures

```bash
# Full restart procedure
pm2 stop claude-discord
pm2 delete claude-discord
git pull
npm install
npm run build
npm run db:init
pm2 start ecosystem.config.js
pm2 save
```

## Performance Optimization

### Node.js Optimization

```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=2048" node dist/index.js

# Enable production mode
NODE_ENV=production node dist/index.js
```

### Database Optimization

```sql
-- Vacuum database periodically
VACUUM;

-- Analyze for query optimization
ANALYZE;
```

### Caching Strategy

Implement Redis for session caching (optional):

```bash
# Install Redis
sudo apt install redis-server

# Configure in .env
REDIS_URL=redis://localhost:6379
```

## Scaling Considerations

### Horizontal Scaling

For multiple bot instances:

1. Use external database (PostgreSQL/MySQL)
2. Implement Redis for session state
3. Use load balancer for webhooks
4. Shard Discord bot for large servers

### Vertical Scaling

Upgrade resources as needed:
- CPU: 2+ cores for heavy usage
- RAM: 2GB+ for multiple sessions
- Storage: SSD recommended
- Network: Stable connection essential

---

For platform-specific deployment guides, see:
- [AWS Deployment](deployment/aws.md)
- [Azure Deployment](deployment/azure.md)
- [GCP Deployment](deployment/gcp.md)
- [DigitalOcean Deployment](deployment/digitalocean.md)