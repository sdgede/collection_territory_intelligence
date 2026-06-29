/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Customer {
  customer_id: string;
  customer_name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface CollectorActivity {
  collector_code: string;
  activity_date: string; // ISO date string or yyyy-mm-dd
  latitude: number;
  longitude: number;
  transaction_amount: number; // in IDR (Rupiah)
  activity_description: string;
}

export interface CollectorProfile {
  collector_code: string;
  total_transaction: number;
  total_nominal: number; // in IDR
  active_days: number;
  active_customers: number;
  average_daily_activity: number;
}

export interface SupportingMetrics {
  activity_count_in_area: number;
  avg_distance_km: number;
  total_transaction_amount_in_area: number;
  consistency_cv: number;
  active_customers: number;
  last_activity_date: string;
}

export interface CollectorResult {
  rank: number;
  collector_code: string;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  supporting_metrics: SupportingMetrics;
}

export interface AnalysisOutput {
  generated_at: string;
  analysis_period: string;
  customer: {
    customer_id: string;
    customer_name: string;
    address: string;
  };
  top_collectors: CollectorResult[];
  executive_summary: string;
  risk_analysis: string[];
  data_limitations: string[];
  recommended_actions: string[];
  map_description: {
    recommended_primary_collector: string;
    recommended_backup_collector: string;
    coverage_observation: string;
  };
}

export interface DatabaseDump {
  customers: Customer[];
  activities: CollectorActivity[];
  profiles: CollectorProfile[];
}
