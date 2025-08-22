# 🚀 Claude Discord Bridge - Launch Guide

## Production Launch Checklist

### ✅ Pre-Launch Requirements

#### Discord Setup
- [ ] Bot created in Discord Developer Portal
- [ ] Bot token secured
- [ ] Required intents enabled (Message Content, Server Members)
- [ ] Bot invited to test server
- [ ] Permissions verified (534723947584)

#### Environment Configuration
- [ ] Production `.env` file created
- [ ] All secrets properly set
- [ ] Rate limits configured
- [ ] Security features enabled
- [ ] Backup encryption key generated

#### Infrastructure
- [ ] Server/hosting platform ready
- [ ] Domain configured (if using webhooks)
- [ ] SSL certificates obtained
- [ ] Firewall rules configured
- [ ] Monitoring stack deployed

### 🏗️ Deployment Options

## Option 1: Docker Deployment (Recommended)

```bash
# 1. Build the image
docker build -t claude-discord-bridge:latest .

# 2. Run with docker-compose
docker-compose up -d

# 3. View logs
docker-compose logs -f claude-discord

# 4. Health check
curl http://localhost:3001/health
```

## Option 2: Kubernetes Deployment

```bash
# 1. Create namespace
kubectl create namespace discord-bots

# 2. Create secrets (edit k8s/secret.yaml first)
kubectl apply -f k8s/secret.yaml

# 3. Deploy application
kubectl apply -f k8s/

# 4. Check deployment
kubectl get pods -n discord-bots
kubectl logs -n discord-bots -l app=claude-discord-bridge

# 5. Port forward for testing
kubectl port-forward -n discord-bots svc/claude-discord-bridge 3001:3001
```

## Option 3: PM2 Deployment

```bash
# 1. Install dependencies
npm ci --only=production

# 2. Build TypeScript
npm run build

# 3. Run database migrations
npm run migrate up

# 4. Start with PM2
pm2 start ecosystem.config.js --env production

# 5. Save PM2 configuration
pm2 save
pm2 startup

# 6. Monitor
pm2 monit
```

## Option 4: SystemD Service

```bash
# 1. Copy service file
sudo cp claude-discord.service /etc/systemd/system/

# 2. Reload systemd
sudo systemctl daemon-reload

# 3. Enable and start service
sudo systemctl enable claude-discord
sudo systemctl start claude-discord

# 4. Check status
sudo systemctl status claude-discord
sudo journalctl -u claude-discord -f
```

### 📊 Post-Launch Monitoring

#### Health Checks
```bash
# Basic health
curl http://localhost:3001/health

# Readiness check
curl http://localhost:3001/ready

# Detailed status
curl http://localhost:3001/status

# Prometheus metrics
curl http://localhost:3001/metrics
```

#### Log Monitoring
```bash
# Application logs
tail -f logs/bot-*.log

# Error logs only
tail -f logs/error-*.log

# PM2 logs
pm2 logs claude-discord-bridge

# Docker logs
docker logs -f claude-discord-bot

# Kubernetes logs
kubectl logs -f -n discord-bots -l app=claude-discord-bridge
```

### 🔒 Security Checklist

- [ ] Change default passwords
- [ ] Enable rate limiting
- [ ] Configure firewall rules
- [ ] Set up fail2ban (optional)
- [ ] Enable audit logging
- [ ] Configure backup encryption
- [ ] Review allowed user IDs
- [ ] Test command sandboxing
- [ ] Verify webhook signatures

### 🎯 Performance Tuning

#### Database Optimization
```sql
-- Run in SQLite console
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = MEMORY;
VACUUM;
ANALYZE;
```

#### Node.js Optimization
```bash
# Set memory limit
NODE_OPTIONS="--max-old-space-size=2048" npm start

# Enable cluster mode (PM2)
pm2 start ecosystem.config.js -i max
```

#### Discord.js Optimization
```javascript
// In config.ts
intents: [
  // Only enable required intents
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  // Remove unused intents
]

// Cache settings
makeCache: Options.cacheWithLimits({
  MessageManager: 100,
  PresenceManager: 0,
  // Adjust based on needs
})
```

### 🚨 Troubleshooting

#### Bot Not Responding
```bash
# Check if process is running
ps aux | grep node
pm2 list

# Check Discord connection
curl http://localhost:3001/health | jq .checks.discord

# Review recent logs
tail -100 logs/error-*.log
```

#### High Memory Usage
```bash
# Check memory usage
pm2 monit
docker stats

# Force garbage collection (PM2)
pm2 trigger claude-discord-bridge gc

# Restart if needed
pm2 restart claude-discord-bridge
```

#### Database Issues
```bash
# Check database integrity
sqlite3 data/sessions.db "PRAGMA integrity_check;"

# Backup and restore
npm run backup create
npm run backup restore backups/latest.tar.gz

# Run migrations
npm run migrate status
npm run migrate up
```

### 📈 Scaling Guidelines

#### When to Scale
- CPU usage consistently > 70%
- Memory usage > 80%
- Response time > 2 seconds
- Queue depth increasing

#### Horizontal Scaling (Kubernetes)
```yaml
# Edit HPA settings
kubectl edit hpa claude-discord-bridge -n discord-bots

# Manual scaling
kubectl scale deployment claude-discord-bridge --replicas=3 -n discord-bots
```

#### Vertical Scaling (Increase Resources)
```yaml
# Edit deployment resources
resources:
  requests:
    memory: "1Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "4000m"
```

### 📦 Backup & Recovery

#### Automated Backups
```bash
# Configure in .env
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_ENCRYPTION_KEY=your-strong-key

# Manual backup
npm run backup create -- --encrypt

# List backups
npm run backup list

# Restore
npm run backup restore backups/backup-full-2024-01-22.tar.gz.enc
```

#### Disaster Recovery Plan
1. **Regular Backups**: Daily automated, weekly manual
2. **Off-site Storage**: Copy backups to S3/GCS
3. **Test Restores**: Monthly restore tests
4. **Documentation**: Keep configs in version control
5. **Monitoring**: Alert on backup failures

### 🎉 Launch Day Tasks

1. **Final Testing**
   - [ ] Test all commands in production
   - [ ] Verify webhook integration
   - [ ] Check monitoring endpoints
   - [ ] Test backup/restore

2. **Communication**
   - [ ] Announce in Discord server
   - [ ] Update documentation
   - [ ] Create support channel
   - [ ] Share in relevant communities

3. **Monitoring**
   - [ ] Watch logs closely
   - [ ] Monitor metrics dashboard
   - [ ] Be ready to rollback
   - [ ] Document any issues

### 📞 Support Channels

- **GitHub Issues**: [Report bugs](https://github.com/yourusername/claude-discord-bridge/issues)
- **Discord Server**: [Join community](https://discord.gg/yourinvite)
- **Documentation**: [Read the docs](./docs/README.md)
- **Email**: support@claude-discord-bridge.com

### 🎊 Congratulations!

Your Claude Discord Bridge is now live! Remember to:
- Monitor performance for the first 24-48 hours
- Gather user feedback
- Address any critical issues immediately
- Plan for iterative improvements

Thank you for using Claude Discord Bridge! 🚀