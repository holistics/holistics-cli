import { loadModule } from './loader';
import { Command } from 'commander';

const program = new Command();

// Pin a specific @holistics/cli-core version via env, otherwise use the latest
const cliCoreVersion = process.env.HOLISTICS_CLI_CORE_VERSION?.trim() || undefined;

const clicore = await loadModule('@holistics/cli-core', cliCoreVersion);
clicore.registerCommands(program);

program.parse(process.argv);
