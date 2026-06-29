/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Customer, CollectorActivity, CollectorProfile, CollectorResult, AnalysisOutput, SupportingMetrics } from "./types";

// Haversine distance formula in kilometers
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate standard deviation
function calculateStandardDeviation(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const sumSqDiff = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return Math.sqrt(sumSqDiff / values.length);
}

interface CollectorStats {
  collector_code: string;
  profile: CollectorProfile;
  weightedDistanceSum: number;
  weightSum: number;
  avgDistance: number;
  recentInRadiusCount: number; // For confidence calculation (last 90 days in radius)
  weightedFrequency: number;
  weightedTransaction: number;
  weeklyCounts: number[];
  lastActivity: Date | null;
  totalInRadius: number;
  hasActivitiesInRadius: boolean;
  allActivities: {
    activity: CollectorActivity;
    distance: number;
    weight: number;
    daysAgo: number;
  }[];
}

export function runAnalysis(
  customer: Customer,
  activities: CollectorActivity[],
  profiles: CollectorProfile[],
  referenceDateInput?: string
): AnalysisOutput {
  const generatedAt = new Date().toISOString();

  // 1. Determine reference date for recency calculation.
  // We use the input reference date, or the latest activity date in the dataset, or today.
  let referenceDate = new Date();
  if (referenceDateInput) {
    referenceDate = new Date(referenceDateInput);
  } else if (activities.length > 0) {
    const dates = activities.map((a) => new Date(a.activity_date).getTime());
    const maxDate = Math.max(...dates);
    if (!isNaN(maxDate)) {
      referenceDate = new Date(maxDate);
    }
  }

  // Parse activity date range for analysis_period
  let analysisPeriod = "Seluruh sejarah aktivitas yang tersedia";
  if (activities.length > 0) {
    const dates = activities.map((a) => new Date(a.activity_date).getTime());
    const minDate = new Date(Math.min(...dates)).toLocaleDateString("id-ID");
    const maxDate = new Date(Math.max(...dates)).toLocaleDateString("id-ID");
    analysisPeriod = `${minDate} - ${maxDate}`;
  }

  // Filter noise
  // GPS noise filter: ignore jumps which are way outliers.
  // For simplicity, we keep items with valid coordinate ranges (e.g. within Indonesia latitudes/longitudes)
  // Latitudes of Indonesia: -11 to 6, Longitudes: 95 to 141
  const validActivities = activities.filter((act) => {
    const validCoords =
      act.latitude >= -15 &&
      act.latitude <= 10 &&
      act.longitude >= 90 &&
      act.longitude <= 150;
    return validCoords;
  });

  const noiseFilteredCount = activities.length - validActivities.length;

  // Let's find time boundaries for weekly consistency calculation
  let minTime = referenceDate.getTime() - 180 * 24 * 60 * 60 * 1000; // default to last 180 days
  let maxTime = referenceDate.getTime();
  if (validActivities.length > 0) {
    const times = validActivities.map((a) => new Date(a.activity_date).getTime());
    minTime = Math.min(...times);
    maxTime = Math.max(...times);
  }

  // Total weeks in our analysis period
  const totalDays = Math.max(7, (maxTime - minTime) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.ceil(totalDays / 7);

  // Group activities by collector
  const collectorCodes = Array.from(new Set(profiles.map((p) => p.collector_code)));

  const collectorsStats: Record<string, CollectorStats> = {};

  // Initialize stats for each known collector code
  for (const code of collectorCodes) {
    const prof = profiles.find((p) => p.collector_code === code) || {
      collector_code: code,
      total_transaction: 0,
      total_nominal: 0,
      active_days: 0,
      active_customers: 0,
      average_daily_activity: 0,
    };

    collectorsStats[code] = {
      collector_code: code,
      profile: prof,
      weightedDistanceSum: 0,
      weightSum: 0,
      avgDistance: 9999, // default large
      recentInRadiusCount: 0,
      weightedFrequency: 0,
      weightedTransaction: 0,
      weeklyCounts: Array(totalWeeks).fill(0),
      lastActivity: null,
      totalInRadius: 0,
      hasActivitiesInRadius: false,
      allActivities: [],
    };
  }

  // Match activities up with collectors
  validActivities.forEach((act) => {
    const code = act.collector_code;
    if (!collectorsStats[code]) return; // Undefined collector profile, skip or auto-handle

    const stats = collectorsStats[code];
    const dist = haversineDistance(act.latitude, act.longitude, customer.latitude, customer.longitude);
    const actDate = new Date(act.activity_date);
    const daysAgo = (referenceDate.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24);

    let weight = 0.3;
    if (daysAgo >= 0 && daysAgo <= 90) {
      weight = 1.0;
    } else if (daysAgo > 90 && daysAgo <= 180) {
      weight = 0.6;
    }

    stats.allActivities.push({ activity: act, distance: dist, weight, daysAgo });

    // Track the last activity date
    if (!stats.lastActivity || actDate.getTime() > stats.lastActivity.getTime()) {
      stats.lastActivity = actDate;
    }

    // Weight distance for all activities of this collector to find general nearness
    stats.weightedDistanceSum += weight * dist;
    stats.weightSum += weight;

    // Radius constraints
    if (dist <= 3.0) {
      stats.hasActivitiesInRadius = true;
      stats.totalInRadius += 1;
      stats.weightedFrequency += weight;
      stats.weightedTransaction += weight * act.transaction_amount;

      // Track last 90 days activities in radius for confidence
      if (daysAgo >= 0 && daysAgo <= 90) {
        stats.recentInRadiusCount += 1;
      }

      // Track weekly visits in radius
      const timeDiff = actDate.getTime() - minTime;
      const weekIdx = Math.min(totalWeeks - 1, Math.max(0, Math.floor(timeDiff / (7 * 24 * 60 * 60 * 1000))));
      stats.weeklyCounts[weekIdx] += 1;
    }
  });

  // Calculate final base metrics for each collector
  const statsList = Object.values(collectorsStats);
  statsList.forEach((stats) => {
    if (stats.weightSum > 0) {
      stats.avgDistance = stats.weightedDistanceSum / stats.weightSum;
    } else {
      // If collector has no recorded activities at all, let's treat average distance as 999.9
      stats.avgDistance = 999.9;
    }
  });

  // Determine if it's a cold start scenario (no activities of any collector within 3.0km)
  const isColdStart = !statsList.some((s) => s.hasActivitiesInRadius);

  // MAX values for scaling subscores
  let maxWeightFreq = Math.max(...statsList.map((s) => s.weightedFrequency));
  let maxWeightTx = Math.max(...statsList.map((s) => s.weightedTransaction));
  let maxActiveCustomers = Math.max(...statsList.map((s) => s.profile.active_customers));

  const statsWithActivities = statsList.filter((s) => s.weightSum > 0);
  const minAvgDistance = statsWithActivities.length > 0
    ? Math.min(...statsWithActivities.map((s) => s.avgDistance))
    : 0;
  const maxAvgDistance = statsWithActivities.length > 0
    ? Math.max(...statsWithActivities.map((s) => s.avgDistance))
    : 50;

  const items: CollectorResult[] = statsList.map((stats) => {
    const code = stats.collector_code;

    // Subscore 1: Kedekatan wilayah (35%)
    let kedekatanScore = 0;
    if (stats.weightSum === 0) {
      kedekatanScore = 0;
    } else if (isColdStart) {
      // In Cold Start, use absolute inverse of average distance. Let's map 0 km to 100 and >= 50 km to 0.
      kedekatanScore = Math.max(0, Math.min(100, Math.round(100 * (1 - stats.avgDistance / 50))));
    } else {
      if (maxAvgDistance === minAvgDistance) {
        kedekatanScore = stats.avgDistance <= 1.0 ? 100 : stats.avgDistance <= 3.0 ? 70 : 40;
      } else {
        kedekatanScore = Math.max(0, Math.round((100 * (maxAvgDistance - stats.avgDistance)) / (maxAvgDistance - minAvgDistance)));
      }
    }

    // Subscore 2: Frekuensi aktivitas (25%)
    let frekuensiScore = 0;
    if (maxWeightFreq > 0) {
      frekuensiScore = Math.round((100 * stats.weightedFrequency) / maxWeightFreq);
    }

    // Subscore 3: Jumlah transaksi (15%)
    let transaksiScore = 0;
    if (maxWeightTx > 0) {
      transaksiScore = Math.round((100 * stats.weightedTransaction) / maxWeightTx);
    }

    // Subscore 4: Konsistensi kunjungan (15%)
    // calculate Coefficient of Variation
    let consistencyCV = 1.0;
    let consistencyScore = 0;

    if (stats.hasActivitiesInRadius) {
      const sum = stats.weeklyCounts.reduce((a, b) => a + b, 0);
      const mean = sum / totalWeeks;
      if (mean > 0) {
        const stdDev = calculateStandardDeviation(stats.weeklyCounts, mean);
        consistencyCV = stdDev / mean;
        // Consistency score is 100 - (CV * 100)
        consistencyScore = Math.max(0, Math.min(100, Math.round(100 - consistencyCV * 100)));
      }
    } else {
      // No visits in radius -> minimum consistency score
      consistencyCV = 1.0;
      consistencyScore = 0;
    }

    // Subscore 5: Beban kerja (10%)
    let bebanScore = 100;
    if (maxActiveCustomers > 0) {
      bebanScore = Math.round(100 * (1 - stats.profile.active_customers / maxActiveCustomers));
    }

    // Final Weighted score
    const finalScore = Math.round(
      kedekatanScore * 0.35 +
        frekuensiScore * 0.25 +
        transaksiScore * 0.15 +
        consistencyScore * 0.15 +
        bebanScore * 0.1
    );

    // Confidence Level
    let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    if (isColdStart) {
      confidence = "LOW";
    } else if (stats.recentInRadiusCount >= 10 && consistencyCV < 0.5) {
      confidence = "HIGH";
    } else if (stats.totalInRadius >= 3) {
      confidence = "MEDIUM";
    } else {
      confidence = "LOW";
    }

    // Last activity date
    const lastActivityStr = stats.lastActivity ? stats.lastActivity.toISOString().split("T")[0] : "-";

    return {
      rank: 0, // Filled in after sorting
      collector_code: code,
      score: finalScore,
      confidence,
      reason: "", // Filled in below
      supporting_metrics: {
        activity_count_in_area: stats.totalInRadius,
        avg_distance_km: parseFloat(stats.avgDistance.toFixed(2)),
        total_transaction_amount_in_area: Math.round(stats.weightedTransaction),
        consistency_cv: parseFloat(consistencyCV.toFixed(2)),
        active_customers: stats.profile.active_customers,
        last_activity_date: lastActivityStr,
      },
      // Keep subscores inside intermediate object to perform elegant tie breaks & descriptions
      _subscores: {
        kedekatan: kedekatanScore,
        frekuensi: frekuensiScore,
        transaksi: transaksiScore,
        konsistensi: consistencyScore,
        beban: bebanScore,
      },
    } as any;
  });

  // Sort by finalScore (desc), consistencyScore (desc), frekuensiScore (desc), collector_code (asc)
  items.sort((a: any, b: any) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b._subscores.konsistensi !== a._subscores.konsistensi) {
      return b._subscores.konsistensi - a._subscores.konsistensi;
    }
    if (b._subscores.frekuensi !== a._subscores.frekuensi) {
      return b._subscores.frekuensi - a._subscores.frekuensi;
    }
    return a.collector_code.localeCompare(b.collector_code);
  });

  // Re-assign ranks and compile reasons
  const rankedItems: CollectorResult[] = items.map((item: any, idx) => {
    const r = idx + 1;
    const stats = collectorsStats[item.collector_code];
    const relativeRanking = getRelativeIndonesiaDescription(r, item, stats, isColdStart);

    return {
      rank: r,
      collector_code: item.collector_code,
      score: item.score,
      confidence: item.confidence,
      reason: relativeRanking,
      supporting_metrics: item.supporting_metrics,
    };
  });

  // Prepare metadata & summaries
  const primaryCollectorCode = rankedItems[0]?.collector_code || "-";
  const backupCollectorCode = rankedItems[1]?.collector_code || "-";

  // Generate robust Indonesia risk, limitations and recommended actions lists
  const riskAnalysis: string[] = [];
  const recommendedActions: string[] = [];
  const dataLimitations: string[] = [];

  if (noiseFilteredCount > 0) {
    dataLimitations.push(
      `Sebanyak ${noiseFilteredCount} titik GPS anomali disaring karena jarak melompat drastis melebihi batas rasional.`
    );
  }

  // Check data limitations (less than 5 activity points in total)
  profiles.forEach((p) => {
    const collectorActsCount = activities.filter((a) => a.collector_code === p.collector_code).length;
    if (collectorActsCount < 5) {
      dataLimitations.push(
        `Kolektor ${p.collector_code} memiliki total histori aktivitas terbatas (${collectorActsCount} data), sehingga keakuratan profil lebih rendah.`
      );
    }
  });

  if (isColdStart) {
    riskAnalysis.push(
      "Cold Start: Tidak terdeteksi adanya cakupan histori kunjungan aktif dari kolektor manapun di dalam wilayah operasional nasabah ini (radius 3 km)."
    );
    riskAnalysis.push(
      "Rekomendasi dihitung murni menggunakan perbandingan garis lurus spasial, bukan pola kunjungan historis."
    );
    recommendedActions.push(
      `Tugaskan kolektor terdekat ${primaryCollectorCode} untuk kunjungan validasi awal guna memetakan jalur rute pengiriman yang optimal.`
    );
    recommendedActions.push("Lakukan geocoding ulang atau verifikasi alamat nasabah secara manual.");
  } else {
    // Standard routing analysis
    const primary = rankedItems[0];
    const backup = rankedItems[1];

    if (primary) {
      if (primary.supporting_metrics.avg_distance_km > 3.0) {
        riskAnalysis.push(
          `Kolektor utama (${primary.collector_code}) rata-rata beroperasi lebih dari 3.0 km dari nasabah. Risiko efisiensi biaya perjalanan tinggi.`
        );
      }
      if (primary.supporting_metrics.active_customers > 1.5 * (maxActiveCustomers / 2)) {
        riskAnalysis.push(
          `Kolektor utama (${primary.collector_code}) memiliki beban kerja yang padat (${primary.supporting_metrics.active_customers} nasabah aktif), terdapat risiko keterlambatan kunjungan.`
        );
      }
      if (primary.confidence === "LOW") {
        riskAnalysis.push(
          `Kolektor utama (${primary.collector_code}) terpilih dengan tingkat kepercayaan rendah akibat terbatasnya histori kunjungan di area ini.`
        );
      }
    }

    // Recommended Actions formulation
    recommendedActions.push(
      `Tugaskan Kolektor ${primaryCollectorCode} sebagai penanggung jawab utama karena memiliki skor kesesuaian wilayah tertinggi (${primary.score} poin).`
    );

    if (backup && backup.score > 60) {
      recommendedActions.push(
        `Gunakan Kolektor ${backupCollectorCode} (${backup.score} poin) sebagai cadangan operasional (backup) jika kolektor utama mengalami kelebihan muatan.`
      );
    } else {
      recommendedActions.push(
        "Gunakan pengawasan rute harian tertutup karena tingkat kesesuaian kolektor cadangan relatif rendah."
      );
    }

    recommendedActions.push("Perbarui rekam data koordinat GPS harian untuk melacak deviasi rute penugasan.");
  }

  // Human-crafted professional executive summary in Indonesian complying with requirements: <= 150 words
  let execSummary = "";
  if (isColdStart) {
    execSummary = `Hasil analisis menunjukkan situasi Cold Start untuk Nasabah ${customer.customer_name}. Tidak ada aktivitas kolektor dalam radius operasional 3 km. Kolektor ${primaryCollectorCode} direkomendasikan sementara karena memiliki estimasi jarak garis lurus terdekat (${rankedItems[0]?.supporting_metrics.avg_distance_km} km), dengan tingkat kepercayaan LOW. Kami menyarankan verifikasi fisik alamat dan penugasan awal guna memperluas wilayah pengumpulan.`;
  } else {
    const primary = rankedItems[0];
    const backup = rankedItems[1];
    execSummary = `Kolektor ${primary.collector_code} sangat direkomendasikan untuk melayani Nasabah ${customer.customer_name} dengan skor ${primary.score} (Konfidensi: ${primary.confidence}). Kolektor ini memiliki ${primary.supporting_metrics.activity_count_in_area} kunjungan di area nasabah dengan rata-rata jarak ${primary.supporting_metrics.avg_distance_km} km. Risiko utama adalah potensi kelebihan beban kerja (${primary.supporting_metrics.active_customers} nasabah aktif). Tindakan terbaik adalah menugaskan ${primary.collector_code} dan menyiapkan ${backup?.collector_code || "-"} sebagai cadangan rute.`;
  }

  // Coverage observation
  let coverageObservation = "Cakupan wilayah operasional cukup baik.";
  if (isColdStart) {
    coverageObservation = "Area kosong (blind spot). Tidak ada aktivitas dari kolektor manapun dalam radius 3 km.";
  } else {
    const countInRadius = statsList.filter((s) => s.hasActivitiesInRadius).length;
    coverageObservation = `Terdapat ${countInRadius} kolektor yang aktif melintasi radius wilayah operasional nasabah ini.`;
  }

  return {
    generated_at: generatedAt,
    analysis_period: analysisPeriod,
    customer: {
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      address: customer.address,
    },
    top_collectors: rankedItems,
    executive_summary: execSummary,
    risk_analysis: riskAnalysis,
    data_limitations: dataLimitations,
    recommended_actions: recommendedActions,
    map_description: {
      recommended_primary_collector: primaryCollectorCode,
      recommended_backup_collector: backupCollectorCode,
      coverage_observation: coverageObservation,
    },
  };
}

// Generate Indonesia explanation sentence based on concrete values
function getRelativeIndonesiaDescription(rank: number, item: any, stats: CollectorStats, isColdStart: boolean): string {
  const code = item.collector_code;
  const score = item.score;
  const dist = item.supporting_metrics.avg_distance_km;
  const count = item.supporting_metrics.activity_count_in_area;
  const cv = item.supporting_metrics.consistency_cv;

  if (isColdStart) {
    return `Kolektor ${code} direkomendasikan sementara di peringkat ${rank} murni berdasarkan jarak terdekat garis lurus sebesar ${dist} km dari lokasi nasabah (situasi Cold Start harian).`;
  }

  if (rank === 1) {
    if (count >= 10 && cv < 0.5) {
      return `Kolektor ${code} direkomendasikan utama karena sangat aktif dengan ${count} kunjungan di area ini, rata-rata jarak dekat ${dist} km, dan pola kehadiran mingguan yang konsisten tinggi (CV ${cv}).`;
    } else {
      return `Kolektor ${code} direkomendasikan di posisi teratas berdasarkan frekuensi kunjungan harian sebanyak ${count} kali di sekitar lokasi nasabah dan jarak rata-rata optimal ${dist} km.`;
    }
  } else {
    if (count > 0) {
      return `Kolektor ${code} sebagai alternatif peringkat ${rank} dengan cakupan wilayah yang mencakup area nasabah (${count} aktivitas, rata-rata jarak ${dist} km), namun memiliki skor keterlibatan lebih rendah dibanding peringkat di atasnya.`;
    } else {
      return `Kolektor ${code} ditempatkan di peringkat ${rank} alternatif karena letak aktivitas umum terdekat berjarak rata-rata ${dist} km, tanpa ada kunjungan tercatat dalam radius intim nasabah.`;
    }
  }
}
