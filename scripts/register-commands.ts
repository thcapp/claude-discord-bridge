import * as dotenv from 'dotenv';
import { registerCommands } from '../src/discord/commands';
import { config, validateConfig } from '../src/config';
import { logger } from '../src/utils/logger';

dotenv.config();

async function main() {
  console.log('🚀 Registering Discord commands...');
  
  if (!validateConfig()) {
    console.error('❌ Invalid configuration. Please check your .env file.');
    process.exit(1);
  }
  
  try {
    await registerCommands(
      config.discord.token,
      config.discord.clientId,
      config.discord.guildId
    );
    
    console.log('✅ Commands registered successfully!');
    
    if (config.discord.guildId) {
      console.log(`📍 Registered to guild: ${config.discord.guildId}`);
    } else {
      console.log('🌍 Registered globally (may take up to 1 hour to propagate)');
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
    process.exit(1);
  }
}

main();