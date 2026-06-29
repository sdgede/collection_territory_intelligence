/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { Customer, CollectorActivity, CollectorProfile, AnalysisOutput } from "./types";
import { sampleDatasets } from "./sampleData";
import { runAnalysis } from "./engine";
import InteractiveMap from "./components/InteractiveMap";
import CollectorCard from "./components/CollectorCard";
import { ShieldAlert, CheckSquare, AlertTriangle, Compass, Bookmark, Plus, X, HelpCircle, Info } from "lucide-react";



export default function App() {
  // Initial preloaded dataset
  const initialPreset = sampleDatasets[0];

  // Client side active collections state
  const [customer, setCustomer] = useState<Customer>(initialPreset.customer);
  const [profiles, setProfiles] = useState<CollectorProfile[]>(initialPreset.profiles);
  const [activities, setActivities] = useState<CollectorActivity[]>(initialPreset.activities);

  // Analysis variables
  const [referenceDate, setReferenceDate] = useState<string>("2026-06-19");
  const [selectedCollectorCode, setSelectedCollectorCode] = useState<string | null>(null);

  // Collector filter state: show top 5 by default, or all, or filter by code/name
  const [showMode, setShowMode] = useState<"top5" | "all">("top5");
  const [searchCollectorCode, setSearchCollectorCode] = useState<string>("all");

  // Database integration state
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbTables, setDbTables] = useState<any>({ customers: 0, profiles: 0, activities: 0 });
  const [dbCustomers, setDbCustomers] = useState<{ customer_id: string; customer_name: string; address: string }[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string>("");
  const [loadingDb, setLoadingDb] = useState<boolean>(false);

  // Add Customer modal state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState<boolean>(false);
  const [newCustId, setNewCustId] = useState<string>( "");
  const [newCustName, setNewCustName] = useState<string>("");
  const [newCustAddress, setNewCustAddress] = useState<string>("");
  const [submittingCust, setSubmittingCust] = useState<boolean>(false);

  // Onboarding Tour states
  const [activeTourStep, setActiveTourStep] = useState<number>(0);
  const [tourTargetRect, setTourTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Automatically recalculate on-the-fly client side
  const clientCalculatedReport = useMemo(() => {
    return runAnalysis(customer, activities, profiles, referenceDate);
  }, [customer, activities, profiles, referenceDate]);

  // Generate a mapping of collector_code to a distinct color scheme sequentially
  const collectorColorMap = useMemo(() => {
    const map: Record<string, { border: string; fill: string; text: string; bg: string; rawBg: string; name: string }> = {};
    const schemes = [
      { border: "#3b82f6", fill: "#93c5fd", text: "text-blue-600", bg: "bg-blue-500", rawBg: "#3b82f6", name: "Biru" },
      { border: "#eab308", fill: "#fef08a", text: "text-yellow-600", bg: "bg-yellow-500", rawBg: "#eab308", name: "Kuning" },
      { border: "#a855f7", fill: "#e9d5ff", text: "text-purple-600", bg: "bg-purple-500", rawBg: "#a855f7", name: "Ungu" },
      { border: "#06b6d4", fill: "#a5f3fc", text: "text-cyan-600", bg: "bg-cyan-500", rawBg: "#06b6d4", name: "Cyan" },
      { border: "#f43f5e", fill: "#fecdd3", text: "text-rose-600", bg: "bg-rose-500", rawBg: "#f43f5e", name: "Merah Muda" },
      { border: "#10b981", fill: "#a7f3d0", text: "text-emerald-600", bg: "bg-emerald-500", rawBg: "#10b981", name: "Hijau" },
      { border: "#f97316", fill: "#ffedd5", text: "text-orange-600", bg: "bg-orange-500", rawBg: "#f97316", name: "Oranye" },
      { border: "#6366f1", fill: "#e0e7ff", text: "text-indigo-600", bg: "bg-indigo-500", rawBg: "#6366f1", name: "Indigo" },
      { border: "#ec4899", fill: "#fbcfe8", text: "text-pink-600", bg: "bg-pink-500", rawBg: "#ec4899", name: "Pink" },
      { border: "#14b8a6", fill: "#ccfbf1", text: "text-teal-600", bg: "bg-teal-500", rawBg: "#14b8a6", name: "Teal" },
    ];
    
    clientCalculatedReport.top_collectors.forEach((col, index) => {
      const schemeIndex = index % schemes.length;
      map[col.collector_code] = schemes[schemeIndex];
    });
    
    return map;
  }, [clientCalculatedReport.top_collectors]);

  // Filtered collectors list based on showMode and searchCollectorCode
  const visibleCollectors = useMemo(() => {
    const allRanked = clientCalculatedReport.top_collectors;
    if (searchCollectorCode !== "all") {
      return allRanked.filter(c => c.collector_code === searchCollectorCode);
    } else if (showMode === "top5") {
      return allRanked.slice(0, 5);
    }
    return allRanked;
  }, [clientCalculatedReport.top_collectors, showMode, searchCollectorCode]);

  // Filtered activities to pass to InteractiveMap
  const mapActivitiesFiltered = useMemo(() => {
    const allowedCodes = new Set(visibleCollectors.map(c => c.collector_code));
    return activities.filter(act => allowedCodes.has(act.collector_code));
  }, [activities, visibleCollectors]);

  // Fetch Database connection and status info
  const fetchDbStatus = async () => {
    setLoadingDb(true);
    try {
      const res = await fetch("/api/db/status");
      const data = await res.json();
      setDbConnected(data.connected);
      if (data.connected) {
        setDbTables(data.tables);
        setDbError(null);
        
        // Fetch database customer list
        const custRes = await fetch("/api/db/customers");
        const custData = await custRes.json();
        setDbCustomers(custData);
      } else {
        setDbError(data.message || "MySQL disconnected.");
        setDbCustomers([]);
      }
    } catch (e: any) {
      setDbConnected(false);
      setDbError("Koneksi gagal: " + e.message);
      setDbCustomers([]);
    } finally {
      setLoadingDb(false);
    }
  };

  // Load database customer analysis data
  const handleLoadDbCustomer = async (custId: string) => {
    if (!custId) return;
    setLoadingDb(true);
    try {
      const res = await fetch(`/api/db/analysis-data/${custId}`);
      if (!res.ok) {
        throw new Error("Gagal memuat data analisis dari database.");
      }
      const data = await res.json();
      setCustomer(data.customer);
      setProfiles(data.profiles);
      setActivities(data.activities);
      setSelectedCustId(custId);
      setSelectedCollectorCode(null);
    } catch (err: any) {
      alert("Error memuat data nasabah: " + err.message);
    } finally {
      setLoadingDb(false);
    }
  };

  // Submit new customer geocoding & save
  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustId || !newCustName || !newCustAddress) {
      alert("Harap isi semua kolom!");
      return;
    }
    setSubmittingCust(true);
    try {
      const res = await fetch("/api/db/customers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: newCustId,
          customer_name: newCustName,
          address: newCustAddress
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menambahkan nasabah.");
      }
      
      if (data.warning) {
        alert(`Nasabah ditambahkan dengan peringatan: ${data.warning}`);
      } else {
        alert("Nasabah berhasil ditambahkan!");
      }
      
      // Reset form & close modal
      setNewCustId("");
      setNewCustName("");
      setNewCustAddress("");
      setIsAddCustomerOpen(false);
      
      // Refresh list and load new customer
      await fetchDbStatus();
      await handleLoadDbCustomer(data.customer.customer_id);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSubmittingCust(false);
    }
  };

  // Fetch db status on mount
  useEffect(() => {
    fetchDbStatus();
  }, []);

  // Sync first DB customer if loaded from database
  useEffect(() => {
    if (dbCustomers.length > 0 && !selectedCustId) {
      const firstCust = dbCustomers[0].customer_id;
      handleLoadDbCustomer(firstCust);
    }
  }, [dbCustomers]);

  // Onboarding steps definition
  const tourSteps = useMemo(() => {
    if (dbConnected) {
      return [
        {
          selector: "#wrapper-header-customer",
          title: "Pilih Nasabah Aktif",
          content: "Pilih nasabah dari database untuk memuat, menganalisis, dan memetakan data kunjungan kolektor secara langsung di peta secara real-time.",
          placement: "bottom" as const
        },
        {
          selector: "#collector-color-index",
          title: "Jejak Rute & Filter Rute",
          content: "Lihat warna jejak rute setiap kolektor di peta. Gunakan filter Top 5 / Semua Rute, cari nama/kode kolektor, atau klik salah satu kolektor untuk memfokuskan rutenya.",
          placement: "left" as const
        },
        {
          selector: "#btn-header-add-customer",
          title: "Daftarkan Nasabah Baru",
          content: "Klik tombol ini untuk menambahkan nasabah baru dengan input alamat lengkap. Sistem akan otomatis melacak koordinat GPS nasabah menggunakan Google Maps Geocoding backend.",
          placement: "bottom" as const
        },
        {
          selector: "#management-report-card",
          title: "Tinjauan Analitis Teritori",
          content: "Lihat ringkasan eksekutif analisis, rekomendasi tindakan operasional lapangan (Actions), serta penilaian risiko spasial wilayah untuk nasabah terpilih.",
          placement: "top" as const
        }
      ];
    } else {
      return [
        {
          selector: "#wrapper-header-ref-date",
          title: "Tanggal Acuan Analisis",
          content: "Pilih tanggal acuan analisis untuk menyaring aktivitas terbaru. Kunjungan yang lebih dekat dengan tanggal acuan dinilai memiliki bobot relevansi lebih tinggi.",
          placement: "bottom" as const
        },
        {
          selector: "#collector-color-index",
          title: "Jejak Rute & Filter Rute",
          content: "Lihat warna jejak rute setiap kolektor di peta. Gunakan filter Top 5 / Semua Rute, cari nama/kode kolektor, atau klik salah satu kolektor untuk memfokuskan rutenya.",
          placement: "left" as const
        },
        {
          selector: "#management-report-card",
          title: "Tinjauan Analitis Teritori",
          content: "Lihat ringkasan eksekutif analisis, rekomendasi tindakan operasional lapangan (Actions), serta penilaian risiko spasial wilayah untuk nasabah terpilih.",
          placement: "top" as const
        }
      ];
    }
  }, [dbConnected]);

  // Hook to calculate coordinates and handle scrolling
  useEffect(() => {
    if (activeTourStep === 0) {
      setTourTargetRect(null);
      return;
    }

    const stepIndex = activeTourStep - 1;
    if (stepIndex < 0 || stepIndex >= tourSteps.length) {
      return;
    }

    const step = tourSteps[stepIndex];
    const updateRect = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        const bounding = el.getBoundingClientRect();
        
        const isOutOfViewport =
          bounding.top < 0 ||
          bounding.left < 0 ||
          bounding.bottom > (window.innerHeight || document.documentElement.clientHeight) ||
          bounding.right > (window.innerWidth || document.documentElement.clientWidth);

        if (isOutOfViewport) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const timer = setTimeout(() => {
            const updatedBounding = el.getBoundingClientRect();
            setTourTargetRect({
              top: updatedBounding.top,
              left: updatedBounding.left,
              width: updatedBounding.width,
              height: updatedBounding.height
            });
          }, 300);
          return () => clearTimeout(timer);
        } else {
          setTourTargetRect({
            top: bounding.top,
            left: bounding.left,
            width: bounding.width,
            height: bounding.height
          });
        }
      } else {
        setTourTargetRect(null);
      }
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [activeTourStep, tourSteps]);

  // Auto-trigger onboarding guide on first visit
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("ctis_onboarding_seen");
    if (!hasSeenOnboarding) {
      const timer = setTimeout(() => {
        setActiveTourStep(1);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const skipTour = () => {
    setActiveTourStep(0);
    localStorage.setItem("ctis_onboarding_seen", "true");
  };

  const finishTour = () => {
    setActiveTourStep(0);
    localStorage.setItem("ctis_onboarding_seen", "true");
  };

  const handleUpdateAllData = (
    nextCust: Customer,
    nextProfs: CollectorProfile[],
    nextActs: CollectorActivity[]
  ) => {
    setCustomer(nextCust);
    setProfiles(nextProfs);
    setActivities(nextActs);
    setSelectedCustId(""); // Reset select status since we switched to mock preset/manual data
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans" id="app-root-container">
      {/* Top Professional Executive Header - Clean Minimalism */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4" id="ctis-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center text-white font-bold text-sm shadow-xs" id="app-brand-logo">
            C
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight uppercase text-slate-800 flex items-center gap-2">
              Collection Territory Intelligence System
              <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono font-medium tracking-wide uppercase normal-case">
                v2.5
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Sistem Analisis Spasial Dan Rekomendasi Teritori Penugasan Kolektor Terbaik
            </p>
          </div>
        </div>

        {/* Header Toolbar containing prominent Customer Selector, Date Picker and Add Customer button */}
        <div className="flex items-center gap-3">
          {/* Prominent Customer Select Block */}
          {dbConnected ? (
            <div 
              id="wrapper-header-customer"
              className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 flex flex-col justify-center shadow-xs min-w-[240px] h-12"
              title="Pilih nasabah aktif untuk menganalisis teritori penugasan kolektor secara real-time"
            >
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Pilih Nasabah Aktif</span>
              <select
                value={selectedCustId}
                onChange={(e) => {
                  if (e.target.value !== "") {
                    handleLoadDbCustomer(e.target.value);
                  }
                }}
                className="bg-transparent text-slate-800 text-sm font-bold focus:outline-none pr-8 cursor-pointer outline-none"
                id="select-header-customer"
              >
                {selectedCustId === "" && (
                  <option value="">(Simulasi Preset / Kustom)</option>
                )}
                {dbCustomers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.customer_name} ({c.customer_id})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div 
              id="offline-preset-badge"
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex flex-col justify-center shadow-xs min-w-[240px] h-12"
              title="Database tidak terhubung. Menggunakan simulasi preset lokal."
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[9px] text-amber-700 uppercase tracking-wider font-bold">Simulasi Offline Preset</span>
              </div>
              <select
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  if (!isNaN(idx) && sampleDatasets[idx]) {
                    const preset = sampleDatasets[idx];
                    handleUpdateAllData(preset.customer, preset.profiles, preset.activities);
                  }
                }}
                className="bg-transparent text-amber-800 text-sm font-bold focus:outline-none pr-8 cursor-pointer outline-none"
              >
                {sampleDatasets.map((preset, idx) => (
                  <option key={idx} value={idx}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reference Date Picker (always visible) */}
          <div 
            id="wrapper-header-ref-date"
            className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 flex flex-col justify-center shadow-xs h-12"
            title="Pilih tanggal acuan analisis untuk menghitung bobot aktivitas kunjungan terbaru (kunjungan dekat tanggal acuan dinilai lebih relevan)"
          >
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Tanggal Acuan Analisis</span>
            <input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="bg-transparent text-slate-850 text-xs font-bold focus:outline-none outline-none cursor-pointer"
              id="select-header-ref-date"
            />
          </div>

          {/* Add Customer Button (only if db connected) */}
          {dbConnected && (
            <button
              onClick={() => setIsAddCustomerOpen(true)}
              className="h-12 w-12 rounded-xl bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center cursor-pointer transition-colors shadow-md border border-slate-700"
              title="Daftarkan nasabah baru dengan input alamat lengkap. Koordinat GPS dicari secara otomatis menggunakan Google Maps Geocoding."
              id="btn-header-add-customer"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}

          {/* Help/Guide Tour Button */}
          <button
            onClick={() => {
              setActiveTourStep(1);
            }}
            className="h-12 w-12 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer transition-colors shadow-xs"
            title="Mulai Panduan Onboarding Interaktif"
            id="btn-header-help-guide"
          >
            <HelpCircle className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="text-left md:text-right">
          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">OPERATOR / UTC TIME</p>
          <p className="text-xs font-mono text-slate-600 mt-0.5">gedeindrawan2006@gmail.com</p>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex flex-col gap-6" id="dashboard-main-view">
        
        {/* Top Section: Interactive Map on the Left, Simple Color-Coded Collector Index on the Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* COLUMN 1 (Left, col-span-9): Interactive Map Preview */}
          <div className="lg:col-span-9 h-[600px]" id="top-map-container">
            <InteractiveMap
              customer={customer}
              activities={mapActivitiesFiltered}
              selectedCollectorCode={selectedCollectorCode}
              onSelectCollector={setSelectedCollectorCode}
              collectorColorMap={collectorColorMap}
            />
          </div>

          {/* COLUMN 2 (Right, col-span-3): Simple Collector Color Legend Index */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                Jejak Rute Kolektor
              </h3>
              <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">
                Filter Rute
              </span>
            </div>

            {/* Filter Controls (Top 5 vs Semua & Filter By Name/Code) */}
            <div className="bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/60 flex flex-col gap-2.5">
              <div className="flex gap-1.5 bg-slate-200/60 p-1 rounded-lg">
                <button
                  onClick={() => {
                    setShowMode("top5");
                    setSearchCollectorCode("all");
                  }}
                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-md text-center transition-colors cursor-pointer ${
                    showMode === "top5" && searchCollectorCode === "all"
                      ? "bg-white text-slate-800 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Tampilkan hanya rute dari 5 kolektor dengan skor kecocokan wilayah tertinggi agar peta tetap bersih dan rapi"
                >
                  Top 5 Rute
                </button>
                <button
                  onClick={() => {
                    setShowMode("all");
                    setSearchCollectorCode("all");
                  }}
                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-md text-center transition-colors cursor-pointer ${
                    showMode === "all" && searchCollectorCode === "all"
                      ? "bg-white text-slate-800 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Tampilkan seluruh rute perjalanan kolektor yang terekam di wilayah ini secara keseluruhan"
                >
                  Semua Rute
                </button>
              </div>

              <div 
                className="flex flex-col gap-1"
                title="Pilih kolektor tertentu untuk menyembunyikan rute lainnya dan fokus menganalisis satu kolektor secara mendalam"
              >
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold px-0.5">
                  Cari Berdasarkan Nama/Kode
                </span>
                <select
                  value={searchCollectorCode}
                  onChange={(e) => {
                    setSearchCollectorCode(e.target.value);
                    if (e.target.value !== "all") {
                      setSelectedCollectorCode(e.target.value);
                    } else {
                      setSelectedCollectorCode(null);
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:border-slate-400 outline-none cursor-pointer font-mono"
                >
                  <option value="all">Semua Kolektor (Tanpa Filter)</option>
                  {clientCalculatedReport.top_collectors.map((col) => {
                    const colors = collectorColorMap[col.collector_code] || { name: "Abu-abu" };
                    return (
                      <option key={col.collector_code} value={col.collector_code}>
                        Kolektor {col.collector_code} ({colors.name})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="space-y-2.5 flex flex-col" id="collector-color-index">
              {visibleCollectors.map((col) => {
                const originalIndex = clientCalculatedReport.top_collectors.findIndex(
                  (c) => c.collector_code === col.collector_code
                );
                const colors = collectorColorMap[col.collector_code] || { border: "#cbd5e1", fill: "#f1f5f9", name: "Abu-abu" };
                const isSelected = selectedCollectorCode === col.collector_code;
                return (
                  <button
                    key={col.collector_code}
                    onClick={() => setSelectedCollectorCode(isSelected ? null : col.collector_code)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left cursor-pointer ${
                      isSelected 
                        ? "bg-slate-800 text-white border-transparent shadow-md" 
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                    style={{
                      borderLeft: `4px solid ${colors.border}`
                    }}
                    title={`Klik untuk menyoroti (highlight) rute perjalanan Kolektor ${col.collector_code} secara eksklusif di peta`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-md font-mono ${
                        isSelected ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"
                      }`}>
                        {originalIndex + 1}
                      </span>
                      <span className="font-bold text-xs font-mono">Kolektor {col.collector_code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium tracking-wide opacity-80">
                        {colors.name}
                      </span>
                      <span className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: colors.border }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Bottom Section: Detailed Matchmaking Cards & Management Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* COLUMN 1 (Left, col-span-4): Matchmaking Detailed Cards (Descriptions) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                Detail Skor & Metrik Matchmaking
              </h3>
              <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">
                Dibersihkan dari Noise
              </span>
            </div>
            <div className="space-y-3 max-h-[520px] overflow-auto pr-1 flex flex-col" id="candidates-list-scrollable">
              {visibleCollectors.map((col) => (
                <div key={col.collector_code}>
                  <CollectorCard
                    collector={col}
                    isSelected={selectedCollectorCode === col.collector_code}
                    onSelect={() =>
                      setSelectedCollectorCode(
                        selectedCollectorCode === col.collector_code ? null : col.collector_code
                      )
                    }
                    colorScheme={collectorColorMap[col.collector_code]}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 2 (Right, col-span-8): Selected Collector Details & Reports */}
          <div className="lg:col-span-8 flex flex-col gap-6">


            {/* If a collector is selected, show details */}
            {selectedCollectorCode && (
              <div className="bg-slate-800 text-white rounded-xl p-5 border border-slate-700 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <h4 className="font-bold text-sm uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-blue-400 animate-spin animate-duration-[4000ms]" />
                    Detail Kolektor Terpilih: {selectedCollectorCode}
                  </h4>
                  <button
                    onClick={() => setSelectedCollectorCode(null)}
                    className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Tutup Detail
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-1">
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[9px] tracking-wider">Aktivitas Terjadwal</span>
                    <p className="font-semibold text-slate-200 mt-0.5 leading-relaxed">
                      {activities.filter(a => a.collector_code === selectedCollectorCode).length} Titik kunjungan terekam di wilayah ini.
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[9px] tracking-wider">Metrik Utama Penugasan</span>
                    {(() => {
                      const colData = clientCalculatedReport.top_collectors.find(c => c.collector_code === selectedCollectorCode);
                      if (!colData) return <p className="text-slate-500 italic mt-0.5">Metrik tidak ditemukan</p>;
                      return (
                        <p className="text-slate-200 font-semibold mt-0.5">
                          Skor Matchmaking: <span className="text-blue-400 font-bold">{colData.score}/100</span> | Rentang Jarak Rerata: <span className="font-bold">{colData.supporting_metrics.avg_distance_km} km</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Analysis report outputs - Clean Minimalism */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col gap-4 text-left" id="management-report-card">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    Tinjauan Analitis Teritori
                  </h3>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5 uppercase">
                    Periode analisis: {clientCalculatedReport.analysis_period}
                  </p>
                </div>
                <Bookmark className="w-4 h-4 text-slate-400" />
              </div>

              {/* Executive summary block */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  Executive Summary
                </span>
                <p className="text-slate-650 text-xs leading-relaxed text-slate-600" id="exec-summary-text">
                  {clientCalculatedReport.executive_summary}
                </p>
              </div>

              {/* Recommended Action steps block */}
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
                  Recommended Actions
                </span>
                <div className="space-y-1.5" id="actions-list">
                  {clientCalculatedReport.recommended_actions.map((act, index) => (
                    <div key={index} className="p-2 bg-slate-50 border border-slate-200/60 rounded text-[11px] text-slate-700">
                      {act}
                    </div>
                  ))}
                </div>
              </div>

              {/* Risks and constraints warnings block */}
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                  Risk Analysis
                </span>
                <div className="space-y-1.5" id="risks-list">
                  {clientCalculatedReport.risk_analysis.length === 0 ? (
                    <p className="text-[11px] text-slate-450 italic pl-1">
                      Tidak terdeteksi deviasi risiko krusial untuk rancangan wilayah saat ini.
                    </p>
                  ) : (
                    clientCalculatedReport.risk_analysis.map((risk, idx) => (
                      <div key={idx} className="flex gap-2 text-xs text-slate-600">
                        <span className="text-amber-500">●</span>
                        <span>{risk}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Data limitations warnings block */}
              {clientCalculatedReport.data_limitations && clientCalculatedReport.data_limitations.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-100">
                  <span className="text-[9px] uppercase tracking-wider text-slate-450 font-semibold font-mono font-bold">
                    Data Limitations
                  </span>
                  <ul className="space-y-1" id="limitations-list">
                    {clientCalculatedReport.data_limitations.map((limit, idx) => (
                      <li key={idx} className="text-[10px] text-slate-500 leading-relaxed italic pl-1 flex items-start gap-1">
                        <span>-</span>
                        <span>{limit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

          </div>

        </div>
      </main>

      {/* Humble Footer Block - Clean Minimalism */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto text-[10px] text-slate-400 font-medium" id="ctis-footer">
        <span>© 2026 TERRITORY INTELLIGENCE ENGINE v2.5</span>
        <span className="flex items-center gap-1 uppercase tracking-wider">
          Data Confidentiality Level: Internal Only
        </span>
      </footer>

      {/* Add Customer Modal Overlay */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-slate-600" />
                Tambah Nasabah Baru
              </h3>
              <button
                onClick={() => setIsAddCustomerOpen(false)}
                className="p-1 hover:bg-slate-200/50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddCustomerSubmit} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">
                  ID Nasabah
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: CUST-999"
                  value={newCustId}
                  onChange={(e) => setNewCustId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:bg-white focus:border-slate-400 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">
                  Nama Nasabah
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Wayan Legian"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:bg-white focus:border-slate-400 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">
                  Alamat Lengkap (Untuk Geocoding)
                </label>
                <textarea
                  required
                  placeholder="Contoh: Jl. Pantai Kuta No. 1, Kuta, Badung, Bali"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:bg-white focus:border-slate-400 outline-none transition-colors resize-none leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  Sistem akan menerjemahkan alamat di atas menjadi koordinat peta menggunakan Google Maps Geocoding secara otomatis.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingCust}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow-xs transition-colors disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
                >
                  {submittingCust ? "Memproses Geocoding..." : "Simpan & Petakan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Onboarding Tour Overlay & Tooltip */}
      {activeTourStep > 0 && tourTargetRect && (
        <>
          {/* Spotlight Highlight Mask */}
          <div 
            className="fixed z-[9998] rounded-xl transition-all duration-300 pointer-events-none"
            style={{
              top: tourTargetRect.top - 8,
              left: tourTargetRect.left - 8,
              width: tourTargetRect.width + 16,
              height: tourTargetRect.height + 16,
              boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65), 0 0 15px rgba(255, 255, 255, 0.4)",
            }}
          />

          {/* Click Blocker Layer */}
          <div 
            className="fixed inset-0 z-[9997] bg-transparent cursor-default"
            onClick={skipTour}
          />

          {/* Tooltip Content Box */}
          {(() => {
            const currentStep = tourSteps[activeTourStep - 1];
            if (!currentStep) return null;

            const tooltipWidth = 320;
            let tooltipStyle: React.CSSProperties = {};

            if (currentStep.placement === "bottom") {
              tooltipStyle = {
                top: Math.min(window.innerHeight - 220, tourTargetRect.top + tourTargetRect.height + 16),
                left: Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, tourTargetRect.left + (tourTargetRect.width / 2) - (tooltipWidth / 2))),
              };
            } else if (currentStep.placement === "left") {
              if (window.innerWidth > 768 && tourTargetRect.left > tooltipWidth + 32) {
                tooltipStyle = {
                  top: Math.max(16, Math.min(window.innerHeight - 220, tourTargetRect.top + (tourTargetRect.height / 2) - 90)),
                  left: tourTargetRect.left - tooltipWidth - 20,
                };
              } else {
                tooltipStyle = {
                  top: Math.min(window.innerHeight - 220, tourTargetRect.top + tourTargetRect.height + 16),
                  left: Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, tourTargetRect.left + (tourTargetRect.width / 2) - (tooltipWidth / 2))),
                };
              }
            } else if (currentStep.placement === "top") {
              tooltipStyle = {
                top: Math.max(16, tourTargetRect.top - 200),
                left: Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, tourTargetRect.left + (tourTargetRect.width / 2) - (tooltipWidth / 2))),
              };
            }

            return (
              <div 
                className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 flex flex-col gap-4 text-slate-800 transition-all duration-300 max-w-[320px] w-full"
                style={tooltipStyle}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-slate-100 text-slate-650 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    Langkah {activeTourStep} dari {tourSteps.length}
                  </span>
                  <button 
                    onClick={skipTour}
                    className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="Lewati panduan"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Content */}
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 mb-1 leading-snug">
                    {currentStep.title}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {currentStep.content}
                  </p>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 mt-1">
                  <button
                    onClick={skipTour}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    Lewati
                  </button>
                  <div className="flex items-center gap-2">
                    {activeTourStep > 1 && (
                      <button
                        onClick={() => setActiveTourStep(activeTourStep - 1)}
                        className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                      >
                        Kembali
                      </button>
                    )}
                    {activeTourStep < tourSteps.length ? (
                      <button
                        onClick={() => setActiveTourStep(activeTourStep + 1)}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Lanjut
                      </button>
                    ) : (
                      <button
                        onClick={finishTour}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Selesai
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ); 
          })()}
        </>
      )}

    </div>
  );
}
