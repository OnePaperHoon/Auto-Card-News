#!/usr/bin/env node
// Auto Card News — interactive setup CLI
// Zero-dependency. Installs the Agent Skills into Claude Code and/or Codex.
//
//   npm run cli                 interactive setup
//   npm run cli -- --list       list available skills + targets
//   npm run cli -- --help       usage
//
// Non-interactive examples:
//   npm run cli -- --target both --skills all --yes
//   npm run cli -- --target claude --skills auto-card-news,auto-motion-news --yes

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');

// ---------- styling ----------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const cyan = (s) => c('36', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('31', s);

// ---------- targets ----------
const TARGETS = {
  claude: {
    key: 'claude',
    label: 'Claude Code',
    homeEnv: 'CLAUDE_HOME',
    defaultHome: () => path.join(os.homedir(), '.claude'),
    restart: 'Restart Claude Code to pick up the new skills.',
  },
  codex: {
    key: 'codex',
    label: 'Codex',
    homeEnv: 'CODEX_HOME',
    defaultHome: () => path.join(os.homedir(), '.codex'),
    restart: 'Restart Codex to pick up the new skills.',
  },
};

// External companion skill (not bundled in this repo).
const COMPANION = {
  name: 'last30days',
  repo: 'https://github.com/mvanhorn/last30days-skill.git',
  subdir: 'skills/last30days',
};

// ---------- discovery ----------
function discoverSkills() {
  if (!fs.existsSync(SKILLS_ROOT)) return [];
  return fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_ROOT, d.name, 'SKILL.md')))
    .map((d) => {
      const dir = path.join(SKILLS_ROOT, d.name);
      return { name: d.name, dir, description: readSkillDescription(dir) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readSkillDescription(dir) {
  try {
    const md = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    const m = md.match(/^description:\s*"?(.*?)"?\s*$/m);
    if (!m) return '';
    const oneLine = m[1].replace(/\s+/g, ' ').trim();
    return oneLine.length > 110 ? oneLine.slice(0, 107) + '...' : oneLine;
  } catch {
    return '';
  }
}

// ---------- args ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--list' || a === '-l') out.list = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--no-companion') out.companion = false;
    else if (a === '--companion') out.companion = true;
    else if (a === '--target') out.target = argv[++i];
    else if (a.startsWith('--target=')) out.target = a.slice(9);
    else if (a === '--skills') out.skills = argv[++i];
    else if (a.startsWith('--skills=')) out.skills = a.slice(9);
    else if (a === '--dest') out.dest = argv[++i];
    else if (a.startsWith('--dest=')) out.dest = a.slice(7);
    else out._.push(a);
  }
  return out;
}

function printHelp() {
  console.log(`
${bold('Auto Card News — setup CLI')}

${bold('Usage')}
  npm run cli                       interactive setup
  npm run cli -- [options]          non-interactive

${bold('Options')}
  --target <claude|codex|both>      where to install (default: ask)
  --skills <all|name,name,...>      which skills to install (default: all)
  --companion / --no-companion      also install the ${COMPANION.name} companion skill
  --dest <dir>                      override the skills destination directory
  -y, --yes                         accept defaults, no prompts
  -l, --list                        list available skills and targets
  -h, --help                        show this help

${bold('Examples')}
  npm run cli -- --target both --skills all --yes
  npm run cli -- --target claude --skills auto-card-news,auto-motion-news
  CLAUDE_HOME=~/work/.claude npm run cli -- --target claude --yes
`);
}

function printList(skills) {
  console.log(`\n${bold('Available skills')} ${dim('(' + SKILLS_ROOT + ')')}`);
  for (const s of skills) {
    console.log(`  ${green('•')} ${bold(s.name)}`);
    if (s.description) console.log(`    ${dim(s.description)}`);
  }
  console.log(`  ${green('•')} ${bold(COMPANION.name)} ${dim('(optional companion, downloaded from GitHub)')}`);
  console.log(`\n${bold('Targets')}`);
  for (const t of Object.values(TARGETS)) {
    console.log(`  ${green('•')} ${bold(t.label)} ${dim('-> ' + skillsDirFor(t))}`);
  }
  console.log('');
}

// ---------- prompts ----------
// Line-queue prompter: works for both interactive TTY and piped/CI stdin
// (Node's rl.question can drop buffered lines on non-TTY input).
function makeRL() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  rl.question = (prompt) => {
    process.stdout.write(prompt);
    return new Promise((res) => {
      if (queue.length) return res(queue.shift());
      if (closed) return res(null);
      waiters.push(res);
    });
  };
  return rl;
}
function ask(rl, q) {
  return rl.question(q).then((a) => (a == null ? '' : String(a).trim()));
}

async function promptTarget(rl) {
  console.log(`\n${bold('1) Where do you want to install the skills?')}`);
  console.log(`  ${cyan('1')}) Claude Code   ${dim('(~/.claude/skills)')}`);
  console.log(`  ${cyan('2')}) Codex         ${dim('(~/.codex/skills)')}`);
  console.log(`  ${cyan('3')}) Both`);
  const a = (await ask(rl, `${cyan('?')} Choose [1/2/3] (default 1): `)) || '1';
  if (a === '2') return ['codex'];
  if (a === '3') return ['claude', 'codex'];
  return ['claude'];
}

async function promptSkills(rl, skills) {
  console.log(`\n${bold('2) Which skills?')}`);
  skills.forEach((s, i) => {
    console.log(`  ${cyan(String(i + 1))}) ${bold(s.name)}`);
    if (s.description) console.log(`     ${dim(s.description)}`);
  });
  console.log(`  ${cyan('a')}) All ${dim('(recommended)')}`);
  const a = (await ask(rl, `${cyan('?')} Choose numbers (e.g. 1,3) or "a" (default a): `)) || 'a';
  if (a.toLowerCase() === 'a') return skills.map((s) => s.name);
  const picked = a
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => n >= 1 && n <= skills.length)
    .map((n) => skills[n - 1].name);
  return picked.length ? [...new Set(picked)] : skills.map((s) => s.name);
}

async function promptCompanion(rl) {
  console.log(`\n${bold('3) Companion skill')}`);
  console.log(`  ${dim(COMPANION.name + ' adds fresh web source discovery. Downloaded from GitHub.')}`);
  const a = (await ask(rl, `${cyan('?')} Install ${COMPANION.name}? [y/N]: `)) || 'n';
  return /^y/i.test(a);
}

// ---------- install ----------
function skillsDirFor(target, destOverride) {
  if (destOverride) return path.resolve(destOverride);
  const home = process.env[target.homeEnv] || target.defaultHome();
  return path.join(home, 'skills');
}

function installSkill(srcDir, name, destSkillsDir) {
  const dest = path.join(destSkillsDir, name);
  if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
    throw new Error(`source for "${name}" has no SKILL.md (${srcDir})`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(srcDir, dest, { recursive: true });
  return dest;
}

function fetchCompanion() {
  // Returns a local path to skills/last30days, or null if it could not be fetched.
  let git = false;
  try {
    execSync('git --version', { stdio: 'ignore' });
    git = true;
  } catch {
    /* no git */
  }
  if (!git) {
    console.log(yellow(`  ! git not found — skipping ${COMPANION.name}. Install it manually:`));
    console.log(dim(`    ${COMPANION.repo} (${COMPANION.subdir})`));
    return null;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-companion-'));
  try {
    console.log(dim(`  Downloading ${COMPANION.name} ...`));
    execSync(`git clone --depth 1 ${COMPANION.repo} "${tmp}"`, { stdio: 'ignore' });
    const sub = path.join(tmp, COMPANION.subdir);
    if (fs.existsSync(path.join(sub, 'SKILL.md'))) return sub;
    console.log(yellow(`  ! ${COMPANION.name} layout changed — skipping.`));
    return null;
  } catch (e) {
    console.log(yellow(`  ! Could not download ${COMPANION.name} (${e.message.split('\n')[0]}). Skipping.`));
    return null;
  }
}

function runInstall({ targets, skillNames, withCompanion, skills, destOverride }) {
  const bySkill = Object.fromEntries(skills.map((s) => [s.name, s]));
  let companionSrc = null;
  if (withCompanion) companionSrc = fetchCompanion();

  for (const tKey of targets) {
    const target = TARGETS[tKey];
    const destSkillsDir = skillsDirFor(target, destOverride);
    fs.mkdirSync(destSkillsDir, { recursive: true });
    console.log(`\n${bold(target.label)} ${dim('-> ' + destSkillsDir)}`);

    for (const name of skillNames) {
      const src = bySkill[name]?.dir;
      if (!src) {
        console.log(yellow(`  ! unknown skill "${name}" — skipped`));
        continue;
      }
      const dest = installSkill(src, name, destSkillsDir);
      console.log(`  ${green('✓')} ${name} ${dim('-> ' + dest)}`);
    }
    if (companionSrc) {
      const dest = installSkill(companionSrc, COMPANION.name, destSkillsDir);
      console.log(`  ${green('✓')} ${COMPANION.name} ${dim('-> ' + dest)}`);
    }
  }
  return targets.map((t) => TARGETS[t]);
}

function printUsageHint(installedTargets, skillNames) {
  console.log(`\n${green(bold('Done.'))}`);
  for (const t of installedTargets) console.log(`  ${dim('•')} ${t.restart}`);

  const primary = skillNames.includes('content-engine')
    ? 'content-engine'
    : skillNames[0];
  console.log(`\n${bold('Try it')}`);
  console.log(dim('  Claude Code:'));
  console.log(`    Use the ${primary} skill. Source: <your link>. Make an 채널 스타일 Korean card-news package.`);
  console.log(dim('  Codex:'));
  console.log(`    $${primary}\n    <your link>\n    채널 카드뉴스 + 릴스 + 캡션 만들어줘.`);
  console.log(
    dim(
      `\n  Note: these are Agent Skills (SKILL.md), not an MCP server — invoke them by name in the agent, no MCP config needed.`
    )
  );
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skills = discoverSkills();

  if (args.help) return printHelp();
  if (!skills.length) {
    console.error(red(`No skills found under ${SKILLS_ROOT}. Run this from inside the repository.`));
    process.exitCode = 1;
    return;
  }
  if (args.list) return printList(skills);

  console.log(bold(cyan('\nAuto Card News — setup')));
  console.log(dim('Installs the Agent Skills into Claude Code and/or Codex.\n'));

  // Resolve config: flags first, then interactive for whatever is missing.
  let targets;
  let skillNames;
  let withCompanion = args.companion;

  const nonInteractive = args.yes || (args.target && args.skills);

  if (args.target) {
    const t = String(args.target).toLowerCase();
    targets = t === 'both' ? ['claude', 'codex'] : t.split(',').map((x) => x.trim()).filter((x) => TARGETS[x]);
    if (!targets.length) {
      console.error(red(`Invalid --target "${args.target}". Use claude, codex, or both.`));
      process.exitCode = 1;
      return;
    }
  }

  if (args.skills) {
    skillNames =
      args.skills === 'all'
        ? skills.map((s) => s.name)
        : args.skills.split(',').map((x) => x.trim()).filter(Boolean);
  }

  if (nonInteractive) {
    targets = targets || ['claude'];
    skillNames = skillNames || skills.map((s) => s.name);
    if (withCompanion === undefined) withCompanion = false;
  } else {
    const rl = makeRL();
    try {
      if (!targets) targets = await promptTarget(rl);
      if (!skillNames) skillNames = await promptSkills(rl, skills);
      if (withCompanion === undefined) withCompanion = await promptCompanion(rl);

      // Confirmation summary
      console.log(`\n${bold('Summary')}`);
      console.log(`  Targets:   ${targets.map((t) => TARGETS[t].label).join(', ')}`);
      console.log(`  Skills:    ${skillNames.join(', ')}${withCompanion ? `, ${COMPANION.name}` : ''}`);
      for (const t of targets) console.log(`  ${dim(TARGETS[t].label + ' -> ' + skillsDirFor(TARGETS[t], args.dest))}`);
      const ok = (await ask(rl, `\n${cyan('?')} Proceed? [Y/n]: `)) || 'y';
      if (/^n/i.test(ok)) {
        console.log(dim('Cancelled.'));
        return;
      }
    } finally {
      rl.close();
    }
  }

  const installedTargets = runInstall({
    targets,
    skillNames,
    withCompanion,
    skills,
    destOverride: args.dest,
  });
  printUsageHint(installedTargets, skillNames);
}

main().catch((e) => {
  console.error(red('\nSetup failed: ') + e.message);
  process.exitCode = 1;
});
