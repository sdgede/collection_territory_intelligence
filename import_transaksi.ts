import fs from "fs";
import path from "path";
import pool from "./src/db";

interface RawTransaction {
  KOLEKTOR: string;
  KETERANGAN: string;
  TANGGAL: string;
  LAT: number;
  LNG: number;
}

// Helper to extract nominal amount from KETERANGAN string (e.g. "Rp 455.000" -> 455000)
function extractAmount(description: string): number {
  const match = description.match(/Rp\s*([0-9.]+)/i);
  if (match) {
    return parseInt(match[1].replace(/\./g, ""), 10) || 0;
  }
  return 0;
}

async function runImport() {
  console.log("[Import] Starting import process from transaksi.json...");
  
  const filePath = path.join(process.cwd(), "transaksi.json");
  if (!fs.existsSync(filePath)) {
    console.error(`[Import] Error: File tidak ditemukan di ${filePath}`);
    process.exit(1);
  }

  // 1. Read and parse JSON file
  console.log("[Import] Reading transaksi.json (this may take a few seconds)...");
  const rawData = fs.readFileSync(filePath, "utf-8");
  const transactions: RawTransaction[] = JSON.parse(rawData);
  console.log(`[Import] Total transaksi ditemukan: ${transactions.length.toLocaleString("id-ID")}`);

  // 2. Pre-process collector profiles from transactions
  console.log("[Import] Pre-processing collector profiles and statistics...");
  
  const collectorStats: Record<string, {
    collector_code: string;
    total_transaction: number;
    total_nominal: number;
    active_dates: Set<string>;
    unique_locations: Set<string>; // to estimate active_customers
  }> = {};

  for (const tx of transactions) {
    const code = tx.KOLEKTOR;
    if (!code) continue;

    if (!collectorStats[code]) {
      collectorStats[code] = {
        collector_code: code,
        total_transaction: 0,
        total_nominal: 0,
        active_dates: new Set<string>(),
        unique_locations: new Set<string>(),
      };
    }

    const stats = collectorStats[code];
    stats.total_transaction += 1;
    stats.total_nominal += extractAmount(tx.KETERANGAN);
    
    // Extract date (YYYY-MM-DD)
    const datePart = tx.TANGGAL.split(" ")[0];
    stats.active_dates.add(datePart);

    // Track unique location coordinates as a proxy for customer count
    const coordKey = `${tx.LAT.toFixed(4)},${tx.LNG.toFixed(4)}`;
    stats.unique_locations.add(coordKey);
  }

  const profiles = Object.values(collectorStats).map((stats) => {
    const activeDays = stats.active_dates.size || 1;
    const avgDaily = stats.total_transaction / activeDays;
    
    return {
      collector_code: stats.collector_code,
      total_transaction: stats.total_transaction,
      total_nominal: stats.total_nominal,
      active_days: activeDays,
      active_customers: Math.max(5, stats.unique_locations.size), // estimate active customer count
      average_daily_activity: parseFloat(avgDaily.toFixed(2)),
    };
  });

  console.log(`[Import] Total profil kolektor unik dihitung: ${profiles.length}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 3. Clear previous records from activities and profiles to prevent duplicate keys
    console.log("[Import] Clearing existing activities and collector profiles in database...");
    await connection.query("SET FOREIGN_KEY_CHECKS = 0;");
    await connection.query("TRUNCATE TABLE collector_activities;");
    await connection.query("TRUNCATE TABLE collector_profiles;");
    await connection.query("SET FOREIGN_KEY_CHECKS = 1;");

    // Insert default customer centered around transactions (Kuta, Bali)
    console.log("[Import] Inserting default customer for Kuta Badung region...");
    await connection.query(
      `INSERT INTO customers (customer_id, customer_name, address, latitude, longitude)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         customer_name = VALUES(customer_name),
         address = VALUES(address),
         latitude = VALUES(latitude),
         longitude = VALUES(longitude)`,
      [
        "CUST-KUTA",
        "Wayan Adi Putra (Kuta)",
        "Jl. Sunset Road No.100, Kuta, Kabupaten Badung, Bali 80361",
        -8.76500000,
        115.17600000
      ]
    );

    // 4. Insert collector profiles
    console.log("[Import] Inserting collector profiles...");
    for (const p of profiles) {
      await connection.query(
        `INSERT INTO collector_profiles (collector_code, total_transaction, total_nominal, active_days, active_customers, average_daily_activity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.collector_code, p.total_transaction, p.total_nominal, p.active_days, p.active_customers, p.average_daily_activity]
      );
    }
    console.log("[Import] Profiles inserted successfully.");

    // 5. Bulk insert collector activities in chunks of 2,000 to optimize performance
    console.log("[Import] Bulk inserting collector activities...");
    const chunkSize = 2000;
    let insertedCount = 0;

    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      
      const values: any[] = [];
      const placeholders = chunk
        .map((tx) => {
          const amount = extractAmount(tx.KETERANGAN);
          const dateVal = tx.TANGGAL.split(" ")[0]; // format to YYYY-MM-DD
          
          values.push(tx.KOLEKTOR, dateVal, tx.LAT, tx.LNG, amount, tx.KETERANGAN);
          return "(?, ?, ?, ?, ?, ?)";
        })
        .join(", ");

      const sql = `INSERT INTO collector_activities (collector_code, activity_date, latitude, longitude, transaction_amount, activity_description) VALUES ${placeholders}`;
      
      await connection.query(sql, values);
      insertedCount += chunk.length;
      
      if (insertedCount % 10000 === 0 || insertedCount === transactions.length) {
        console.log(`[Import] Progress: Imported ${insertedCount.toLocaleString("id-ID")} / ${transactions.length.toLocaleString("id-ID")} activities`);
      }
    }

    await connection.commit();
    console.log("[Import] Database transaction committed successfully.");
    console.log("[Import] IMPORT COMPLETED SUCCESSFULLY!");
  } catch (error) {
    await connection.rollback();
    console.error("[Import] Transaction failed, rolled back changes.", error);
  } finally {
    connection.release();
    await pool.end();
  }
}

runImport();
