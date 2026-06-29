<?php

namespace App\Libraries;

class SampleData
{
    public static function getDatasets(): array
    {
        return [
            [
                'name' => 'Denpasar, Bali - Area Teuku Umar',
                'description' => 'Skenario kota Denpasar dengan kecocokan kolektor tinggi di wilayah Teuku Umar. Wayan (KOL-01) sangat aktif dan konsisten.',
                'customer' => [
                    'customer_id' => 'CUST-301',
                    'customer_name' => 'I Made Swastika',
                    'address' => 'Jl. Teuku Umar No.50, Dauh Puri Kauh, Kec. Denpasar Barat, Kota Denpasar, Bali 80113',
                    'latitude' => -8.6738,
                    'longitude' => 115.2091,
                ],
                'profiles' => [
                    [
                        'collector_code' => 'KOL-01',
                        'total_transaction' => 450,
                        'total_nominal' => 185000000,
                        'active_days' => 90,
                        'active_customers' => 32,
                        'average_daily_activity' => 5.0,
                    ],
                    [
                        'collector_code' => 'KOL-02',
                        'total_transaction' => 380,
                        'total_nominal' => 124000000,
                        'active_days' => 85,
                        'active_customers' => 48,
                        'average_daily_activity' => 4.4,
                    ],
                    [
                        'collector_code' => 'KOL-03',
                        'total_transaction' => 120,
                        'total_nominal' => 43000000,
                        'active_days' => 30,
                        'active_customers' => 15,
                        'average_daily_activity' => 4.0,
                    ],
                ],
                'activities' => [
                    // KOL-01
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-06-18', 'latitude' => -8.6745, 'longitude' => 115.2085, 'transaction_amount' => 500000, 'activity_description' => 'Kunjungan rumah & penagihan rutin'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-06-11', 'latitude' => -8.6732, 'longitude' => 115.2098, 'transaction_amount' => 1200000, 'activity_description' => 'Penagihan berhasil dan update database'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-06-04', 'latitude' => -8.6728, 'longitude' => 115.2102, 'transaction_amount' => 750000, 'activity_description' => 'Penyerahan surat peringatan pertama'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-05-28', 'latitude' => -8.6750, 'longitude' => 115.2080, 'transaction_amount' => 900000, 'activity_description' => 'Kunjungan follow-up bulanan'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-05-21', 'latitude' => -8.6739, 'longitude' => 115.2093, 'transaction_amount' => 1500000, 'activity_description' => 'Koleksi cicilan triwulan'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-05-14', 'latitude' => -8.6740, 'longitude' => 115.2090, 'transaction_amount' => 500000, 'activity_description' => 'Penagihan reguler'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-05-07', 'latitude' => -8.6752, 'longitude' => 115.2110, 'transaction_amount' => 300000, 'activity_description' => 'Distribusi brosur & tagihan'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-04-30', 'latitude' => -8.6720, 'longitude' => 115.2075, 'transaction_amount' => 1100000, 'activity_description' => 'Penagihan berhasil'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-04-23', 'latitude' => -8.6735, 'longitude' => 115.2095, 'transaction_amount' => 600000, 'activity_description' => 'Verifikasi tempat tinggal nasabah harian'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-04-16', 'latitude' => -8.6746, 'longitude' => 115.2097, 'transaction_amount' => 850000, 'activity_description' => 'Kunjungan & janji bayar'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-04-09', 'latitude' => -8.6725, 'longitude' => 115.2081, 'transaction_amount' => 950000, 'activity_description' => 'Penagihan rutin tengah bulan'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-04-02', 'latitude' => -8.6734, 'longitude' => 115.2092, 'transaction_amount' => 500000, 'activity_description' => 'Penagihan rutin awal bulan'],
                    // KOL-02
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-15', 'latitude' => -8.6920, 'longitude' => 115.1950, 'transaction_amount' => 2000000, 'activity_description' => 'Kunjungan Imam Bonjol'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-05', 'latitude' => -8.6912, 'longitude' => 115.1955, 'transaction_amount' => 1500000, 'activity_description' => 'Kunjungan rute simpang siur'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-05-12', 'latitude' => -8.6930, 'longitude' => 115.1930, 'transaction_amount' => 1200000, 'activity_description' => 'Verifikasi nasabah Kuta utara'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-04-10', 'latitude' => -8.6850, 'longitude' => 115.1980, 'transaction_amount' => 3200000, 'activity_description' => 'Penagihan borongan merchant'],
                    // KOL-03
                    ['collector_code' => 'KOL-03', 'activity_date' => '2026-06-10', 'latitude' => -8.6750, 'longitude' => 115.2090, 'transaction_amount' => 400000, 'activity_description' => 'Kunjungan darurat'],
                    ['collector_code' => 'KOL-03', 'activity_date' => '2026-06-01', 'latitude' => -8.6120, 'longitude' => 115.2320, 'transaction_amount' => 1200000, 'activity_description' => 'Kunjungan Sanur jauh'],
                ],
            ],
            [
                'name' => 'Jakarta Selatan - Area Menteng',
                'description' => 'Skenario DKI Jakarta dengan persaingan ketat di Menteng. Nyoman (KOL-02) sangat dekat dan bertransaksi besar.',
                'customer' => [
                    'customer_id' => 'CUST-302',
                    'customer_name' => 'Yusuf Wijaya',
                    'address' => 'Jl. Teuku Umar No.20, RT.1/RW.1, Gondangdia, Kec. Menteng, Kota Jakarta Pusat, DKI Jakarta 10350',
                    'latitude' => -6.1895,
                    'longitude' => 106.8322,
                ],
                'profiles' => [
                    [
                        'collector_code' => 'KOL-01',
                        'total_transaction' => 220,
                        'total_nominal' => 115000000,
                        'active_days' => 60,
                        'active_customers' => 25,
                        'average_daily_activity' => 3.7,
                    ],
                    [
                        'collector_code' => 'KOL-02',
                        'total_transaction' => 510,
                        'total_nominal' => 298000000,
                        'active_days' => 120,
                        'active_customers' => 22,
                        'average_daily_activity' => 5.2,
                    ],
                    [
                        'collector_code' => 'KOL-03',
                        'total_transaction' => 90,
                        'total_nominal' => 35000000,
                        'active_days' => 20,
                        'active_customers' => 40,
                        'average_daily_activity' => 4.5,
                    ],
                ],
                'activities' => [
                    // KOL-02
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-19', 'latitude' => -6.1901, 'longitude' => 106.8315, 'transaction_amount' => 5000000, 'activity_description' => 'Penagihan korporat Menteng'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-15', 'latitude' => -6.1889, 'longitude' => 106.8330, 'transaction_amount' => 4500000, 'activity_description' => 'Kunjungan rutin Cikini'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-10', 'latitude' => -6.1892, 'longitude' => 106.8327, 'transaction_amount' => 3000000, 'activity_description' => 'Janji bayar jatuh tempo'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-03', 'latitude' => -6.1910, 'longitude' => 106.8320, 'transaction_amount' => 2500000, 'activity_description' => 'Distribusi surat penagihan'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-05-26', 'latitude' => -6.1899, 'longitude' => 106.8318, 'transaction_amount' => 3200000, 'activity_description' => 'Follow up lanjutan'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-05-19', 'latitude' => -6.1885, 'longitude' => 106.8335, 'transaction_amount' => 4000000, 'activity_description' => 'Kunjungan mingguan rutin'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-05-12', 'latitude' => -6.1905, 'longitude' => 106.8310, 'transaction_amount' => 2500000, 'activity_description' => 'Koleksi cicilan'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-05-05', 'latitude' => -6.1890, 'longitude' => 106.8325, 'transaction_amount' => 4700000, 'activity_description' => 'Penagihan lancar'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-04-28', 'latitude' => -6.1912, 'longitude' => 106.8322, 'transaction_amount' => 1500000, 'activity_description' => 'Janji bayar Menteng'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-04-21', 'latitude' => -6.1881, 'longitude' => 106.8329, 'transaction_amount' => 3000000, 'activity_description' => 'Penagihan rutin'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-04-14', 'latitude' => -6.1897, 'longitude' => 106.8332, 'transaction_amount' => 4000000, 'activity_description' => 'Kunjungan mingguan awal'],
                    // KOL-01
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-06-18', 'latitude' => -6.2081, 'longitude' => 106.8210, 'transaction_amount' => 1500000, 'activity_description' => 'Kunjungan Thamrin'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-06-10', 'latitude' => -6.2050, 'longitude' => 106.8230, 'transaction_amount' => 1000000, 'activity_description' => 'Penagihan gedung Sudirman'],
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-05-15', 'latitude' => -6.2070, 'longitude' => 106.8220, 'transaction_amount' => 2200000, 'activity_description' => 'Kunjungan reguler Sudirman'],
                ],
            ],
            [
                'name' => 'Cold Start - Daerah Baru',
                'description' => 'Mensimulasikan skenario tanpa data kunjungan historis dalam rute 3 km. Menghitung peringkat murni berdasarkan spasial terdekat.',
                'customer' => [
                    'customer_id' => 'CUST-303',
                    'customer_name' => 'Ni Ketut Suartini',
                    'address' => 'Jl. Raya Singaraja, Bedugul, Candikuning, Baturiti, Tabanan, Bali 82191',
                    'latitude' => -8.2750,
                    'longitude' => 115.1660,
                ],
                'profiles' => [
                    [
                        'collector_code' => 'KOL-01',
                        'total_transaction' => 150,
                        'total_nominal' => 60000000,
                        'active_days' => 45,
                        'active_customers' => 12,
                        'average_daily_activity' => 3.3,
                    ],
                    [
                        'collector_code' => 'KOL-02',
                        'total_transaction' => 230,
                        'total_nominal' => 92000000,
                        'active_days' => 60,
                        'active_customers' => 24,
                        'average_daily_activity' => 3.8,
                    ],
                    [
                        'collector_code' => 'KOL-03',
                        'total_transaction' => 80,
                        'total_nominal' => 28000000,
                        'active_days' => 20,
                        'active_customers' => 10,
                        'average_daily_activity' => 4.0,
                    ],
                ],
                'activities' => [
                    ['collector_code' => 'KOL-01', 'activity_date' => '2026-06-18', 'latitude' => -8.5450, 'longitude' => 115.1200, 'transaction_amount' => 800000, 'activity_description' => 'Kunjungan Tabanan Kota'],
                    ['collector_code' => 'KOL-02', 'activity_date' => '2026-06-15', 'latitude' => -8.6738, 'longitude' => 115.2091, 'transaction_amount' => 1500000, 'activity_description' => 'Penagihan Denpasar'],
                    ['collector_code' => 'KOL-03', 'activity_date' => '2026-06-17', 'latitude' => -8.4500, 'longitude' => 115.1300, 'transaction_amount' => 300000, 'activity_description' => 'Aktivitas Baturiti selatan'],
                ],
            ],
        ];
    }
}
