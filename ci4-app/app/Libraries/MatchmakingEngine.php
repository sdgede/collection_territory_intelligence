<?php

namespace App\Libraries;

class MatchmakingEngine
{
    /**
     * Hitung jarak antara dua koordinat menggunakan rumus Haversine (dalam km)
     */
    public function haversineDistance(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R = 6371; // Radius bumi dalam km
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon / 2) * sin($dLon / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return $R * $c;
    }

    /**
     * Hitung standar deviasi untuk sekumpulan nilai
     */
    private function calculateStandardDeviation(array $values, float $mean): float
    {
        if (empty($values)) {
            return 0.0;
        }
        $sumSqDiff = 0.0;
        foreach ($values as $val) {
            $sumSqDiff += pow($val - $mean, 2);
        }
        return sqrt($sumSqDiff / count($values));
    }

    /**
     * Jalankan analisis kecocokan teritori (Matchmaking)
     *
     * @param array $customer
     * @param array $activities
     * @param array $profiles
     * @param string|null $referenceDateInput
     * @return array
     */
    public function runAnalysis(array $customer, array $activities, array $profiles, ?string $referenceDateInput = null): array
    {
        $generatedAt = (new \DateTime('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');

        // 1. Tentukan tanggal acuan
        $referenceDate = new \DateTime();
        if ($referenceDateInput) {
            $referenceDate = new \DateTime($referenceDateInput);
        } elseif (!empty($activities)) {
            $maxTime = 0;
            foreach ($activities as $act) {
                $time = strtotime($act['activity_date']);
                if ($time > $maxTime) {
                    $maxTime = $time;
                }
            }
            if ($maxTime > 0) {
                $referenceDate->setTimestamp($maxTime);
            }
        }

        // Rentang waktu analisis
        $analysisPeriod = "Seluruh sejarah aktivitas yang tersedia";
        if (!empty($activities)) {
            $times = array_map(function($a) { return strtotime($a['activity_date']); }, $activities);
            $minDate = (new \DateTime())->setTimestamp(min($times))->format('d/m/Y');
            $maxDate = (new \DateTime())->setTimestamp(max($times))->format('d/m/Y');
            $analysisPeriod = "$minDate - $maxDate";
        }

        // 2. Filter noise koordinat GPS (sesuai cakupan geografis Indonesia: Lintang -15 s.d 10, Bujur 90 s.d 150)
        $validActivities = [];
        $noiseFilteredCount = 0;
        foreach ($activities as $act) {
            $lat = (float) $act['latitude'];
            $lng = (float) $act['longitude'];
            if ($lat >= -15.0 && $lat <= 10.0 && $lng >= 90.0 && $lng <= 150.0) {
                $validActivities[] = $act;
            } else {
                $noiseFilteredCount++;
            }
        }

        // Hitung batas waktu untuk pembagian mingguan (maksimal ke belakang adalah minTime, hingga referenceDate)
        $minTime = $referenceDate->getTimestamp() - (180 * 24 * 60 * 60); // Default 180 hari ke belakang
        $maxTime = $referenceDate->getTimestamp();
        if (!empty($validActivities)) {
            $times = array_map(function($a) { return strtotime($a['activity_date']); }, $validActivities);
            $minTime = min($times);
            $maxTime = max($times);
        }

        $totalDays = max(7, ($maxTime - $minTime) / (24 * 60 * 60));
        $totalWeeks = (int) ceil($totalDays / 7);

        // Grouping & Inisialisasi statistik kolektor
        $collectorCodes = array_unique(array_map(function($p) { return $p['collector_code']; }, $profiles));
        $collectorsStats = [];

        foreach ($collectorCodes as $code) {
            $prof = null;
            foreach ($profiles as $p) {
                if ($p['collector_code'] === $code) {
                    $prof = $p;
                    break;
                }
            }

            if (!$prof) {
                $prof = [
                    'collector_code' => $code,
                    'total_transaction' => 0,
                    'total_nominal' => 0,
                    'active_days' => 0,
                    'active_customers' => 0,
                    'average_daily_activity' => 0.0,
                ];
            }

            $collectorsStats[$code] = [
                'collector_code' => $code,
                'profile' => $prof,
                'weightedDistanceSum' => 0.0,
                'weightSum' => 0.0,
                'avgDistance' => 9999.0, // default jauh
                'recentInRadiusCount' => 0,
                'weightedFrequency' => 0.0,
                'weightedTransaction' => 0.0,
                'weeklyCounts' => array_fill(0, $totalWeeks, 0),
                'lastActivity' => null,
                'totalInRadius' => 0,
                'hasActivitiesInRadius' => false,
                'allActivities' => [],
            ];
        }

        // Hitung statistik berdasarkan aktivitas valid
        $custLat = (float) $customer['latitude'];
        $custLng = (float) $customer['longitude'];

        foreach ($validActivities as $act) {
            $code = $act['collector_code'];
            if (!isset($collectorsStats[$code])) {
                continue;
            }

            $actLat = (float) $act['latitude'];
            $actLng = (float) $act['longitude'];
            $dist = $this->haversineDistance($actLat, $actLng, $custLat, $custLng);
            
            $actTime = strtotime($act['activity_date']);
            $daysAgo = ($referenceDate->getTimestamp() - $actTime) / (24 * 60 * 60);

            // Pembobotan recency (kunjungan baru lebih dinilai tinggi)
            $weight = 0.3;
            if ($daysAgo >= 0 && $daysAgo <= 90) {
                $weight = 1.0;
            } elseif ($daysAgo > 90 && $daysAgo <= 180) {
                $weight = 0.6;
            }

            $collectorsStats[$code]['allActivities'][] = [
                'activity' => $act,
                'distance' => $dist,
                'weight' => $weight,
                'daysAgo' => $daysAgo
            ];

            // Catat aktivitas terbaru
            if ($collectorsStats[$code]['lastActivity'] === null || $actTime > $collectorsStats[$code]['lastActivity']) {
                $collectorsStats[$code]['lastActivity'] = $actTime;
            }

            $collectorsStats[$code]['weightedDistanceSum'] += ($weight * $dist);
            $collectorsStats[$code]['weightSum'] += $weight;

            // Masuk dalam radius intim penugasan (3 km)
            if ($dist <= 3.0) {
                $collectorsStats[$code]['hasActivitiesInRadius'] = true;
                $collectorsStats[$code]['totalInRadius'] += 1;
                $collectorsStats[$code]['weightedFrequency'] += $weight;
                $collectorsStats[$code]['weightedTransaction'] += ($weight * (float) $act['transaction_amount']);

                if ($daysAgo >= 0 && $daysAgo <= 90) {
                    $collectorsStats[$code]['recentInRadiusCount'] += 1;
                }

                // Hitung konsistensi kunjungan mingguan
                $timeDiff = $actTime - $minTime;
                $weekIdx = (int) floor($timeDiff / (7 * 24 * 60 * 60));
                $weekIdx = min($totalWeeks - 1, max(0, $weekIdx));
                $collectorsStats[$code]['weeklyCounts'][$weekIdx] += 1;
            }
        }

        // Rata-rata jarak terbobot
        foreach ($collectorsStats as $code => &$stats) {
            if ($stats['weightSum'] > 0) {
                $stats['avgDistance'] = $stats['weightedDistanceSum'] / $stats['weightSum'];
            } else {
                $stats['avgDistance'] = 999.9;
            }
        }
        unset($stats);

        // Cek situasi Cold Start (tidak ada aktivitas dalam radius 3.0 km)
        $isColdStart = true;
        foreach ($collectorsStats as $stats) {
            if ($stats['hasActivitiesInRadius']) {
                $isColdStart = false;
                break;
            }
        }

        // Cari nilai maksimum untuk normalisasi skor
        $maxWeightFreq = 0.0;
        $maxWeightTx = 0.0;
        $maxActiveCustomers = 0;
        $activeDistances = [];

        foreach ($collectorsStats as $stats) {
            if ($stats['weightedFrequency'] > $maxWeightFreq) $maxWeightFreq = $stats['weightedFrequency'];
            if ($stats['weightedTransaction'] > $maxWeightTx) $maxWeightTx = $stats['weightedTransaction'];
            if ((int)$stats['profile']['active_customers'] > $maxActiveCustomers) {
                $maxActiveCustomers = (int)$stats['profile']['active_customers'];
            }
            if ($stats['weightSum'] > 0) {
                $activeDistances[] = $stats['avgDistance'];
            }
        }

        $minAvgDistance = !empty($activeDistances) ? min($activeDistances) : 0.0;
        $maxAvgDistance = !empty($activeDistances) ? max($activeDistances) : 50.0;

        // Hitung sub-skor & skor akhir untuk setiap kandidat kolektor
        $results = [];
        foreach ($collectorsStats as $code => $stats) {
            // 1. Kedekatan Wilayah (35%)
            $kedekatanScore = 0;
            if ($stats['weightSum'] == 0) {
                $kedekatanScore = 0;
            } elseif ($isColdStart) {
                // Pemetaan linier terbalik jika Cold Start: 0km -> 100, >=50km -> 0
                $kedekatanScore = (int) max(0, min(100, round(100 * (1 - $stats['avgDistance'] / 50.0))));
            } else {
                if ($maxAvgDistance == $minAvgDistance) {
                    $kedekatanScore = $stats['avgDistance'] <= 1.0 ? 100 : ($stats['avgDistance'] <= 3.0 ? 70 : 40);
                } else {
                    $kedekatanScore = (int) max(0, round((100 * ($maxAvgDistance - $stats['avgDistance'])) / ($maxAvgDistance - $minAvgDistance)));
                }
            }

            // 2. Frekuensi Aktivitas (25%)
            $frekuensiScore = 0;
            if ($maxWeightFreq > 0) {
                $frekuensiScore = (int) round((100 * $stats['weightedFrequency']) / $maxWeightFreq);
            }

            // 3. Jumlah Nominal Transaksi (15%)
            $transaksiScore = 0;
            if ($maxWeightTx > 0) {
                $transaksiScore = (int) round((100 * $stats['weightedTransaction']) / $maxWeightTx);
            }

            // 4. Konsistensi Kunjungan (15%)
            $consistencyCV = 1.0;
            $consistencyScore = 0;
            if ($stats['hasActivitiesInRadius']) {
                $sum = array_sum($stats['weeklyCounts']);
                $mean = $sum / $totalWeeks;
                if ($mean > 0) {
                    $stdDev = $this->calculateStandardDeviation($stats['weeklyCounts'], $mean);
                    $consistencyCV = $stdDev / $mean;
                    $consistencyScore = (int) max(0, min(100, round(100 - ($consistencyCV * 100))));
                }
            }

            // 5. Beban Kerja Spasial (10%)
            $bebanScore = 100;
            if ($maxActiveCustomers > 0) {
                $bebanScore = (int) round(100 * (1 - (int)$stats['profile']['active_customers'] / $maxActiveCustomers));
            }

            // Gabungkan menjadi Skor Akhir Tertimbang
            $finalScore = (int) round(
                $kedekatanScore * 0.35 +
                $frekuensiScore * 0.25 +
                $transaksiScore * 0.15 +
                $consistencyScore * 0.15 +
                $bebanScore * 0.1
            );

            // Tingkat Keyakinan Rekomendasi
            $confidence = "LOW";
            if ($isColdStart) {
                $confidence = "LOW";
            } elseif ($stats['recentInRadiusCount'] >= 10 && $consistencyCV < 0.5) {
                $confidence = "HIGH";
            } elseif ($stats['totalInRadius'] >= 3) {
                $confidence = "MEDIUM";
            } else {
                $confidence = "LOW";
            }

            $lastActivityStr = $stats['lastActivity'] !== null ? date('Y-m-d', $stats['lastActivity']) : "-";

            $results[] = [
                'rank' => 0, // diisi nanti setelah sorting
                'collector_code' => $code,
                'score' => $finalScore,
                'confidence' => $confidence,
                'reason' => '',
                'supporting_metrics' => [
                    'activity_count_in_area' => $stats['totalInRadius'],
                    'avg_distance_km' => (float) number_format($stats['avgDistance'], 2, '.', ''),
                    'total_transaction_amount_in_area' => (int) round($stats['weightedTransaction']),
                    'consistency_cv' => (float) number_format($consistencyCV, 2, '.', ''),
                    'active_customers' => (int) $stats['profile']['active_customers'],
                    'last_activity_date' => $lastActivityStr,
                ],
                '_subscores' => [
                    'kedekatan' => $kedekatanScore,
                    'frekuensi' => $frekuensiScore,
                    'transaksi' => $transaksiScore,
                    'konsistensi' => $consistencyScore,
                    'beban' => $bebanScore,
                ]
            ];
        }

        // Sorting kandidat: Skor (desc), Konsistensi (desc), Frekuensi (desc), Kode (asc)
        usort($results, function($a, $b) {
            if ($b['score'] !== $a['score']) {
                return $b['score'] - $a['score'];
            }
            if ($b['_subscores']['konsistensi'] !== $a['_subscores']['konsistensi']) {
                return $b['_subscores']['konsistensi'] - $a['_subscores']['konsistensi'];
            }
            if ($b['_subscores']['frekuensi'] !== $a['_subscores']['frekuensi']) {
                return $b['_subscores']['frekuensi'] - $a['_subscores']['frekuensi'];
            }
            return strcmp($a['collector_code'], $b['collector_code']);
        });

        // Tetapkan peringkat & deskripsi analisis kualitatif
        $rankedItems = [];
        foreach ($results as $idx => $item) {
            $rank = $idx + 1;
            $code = $item['collector_code'];
            $stats = $collectorsStats[$code];
            $reason = $this->getRelativeIndonesiaDescription($rank, $item, $stats, $isColdStart);

            $rankedItems[] = [
                'rank' => $rank,
                'collector_code' => $code,
                'score' => $item['score'],
                'confidence' => $item['confidence'],
                'reason' => $reason,
                'supporting_metrics' => $item['supporting_metrics']
            ];
        }

        // Susun ringkasan eksekutif, risiko, dan rekomendasi aksi
        $primaryCode = !empty($rankedItems) ? $rankedItems[0]['collector_code'] : "-";
        $backupCode = count($rankedItems) > 1 ? $rankedItems[1]['collector_code'] : "-";

        $riskAnalysis = [];
        $recommendedActions = [];
        $dataLimitations = [];

        if ($noiseFilteredCount > 0) {
            $dataLimitations[] = "Sebanyak $noiseFilteredCount titik GPS anomali disaring karena jarak melompat drastis melebihi batas rasional.";
        }

        foreach ($profiles as $p) {
            $cActsCount = 0;
            foreach ($activities as $a) {
                if ($a['collector_code'] === $p['collector_code']) {
                    $cActsCount++;
                }
            }
            if ($cActsCount < 5) {
                $dataLimitations[] = "Kolektor {$p['collector_code']} memiliki total histori aktivitas terbatas ($cActsCount data), sehingga keakuratan profil lebih rendah.";
            }
        }

        if ($isColdStart) {
            $riskAnalysis[] = "Cold Start: Tidak terdeteksi adanya cakupan histori kunjungan aktif dari kolektor manapun di dalam wilayah operasional nasabah ini (radius 3 km).";
            $riskAnalysis[] = "Rekomendasi dihitung murni menggunakan perbandingan garis lurus spasial, bukan pola kunjungan historis.";
            $recommendedActions[] = "Tugaskan kolektor terdekat $primaryCode untuk kunjungan validasi awal guna memetakan jalur rute pengiriman yang optimal.";
            $recommendedActions[] = "Lakukan geocoding ulang atau verifikasi alamat nasabah secara manual.";

            $custName = $customer['customer_name'];
            $primaryDist = !empty($rankedItems) ? $rankedItems[0]['supporting_metrics']['avg_distance_km'] : 0.0;
            $execSummary = "Hasil analisis menunjukkan situasi Cold Start untuk Nasabah $custName. Tidak ada aktivitas kolektor dalam radius operasional 3 km. Kolektor $primaryCode direkomendasikan sementara karena memiliki estimasi jarak garis lurus terdekat ($primaryDist km), dengan tingkat kepercayaan LOW. Kami menyarankan verifikasi fisik alamat dan penugasan awal guna memperluas wilayah pengumpulan.";
        } else {
            $primary = $rankedItems[0];
            $backup = count($rankedItems) > 1 ? $rankedItems[1] : null;

            if ($primary['supporting_metrics']['avg_distance_km'] > 3.0) {
                $riskAnalysis[] = "Kolektor utama ({$primary['collector_code']}) rata-rata beroperasi lebih dari 3.0 km dari nasabah. Risiko efisiensi biaya perjalanan tinggi.";
            }
            if ($primary['supporting_metrics']['active_customers'] > 1.5 * ($maxActiveCustomers / 2)) {
                $riskAnalysis[] = "Kolektor utama ({$primary['collector_code']}) memiliki beban kerja yang padat ({$primary['supporting_metrics']['active_customers']} nasabah aktif), terdapat risiko keterlambatan kunjungan.";
            }
            if ($primary['confidence'] === "LOW") {
                $riskAnalysis[] = "Kolektor utama ({$primary['collector_code']}) terpilih dengan tingkat kepercayaan rendah akibat terbatasnya histori kunjungan di area ini.";
            }

            $recommendedActions[] = "Tugaskan Kolektor $primaryCode sebagai penanggung jawab utama karena memiliki skor kesesuaian wilayah tertinggi ({$primary['score']} poin).";
            if ($backup && $backup['score'] > 60) {
                $recommendedActions[] = "Gunakan Kolektor $backupCode ({$backup['score']} poin) sebagai cadangan operasional (backup) jika kolektor utama mengalami kelebihan muatan.";
            } else {
                $recommendedActions[] = "Gunakan pengawasan rute harian tertutup karena tingkat kesesuaian kolektor cadangan relatif rendah.";
            }
            $recommendedActions[] = "Perbarui rekam data koordinat GPS harian untuk melacak deviasi rute penugasan.";

            $custName = $customer['customer_name'];
            $pCode = $primary['collector_code'];
            $pScore = $primary['score'];
            $pConf = $primary['confidence'];
            $pActs = $primary['supporting_metrics']['activity_count_in_area'];
            $pDist = $primary['supporting_metrics']['avg_distance_km'];
            $pCust = $primary['supporting_metrics']['active_customers'];
            $bCode = $backup ? $backup['collector_code'] : "-";

            $execSummary = "Kolektor $pCode sangat direkomendasikan untuk melayani Nasabah $custName dengan skor $pScore (Konfidensi: $pConf). Kolektor ini memiliki $pActs kunjungan di area nasabah dengan rata-rata jarak $pDist km. Risiko utama adalah potensi kelebihan beban kerja ($pCust nasabah aktif). Tindakan terbaik adalah menugaskan $pCode dan menyiapkan $bCode sebagai cadangan rute.";
        }

        $coverageObservation = "Cakupan wilayah operasional cukup baik.";
        if ($isColdStart) {
            $coverageObservation = "Area kosong (blind spot). Tidak ada aktivitas dari kolektor manapun dalam radius 3 km.";
        } else {
            $countInRadius = 0;
            foreach ($collectorsStats as $stats) {
                if ($stats['hasActivitiesInRadius']) $countInRadius++;
            }
            $coverageObservation = "Terdapat $countInRadius kolektor yang aktif melintasi radius wilayah operasional nasabah ini.";
        }

        return [
            'generated_at' => $generatedAt,
            'analysis_period' => $analysisPeriod,
            'customer' => [
                'customer_id' => $customer['customer_id'],
                'customer_name' => $customer['customer_name'],
                'address' => $customer['address'],
            ],
            'top_collectors' => $rankedItems,
            'executive_summary' => $execSummary,
            'risk_analysis' => $riskAnalysis,
            'data_limitations' => $dataLimitations,
            'recommended_actions' => $recommendedActions,
            'map_description' => [
                'recommended_primary_collector' => $primaryCode,
                'recommended_backup_collector' => $backupCode,
                'coverage_observation' => $coverageObservation,
            ],
        ];
    }

    /**
     * Susun kalimat deskripsi peringkat kualitatif
     */
    private function getRelativeIndonesiaDescription(int $rank, array $item, array $stats, bool $isColdStart): string
    {
        $code = $item['collector_code'];
        $dist = $item['supporting_metrics']['avg_distance_km'];
        $count = $item['supporting_metrics']['activity_count_in_area'];
        $cv = $item['supporting_metrics']['consistency_cv'];

        if ($isColdStart) {
            return "Kolektor $code direkomendasikan sementara di peringkat $rank murni berdasarkan jarak terdekat garis lurus sebesar $dist km dari lokasi nasabah (situasi Cold Start harian).";
        }

        if ($rank === 1) {
            if ($count >= 10 && $cv < 0.5) {
                return "Kolektor $code direkomendasikan utama karena sangat aktif dengan $count kunjungan di area ini, rata-rata jarak dekat $dist km, dan pola kehadiran mingguan yang konsisten tinggi (CV $cv).";
            } else {
                return "Kolektor $code direkomendasikan di posisi teratas berdasarkan frekuensi kunjungan harian sebanyak $count kali di sekitar lokasi nasabah dan jarak rata-rata optimal $dist km.";
            }
        } else {
            if ($count > 0) {
                return "Kolektor $code sebagai alternatif peringkat $rank dengan cakupan wilayah yang mencakup area nasabah ($count aktivitas, rata-rata jarak $dist km), namun memiliki skor keterlibatan lebih rendah dibanding peringkat di atasnya.";
            } else {
                return "Kolektor $code ditempatkan di peringkat $rank alternatif karena letak aktivitas umum terdekat berjarak rata-rata $dist km, tanpa ada kunjungan tercatat dalam radius intim nasabah.";
            }
        }
    }
}
