import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

// Create connection pool using credentials from .env
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "8889"),
  user: process.env.DB_USERNAME || "root",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_DATABASE || "collection_territory",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;

/**
 * Initialize Database tables for the Collection Territory Intelligence System
 */
export async function initializeDatabase() {
  console.log("[DB] Initializing database tables...");
  
  // 1. Create customers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      customer_id VARCHAR(50) PRIMARY KEY,
      customer_name VARCHAR(255) NOT NULL,
      address TEXT NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Create collector profiles table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collector_profiles (
      collector_code VARCHAR(50) PRIMARY KEY,
      total_transaction INT DEFAULT 0,
      total_nominal BIGINT DEFAULT 0,
      active_days INT DEFAULT 0,
      active_customers INT DEFAULT 0,
      average_daily_activity DECIMAL(5, 2) DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3. Create collector activities table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collector_activities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      collector_code VARCHAR(50) NOT NULL,
      activity_date DATE NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      transaction_amount BIGINT DEFAULT 0,
      activity_description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collector_code) REFERENCES collector_profiles(collector_code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 4. Create index on coordinates for faster spatial bounding box filtering
  try {
    await pool.query(`
      CREATE INDEX idx_coords ON collector_activities (latitude, longitude);
    `);
    console.log("[DB] Index idx_coords created successfully.");
  } catch (err: any) {
    // Index might already exist, which is fine in mysql
  }

  console.log("[DB] Database tables initialized successfully.");
}

/**
 * Seed the database with the sample datasets from sampleData.ts
 */
export async function seedSampleData(dataset: {
  customer: any;
  profiles: any[];
  activities: any[];
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`[DB] Seeding data for customer: ${dataset.customer.customer_name}`);

    // Insert or update customer
    await connection.query(
      `INSERT INTO customers (customer_id, customer_name, address, latitude, longitude)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         customer_name = VALUES(customer_name),
         address = VALUES(address),
         latitude = VALUES(latitude),
         longitude = VALUES(longitude)`,
      [
        dataset.customer.customer_id,
        dataset.customer.customer_name,
        dataset.customer.address,
        dataset.customer.latitude,
        dataset.customer.longitude,
      ]
    );

    // Insert or update collector profiles
    for (const profile of dataset.profiles) {
      await connection.query(
        `INSERT INTO collector_profiles (collector_code, total_transaction, total_nominal, active_days, active_customers, average_daily_activity)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_transaction = VALUES(total_transaction),
           total_nominal = VALUES(total_nominal),
           active_days = VALUES(active_days),
           active_customers = VALUES(active_customers),
           average_daily_activity = VALUES(average_daily_activity)`,
        [
          profile.collector_code,
          profile.total_transaction,
          profile.total_nominal,
          profile.active_days,
          profile.active_customers,
          profile.average_daily_activity,
        ]
      );
    }

    // Insert collector activities (clear first for clean seed or keep simple)
    // For simplicity of seeding, we can delete previous activities for these collectors to prevent duplicates on repeat runs
    const collectorCodes = dataset.profiles.map(p => p.collector_code);
    if (collectorCodes.length > 0) {
      await connection.query(
        `DELETE FROM collector_activities WHERE collector_code IN (?)`,
        [collectorCodes]
      );
    }

    for (const activity of dataset.activities) {
      // Map activity date to yyyy-mm-dd
      const dateVal = new Date(activity.activity_date).toISOString().split("T")[0];
      await connection.query(
        `INSERT INTO collector_activities (collector_code, activity_date, latitude, longitude, transaction_amount, activity_description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          activity.collector_code,
          dateVal,
          activity.latitude,
          activity.longitude,
          activity.transaction_amount,
          activity.activity_description,
        ]
      );
    }

    await connection.commit();
    console.log("[DB] Seeding completed successfully.");
  } catch (error) {
    await connection.rollback();
    console.error("[DB] Seeding failed. Transaksi di-rollback.", error);
    throw error;
  } finally {
    connection.release();
  }
}
