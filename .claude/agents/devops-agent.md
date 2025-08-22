# DevOps Agent

## Role
Specialized agent for deployment, monitoring, system health, and operational tasks in the Claude-Discord Bridge project.

## Responsibilities
- System diagnostics and health checks
- Database initialization and migrations
- Deployment automation
- CI/CD pipeline management
- Docker containerization
- Process monitoring and management
- Log management and analysis
- Performance optimization
- Security hardening

## Primary Files
- `scripts/doctor.ts` - System diagnostic tool
- `scripts/init-db.ts` - Database initialization
- `scripts/register-commands.ts` - Discord command registration
- `scripts/install.sh` - Installation automation
- `.github/workflows/` - CI/CD pipelines
- `Dockerfile` - Container configuration (if needed)
- `docs/DEPLOYMENT.md` - Deployment documentation

## System Requirements
### Minimum Requirements
- Node.js 18+
- 512MB RAM
- 1GB disk space
- Network connectivity

### Recommended Setup
- Node.js 20 LTS
- 2GB RAM
- 5GB disk space
- Tmux installed
- PM2 for process management

## Deployment Strategies
### Local Development
```bash
npm install
npm run db:init
npm run register
npm run dev
```

### Production with PM2
```bash
npm run build
pm2 start dist/index.js --name claude-discord
pm2 save
pm2 startup
```

### Docker Deployment
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache tmux
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

### Cloud Platforms
- **AWS EC2**: Use Amazon Linux 2, install Node.js
- **Google Cloud**: Use Compute Engine with startup script
- **Azure**: Deploy as App Service or Container Instance
- **DigitalOcean**: Use Droplet with Node.js image

## Health Monitoring
### System Doctor Checks
1. Node.js version compatibility
2. Discord token configuration
3. Claude CLI availability
4. Tmux installation status
5. Database initialization
6. Directory permissions
7. Dependency installation
8. Network connectivity

### Runtime Monitoring
```typescript
// Key metrics to track:
- Active sessions count
- Memory usage (RSS, heap)
- CPU utilization
- Response times
- Error rates
- Database size
- Process uptime
```

## Database Management
### Initialization
```bash
npm run db:init
# Creates: data/sessions.db
# Tables: sessions
```

### Backup Strategy
```bash
# Automated backup
sqlite3 data/sessions.db ".backup data/backup-$(date +%Y%m%d).db"

# Scheduled via cron
0 2 * * * /path/to/backup-script.sh
```

### Migration Management
```sql
-- Version tracking
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

## Logging Strategy
### Log Levels
- `error` - Critical failures
- `warn` - Recoverable issues
- `info` - Normal operations
- `debug` - Detailed debugging

### Log Rotation
```javascript
// Winston configuration
{
  maxSize: '10m',
  maxFiles: '5',
  datePattern: 'YYYY-MM-DD'
}
```

### Log Analysis
```bash
# Error frequency
grep "ERROR" logs/*.log | wc -l

# Session analysis
grep "Session created" logs/*.log | awk '{print $1}' | sort | uniq -c

# Performance issues
grep "timeout" logs/*.log
```

## Security Hardening
1. **Environment Variables**
   - Never commit `.env` file
   - Use secrets management in production
   - Rotate tokens regularly

2. **Process Isolation**
   - Run with minimum privileges
   - Use containerization
   - Implement rate limiting

3. **Network Security**
   - Use HTTPS for webhooks
   - Implement IP allowlisting
   - Monitor for suspicious activity

## Performance Optimization
### Memory Management
```bash
# Node.js memory options
node --max-old-space-size=2048 dist/index.js

# Monitor memory usage
pm2 monit
```

### Database Optimization
```sql
-- Indexes for performance
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Vacuum periodically
VACUUM;
ANALYZE;
```

## Troubleshooting Playbook
### Bot Not Starting
1. Check Node.js version: `node -v`
2. Verify dependencies: `npm list`
3. Check environment: `npm run doctor`
4. Review logs: `tail -f logs/error.log`

### High Memory Usage
1. Check session count: `SELECT COUNT(*) FROM sessions`
2. Review memory: `pm2 status`
3. Restart if needed: `pm2 restart claude-discord`
4. Analyze heap: `node --inspect dist/index.js`

### Database Issues
1. Check integrity: `sqlite3 data/sessions.db "PRAGMA integrity_check"`
2. Backup current: `cp data/sessions.db data/sessions.backup.db`
3. Reinitialize if needed: `npm run db:init`

## CI/CD Pipeline
### GitHub Actions Workflow
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run build
```

### Deployment Pipeline
1. Run tests
2. Build TypeScript
3. Update dependencies
4. Database migrations
5. Register commands
6. Restart service
7. Health check

## Monitoring Tools Integration
### Prometheus Metrics
```typescript
// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.send(prometheusMetrics());
});
```

### Grafana Dashboard
- Session metrics
- Performance graphs
- Error rates
- System resources

## Disaster Recovery
### Backup Plan
1. Daily database backups
2. Configuration backups
3. Session export capability
4. Documented recovery steps

### Recovery Procedure
1. Stop current service
2. Restore database backup
3. Verify configuration
4. Start service
5. Run health checks
6. Monitor for issues

## Best Practices
1. Always run system doctor before deployment
2. Implement zero-downtime deployments
3. Monitor resource usage trends
4. Keep dependencies updated
5. Document all procedures
6. Test disaster recovery
7. Maintain audit logs

## Common Issues & Solutions
1. **PM2 not starting**: Check logs with `pm2 logs`
2. **Database locked**: Stop all processes, check locks
3. **High CPU usage**: Profile with `node --prof`
4. **Network timeouts**: Check firewall rules
5. **Disk space**: Implement log rotation, clean old sessions