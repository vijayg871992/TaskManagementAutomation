'use strict';

/**
 * Test-harness CLI — simulate ANY sender without logins or the team.
 *
 *   npm run simulate -- --from Donald "Hey Jarvis, assign Eric for Cold Calling to pull 400 leads by Monday 4pm"
 *   npm run simulate -- --from Jeremy --pick "Cold Calling" "Hey Jarvis, assign Vijay to pull leads by Friday"
 *   npm run simulate -- --list            # show the roster + projects
 *
 * Uses the SAME commandService the web app uses, so it exercises real logic.
 */

const { getKnex, destroyKnex } = require('../src/db/knex');
const taskService = require('../src/services/taskService');
const commandService = require('../src/services/commandService');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') args.from = argv[++i];
    else if (a === '--pick') args.pick = argv[++i];
    else if (a === '--list') args.list = true;
    else args._.push(a);
  }
  args.text = args._.join(' ');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const users = await taskService.listUsers();
    const projects = await taskService.listProjects();
    console.log('People:', users.map((u) => u.name).join(', '));
    console.log('Projects:', projects.map((p) => p.name).join(', '));
    return;
  }

  if (!args.from || !args.text) {
    console.error('Usage: npm run simulate -- --from <Name> "Hey Jarvis, ..."');
    console.error('       npm run simulate -- --list');
    process.exitCode = 1;
    return;
  }

  const sender = await taskService.findUserByName(args.from);
  if (!sender) {
    console.error(`Unknown sender "${args.from}". Try --list.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[${sender.name}] > ${args.text}\n`);
  let res = await commandService.handle({ senderId: sender.id, text: args.text });

  // If a project is needed and --pick was supplied, complete the flow.
  if (res.status === 'need_project' && args.pick) {
    const proj = res.projects.find((p) => p.name.toLowerCase() === args.pick.toLowerCase());
    if (!proj) {
      console.log(`need_project: "${args.pick}" not in [${res.projects.map((p) => p.name).join(', ')}]`);
    } else {
      console.log(`(auto-picking project "${proj.name}")`);
      res = await commandService.createFromDraft({ senderId: sender.id, draft: res.draft, projectId: proj.id });
    }
  }

  switch (res.status) {
    case 'created':
      console.log('✅ CREATED');
      console.log('   ' + res.summary);
      console.log(`   task #${res.task.id} | status=${res.task.status} | deadline_utc=${res.task.deadline_utc}`);
      break;
    case 'need_project':
      console.log('❓ NEED PROJECT —', res.message);
      console.log('   options:', res.projects.map((p) => p.name).join(', '));
      console.log('   (re-run with --pick "<Project>" to complete)');
      break;
    case 'error':
      console.log('⛔ ERROR —', res.message);
      break;
    default:
      console.log(res);
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error('Simulate failed:', e);
    process.exitCode = 1;
  })
  .finally(() => destroyKnex());
