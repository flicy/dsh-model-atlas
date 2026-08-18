#!/usr/bin/env node
/**
 * DSH Plugin Data Collector
 * 
 * Fetches dsh-plugin data from GitHub API, processes it,
 * and stores timestamped snapshots for day/week/month analysis.
 * 
 * Usage:
 *   node dsh-plugin-collector.mjs              # collect & save
 *   node dsh-plugin-collector.mjs --report     # print summary report
 *   node dsh-plugin-collector.mjs --history    # show historical snapshots
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '.dsh-plugin-db');
const SNAPSHOTS_DIR = join(DB_DIR, 'snapshots');
const LATEST_FILE = join(DB_DIR, 'latest.json');
const HISTORY_FILE = join(DB_DIR, 'history.json');
const PLUGINS_FILE = join(DB_DIR, 'plugins.json');

// Ensure directories exist
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true });

// GitHub API config
const GITHUB_API = 'https://api.github.com';
const TOPIC = 'dsh-plugin';
const PER_PAGE = 100;
const MAX_PAGES = 30; // Up to 3000 repos

// Static curated data from known sources (fallback + supplement)
const CURATED_CATEGORIES = {
  '🛠️ Tools': ['dsh-toolkit', 'dsh-tool-calculator', 'dsh-tool-csv', 'dsh-tool-diff', 'dsh-tool-encoding', 'dsh-tool-json', 'dsh-tool-markdown', 'dsh-tool-regex', 'dsh-tool-schema', 'dsh-tool-stat', 'dsh-tool-time', 'dsh-tool-git', 'dsh-test-runner', 'dsh-security-scan', 'dsh-tool-search', 'dsh-custom-tool', 'dsh-bash-encoding', 'dsh-at-file', 'dsh-wikilink', 'dsh-safe-delete', 'dsh-bisect-debug', 'dsh-payload-capture', 'dsh-data-agent', 'dsh-openapi', 'dsh-plugin-interpreters', 'dsh-cowork', 'dsh-plugin-mineru', 'dsh-plugin-sleep', 'dsh-port-guard', 'dsh-scout'],
  '🧩 Skills': ['dsh-review-skills', 'dsh-skillport', 'dsh-find-skill', 'dsh-plugin-skills', 'dsh-book2skill', 'dsh-superpowers', 'dsh-plugin-code-review', 'dsh-review-loop', 'dsh-plugin-claude-bridge', 'dsh-plugin-codex-bridge', 'dsh-plugin-opencode-bridge', 'dsh-plugin-pi-bridge', 'Code2Skill', 'dsh-reverse-skill', 'dsh-find-plugins', 'forkprobe'],
  '🔌 MCP': ['dsh-mcp-proxy', 'deepseek-harness-plugin-mcp', 'dsh-webfetch', 'dsh-search-mcp', 'dsh-oauth-mcp-client', 'shadow-vision', 'mcp-bridge', 'dsh-acp-for-bitfun'],
  '🎨 UI/Skins': ['dsh-skins', 'dsh-deep-whale', 'dsh-qq2006', 'dsh-miku-skin', 'dsh-deepcel', 'dsh-tonghuashun', 'dsh-plugin-colorscheme', 'dsh-custom-css', 'dsh-web-background', 'dsh-plugin-background', 'dsh-chat-width', 'deepseek-harness-skin', 'dsh-homepage-skin', 'DSH-better-sidebar', 'dsh-side-panel', 'dsh-focus-chat', 'ui-status-label', 'dsh-navbar', 'dsh-task-status', 'dsh-web-archive', 'dsh-milestone', 'dsh-spotlight', 'dsh-deeplink', 'dsh-diff-viewer', 'dsh-drag-and-drop', 'ex-setting', 'dsh-annotation', 'dsh-prompt-studio', 'dsh-prompt-persona', 'dsh-local-filetree', 'dsh-sticky-disclosure', 'dsh-token-usage', 'TokenLedger', 'dsh-web-billing', 'dsh-model-config-sync', 'dsh-web-ui', 'dsh-plugin-open-app', 'dsh-ui-hub', 'dsh-what-changed', 'dsh-visualize', 'dsh-genui', 'web-components', 'dsh-openpencil'],
  '🖥️ Desktop/TUI/Mobile': ['dsh-TUI', 'dsh-tianshu-tui', 'dsh-pi-tui', 'deepseek-harness-tui', 'dsh-tui', 'oh-dsh', 'deepseek-harness-desktop', 'dsh-desktop', 'dsh-launcher', 'dsh-work', 'dsh-companion', 'dsh-mobile', 'dsh-hub-workshop'],
  '🤖 Agent Orchestration': ['dsh-agent-teams', 'dsh_workflow', 'dsh-meta-orchestrator', 'dsh-crosstalk', 'dsh-agent-messaging', 'dsh-interconnect', 'dsh-session-hub', 'dsh-plugin-yet-another-subagent', 'dsh-a2a', 'dph-fleet'],
  '🧠 Context/Memory': ['dsh-memory-evolve', 'billion-context-dsh', 'dsh-memory', 'dsh-mnemon', 'nowledge-mem-deepseek-harness', 'dsh-plugin-meta-memory', 'dsh-kb-sieve', 'dsh-llm-wiki', 'dsh-continual-evolve', 'dsh-meow-memory', 'dsh-context-doctor', 'context-vista', 'distill', 'dsh-auto-compact', 'dsh-context', 'dsh-turn-rewind', 'Coral-Memory'],
  '👁️ Multimodal/Vision': ['dsh-vision-router', 'dsh-video-studio', 'dsh-image-generation', 'shadow-vision', 'dsh-vision', 'dsh-open-eyes', 'modlens', 'dsh-annotation'],
  '🔁 Workflow/Automation': ['dsh-deep-research', 'dsh-cron', 'dsh-condition-wakeup', 'dsh-review-loop', 'DSH-EvoResearch', 'dsh-test-sync-plugin', 'dsh-task-completion', 'dsh-git-push', 'dsh-git-rescue', 'dsh-bili-publisher', 'dsh-daemon', 'dsh-cost-guard', 'dsh-balance-tasks'],
  '📡 Notifications/Channels': ['dsh-telegram-bot', 'dsh-wechat-bot', 'dsh-feishu-bot', 'dsh-web-ui-notify', 'dsh-lark-all', 'ax-feishu-bridge', 'dsh-bili-publisher', 'dsh-bridge', 'dsh-tailscale-console'],
  '🌐 Browser/Search': ['dsh-browser-control', 'dsh-search-mcp', 'dsh-wigolo', 'dsh-webfetch', 'dsh-web-search', 'dsh-scrape', 'dsh-browser-use'],
  '🏗️ Infra/Management': ['dsh-market', 'dsh-plugin-marketplace', 'dsh-web-plugin-manager', 'dsh-plugin-check', 'dsh-plugin-guard', 'dsh-mcp-manager', 'dsh-workshop', 'dsh-plugin-healthcheck', 'dsh-suite', 'dsh-server-deployment', 'dsh-cost-guard', 'dsh-session-manager', 'dsh-mod-manager', 'dsh-plugin-security-audit', 'dsh-diff-approval', 'dsh-scan', 'dsh-plugin-registry', 'dsh-hub'],
  '🎮 Fun/Other': ['dsh-bgm', 'dsh-pet-StatusLight', 'dsh-wallpaper-engine', 'dsh-stock-terminal', 'dsh-funpack', 'dsh-plugin-hub', 'dsh-skin-market', 'dsh-bloub-mood', 'dsh-enter-lock', 'dsh-desktop-window', 'dsh-editor', 'dsh-failbook', 'dsh-fail-logger', 'dsh-data-ledger', 'dsh-youmind-plugin', 'dsh-plugin-longgraph', 'dsh-seismicx', 'dsh-plugin-codereview'],
  '🏛️ Official/Meta': ['deepseek-ai/deepseek-harness', 'awesome-dsh-plugins', 'dsh-plugin-stars', 'dsh-plugin-hub', 'awesome-dsh-plugin', 'dsh-plugin-leaderboard', 'deepseek-plugin-store', 'dsh-skin-market', 'dsh-skill-viewer']
};

/**
 * Fetch all repos with the dsh-plugin topic from GitHub
 */
async function fetchAllPluginRepos() {
  const allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    try {
      const url = `${GITHUB_API}/search/repositories?q=topic:${TOPIC}&sort=updated&per_page=${PER_PAGE}&page=${page}`;
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'dsh-plugin-collector/1.0'
        }
      });
      
      if (!resp.ok) {
        console.warn(`GitHub API returned ${resp.status} on page ${page}, stopping.`);
        break;
      }
      
      const data = await resp.json();
      const items = data.items || [];
      allItems.push(...items);
      
      console.log(`Fetched page ${page}: ${items.length} items (total: ${allItems.length})`);
      
      if (items.length < PER_PAGE) hasMore = false;
      page++;
      
      // Rate limiting: 1 request per second
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.warn(`Error fetching page ${page}: ${err.message}`);
      break;
    }
  }
  
  return allItems;
}

/**
 * Categorize a repo based on its name and description
 */
function categorizeRepo(repo) {
  const name = (repo.name || '').toLowerCase();
  const desc = (repo.description || '').toLowerCase();
  const fullName = repo.full_name || '';
  const text = name + ' ' + desc + ' ' + fullName;

  if (text.includes('skin') || text.includes('theme') || text.includes('sidebar') || text.includes('ui-') || text.includes('web-ui') || text.includes('genui') || text.includes('visualize') || text.includes('navbar') || text.includes('diff-viewer') || text.includes('annotation') || text.includes('focus-chat') || text.includes('openpencil') || text.includes('wallpaper') || text.includes('background') || text.includes('skin') || text.includes('color') || text.includes('icon')) return '🎨 UI/Skins';
  if (text.includes('tui') || text.includes('terminal') || text.includes('desktop') || text.includes('mobile') || text.includes('launcher') || text.includes('electron') || text.includes('tauri') || text.includes('wails') || text.includes('companion')) return '🖥️ Desktop/TUI/Mobile';
  if (text.includes('memory') || text.includes('context') || text.includes('compress') || text.includes('recall') || text.includes('mnemon') || text.includes('wiki') || text.includes('kb-') || text.includes('compact') || text.includes('rewind') || text.includes('distill')) return '🧠 Context/Memory';
  if (text.includes('agent') && (text.includes('team') || text.includes('orchestrat') || text.includes('multi') || text.includes('crosstalk') || text.includes('interconnect') || text.includes('fleet') || text.includes('hub') || text.includes('subagent') || text.includes('a2a'))) return '🤖 Agent Orchestration';
  if (text.includes('mcp') && !text.includes('tool')) return '🔌 MCP';
  if (text.includes('vision') || text.includes('image') || text.includes('ocr') || text.includes('screenshot') || text.includes('video') || text.includes('router') || text.includes('visual')) return '👁️ Multimodal/Vision';
  if (text.includes('workflow') || text.includes('automation') || text.includes('cron') || text.includes('schedule') || text.includes('review-loop') || text.includes('evolve') || text.includes('research') || text.includes('evolv')) return '🔁 Workflow/Automation';
  if (text.includes('market') || text.includes('manager') || text.includes('install') || text.includes('health') || text.includes('audit') || text.includes('deploy') || text.includes('server') || text.includes('cost') || text.includes('billing') || text.includes('guard') || text.includes('scan') || text.includes('registry') || text.includes('security')) return '🏗️ Infra/Management';
  if (text.includes('tool') || text.includes('calculator') || text.includes('csv') || text.includes('json') || text.includes('regex') || text.includes('git') || text.includes('test') || text.includes('search') || text.includes('data-agent') || text.includes('openapi') || text.includes('sleep') || text.includes('port') || text.includes('scout') || text.includes('encoding') || text.includes('diff') || text.includes('markdown') || text.includes('stat') || text.includes('time')) return '🛠️ Tools';
  if (text.includes('skill') || text.includes('bridge') || text.includes('port') || text.includes('book2') || text.includes('superpower') || text.includes('review') || text.includes('forkprobe') || text.includes('discover') || text.includes('find-plugin')) return '🧩 Skills';
  if (text.includes('telegram') || text.includes('wechat') || text.includes('feishu') || text.includes('lark') || text.includes('notify') || text.includes('bili') || text.includes('bridge') || text.includes('tunnel') || text.includes('tailscale') || text.includes('webhook') || text.includes('bot')) return '📡 Notifications/Channels';
  if (text.includes('browser') || text.includes('search') || text.includes('scrape') || text.includes('fetch') || text.includes('wigolo')) return '🌐 Browser/Search';
  if (text.includes('game') || text.includes('pet') || text.includes('music') || text.includes('bgm') || text.includes('stock') || text.includes('fun') || text.includes('mood') || text.includes('bloub') || text.includes('wallpaper') || text.includes('editor') || text.includes('failbook') || text.includes('fail-log') || text.includes('ledger') || text.includes('codereview') || text.includes('longgraph') || text.includes('seismicx')) return '🎮 Fun/Other';
  if (text.includes('awesome') || text.includes('official') || text.includes('meta') || text.includes('leaderboard') || text.includes('stars') || text.includes('hub') || text.includes('store') || text.includes('registry') || text.includes('catalog') || text.includes('index')) return '🏛️ Official/Meta';

  return '📦 Uncategorized';
}

/**
 * Process raw repos into structured data
 */
function processRepos(repos) {
  const now = new Date().toISOString();
  const categorized = {};
  
  for (const repo of repos) {
    const cat = categorizeRepo(repo);
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push({
      name: repo.full_name,
      repo: repo.name,
      url: repo.html_url,
      description: (repo.description || '').substring(0, 200),
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      openIssues: repo.open_issues_count || 0,
      language: repo.language || '',
      updatedAt: repo.updated_at || '',
      createdAt: repo.pushed_at || '',
      topics: repo.topics || []
    });
  }

  // Sort each category by stars
  for (const cat of Object.keys(categorized)) {
    categorized[cat].sort((a, b) => b.stars - a.stars);
  }

  return {
    snapshotTime: now,
    snapshotDate: now.substring(0, 10),
    totalRepos: repos.length,
    categories: Object.keys(categorized).length,
    categorized,
    categoryCounts: Object.fromEntries(
      Object.entries(categorized).map(([k, v]) => [k, v.length])
    ),
    topByStars: repos
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, 30)
      .map(r => ({
        name: r.full_name,
        url: r.html_url,
        stars: r.stargazers_count || 0,
        description: (r.description || '').substring(0, 200)
      }))
  };
}

/**
 * Load historical data
 */
function loadHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch {}
  return { snapshots: [] };
}

/**
 * Compute day/week/month aggregates
 */
function computeAggregates(history) {
  const { snapshots } = history;
  if (snapshots.length === 0) return null;

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const oldest = sorted[0];

  // Daily: latest snapshot
  // Weekly: average of last 7 days
  // Monthly: average of last 30 days
  const last7 = sorted.slice(-7);
  const last30 = sorted.slice(-30);

  const avg = (arr, field) => {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((s, d) => s + (d[field] || 0), 0) / arr.length);
  };

  return {
    daily: {
      date: latest.date,
      totalRepos: latest.totalRepos,
      categories: latest.categories
    },
    weekly: {
      startDate: last7.length > 0 ? last7[0].date : latest.date,
      endDate: latest.date,
      avgTotalRepos: avg(last7, 'totalRepos'),
      avgCategories: avg(last7, 'categories'),
      snapshots: last7.length
    },
    monthly: {
      startDate: last30.length > 0 ? last30[0].date : latest.date,
      endDate: latest.date,
      avgTotalRepos: avg(last30, 'totalRepos'),
      avgCategories: avg(last30, 'categories'),
      totalGrowth: latest.totalRepos - oldest.totalRepos,
      snapshots: last30.length
    }
  };
}

/**
 * Main collection and save
 */
async function collect() {
  console.log('🔍 Fetching DSH plugin data from GitHub...\n');
  
  const repos = await fetchAllPluginRepos();
  console.log(`\n✅ Total repos fetched: ${repos.length}`);
  
  const data = processRepos(repos);
  
  // Save latest snapshot
  writeFileSync(LATEST_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 Saved latest snapshot: ${LATEST_FILE}`);
  
  // Save to plugins.json (for web consumption)
  writeFileSync(PLUGINS_FILE, JSON.stringify({
    lastUpdated: data.snapshotTime,
    totalRepos: data.totalRepos,
    categories: data.categories,
    categoryCounts: data.categoryCounts,
    topByStars: data.topByStars,
    categoryData: Object.fromEntries(
      Object.entries(data.categorized).map(([cat, plugins]) => [
        cat, plugins.map(p => ({ 
          name: p.name, url: p.url, stars: p.stars, description: p.description 
        }))
      ])
    )
  }, null, 2));
  console.log(`💾 Saved web data: ${PLUGINS_FILE}`);
  
  // Update history
  const history = loadHistory();
  // Check if we already have a snapshot for today
  const today = data.snapshotDate;
  const existingIndex = history.snapshots.findIndex(s => s.date === today);
  const snapshotEntry = {
    date: today,
    timestamp: data.snapshotTime,
    totalRepos: data.totalRepos,
    categories: data.categories
  };
  
  if (existingIndex >= 0) {
    history.snapshots[existingIndex] = snapshotEntry;
  } else {
    history.snapshots.push(snapshotEntry);
  }
  
  // Keep only last 90 days
  history.snapshots.sort((a, b) => a.date.localeCompare(b.date));
  if (history.snapshots.length > 90) {
    history.snapshots = history.snapshots.slice(-90);
  }
  
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`💾 Updated history: ${HISTORY_FILE}`);
  
  // Save daily snapshot
  const snapshotFile = join(SNAPSHOTS_DIR, `${today}.json`);
  writeFileSync(snapshotFile, JSON.stringify({
    date: today,
    timestamp: data.snapshotTime,
    totalRepos: data.totalRepos,
    categories: data.categories,
    categoryCounts: data.categoryCounts
  }, null, 2));
  
  // Compute aggregates
  const aggregates = computeAggregates(history);
  if (aggregates) {
    writeFileSync(join(DB_DIR, 'aggregates.json'), JSON.stringify(aggregates, null, 2));
    console.log(`💾 Saved aggregates`);
  }
  
  // Copy to repo for GitHub Pages
  const REPO_DIR = '/tmp/dsh-model-atlas';
  try {
    writeFileSync(join(REPO_DIR, 'plugins-data.json'), readFileSync(PLUGINS_FILE));
    writeFileSync(join(REPO_DIR, 'plugins-aggregates.json'), readFileSync(join(DB_DIR, 'aggregates.json')));
    console.log(`💾 Copied to repo: ${REPO_DIR}`);
  } catch (e) {
    console.warn(`⚠️ Could not copy to repo: ${e.message}`);
  }
  
  // Print summary
  console.log(`\n📊 === Summary ===`);
  console.log(`Total repos: ${data.totalRepos}`);
  console.log(`Categories: ${data.categories}`);
  console.log(`\nCategory breakdown:`);
  for (const [cat, count] of Object.entries(data.categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nTop 5 by stars:`);
  data.topByStars.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.name} ⭐${r.stars}`);
  });
  
  console.log(`\n✅ Collection complete.`);
  return data;
}

// Run
collect().catch(err => {
  console.error('❌ Collection failed:', err.message);
  process.exit(1);
});