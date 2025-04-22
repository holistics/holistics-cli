import { loadModule } from './loader';
import { Command } from 'commander';

const program = new Command();

const clicore = await loadModule('@holistics/cli-core');
clicore.registerCommands(program);

program.parse(process.argv);
