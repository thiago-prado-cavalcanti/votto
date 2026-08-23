/**
 * Votto sync worker — the long-running process that keeps the federal data fresh.
 *
 * Runs the whole synchronization chain (`src/lib/integration/pipeline.ts`) on its
 * weekly slot, America/São_Paulo. Started as its own container in production:
 *
 *   docker compose -f docker-compose.prod.yml up -d worker
 *
 * Behaviour:
 *   * **One chain, in order** — the jobs are not independent (a bill import
 *     resolves its authors against the agent roster; the quality index ranks a
 *     cohort the vote import supplies), so they run as a sequence rather than on
 *     sixteen clocks that could finish out of order.
 *   * **Skips what is current** — a job that succeeded inside the freshness
 *     window is not re-run, which is what makes booting cheap and lets the chain
 *     be triggered by hand without paying for the whole federal record again.
 *   * **Catch-up on boot** — the chain simply runs at startup. Freshness does the
 *     deciding, so a restart costs nothing when everything is in date and a fresh
 *     deployment populates itself without anyone typing a command.
 *   * **Failure isolation** — a failing job is logged and the chain continues;
 *     only a `needs` dependent is held back, for the next run to pick up.
 *   * **Graceful shutdown** — SIGINT/SIGTERM stop the loop after the current job.
 *
 * Concurrency with the other triggers (admin panel, cron endpoint, CLI) is
 * handled one level down: the chain takes a lock of its own and every job takes
 * its own on top of it.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import { PIPELINE_SCHEDULE, SYNC_JOBS } from "@/lib/integration/jobs";
import { reapOrphanRuns } from "@/lib/integration/runner";
import {
  FRESH_FOR_DAYS,
  orderedJobs,
  releaseChainClaimOnBoot,
  runPipeline,
  summarize,
} from "@/lib/integration/pipeline";
import { describeSchedule, formatZoned, nextOccurrence } from "@/lib/integration/schedule";
import { db } from "@/lib/db";

/**
 * Longest single sleep. `setTimeout` is capped at ~24.8 days, and shorter naps
 * let the loop notice a shutdown signal promptly.
 */
const MAX_SLEEP_MS = 60 * 60 * 1000;

/**
 * Seconds between progress lines. The heavy jobs run for tens of minutes; a log
 * that says nothing between "started" and "finished" is indistinguishable from a
 * hang, which is how an operator ends up killing a healthy import.
 */
const HEARTBEAT_SECONDS = 30;

let stopping = false;

/** Sleep in bounded slices so shutdown is observed within the minute. */
async function sleepUntil(target: Date): Promise<void> {
  while (!stopping) {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, MAX_SLEEP_MS)));
  }
}

/** Timestamped log line. */
function log(message: string): void {
  console.log(`[${formatZoned(new Date())}] ${message}`);
}

/** Run the chain once, narrating every decision. */
async function runChain(trigger: string): Promise<void> {
  log(`Sincronização (${trigger}) — ${SYNC_JOBS.length} jobs na cadeia.`);

  let startedAt = Date.now();
  let lastBeat = startedAt;

  const report = await runPipeline({
    shouldStop: () => stopping,
    onStep: (step, index, total) => {
      if (step.action !== "run") return;
      startedAt = Date.now();
      lastBeat = startedAt;
      log(`[${index + 1}/${total}] ▶ ${step.job.name} — ${step.job.label} (${step.reason})`);
    },
    onProgress: (_job, progress) => {
      const now = Date.now();
      if (now - lastBeat < HEARTBEAT_SECONDS * 1000) return;
      lastBeat = now;
      const secs = Math.round((now - startedAt) / 1000);
      log(`      … ${progress.note ?? `${progress.seen} itens`} (${progress.upserted} gravados, ${secs}s)`);
    },
    onDone: (step, index, total) => {
      const position = `[${index + 1}/${total}]`;
      if (step.status === "ok") {
        log(
          `      ✓ ${step.itemsUpserted} atualizados / ${step.itemsSeen} vistos ` +
            `em ${(step.durationMs / 1000).toFixed(1)}s`,
        );
      } else if (step.status === "fresh") {
        log(`${position} ↷ ${step.name} — em dia (${step.reason})`);
      } else if (step.status === "failed") {
        log(`      ✗ ${step.name} falhou: ${step.reason}`);
      } else {
        log(`${position} ⏸ ${step.name} — adiado: ${step.reason}`);
      }
    },
  });

  if (report.status === "locked") {
    log(
      "↷ Sincronização já em andamento" +
        `${report.runningSince ? ` desde ${formatZoned(report.runningSince)}` : ""} — nada a fazer.`,
    );
    return;
  }

  log(`${report.interrupted ? "⏹" : report.failed === 0 ? "✓" : "⚠"} ${summarize(report)}`);
}

/** Main loop: run the chain, then sleep until the next weekly slot, forever. */
async function main(): Promise<void> {
  log(`Worker iniciado — cadeia de ${SYNC_JOBS.length} jobs, ${describeSchedule(PIPELINE_SCHEDULE)}.`);
  log(`Frescor: um job concluído há menos de ${FRESH_FOR_DAYS} dias é pulado.`);
  for (const [i, job] of orderedJobs().entries()) {
    log(`  ${String(i + 1).padStart(2)}. ${job.name} — ${job.label}`);
  }

  // A restart is proof that nothing we started is still running. Close whatever
  // the previous process left open before deciding anything, so a job it was
  // killed mid-run neither looks busy nor keeps its claim.
  const reaped = await reapOrphanRuns();
  if (reaped > 0) log(`${reaped} execução(ões) interrompida(s) por um reinício anterior, encerrada(s).`);

  // The reaper works off a lease; this works off the fact of the restart, which
  // is what a deploy landing mid-chain actually gives us.
  const abandoned = await releaseChainClaimOnBoot();
  if (abandoned) {
    log(
      `Cadeia constava em execução desde ${formatZoned(abandoned)} — claim liberado: ` +
        "um worker que sobe é prova de que aquele processo não existe mais.",
    );
  }

  // Boot is just another chain run: freshness decides whether it costs anything.
  await runChain("na inicialização");

  while (!stopping) {
    const next = nextOccurrence(PIPELINE_SCHEDULE, new Date());
    log(`Próxima sincronização: ${formatZoned(next)}.`);
    await sleepUntil(next);
    if (stopping) break;
    await runChain("agendada");
  }

  log("Worker encerrado.");
  await db.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1); // Second signal: give up waiting.
    stopping = true;
    log(`Sinal ${signal} recebido — encerrando após o job atual…`);
  });
}

void main().catch(async (err) => {
  console.error("Worker falhou:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
