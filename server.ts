/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { runAnalysis } from "./src/engine";
import { GoogleGenAI } from "@google/genai";
import pool, { initializeDatabase, seedSampleData } from "./src/db";
import { sampleDatasets } from "./src/sampleData";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // JSON body parser with increased limit for larger activity streams
  app.use(express.json({ limit: "15mb" }));

  // Endpoint to add customer to database with optional Google Geocoding API
  app.post("/api/db/customers/add", async (req, res) => {
    try {
      const { customer_id, customer_name, address } = req.body;
      if (!customer_id || !customer_name || !address) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(400).json({ error: "Data nasabah tidak lengkap (customer_id, customer_name, address wajib)." });
      }

      let latitude = -8.7650;
      let longitude = 115.1760;
      let warning = "";

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey && apiKey.trim() !== "") {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
          const geocodeRes = await fetch(url);
          const geocodeData = await geocodeRes.json();
          if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
            const loc = geocodeData.results[0].geometry.location;
            latitude = loc.lat;
            longitude = loc.lng;
          } else {
            warning = `Gagal melakukan geocoding: status ${geocodeData.status}. Menggunakan koordinat default Kuta Beach.`;
            console.warn(`[Geocoding] ${warning}`);
          }
        } catch (fetchErr: any) {
          warning = `Koneksi ke Google Maps API gagal: ${fetchErr.message}. Menggunakan koordinat default Kuta Beach.`;
          console.warn(`[Geocoding] ${warning}`);
        }
      } else {
        warning = "GOOGLE_MAPS_API_KEY tidak ditemukan di .env. Menggunakan koordinat default Kuta Beach.";
        console.warn(`[Geocoding] ${warning}`);
      }

      await pool.query(
        `INSERT INTO customers (customer_id, customer_name, address, latitude, longitude)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           customer_name = VALUES(customer_name),
           address = VALUES(address),
           latitude = VALUES(latitude),
           longitude = VALUES(longitude)`,
        [customer_id, customer_name, address, latitude, longitude]
      );

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({
        success: true,
        customer: {
          customer_id,
          customer_name,
          address,
          latitude,
          longitude
        },
        warning: warning || undefined
      });
    } catch (e: any) {
      console.error("[DB] Gagal menambah nasabah:", e);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({ error: "Gagal menambah nasabah: " + e.message });
    }
  });

  // DB status check endpoint
  app.get("/api/db/status", async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT 1");
      
      let customersCount = 0;
      let profilesCount = 0;
      let activitiesCount = 0;

      try {
        const [custRes]: any = await pool.query("SELECT COUNT(*) as count FROM customers");
        customersCount = custRes[0].count;
        const [profRes]: any = await pool.query("SELECT COUNT(*) as count FROM collector_profiles");
        profilesCount = profRes[0].count;
        const [actRes]: any = await pool.query("SELECT COUNT(*) as count FROM collector_activities");
        activitiesCount = actRes[0].count;
      } catch (tableErr) {
        // Tables might not be initialized yet
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({
        connected: true,
        database: process.env.DB_DATABASE || "collection_territory",
        host: process.env.DB_HOST || "127.0.0.1",
        port: process.env.DB_PORT || "8889",
        tables: {
          customers: customersCount,
          profiles: profilesCount,
          activities: activitiesCount,
        }
      });
    } catch (e: any) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({
        connected: false,
        error: e.message,
        message: "Gagal terhubung ke MySQL MAMP. Pastikan server MySQL di MAMP sudah aktif pada port " + (process.env.DB_PORT || "8889")
      });
    }
  });

  // DB init endpoint
  app.post("/api/db/init", async (req, res) => {
    try {
      await initializeDatabase();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({ success: true, message: "Tabel database berhasil diinisialisasi." });
    } catch (e: any) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // DB seed endpoint
  app.post("/api/db/seed", async (req, res) => {
    try {
      await seedSampleData(sampleDatasets[0]);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({ success: true, message: "Database berhasil di-seed dengan data sampel Denpasar Barat, Bali." });
    } catch (e: any) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // Get list of customers from database
  app.get("/api/db/customers", async (req, res) => {
    try {
      const [rows]: any = await pool.query("SELECT customer_id, customer_name, address FROM customers");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json(rows);
    } catch (e: any) {
      console.error("[DB] Gagal memuat daftar nasabah:", e);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({ error: "Gagal memuat daftar nasabah: " + e.message });
    }
  });

  // Load analysis data for a specific customer from database
  app.get("/api/db/analysis-data/:customerId", async (req, res) => {
    try {
      const customerId = req.params.customerId;
      
      // Get customer
      const [custRows]: any = await pool.query("SELECT * FROM customers WHERE customer_id = ?", [customerId]);
      if (custRows.length === 0) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(404).json({ error: "Nasabah tidak ditemukan di database." });
      }
      const customer = custRows[0];

      // Get profiles
      const [profiles]: any = await pool.query("SELECT * FROM collector_profiles");

      // Query activities in a bounding box of ~5.5 km around the customer to optimize loading speed
      const lat = parseFloat(customer.latitude);
      const lng = parseFloat(customer.longitude);
      const boundingBox = 0.05; // degrees latitude/longitude (~5.5km)

      const [activities]: any = await pool.query(
        `SELECT * FROM collector_activities 
         WHERE latitude BETWEEN ? AND ? 
           AND longitude BETWEEN ? AND ?
         ORDER BY activity_date DESC
         LIMIT 1000`,
        [lat - boundingBox, lat + boundingBox, lng - boundingBox, lng + boundingBox]
      );

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.json({
        customer: {
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          address: customer.address,
          latitude: lat,
          longitude: lng,
        },
        profiles: profiles.map((p: any) => ({
          collector_code: p.collector_code,
          total_transaction: p.total_transaction,
          total_nominal: parseFloat(p.total_nominal),
          active_days: p.active_days,
          active_customers: p.active_customers,
          average_daily_activity: parseFloat(p.average_daily_activity),
        })),
        activities: activities.map((a: any) => {
          let dateStr = "";
          if (a.activity_date instanceof Date) {
            dateStr = a.activity_date.toISOString().split("T")[0];
          } else {
            // Hande string, buffer or other formats
            dateStr = String(a.activity_date).split(" ")[0];
          }
          return {
            collector_code: a.collector_code,
            activity_date: dateStr,
            latitude: parseFloat(a.latitude),
            longitude: parseFloat(a.longitude),
            transaction_amount: parseFloat(a.transaction_amount),
            activity_description: a.activity_description,
          };
        }),
      });
    } catch (e: any) {
      console.error("[DB] Gagal memuat data analisis:", e);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({ error: "Gagal memuat data analisis dari database: " + e.message });
    }
  });

  // Serve static UI assets to visitors on Port 3000
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Collection Territory Intelligence System] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
