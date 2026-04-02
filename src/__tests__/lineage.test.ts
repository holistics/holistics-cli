import { describe, it, expect, vi } from 'vitest';
import { transformToLineage, type CliCoreModule } from '../lineage';
import compiledSample from './fixtures/compiled-sample.json';

describe('transformToLineage', () => {
  const projectPath = '/test/project';
  const lineage = transformToLineage(compiledSample, projectPath);

  describe('metadata', () => {
    it('should include version and project info', () => {
      expect(lineage.version).toBe('1.0');
      expect(lineage.project.name).toBe('project');
      expect(lineage.project.path).toBe(projectPath);
      expect(lineage.generated_at).toBeDefined();
    });
  });

  describe('entities.models', () => {
    it('should parse TableModel correctly', () => {
      const orders = lineage.entities.models.find(m => m.name === 'orders');
      expect(orders).toBeDefined();
      expect(orders!.fqn).toBe('orders');
      expect(orders!.type).toBe('TableModel');
      expect(orders!.label).toBe('Orders');
      expect(orders!.data_source).toBe('bigquery');
      expect(orders!.owner).toBe('data@example.com');
      expect(orders!.description).toBe('Order transactions');
    });

    it('should parse QueryModel correctly', () => {
      const customers = lineage.entities.models.find(m => m.name === 'customers');
      expect(customers).toBeDefined();
      expect(customers!.type).toBe('QueryModel');
      expect(customers!.query).toBe('SELECT * FROM customers_raw');
    });

    it('should parse source_table for TableModel', () => {
      const orders = lineage.entities.models.find(m => m.name === 'orders');
      expect(orders!.source_table).toBeDefined();
      expect(orders!.source_table!.database).toBe('project');
      expect(orders!.source_table!.schema).toBe('schema');
      expect(orders!.source_table!.table).toBe('orders');
    });

    it('should parse fields correctly', () => {
      const orders = lineage.entities.models.find(m => m.name === 'orders');
      expect(orders!.fields.length).toBe(5); // 3 dimensions + 2 measures

      const idField = orders!.fields.find(f => f.name === 'id');
      expect(idField!.is_dimension).toBe(true);
      expect(idField!.is_measure).toBe(false);
      expect(idField!.is_primary_key).toBe(true);

      const amountField = orders!.fields.find(f => f.name === 'total_amount');
      expect(amountField!.is_dimension).toBe(false);
      expect(amountField!.is_measure).toBe(true);
      expect(amountField!.aggregation).toBe('sum');
    });
  });

  describe('entities.datasets', () => {
    it('should parse Dataset correctly', () => {
      expect(lineage.entities.datasets.length).toBe(1);
      const ecommerce = lineage.entities.datasets[0];
      expect(ecommerce.fqn).toBe('ecommerce');
      expect(ecommerce.name).toBe('ecommerce');
      expect(ecommerce.label).toBe('E-commerce Dataset');
      expect(ecommerce.models).toEqual(['orders', 'customers']);
    });

    it('should extract metrics with AQL references', () => {
      const ecommerce = lineage.entities.datasets[0];
      expect(ecommerce.metrics.length).toBe(2);

      const ltvMetric = ecommerce.metrics.find(m => m.name === 'customer_ltv');
      expect(ltvMetric).toBeDefined();
      expect(ltvMetric!.label).toBe('Customer LTV');
      expect(ltvMetric!.models_referenced).toContain('orders');
      expect(ltvMetric!.models_referenced).toContain('customers');
      expect(ltvMetric!.fields_referenced).toContainEqual({ model: 'orders', field: 'total_amount' });
      expect(ltvMetric!.fields_referenced).toContainEqual({ model: 'customers', field: 'id' });

      const avgMetric = ecommerce.metrics.find(m => m.name === 'avg_order_value');
      expect(avgMetric).toBeDefined();
      expect(avgMetric!.models_referenced).toContain('orders');
      expect(avgMetric!.fields_referenced).toContainEqual({ model: 'orders', field: 'total_amount' });
    });
  });

  describe('entities.dashboards', () => {
    it('should parse Dashboard correctly', () => {
      expect(lineage.entities.dashboards.length).toBe(1);
      const dashboard = lineage.entities.dashboards[0];
      expect(dashboard.fqn).toBe('sales_overview');
      expect(dashboard.title).toBe('Sales Overview');
      expect(dashboard.owner).toBe('product@example.com');
      expect(dashboard.charts.length).toBe(3);
    });
  });

  describe('entities.charts', () => {
    it('should parse charts with field references', () => {
      expect(lineage.entities.charts.length).toBe(3);

      const revenueChart = lineage.entities.charts.find(c => c.name === 'revenue_chart');
      expect(revenueChart).toBeDefined();
      expect(revenueChart!.label).toBe('Revenue Over Time');
      expect(revenueChart!.dashboard).toBe('sales_overview');
      expect(revenueChart!.dataset).toBe('ecommerce');
      expect(revenueChart!.models_used).toContain('orders');
      expect(revenueChart!.fields_used).toContainEqual({ model: 'orders', field: 'order_date', source: 'field_ref' });
      expect(revenueChart!.fields_used).toContainEqual({ model: 'orders', field: 'total_amount', source: 'field_ref' });
    });

    it('should track multiple models used in a chart', () => {
      const segmentsChart = lineage.entities.charts.find(c => c.name === 'customer_segments');
      expect(segmentsChart!.models_used).toContain('customers');
      expect(segmentsChart!.models_used).toContain('orders');
    });

    it('should extract model refs from AQL calculations in charts', () => {
      const aqlChart = lineage.entities.charts.find(c => c.name === 'aql_calculation_chart');
      expect(aqlChart).toBeDefined();

      // Should have both field_ref and aql sources
      expect(aqlChart!.fields_used.some(f => f.source === 'field_ref')).toBe(true);
      expect(aqlChart!.fields_used.some(f => f.source === 'aql')).toBe(true);

      // Should extract refs from AQL calculations
      expect(aqlChart!.fields_used).toContainEqual({ model: 'orders', field: 'total_amount', source: 'aql' });
      expect(aqlChart!.fields_used).toContainEqual({ model: 'customers', field: 'id', source: 'aql' });

      // Should include both orders and customers in models_used
      expect(aqlChart!.models_used).toContain('orders');
      expect(aqlChart!.models_used).toContain('customers');
    });
  });

  describe('entities.data_sources', () => {
    it('should collect unique data sources', () => {
      expect(lineage.entities.data_sources).toContain('bigquery');
    });
  });

  describe('lineage.model_to_source', () => {
    it('should create edges for TableModels with source tables', () => {
      const ordersEdge = lineage.lineage.model_to_source.find(e => e.model === 'orders');
      expect(ordersEdge).toBeDefined();
      expect(ordersEdge!.source.data_source).toBe('bigquery');
      expect(ordersEdge!.source.database).toBe('project');
      expect(ordersEdge!.source.schema).toBe('schema');
      expect(ordersEdge!.source.table).toBe('orders');
    });

    it('should not create edges for QueryModels', () => {
      const customersEdge = lineage.lineage.model_to_source.find(e => e.model === 'customers');
      expect(customersEdge).toBeUndefined();
    });
  });

  describe('lineage.dataset_to_model', () => {
    it('should map datasets to their models', () => {
      expect(lineage.lineage.dataset_to_model.length).toBe(1);
      const edge = lineage.lineage.dataset_to_model[0];
      expect(edge.dataset).toBe('ecommerce');
      expect(edge.models).toEqual(['orders', 'customers']);
    });
  });

  describe('lineage.chart_to_dataset', () => {
    it('should map charts to their datasets', () => {
      expect(lineage.lineage.chart_to_dataset.length).toBe(3);

      const revenueEdge = lineage.lineage.chart_to_dataset.find(
        e => e.chart === 'sales_overview.revenue_chart'
      );
      expect(revenueEdge).toBeDefined();
      expect(revenueEdge!.dataset).toBe('ecommerce');

      const segmentsEdge = lineage.lineage.chart_to_dataset.find(
        e => e.chart === 'sales_overview.customer_segments'
      );
      expect(segmentsEdge).toBeDefined();
      expect(segmentsEdge!.dataset).toBe('ecommerce');
    });
  });

  describe('lineage.chart_to_model', () => {
    it('should map charts to models via field refs', () => {
      expect(lineage.lineage.chart_to_model.length).toBe(3);

      const revenueEdge = lineage.lineage.chart_to_model.find(
        e => e.chart === 'sales_overview.revenue_chart'
      );
      expect(revenueEdge!.dataset).toBe('ecommerce');
      expect(revenueEdge!.models).toContain('orders');

      const segmentsEdge = lineage.lineage.chart_to_model.find(
        e => e.chart === 'sales_overview.customer_segments'
      );
      expect(segmentsEdge!.models).toContain('customers');
      expect(segmentsEdge!.models).toContain('orders');
    });
  });

  describe('lineage.dashboard_to_chart', () => {
    it('should map dashboards to their charts', () => {
      expect(lineage.lineage.dashboard_to_chart.length).toBe(1);
      const edge = lineage.lineage.dashboard_to_chart[0];
      expect(edge.dashboard).toBe('sales_overview');
      expect(edge.charts).toContain('sales_overview.revenue_chart');
      expect(edge.charts).toContain('sales_overview.customer_segments');
      expect(edge.charts).toContain('sales_overview.aql_calculation_chart');
    });
  });
});

describe('parseTableName', () => {
  it('should parse BigQuery backtick format', () => {
    const lineage = transformToLineage(
      {
        'test.aml': {
          __type__: 'TableModel',
          __fqn__: 'test',
          name: 'test',
          data_source_name: 'bq',
          table_name: '`my-project`.`dataset`.`table`',
          dimension: {},
          measure: {},
        },
      },
      '/test'
    );
    const model = lineage.entities.models[0];
    expect(model.source_table!.database).toBe('my-project');
    expect(model.source_table!.schema).toBe('dataset');
    expect(model.source_table!.table).toBe('table');
  });

  it('should parse PostgreSQL double-quote format', () => {
    const lineage = transformToLineage(
      {
        'test.aml': {
          __type__: 'TableModel',
          __fqn__: 'test',
          name: 'test',
          data_source_name: 'pg',
          table_name: '"public"."users"',
          dimension: {},
          measure: {},
        },
      },
      '/test'
    );
    const model = lineage.entities.models[0];
    expect(model.source_table!.schema).toBe('public');
    expect(model.source_table!.table).toBe('users');
  });

  it('should parse simple schema.table format', () => {
    const lineage = transformToLineage(
      {
        'test.aml': {
          __type__: 'TableModel',
          __fqn__: 'test',
          name: 'test',
          data_source_name: 'mysql',
          table_name: 'mydb.orders',
          dimension: {},
          measure: {},
        },
      },
      '/test'
    );
    const model = lineage.entities.models[0];
    expect(model.source_table!.schema).toBe('mydb');
    expect(model.source_table!.table).toBe('orders');
  });
});

describe('AQL type-checked extraction', () => {
  // Sample compiled data for testing
  const sampleCompiledData = {
    'datasets/test.aml': {
      __type__: 'Dataset',
      __fqn__: 'test_dataset',
      name: 'test_dataset',
      label: 'Test Dataset',
      data_source_name: 'bigquery',
      models: [
        { name: 'orders', __fqn__: 'orders' },
        { name: 'customers', __fqn__: 'customers' },
      ],
      metric: {
        test_metric: {
          label: 'Test Metric',
          type: 'number',
          definition: { __type__: 'Heredoc', content: 'sum(orders.amount) / count_distinct(customers.id)' },
        },
      },
    },
    'dashboards/test.aml': {
      __type__: 'Dashboard',
      __fqn__: 'test_dashboard',
      uname: 'test_dashboard',
      title: 'Test Dashboard',
      block: {
        test_chart: {
          def: {
            __type__: 'VizBlock',
            label: 'Test Chart',
            viz: {
              dataset: { name: 'test_dataset', __fqn__: 'test_dataset' },
              calculation: {
                calc1: {
                  formula: { __type__: 'Heredoc', content: 'avg(orders.amount)' },
                },
              },
            },
          },
        },
      },
    },
  };

  describe('without cli-core (regex fallback)', () => {
    it('should extract AQL refs using regex when no cli-core provided', () => {
      const lineage = transformToLineage(sampleCompiledData, '/test');

      const dataset = lineage.entities.datasets[0];
      expect(dataset.metrics[0].models_referenced).toContain('orders');
      expect(dataset.metrics[0].models_referenced).toContain('customers');
      expect(dataset.metrics[0].fields_referenced).toContainEqual({ model: 'orders', field: 'amount' });
      expect(dataset.metrics[0].fields_referenced).toContainEqual({ model: 'customers', field: 'id' });
    });

    it('should extract AQL refs from chart calculations using regex', () => {
      const lineage = transformToLineage(sampleCompiledData, '/test');

      const chart = lineage.entities.charts[0];
      expect(chart.fields_used.some(f => f.source === 'aql')).toBe(true);
      expect(chart.fields_used).toContainEqual({ model: 'orders', field: 'amount', source: 'aql' });
    });
  });

  describe('with cli-core (type-checked extraction)', () => {
    it('should use cli-core extractAqlReferences when available', () => {
      const mockExtractAqlReferences = vi.fn().mockReturnValue({
        models: ['orders', 'customers'],
        fields: [
          { model: 'orders', field: 'amount' },
          { model: 'customers', field: 'id' },
        ],
        errors: [],
      });

      const mockCreateDatasetFromCompiled = vi.fn().mockReturnValue({
        name: 'test_dataset',
        models: [],
        dataSource: { name: 'bigquery', dbtype: 'bigquery' },
      });

      const mockCliCore: CliCoreModule = {
        registerCommands: vi.fn(),
        extractAqlReferences: mockExtractAqlReferences,
        createDatasetFromCompiled: mockCreateDatasetFromCompiled,
      };

      const lineage = transformToLineage(sampleCompiledData, '/test', mockCliCore);

      // Verify cli-core was called
      expect(mockCreateDatasetFromCompiled).toHaveBeenCalled();
      expect(mockExtractAqlReferences).toHaveBeenCalled();

      // Verify results are correct
      const dataset = lineage.entities.datasets[0];
      expect(dataset.metrics[0].fields_referenced).toContainEqual({ model: 'orders', field: 'amount' });
      expect(dataset.metrics[0].fields_referenced).toContainEqual({ model: 'customers', field: 'id' });
    });

    it('should cache datasets for repeated AQL extractions', () => {
      const mockCreateDatasetFromCompiled = vi.fn().mockReturnValue({
        name: 'test_dataset',
        models: [],
        dataSource: { name: 'bigquery', dbtype: 'bigquery' },
      });

      const mockCliCore: CliCoreModule = {
        registerCommands: vi.fn(),
        extractAqlReferences: vi.fn().mockReturnValue({
          models: ['orders'],
          fields: [{ model: 'orders', field: 'amount' }],
          errors: [],
        }),
        createDatasetFromCompiled: mockCreateDatasetFromCompiled,
      };

      // Add multiple metrics to test caching
      const dataWithMultipleMetrics = {
        ...sampleCompiledData,
        'datasets/test.aml': {
          ...sampleCompiledData['datasets/test.aml'],
          metric: {
            metric1: {
              label: 'Metric 1',
              definition: { __type__: 'Heredoc', content: 'sum(orders.amount)' },
            },
            metric2: {
              label: 'Metric 2',
              definition: { __type__: 'Heredoc', content: 'avg(orders.amount)' },
            },
            metric3: {
              label: 'Metric 3',
              definition: { __type__: 'Heredoc', content: 'count(orders.id)' },
            },
          },
        },
      };

      transformToLineage(dataWithMultipleMetrics, '/test', mockCliCore);

      // Dataset should only be created once (cached for subsequent metrics)
      expect(mockCreateDatasetFromCompiled).toHaveBeenCalledTimes(1);
    });

    it('should fall back to regex when cli-core returns errors', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockCliCore: CliCoreModule = {
        registerCommands: vi.fn(),
        extractAqlReferences: vi.fn().mockReturnValue({
          models: [],
          fields: [],
          errors: ['Unknown model: orders'],
        }),
        createDatasetFromCompiled: vi.fn().mockReturnValue({
          name: 'test_dataset',
          models: [],
          dataSource: { name: 'bigquery', dbtype: 'bigquery' },
        }),
      };

      const lineage = transformToLineage(sampleCompiledData, '/test', mockCliCore);

      // Should log warning about errors
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Should still extract refs using regex fallback
      const dataset = lineage.entities.datasets[0];
      expect(dataset.metrics[0].fields_referenced.length).toBeGreaterThan(0);

      consoleErrorSpy.mockRestore();
    });

    it('should fall back to regex when cli-core throws an error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockCliCore: CliCoreModule = {
        registerCommands: vi.fn(),
        extractAqlReferences: vi.fn().mockImplementation(() => {
          throw new Error('Type checker failed');
        }),
        createDatasetFromCompiled: vi.fn().mockReturnValue({
          name: 'test_dataset',
          models: [],
          dataSource: { name: 'bigquery', dbtype: 'bigquery' },
        }),
      };

      const lineage = transformToLineage(sampleCompiledData, '/test', mockCliCore);

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Type-checked AQL extraction failed')
      );

      // Should still extract refs using regex fallback
      const dataset = lineage.entities.datasets[0];
      expect(dataset.metrics[0].fields_referenced).toContainEqual({ model: 'orders', field: 'amount' });

      consoleErrorSpy.mockRestore();
    });

    it('should fall back to regex when createDatasetFromCompiled throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockCliCore: CliCoreModule = {
        registerCommands: vi.fn(),
        extractAqlReferences: vi.fn(),
        createDatasetFromCompiled: vi.fn().mockImplementation(() => {
          throw new Error('Invalid dataset format');
        }),
      };

      const lineage = transformToLineage(sampleCompiledData, '/test', mockCliCore);

      // Should still extract refs using regex fallback
      const dataset = lineage.entities.datasets[0];
      expect(dataset.metrics[0].fields_referenced).toContainEqual({ model: 'orders', field: 'amount' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('chart AQL extraction with dataset context', () => {
    it('should pass compiled dataset to chart AQL extraction', () => {
      const mockExtractAqlReferences = vi.fn().mockReturnValue({
        models: ['orders'],
        fields: [{ model: 'orders', field: 'amount' }],
        errors: [],
      });

      const mockCliCore: CliCoreModule = {
        registerCommands: vi.fn(),
        extractAqlReferences: mockExtractAqlReferences,
        createDatasetFromCompiled: vi.fn().mockReturnValue({
          name: 'test_dataset',
          models: [],
          dataSource: { name: 'bigquery', dbtype: 'bigquery' },
        }),
      };

      transformToLineage(sampleCompiledData, '/test', mockCliCore);

      // extractAqlReferences should be called for both metrics and chart calculations
      expect(mockExtractAqlReferences.mock.calls.length).toBeGreaterThan(1);
    });

    it('should handle charts without dataset reference gracefully', () => {
      const dataWithOrphanChart = {
        'dashboards/test.aml': {
          __type__: 'Dashboard',
          __fqn__: 'test_dashboard',
          uname: 'test_dashboard',
          block: {
            orphan_chart: {
              def: {
                __type__: 'VizBlock',
                label: 'Orphan Chart',
                viz: {
                  // No dataset reference
                  calculation: {
                    calc: {
                      formula: { __type__: 'Heredoc', content: 'sum(orders.amount)' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Should not throw, should use regex fallback
      const lineage = transformToLineage(dataWithOrphanChart, '/test');
      const chart = lineage.entities.charts[0];
      expect(chart.fields_used).toContainEqual({ model: 'orders', field: 'amount', source: 'aql' });
    });
  });
});
