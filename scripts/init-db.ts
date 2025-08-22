import * as dotenv from 'dotenv';
import Database from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../src/config';

dotenv.config();

async function initializeDatabase() {
  console.log('💾 Initializing database...');
  
  const dbPath = path.resolve(config.database.path);
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 Created directory: ${dbDir}`);
  }
  
  const db = new Database.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Failed to open database:', err);
      process.exit(1);
    }
    
    console.log(`✅ Database opened: ${dbPath}`);
    
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          status TEXT NOT NULL,
          model TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          data TEXT
        )
      `, (err) => {
        if (err) {
          console.error('❌ Failed to create sessions table:', err);
          process.exit(1);
        }
        console.log('✅ Sessions table created');
      });
      
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
      `, (err) => {
        if (err) {
          console.error('❌ Failed to create index:', err);
        } else {
          console.log('✅ Indexes created');
        }
      });
      
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
      `, (err) => {
        if (err) {
          console.error('❌ Failed to create messages table:', err);
          process.exit(1);
        }
        console.log('✅ Messages table created');
      });
      
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)
      `, (err) => {
        if (err) {
          console.error('❌ Failed to create message index:', err);
        } else {
          console.log('✅ Message indexes created');
        }
      });
      
      db.get('SELECT COUNT(*) as count FROM sessions', (err, row: any) => {
        if (err) {
          console.error('❌ Failed to count sessions:', err);
        } else {
          console.log(`📊 Current sessions in database: ${row.count}`);
        }
        
        db.close((err) => {
          if (err) {
            console.error('❌ Failed to close database:', err);
          } else {
            console.log('✅ Database initialization complete!');
          }
        });
      });
    });
  });
}

initializeDatabase();