import { loadConfig } from './config';
import { EmulatorOrchestrator } from './orchestrator';
import { Logger, getLogger } from './logger';

const logger = getLogger('main');

async function main() {
  const config = loadConfig();

  const logFile = Logger.setupLogging(config.numClients, config.cyclesPerClient);
  logger.info(`Logging to file. [log_file=${logFile}]`);

  const orchestrator = new EmulatorOrchestrator(config);

  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    Logger.closeLogging();
    process.exit(0);
  });

  await orchestrator.run();
  Logger.closeLogging();
}

main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  Logger.closeLogging();
  process.exit(1);
});
