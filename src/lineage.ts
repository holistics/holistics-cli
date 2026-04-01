/**
 * Holistics AML Lineage Command
 *
 * Extracts lineage metadata from compiled AML and outputs a normalized
 * JSON structure optimized for integration with data catalogs.
 */

import { Command } from 'commander';

// Types for the lineage output
interface SourceTable {
  database?: string;
  schema?: string;
  table: string;
  full_name: string;
}

interface Field {
  name: string;
  label: string;
  type: string;
  is_dimension: boolean;
  is_measure: boolean;
  is_primary_key: boolean;
  description?: string;
  definition?: string;
  aggregation?: string;
}

interface Model {
  fqn: string;
  name: string;
  label: string;
  type: 'TableModel' | 'QueryModel';
  description?: string;
  data_source: string;
  source_table?: SourceTable;
  query?: string;
  owner?: string;
  fields: Field[];
  file_path: string;
}

interface Dataset {
  fqn: string;
  name: string;
  label: string;
  description?: string;
  data_source: string;
  owner?: string;
  models: string[];
  file_path: string;
}

interface Chart {
  fqn: string;
  name: string;
  label: string;
  type: string;
  dashboard: string;
  dataset?: string;
  models_used: string[];
  fields_used: Array<{ model: string; field: string }>;
}

interface Dashboard {
  fqn: string;
  name: string;
  title?: string;
  description?: string;
  owner?: string;
  charts: string[];
  file_path: string;
}

interface LineageEdge {
  model: string;
  source: {
    data_source: string;
    database?: string;
    schema?: string;
    table: string;
  };
}

interface DatasetToModel {
  dataset: string;
  models: string[];
}

interface ChartToModel {
  chart: string;
  dataset?: string;
  models: string[];
}

interface ChartToDataset {
  chart: string;
  dataset: string;
}

interface DashboardToChart {
  dashboard: string;
  charts: string[];
}

interface LineageOutput {
  version: string;
  generated_at: string;
  project: {
    name: string;
    path: string;
  };
  entities: {
    data_sources: string[];
    models: Model[];
    datasets: Dataset[];
    dashboards: Dashboard[];
    charts: Chart[];
  };
  lineage: {
    model_to_source: LineageEdge[];
    dataset_to_model: DatasetToModel[];
    chart_to_dataset: ChartToDataset[];
    chart_to_model: ChartToModel[];
    dashboard_to_chart: DashboardToChart[];
  };
}

// Parse source table name into components
function parseTableName(tableName: string): SourceTable {
  // Handle backtick-quoted BigQuery style: `project`.`schema`.`table`
  const bqMatch = tableName.match(/`([^`]+)`\.`([^`]+)`\.`([^`]+)`/);
  if (bqMatch) {
    return {
      database: bqMatch[1],
      schema: bqMatch[2],
      table: bqMatch[3],
      full_name: tableName,
    };
  }

  // Handle double-quote style: "schema"."table"
  const pgMatch = tableName.match(/"([^"]+)"\.?"([^"]+)"?/);
  if (pgMatch) {
    return {
      schema: pgMatch[1],
      table: pgMatch[2],
      full_name: tableName,
    };
  }

  // Handle simple schema.table
  const simpleMatch = tableName.match(/(\w+)\.(\w+)/);
  if (simpleMatch) {
    return {
      schema: simpleMatch[1],
      table: simpleMatch[2],
      full_name: tableName,
    };
  }

  // Just table name
  return {
    table: tableName,
    full_name: tableName,
  };
}

// Extract heredoc content
function getHeredocContent(heredoc: any): string | undefined {
  if (!heredoc || typeof heredoc !== 'object') return undefined;
  if (heredoc.__type__ === 'Heredoc') {
    return heredoc.content;
  }
  return undefined;
}

// Parse a field (dimension or measure)
function parseField(name: string, data: any, isMeasure: boolean): Field {
  return {
    name,
    label: data.label || name,
    type: data.type || 'text',
    is_dimension: !isMeasure,
    is_measure: isMeasure,
    is_primary_key: data.primary_key || false,
    description: data.description,
    definition: getHeredocContent(data.definition),
    aggregation: isMeasure ? data.aggregation_type : undefined,
  };
}

// Parse a model from compiled JSON
function parseModel(filePath: string, data: any): Model | null {
  const type = data.__type__;
  if (type !== 'TableModel' && type !== 'QueryModel') return null;

  const fields: Field[] = [];

  // Parse dimensions
  if (data.dimension) {
    for (const [name, dimData] of Object.entries(data.dimension)) {
      fields.push(parseField(name, dimData, false));
    }
  }

  // Parse measures
  if (data.measure) {
    for (const [name, measureData] of Object.entries(data.measure)) {
      fields.push(parseField(name, measureData, true));
    }
  }

  const model: Model = {
    fqn: data.__fqn__ || data.name,
    name: data.name,
    label: data.label || data.name,
    type: type as 'TableModel' | 'QueryModel',
    description: typeof data.description === 'string' ? data.description : getHeredocContent(data.description),
    data_source: data.data_source_name || '',
    owner: data.owner,
    fields,
    file_path: filePath,
  };

  if (type === 'TableModel' && data.table_name) {
    model.source_table = parseTableName(data.table_name);
  }

  if (type === 'QueryModel' && data.query) {
    model.query = getHeredocContent(data.query);
  }

  return model;
}

// Parse a dataset from compiled JSON
function parseDataset(filePath: string, data: any): Dataset | null {
  if (data.__type__ !== 'Dataset') return null;

  const modelNames: string[] = [];
  if (Array.isArray(data.models)) {
    for (const model of data.models) {
      if (model && typeof model === 'object' && model.name) {
        modelNames.push(model.__fqn__ || model.name);
      }
    }
  }

  return {
    fqn: data.__fqn__ || data.name,
    name: data.name,
    label: data.label || data.name,
    description: typeof data.description === 'string' ? data.description : getHeredocContent(data.description),
    data_source: data.data_source_name || '',
    owner: data.owner,
    models: modelNames,
    file_path: filePath,
  };
}

// Extract field references from a viz object recursively
function extractFieldRefs(obj: any): Array<{ model: string; field: string }> {
  const refs: Array<{ model: string; field: string }> = [];

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;

    if (o.__type__ === 'FieldRef' && o.model && o.field) {
      refs.push({ model: o.model, field: o.field });
    }

    if (Array.isArray(o)) {
      for (const item of o) traverse(item);
    } else {
      for (const value of Object.values(o)) traverse(value);
    }
  }

  traverse(obj);
  return refs;
}

// Parse a chart (viz block) from a dashboard
function parseChart(dashboardFqn: string, blockName: string, blockData: any): Chart {
  const def = blockData.def || {};
  const viz = def.viz || {};
  const dataset = viz.dataset || {};

  const fieldRefs = extractFieldRefs(viz);
  const modelsUsed = [...new Set(fieldRefs.map(r => r.model))];

  return {
    fqn: `${dashboardFqn}.${blockName}`,
    name: blockName,
    label: def.label || blockName,
    type: def.__type__ || 'VizBlock',
    dashboard: dashboardFqn,
    dataset: dataset.__fqn__ || dataset.name,
    models_used: modelsUsed,
    fields_used: fieldRefs,
  };
}

// Parse a dashboard from compiled JSON
function parseDashboard(filePath: string, data: any): { dashboard: Dashboard; charts: Chart[] } | null {
  if (data.__type__ !== 'Dashboard') return null;

  const dashboardFqn = data.__fqn__ || data.uname;
  const charts: Chart[] = [];
  const chartFqns: string[] = [];

  if (data.block && typeof data.block === 'object') {
    for (const [blockName, blockData] of Object.entries(data.block)) {
      const chart = parseChart(dashboardFqn, blockName, blockData);
      charts.push(chart);
      chartFqns.push(chart.fqn);
    }
  }

  const dashboard: Dashboard = {
    fqn: dashboardFqn,
    name: data.uname || dashboardFqn,
    title: data.title,
    description: typeof data.description === 'string' ? data.description : getHeredocContent(data.description),
    owner: data.owner,
    charts: chartFqns,
    file_path: filePath,
  };

  return { dashboard, charts };
}

// Main function to transform compiled JSON to lineage format
export function transformToLineage(compiledData: Record<string, any>, projectPath: string): LineageOutput {
  const models: Model[] = [];
  const datasets: Dataset[] = [];
  const dashboards: Dashboard[] = [];
  const charts: Chart[] = [];
  const dataSources = new Set<string>();

  // Parse all entities
  for (const [filePath, data] of Object.entries(compiledData)) {
    if (!data || typeof data !== 'object' || !data.__type__) continue;

    // Skip non-AML files that got compiled
    if (!filePath.endsWith('.aml') && !filePath.includes('.aml')) {
      // Check if it's a valid entity anyway
      if (!['TableModel', 'QueryModel', 'Dataset', 'Dashboard'].includes(data.__type__)) {
        continue;
      }
    }

    const entityType = data.__type__;

    if (entityType === 'TableModel' || entityType === 'QueryModel') {
      const model = parseModel(filePath, data);
      if (model) {
        models.push(model);
        if (model.data_source) dataSources.add(model.data_source);
      }
    } else if (entityType === 'Dataset') {
      const dataset = parseDataset(filePath, data);
      if (dataset) {
        datasets.push(dataset);
        if (dataset.data_source) dataSources.add(dataset.data_source);
      }
    } else if (entityType === 'Dashboard') {
      const result = parseDashboard(filePath, data);
      if (result) {
        dashboards.push(result.dashboard);
        charts.push(...result.charts);
      }
    }
  }

  // Build lineage edges
  const modelToSource: LineageEdge[] = models
    .filter(m => m.type === 'TableModel' && m.source_table)
    .map(m => ({
      model: m.fqn,
      source: {
        data_source: m.data_source,
        database: m.source_table!.database,
        schema: m.source_table!.schema,
        table: m.source_table!.table,
      },
    }));

  const datasetToModel: DatasetToModel[] = datasets.map(d => ({
    dataset: d.fqn,
    models: d.models,
  }));

  const chartToDataset: ChartToDataset[] = charts
    .filter(c => c.dataset)
    .map(c => ({
      chart: c.fqn,
      dataset: c.dataset!,
    }));

  const chartToModel: ChartToModel[] = charts
    .filter(c => c.models_used.length > 0)
    .map(c => ({
      chart: c.fqn,
      dataset: c.dataset,
      models: c.models_used,
    }));

  const dashboardToChart: DashboardToChart[] = dashboards.map(d => ({
    dashboard: d.fqn,
    charts: d.charts,
  }));

  // Extract project name from path
  const projectName = projectPath.split('/').filter(Boolean).pop() || 'unknown';

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    project: {
      name: projectName,
      path: projectPath,
    },
    entities: {
      data_sources: [...dataSources],
      models,
      datasets,
      dashboards,
      charts,
    },
    lineage: {
      model_to_source: modelToSource,
      dataset_to_model: datasetToModel,
      chart_to_dataset: chartToDataset,
      chart_to_model: chartToModel,
      dashboard_to_chart: dashboardToChart,
    },
  };
}

// Register the lineage command
export function registerLineageCommand(program: Command, compileFunc: (path: string) => Promise<Record<string, any>>) {
  program
    .command('lineage [path]')
    .description('Extract lineage metadata from AML project')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .option('--entities <types>', 'Filter by entity types (comma-separated: models,datasets,dashboards,charts)')
    .option('--compact', 'Output compact JSON (no pretty printing)')
    .action(async (path: string = '.', options: { output?: string; entities?: string; compact?: boolean }) => {
      try {
        // Compile the AML project
        const compiledData = await compileFunc(path);

        // Transform to lineage format
        const lineage = transformToLineage(compiledData, path);

        // Filter entities if requested
        if (options.entities) {
          const allowedTypes = options.entities.split(',').map(t => t.trim().toLowerCase());
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
