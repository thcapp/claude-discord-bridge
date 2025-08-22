import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} from 'discord.js';
import { SessionManager } from '../../claude/session-manager';
import { logger } from '../../utils/logger';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const webCommand = {
  data: new SlashCommandBuilder()
    .setName('web')
    .setDescription('Web search and fetch operations')
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Search the web for current information')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Search query')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of results (default: 5)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Search type')
            .setRequired(false)
            .addChoices(
              { name: 'General', value: 'general' },
              { name: 'Documentation', value: 'docs' },
              { name: 'Stack Overflow', value: 'stackoverflow' },
              { name: 'GitHub', value: 'github' },
              { name: 'NPM Packages', value: 'npm' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('fetch')
        .setDescription('Fetch and analyze a webpage')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('URL to fetch')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('extract')
            .setDescription('What to extract')
            .setRequired(false)
            .addChoices(
              { name: 'Full Content', value: 'full' },
              { name: 'Main Content', value: 'main' },
              { name: 'Code Blocks', value: 'code' },
              { name: 'Links', value: 'links' },
              { name: 'Images', value: 'images' },
              { name: 'Metadata', value: 'meta' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('docs')
        .setDescription('Search documentation for a technology')
        .addStringOption(option =>
          option
            .setName('technology')
            .setDescription('Technology/framework name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('topic')
            .setDescription('Specific topic to search')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('api')
        .setDescription('Make an API request')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('API endpoint URL')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('method')
            .setDescription('HTTP method')
            .setRequired(false)
            .addChoices(
              { name: 'GET', value: 'GET' },
              { name: 'POST', value: 'POST' },
              { name: 'PUT', value: 'PUT' },
              { name: 'DELETE', value: 'DELETE' },
              { name: 'PATCH', value: 'PATCH' }
            )
        )
        .addStringOption(option =>
          option
            .setName('headers')
            .setDescription('Headers (JSON format)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('body')
            .setDescription('Request body (JSON format)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('scrape')
        .setDescription('Scrape specific data from a webpage')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('URL to scrape')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('selector')
            .setDescription('CSS selector to target')
            .setRequired(true)
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    const subcommand = interaction.options.getSubcommand();
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    
    if (!session) {
      await interaction.reply({
        content: '❌ No active session. Use `/claude chat` to start.',
        ephemeral: true
      });
      return;
    }

    switch (subcommand) {
      case 'search':
        await this.handleSearch(interaction, session);
        break;
      case 'fetch':
        await this.handleFetch(interaction, session);
        break;
      case 'docs':
        await this.handleDocs(interaction, session);
        break;
      case 'api':
        await this.handleAPI(interaction, session);
        break;
      case 'scrape':
        await this.handleScrape(interaction, session);
        break;
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, sessionManager: SessionManager) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'technology') {
      const technologies = [
        'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Svelte',
        'Node.js', 'Express', 'Fastify', 'NestJS', 'Koa',
        'TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust',
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite',
        'Docker', 'Kubernetes', 'AWS', 'Google Cloud', 'Azure',
        'Git', 'GitHub', 'GitLab', 'Bitbucket',
        'Jest', 'Mocha', 'Cypress', 'Playwright',
        'Webpack', 'Vite', 'Rollup', 'Parcel',
        'TailwindCSS', 'Bootstrap', 'Material-UI', 'Chakra UI'
      ];
      
      const filtered = technologies
        .filter(t => t.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map(t => ({ name: t, value: t.toLowerCase() }));
      
      await interaction.respond(filtered);
    }
  },

  async handleSearch(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const query = interaction.options.getString('query', true);
    const limit = interaction.options.getInteger('limit') || 5;
    const searchType = interaction.options.getString('type') || 'general';
    
    try {
      // Simulated search results (in production, integrate with actual search API)
      const searchQuery = this.buildSearchQuery(query, searchType);
      const results = await this.performWebSearch(searchQuery, limit);
      
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Web Search: ${query}`)
        .setColor(0x4285F4)
        .setDescription(`Found ${results.length} results for "${query}"`);
      
      results.forEach((result, index) => {
        embed.addFields({
          name: `${index + 1}. ${result.title}`,
          value: `${result.snippet}\n[🔗 Link](${result.url})`,
          inline: false
        });
      });
      
      // Add action buttons
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`web_search_refine_${query}`)
            .setLabel('Refine Search')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔍'),
          new ButtonBuilder()
            .setCustomId(`web_search_claude_${query}`)
            .setLabel('Analyze with Claude')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🤖'),
          new ButtonBuilder()
            .setCustomId(`web_search_more_${query}`)
            .setLabel('More Results')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➕')
        );
      
      await interaction.editReply({ 
        embeds: [embed],
        components: [row]
      });
      
      // Send search results to Claude for context
      const searchContext = results
        .map(r => `${r.title}\n${r.url}\n${r.snippet}`)
        .join('\n\n');
      
      await session.sendMessage(
        `Web search results for "${query}":\n\n${searchContext}`
      );
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error performing search: ${error.message}`
      });
    }
  },

  async handleFetch(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const url = interaction.options.getString('url', true);
    const extractType = interaction.options.getString('extract') || 'main';
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Claude-Discord-Bridge)'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      let content = '';
      
      switch (extractType) {
        case 'full':
          content = $('body').text().trim();
          break;
        case 'main':
          // Try to find main content area
          const mainSelectors = ['main', 'article', '.content', '#content', '.main'];
          for (const selector of mainSelectors) {
            if ($(selector).length) {
              content = $(selector).first().text().trim();
              break;
            }
          }
          if (!content) content = $('body').text().trim();
          break;
        case 'code':
          const codeBlocks: string[] = [];
          $('pre, code').each((i, elem) => {
            codeBlocks.push($(elem).text());
          });
          content = codeBlocks.join('\n\n');
          break;
        case 'links':
          const links: string[] = [];
          $('a[href]').each((i, elem) => {
            const href = $(elem).attr('href');
            const text = $(elem).text().trim();
            if (href) links.push(`${text}: ${href}`);
          });
          content = links.slice(0, 50).join('\n');
          break;
        case 'images':
          const images: string[] = [];
          $('img[src]').each((i, elem) => {
            const src = $(elem).attr('src');
            const alt = $(elem).attr('alt') || 'No description';
            if (src) images.push(`${alt}: ${src}`);
          });
          content = images.slice(0, 30).join('\n');
          break;
        case 'meta':
          const meta = {
            title: $('title').text(),
            description: $('meta[name="description"]').attr('content'),
            keywords: $('meta[name="keywords"]').attr('content'),
            author: $('meta[name="author"]').attr('content'),
            ogTitle: $('meta[property="og:title"]').attr('content'),
            ogDescription: $('meta[property="og:description"]').attr('content'),
            ogImage: $('meta[property="og:image"]').attr('content')
          };
          content = JSON.stringify(meta, null, 2);
          break;
      }
      
      // Truncate if too long
      if (content.length > 4000) {
        content = content.substring(0, 3900) + '\n\n... [Content truncated]';
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`🌐 Fetched: ${new URL(url).hostname}`)
        .setURL(url)
        .setColor(0x00FF00)
        .setDescription(`Extracted ${extractType} content`)
        .addFields({
          name: 'Content',
          value: content.substring(0, 1024) || 'No content found'
        });
      
      if (content.length > 1024) {
        // Send as file if content is large
        const buffer = Buffer.from(content);
        const attachment = new AttachmentBuilder(buffer, { 
          name: `${extractType}-content.txt` 
        });
        
        await interaction.editReply({
          embeds: [embed],
          files: [attachment]
        });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
      
      // Send to Claude for analysis
      await session.sendMessage(
        `Fetched content from ${url} (${extractType}):\n\n${content}`
      );
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error fetching URL: ${error.message}`
      });
    }
  },

  async handleDocs(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const technology = interaction.options.getString('technology', true);
    const topic = interaction.options.getString('topic');
    
    try {
      // Build documentation search query
      const docsUrls = this.getDocumentationUrls(technology);
      const searchQuery = topic 
        ? `${technology} ${topic} documentation`
        : `${technology} documentation getting started`;
      
      const embed = new EmbedBuilder()
        .setTitle(`📚 ${technology} Documentation`)
        .setColor(0x5865F2)
        .setDescription(topic 
          ? `Searching for "${topic}" in ${technology} docs`
          : `${technology} documentation resources`);
      
      // Add official documentation links
      if (docsUrls.length > 0) {
        embed.addFields({
          name: 'Official Documentation',
          value: docsUrls.map(doc => `[${doc.name}](${doc.url})`).join('\n'),
          inline: false
        });
      }
      
      // Perform search for specific topics
      if (topic) {
        const results = await this.performWebSearch(
          `site:${docsUrls[0]?.url || technology + '.org'} ${topic}`,
          3
        );
        
        if (results.length > 0) {
          embed.addFields({
            name: `Results for "${topic}"`,
            value: results
              .map(r => `[${r.title}](${r.url})\n${r.snippet}`)
              .join('\n\n')
              .substring(0, 1024)
          });
        }
      }
      
      // Add quick links
      embed.addFields({
        name: 'Quick Links',
        value: [
          `🔍 [Search ${technology}](https://www.google.com/search?q=${encodeURIComponent(searchQuery)})`,
          `📦 [NPM Package](https://www.npmjs.com/search?q=${technology})`,
          `🐙 [GitHub](https://github.com/search?q=${technology})`,
          `💬 [Stack Overflow](https://stackoverflow.com/questions/tagged/${technology})`
        ].join('\n'),
        inline: false
      });
      
      await interaction.editReply({ embeds: [embed] });
      
      // Send to Claude for context
      await session.sendMessage(
        `User is looking for ${technology} documentation${topic ? ` about ${topic}` : ''}. ` +
        `Official docs: ${docsUrls.map(d => d.url).join(', ')}`
      );
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error fetching documentation: ${error.message}`
      });
    }
  },

  async handleAPI(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const url = interaction.options.getString('url', true);
    const method = interaction.options.getString('method') || 'GET';
    const headersStr = interaction.options.getString('headers');
    const bodyStr = interaction.options.getString('body');
    
    try {
      let headers = {};
      let body = undefined;
      
      if (headersStr) {
        try {
          headers = JSON.parse(headersStr);
        } catch {
          throw new Error('Invalid JSON in headers');
        }
      }
      
      if (bodyStr) {
        try {
          body = JSON.parse(bodyStr);
        } catch {
          throw new Error('Invalid JSON in body');
        }
      }
      
      const response = await axios({
        method,
        url,
        headers: {
          'User-Agent': 'Claude-Discord-Bridge',
          ...headers
        },
        data: body,
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status
      });
      
      const embed = new EmbedBuilder()
        .setTitle(`🔌 API Request: ${method} ${new URL(url).pathname}`)
        .setColor(response.status >= 200 && response.status < 300 ? 0x00FF00 : 0xFF0000)
        .addFields(
          { name: 'Status', value: `${response.status} ${response.statusText}`, inline: true },
          { name: 'Method', value: method, inline: true },
          { name: 'Content-Type', value: response.headers['content-type'] || 'Unknown', inline: true }
        );
      
      // Format response data
      let responseData = response.data;
      if (typeof responseData === 'object') {
        responseData = JSON.stringify(responseData, null, 2);
      }
      
      if (responseData.length <= 1024) {
        embed.addFields({
          name: 'Response',
          value: `\`\`\`json\n${responseData}\n\`\`\``
        });
        await interaction.editReply({ embeds: [embed] });
      } else {
        // Send as attachment if large
        const buffer = Buffer.from(responseData);
        const attachment = new AttachmentBuilder(buffer, { 
          name: 'api-response.json' 
        });
        
        embed.addFields({
          name: 'Response',
          value: 'Response too large - sent as attachment'
        });
        
        await interaction.editReply({ 
          embeds: [embed],
          files: [attachment]
        });
      }
      
      // Send to Claude
      await session.sendMessage(
        `API Request: ${method} ${url}\n` +
        `Status: ${response.status}\n` +
        `Response: ${responseData.substring(0, 2000)}`
      );
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ API request failed: ${error.message}`
      });
    }
  },

  async handleScrape(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const url = interaction.options.getString('url', true);
    const selector = interaction.options.getString('selector', true);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Claude-Discord-Bridge)'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      const elements = $(selector);
      
      if (elements.length === 0) {
        await interaction.editReply({
          content: `⚠️ No elements found matching selector: \`${selector}\``
        });
        return;
      }
      
      const results: string[] = [];
      elements.each((i, elem) => {
        if (i < 20) { // Limit to 20 elements
          const text = $(elem).text().trim();
          const html = $(elem).html();
          results.push(`**Element ${i + 1}:**\nText: ${text}\nHTML: ${html?.substring(0, 200)}`);
        }
      });
      
      const embed = new EmbedBuilder()
        .setTitle(`🕷️ Scraped: ${new URL(url).hostname}`)
        .setURL(url)
        .setColor(0x9B59B6)
        .setDescription(`Found ${elements.length} elements matching \`${selector}\``)
        .addFields({
          name: 'Results',
          value: results.slice(0, 3).join('\n\n').substring(0, 1024)
        });
      
      if (results.length > 3) {
        const buffer = Buffer.from(results.join('\n\n'));
        const attachment = new AttachmentBuilder(buffer, { 
          name: 'scrape-results.txt' 
        });
        
        await interaction.editReply({ 
          embeds: [embed],
          files: [attachment]
        });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
      
      // Send to Claude
      await session.sendMessage(
        `Scraped ${url} with selector "${selector}":\n\n${results.slice(0, 5).join('\n\n')}`
      );
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Scraping failed: ${error.message}`
      });
    }
  },

  buildSearchQuery(query: string, type: string): string {
    switch (type) {
      case 'docs':
        return `${query} documentation tutorial guide`;
      case 'stackoverflow':
        return `site:stackoverflow.com ${query}`;
      case 'github':
        return `site:github.com ${query}`;
      case 'npm':
        return `site:npmjs.com ${query}`;
      default:
        return query;
    }
  },

  async performWebSearch(query: string, limit: number): Promise<any[]> {
    // This is a placeholder - in production, integrate with actual search API
    // Options: Brave Search API, Google Custom Search API, Bing Search API, etc.
    
    // Simulated results for demonstration
    return [
      {
        title: 'Example Result 1',
        url: 'https://example.com/1',
        snippet: 'This is a sample search result snippet...'
      },
      {
        title: 'Example Result 2',
        url: 'https://example.com/2',
        snippet: 'Another sample search result snippet...'
      }
    ].slice(0, limit);
  },

  getDocumentationUrls(technology: string): Array<{name: string, url: string}> {
    const docsMap: Record<string, Array<{name: string, url: string}>> = {
      'react': [
        { name: 'Official Docs', url: 'https://react.dev' },
        { name: 'Legacy Docs', url: 'https://legacy.reactjs.org' }
      ],
      'vue': [
        { name: 'Official Docs', url: 'https://vuejs.org' }
      ],
      'angular': [
        { name: 'Official Docs', url: 'https://angular.io' }
      ],
      'node.js': [
        { name: 'Official Docs', url: 'https://nodejs.org/docs' }
      ],
      'typescript': [
        { name: 'Official Docs', url: 'https://www.typescriptlang.org/docs' }
      ],
      'python': [
        { name: 'Official Docs', url: 'https://docs.python.org' }
      ],
      // Add more technologies...
    };
    
    return docsMap[technology.toLowerCase()] || [];
  }
};