import { Pool, PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  ssl?: boolean | any;
}

interface QueryOptions {
  timeout?: number;
  transaction?: PoolClient;
}

export class PostgresAdapter extends EventEmitter {
  private static instance: PostgresAdapter;
  private pool: Pool;
  private config: DatabaseConfig;
  private isConnected: boolean = false;
  private queryCount: number = 0;
  private errorCount: number = 0;

  private constructor() {
    super();
    this.config = this.buildConfig();
    this.pool = new Pool(this.config);
    this.setupEventHandlers();
  }

  static getInstance(): PostgresAdapter {
    if (!PostgresAdapter.instance) {
      PostgresAdapter.instance = new PostgresAdapter();
    }
    return PostgresAdapter.instance;
  }

  private buildConfig(): DatabaseConfig {
    return {
      host: config.database?.host || process.env.DB_HOST || 'localhost',
      port: config.database?.port || parseInt(process.env.DB_PORT || '5432'),
      database: config.database?.name || process.env.DB_NAME || 'claude_discord',
      user: config.database?.user || process.env.DB_USER || 'postgres',
      password: config.database?.password || process.env.DB_PASSWORD || '',
      max: config.database?.maxConnections || 20,
      idleTimeoutMillis: config.database?.idleTimeout || 30000,
      connectionTimeoutMillis: config.database?.connectionTimeout || 2000,
      ssl: config.database?.ssl || process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (client) => {
      logger.debug('New database connection established');
      this.emit('connect', client);
    });

    this.pool.on('error', (err, client) => {
      logger.error('Database pool error:', err);
      this.errorCount++;
      this.emit('error', err);
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Client acquired from pool');
    });

    this.pool.on('remove', (client) => {
      logger.debug('Client removed from pool');
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.info('Connected to PostgreSQL database');
      this.emit('connected');
      
      // Run migrations
      await this.runMigrations();
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Disconnected from PostgreSQL database');
      this.emit('disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
      throw error;
    }
  }

  async query<T = any>(
    text: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const client = options?.transaction || this.pool;

    try {
      this.queryCount++;
      const result = await client.query<T>(text, params);
      
      const duration = Date.now() - start;
      logger.debug(`Query executed in ${duration}ms`, {
        query: text.substring(0, 100),
        rows: result.rowCount,
        duration
      });

      this.emit('query', {
        query: text,
        params,
        duration,
        rows: result.rowCount
      });

      return result;
    } catch (error) {
      this.errorCount++;
      logger.error('Query error:', error, {
        query: text,
        params
      });
      throw error;
    }
  }

  async transaction<T = any>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Session Management
  async createSession(data: any): Promise<any> {
    const query = `
      INSERT INTO sessions (id, user_id, type, status, config, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.query(query, [
      data.id,
      data.userId,
      data.type,
      data.status,
      JSON.stringify(data.config)
    ]);
    return result.rows[0];
  }

  async getSession(sessionId: string): Promise<any> {
    const query = 'SELECT * FROM sessions WHERE id = $1';
    const result = await this.query(query, [sessionId]);
    return result.rows[0];
  }

  async updateSession(sessionId: string, data: any): Promise<any> {
    const query = `
      UPDATE sessions 
      SET status = $2, config = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.query(query, [
      sessionId,
      data.status,
      JSON.stringify(data.config)
    ]);
    return result.rows[0];
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  async getUserSessions(userId: string): Promise<any[]> {
    const query = `
      SELECT * FROM sessions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await this.query(query, [userId]);
    return result.rows;
  }

  // User Management
  async createUser(data: any): Promise<any> {
    const query = `
      INSERT INTO users (id, discord_id, username, permissions, settings, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (discord_id) 
      DO UPDATE SET username = $3, updated_at = NOW()
      RETURNING *
    `;
    const result = await this.query(query, [
      data.id,
      data.discordId,
      data.username,
      JSON.stringify(data.permissions || []),
      JSON.stringify(data.settings || {})
    ]);
    return result.rows[0];
  }

  async getUser(userId: string): Promise<any> {
    const query = 'SELECT * FROM users WHERE id = $1 OR discord_id = $1';
    const result = await this.query(query, [userId]);
    return result.rows[0];
  }

  async updateUser(userId: string, data: any): Promise<any> {
    const query = `
      UPDATE users 
      SET permissions = $2, settings = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.query(query, [
      userId,
      JSON.stringify(data.permissions),
      JSON.stringify(data.settings)
    ]);
    return result.rows[0];
  }

  // Audit Logging
  async createAuditLog(data: any): Promise<void> {
    const query = `
      INSERT INTO audit_logs (user_id, action, resource, details, ip_address, timestamp)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;
    await this.query(query, [
      data.userId,
      data.action,
      data.resource,
      JSON.stringify(data.details),
      data.ipAddress
    ]);
  }

  async getAuditLogs(filters: any): Promise<any[]> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (filters.userId) {
      paramCount++;
      query += ` AND user_id = $${paramCount}`;
      params.push(filters.userId);
    }

    if (filters.action) {
      paramCount++;
      query += ` AND action = $${paramCount}`;
      params.push(filters.action);
    }

    if (filters.startDate) {
      paramCount++;
      query += ` AND timestamp >= $${paramCount}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      query += ` AND timestamp <= $${paramCount}`;
      params.push(filters.endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT 1000';
    
    const result = await this.query(query, params);
    return result.rows;
  }

  // Metrics
  async recordMetric(data: any): Promise<void> {
    const query = `
      INSERT INTO metrics (name, value, labels, timestamp)
      VALUES ($1, $2, $3, NOW())
    `;
    await this.query(query, [
      data.name,
      data.value,
      JSON.stringify(data.labels || {})
    ]);
  }

  async getMetrics(name: string, startTime: Date, endTime: Date): Promise<any[]> {
    const query = `
      SELECT * FROM metrics 
      WHERE name = $1 AND timestamp BETWEEN $2 AND $3
      ORDER BY timestamp DESC
    `;
    const result = await this.query(query, [name, startTime, endTime]);
    return result.rows;
  }

  // Migrations
  async runMigrations(): Promise<void> {
    try {
      // Create migrations table if not exists
      await this.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Run each migration
      const migrations = await this.getMigrations();
      for (const migration of migrations) {
        await this.runMigration(migration);
      }

      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Migration error:', error);
      throw error;
    }
  }

  private async getMigrations(): Promise<any[]> {
    // Migration definitions
    return [
      {
        name: '001_create_users_table',
        up: `
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            discord_id VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(255) NOT NULL,
            permissions JSONB DEFAULT '[]'::jsonb,
            settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_users_discord_id ON users(discord_id);
        `
      },
      {
        name: '002_create_sessions_table',
        up: `
          CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(255) PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL,
            config JSONB DEFAULT '{}'::jsonb,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            last_activity TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_sessions_user_id ON sessions(user_id);
          CREATE INDEX idx_sessions_status ON sessions(status);
        `
      },
      {
        name: '003_create_audit_logs_table',
        up: `
          CREATE TABLE IF NOT EXISTS audit_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id UUID REFERENCES users(id),
            action VARCHAR(100) NOT NULL,
            resource VARCHAR(255),
            details JSONB DEFAULT '{}'::jsonb,
            ip_address INET,
            timestamp TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
          CREATE INDEX idx_audit_logs_action ON audit_logs(action);
          CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
        `
      },
      {
        name: '004_create_organizations_table',
        up: `
          CREATE TABLE IF NOT EXISTS organizations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            plan VARCHAR(50) DEFAULT 'free',
            settings JSONB DEFAULT '{}'::jsonb,
            limits JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `
      },
      {
        name: '005_create_teams_table',
        up: `
          CREATE TABLE IF NOT EXISTS teams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_teams_organization_id ON teams(organization_id);
        `
      },
      {
        name: '006_create_team_members_table',
        up: `
          CREATE TABLE IF NOT EXISTS team_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(50) DEFAULT 'member',
            permissions JSONB DEFAULT '[]'::jsonb,
            joined_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(team_id, user_id)
          );
          CREATE INDEX idx_team_members_team_id ON team_members(team_id);
          CREATE INDEX idx_team_members_user_id ON team_members(user_id);
        `
      },
      {
        name: '007_create_api_keys_table',
        up: `
          CREATE TABLE IF NOT EXISTS api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            key_hash VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255),
            permissions JSONB DEFAULT '[]'::jsonb,
            last_used_at TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
          CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
        `
      },
      {
        name: '008_create_metrics_table',
        up: `
          CREATE TABLE IF NOT EXISTS metrics (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            value DOUBLE PRECISION NOT NULL,
            labels JSONB DEFAULT '{}'::jsonb,
            timestamp TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_metrics_name ON metrics(name);
          CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
        `
      },
      {
        name: '009_create_rbac_roles_table',
        up: `
          CREATE TABLE IF NOT EXISTS rbac_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            permissions JSONB DEFAULT '[]'::jsonb,
            is_system BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(organization_id, name)
          );
          CREATE INDEX idx_rbac_roles_organization_id ON rbac_roles(organization_id);
        `
      },
      {
        name: '010_create_user_roles_table',
        up: `
          CREATE TABLE IF NOT EXISTS user_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            role_id UUID REFERENCES rbac_roles(id) ON DELETE CASCADE,
            granted_by UUID REFERENCES users(id),
            granted_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP,
            UNIQUE(user_id, role_id)
          );
          CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
          CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
        `
      }
    ];
  }

  private async runMigration(migration: any): Promise<void> {
    // Check if migration already executed
    const result = await this.query(
      'SELECT * FROM migrations WHERE name = $1',
      [migration.name]
    );

    if (result.rows.length === 0) {
      logger.info(`Running migration: ${migration.name}`);
      
      await this.transaction(async (client) => {
        await client.query(migration.up);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
      });
      
      logger.info(`Migration completed: ${migration.name}`);
    }
  }

  // Performance optimization with prepared statements
  async prepare(name: string, text: string, values: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        name,
        text,
        values
      } as any);
    } finally {
      client.release();
    }
  }

  async execute(name: string, params: any[]): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      return await client.query(name, params);
    } finally {
      client.release();
    }
  }

  // Connection pool management
  getPoolStats(): any {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      queryCount: this.queryCount,
      errorCount: this.errorCount
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }
}