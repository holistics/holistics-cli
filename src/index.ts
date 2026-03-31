import { loadModule } from './loader';
import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { transformToLineage } from './lineage';

const program = new Command();

const clicore = await loadModule('@holistics/cli-core');
clicore.registerCommands(program);

// Helper to run compile command and capture JSON output
async function runCompile(projectPath: string): Promise<Record<string, any>> {
  return new Promise((resolvePromise, reject) => {
    // Get the path to the holistics wrapper script
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const holisticsWrapper = resolve(__dirname, '..', 'holistics');

    const child = spawn(holisticsWrapper, ['aml', 'compile', '.'], {
      cwd: projectPath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, HOLISTICS_LINEAGE_SUBPROCESS: '1' }, // Prevent recursion
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Compile failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolvePromise(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse compile output: ${e}\nOutput: ${stdout.slice(0, 500)}`));
      }
    });

    child.on('error', reject);
  });
}

// Add lineage command under 'aml'
const amlCommand = program.commands.find(cmd => cmd.name() === 'aml');
if (amlCommand) {
  amlCommand
    .command('lineage [path]')
    .description('Extract lineage metadata from AML project in a normalized format')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .option('--entities <types>', 'Filter by entity types (comma-separated: models,datasets,dashboards,charts)')
    .option('--compact', 'Output compact JSON (no pretty printing)')
    .action(async (path: string = '.', options: { output?: string; entities?: string; compact?: boolean }) => {
      try {
        const projectPath = resolve(path);

        // Compile the AML project
        const compiledData = await runCompile(projectPath);

        // Transform to lineage format
        const lineage = transformToLineage(compiledData, projectPath);

        // Filter entities if requested
        if (options.entities) {
          const allowedTypes = options.entities.split(',').map((t: string) => t.trim().toLowerCase());
          if (!allowedTypes.includes('models')) lineage.entities.models = [];
          if (!allowedTypes.includes('datasets')) lineage.entities.datasets = [];
          if (!allowedTypes.includes('dashboards')) lineage.entities.dashboards = [];
          if (!allowedTypes.includes('charts')) lineage.entities.charts = [];
        }

        // Output
        const jsonOutput = options.compact
          ? JSON.stringify(lineage)
          : JSON.stringify(lineage, null, 2);

        if (options.output) {
          const { writeFile } = await import('fs/promises');
          await writeFile(options.output, jsonOutput);
          console.error(`Lineage written to ${options.output}`);
        } else {
          console.log(jsonOutput);
        }
      } catch (error) {
        console.error('Error generating lineage:', error);
        process.exit(1);
      }
    });
}

program.parse(process.argv);
