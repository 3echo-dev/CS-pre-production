// Function hooks: the rules that refuse, sitting in front of the call rather than after it.
//
// Loaded by the engine only when CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1. Switched off, every
// rule below is still written down in CONFIG.md and the agent files, and the model is asked
// to follow it. That difference is the point of the flag.
//
// Three rules shape this module:
//   1. Nothing here may fail a session. A hook that throws is skipped, so every op call sits
//      inside a try whose catch is the safe answer, and for a spend the safe answer is no.
//   2. `$` is not a value. It is spelled `$.noun.verb(...)` at a call site and nowhere else.
//      The pure half of every rule lives in `lib.mjs`, which takes an op's result, never `$`.
//   3. The module's filesystem stops at the session's working directory. It reads the world
//      through `$.process.run` on scripts that already own the answer: `job-context.js` for
//      which project is open, `preflight-generation.js --json` for whether the plan is safe.
import * as lib from './lib.mjs';

const CONTEXT_MS = 3000;
const PREFLIGHT_MS = 7000;
const CONTEXT_FRESH_MS = 5000;

/** @type {{ at: number, ctx: any } | null} */
let lastContext = null;

async function context($) {
  const now = Date.now();
  if (lastContext && now - lastContext.at < CONTEXT_FRESH_MS) return lastContext.ctx;
  try {
    const run = await $.process.run(['node', $.plugin.root + '/scripts/job-context.js', '--json'], { timeoutMs: CONTEXT_MS });
    const ctx = lib.readJson(run.stdout);
    lastContext = { at: now, ctx };
    return ctx;
  } catch {
    return null;
  }
}

export const register = (on) => {
  on('session.start', async ($, e, next) => {
    try { $.ui.log(lib.PLUGIN_NAME + ': the spend and write guards are on.'); } catch { /* a log line is never worth a session */ }
    return next(e);
  });

  // One hook for every tool call. No matcher: MCP tool names carry the server in them, and
  // only the suffix is stable across a plugin install and a Desktop connector.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool || '');
    const args = /** @type {Record<string, any>} */ (/** @type {unknown} */ (e));

    // ---------------------------------------------------------------------------------
    // The spend guard. A generation call is refused unless the open project's plan passed
    // the pre-spend gate, the key names a panel that plan covers, the sample came first,
    // and the batch stays under the figure agreed at the sample approval.
    // ---------------------------------------------------------------------------------
    if (lib.STUDIO.test(tool) || lib.VIDEO.test(tool) || lib.SPENDER.test(tool)) {
      let verdict;
      try {
        const ctx = await context($);
        let preflight = null;
        let panelsOnDisk = 0;
        if (lib.SPENDER.test(tool) && ctx && ctx.jobId) {
          const run = await $.process.run(
            ['node', $.plugin.root + '/scripts/preflight-generation.js', ctx.client || ctx.brand, ctx.jobId, '--json'],
            { timeoutMs: PREFLIGHT_MS });
          preflight = lib.readJson(run.stdout);
          if (preflight && Number.isFinite(Number(preflight.generated))) panelsOnDisk = Number(preflight.generated);
        }
        verdict = lib.spendVerdict(tool, args.idempotencyKey, ctx, preflight, panelsOnDisk);
      } catch {
        verdict = { deny: lib.DENY.preflightBroke };
      }
      if (verdict && verdict.deny) {
        try { $.ui.log(lib.PLUGIN_NAME + ' refused ' + tool + ': ' + verdict.deny); } catch { /* the deny is what matters */ }
        return { deny: verdict.deny };
      }
      return next(e);
    }

    // ---------------------------------------------------------------------------------
    // The write guard. Six files nobody may write by hand, and the plugin folder.
    // ---------------------------------------------------------------------------------
    if (lib.WRITE_TOOLS.includes(tool)) {
      try {
        const ctx = await context($);
        const verdict = lib.classifyWrite(lib.writeTarget(args), ctx && ctx.root, $.plugin.root);
        if (verdict.action === 'deny') {
          try { $.ui.log(lib.PLUGIN_NAME + ' refused ' + tool + ': ' + verdict.reason); } catch { /* the deny is what matters */ }
          return { deny: verdict.reason };
        }
      } catch {
        /* a write the guard could not classify is allowed: the write rules are about the
           pipeline's own files, and failing every write in a session would be worse */
      }
      return next(e);
    }

    // A shell heredoc loses the file on this machine. The Write tool is the way.
    if (tool === 'Bash' && lib.HEREDOC.test(String(args.command || ''))) {
      const reason = 'A shell heredoc loses the file on this machine. Write the file with the Write tool, or with a script that writes the same shape every time.';
      try { $.ui.log(lib.PLUGIN_NAME + ' refused Bash: heredoc'); } catch { /* the deny is what matters */ }
      return { deny: reason };
    }

    return next(e);
  });

  // The block the model reads beside every prompt: which project is open, whose turn it is,
  // and the two rules a run most often forgets.
  on('prompt.submit', async ($, e, next) => {
    try {
      const ctx = await context($);
      const block = lib.contextBlock(ctx);
      if (block && typeof e.text === 'string' && !e.text.includes('1-22, this folder:')) {
        return next({ ...e, text: e.text + '\n\n' + block });
      }
    } catch {
      /* no context means the prompt goes through as typed */
    }
    return next(e);
  });
};
