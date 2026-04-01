import { describe, it, expect } from 'vitest';
import { transformToLineage } from '../lineage';
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
  });

  describe('entities.dashboards', () => {
    it('should parse Dashboard correctly', () => {
      expect(lineage.entities.dashboards.length).toBe(1);
      const dashboard = lineage.entities.dashboards[0];
      expect(dashboard.fqn).toBe('sales_overview');
      expect(dashboard.title).toBe('Sales Overview');
      expect(dashboard.owner).toBe('product@example.com');
      expect(dashboard.charts.length).toBe(2);
    });
  });

  describe('entities.charts', () => {
    it('should parse charts with field references', () => {
      expect(lineage.entities.charts.length).toBe(2);

      const revenueChart = lineage.entities.charts.find(c => c.name === 'revenue_chart');
      expect(revenueChart).toBeDefined();
      expect(revenueChart!.label).toBe('Revenue Over Time');
      expect(revenueChart!.dashboard).toBe('sales_overview');
      expect(revenueChart!.dataset).toBe('ecommerce');
      expect(revenueChart!.models_used).toContain('orders');
      expect(revenueChart!.fields_used).toContainEqual({ model: 'orders', field: 'order_date' });
      expect(revenueChart!.fields_used).toContainEqual({ model: 'orders', field: 'total_amount' });
    });

    it('should track multiple models used in a chart', () => {
      const segmentsChart = lineage.entities.charts.find(c => c.name === 'customer_segments');
      expect(segmentsChart!.models_used).toContain('customers');
      expect(segmentsChart!.models_used).toContain('orders');
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
      expect(lineage.lineage.chart_to_dataset.length).toBe(2);

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
      expect(lineage.lineage.chart_to_model.length).toBe(2);

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
