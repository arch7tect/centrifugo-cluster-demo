import { loadConfig } from './config';
import { EmulatorOrchestrator } from './orchestrator';

async function main() {
  const config = loadConfig();
  const orchestrator = new EmulatorOrchestrator(config);

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    process.exit(0);
  });

  await orchestrator.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
