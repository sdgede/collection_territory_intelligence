/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CollectorResult } from "../types";
import { Award, ShieldAlert, Sparkles, User, TrendingUp, Calendar, MapPin, DollarSign, Repeat, Users } from "lucide-react";

interface CollectorCardProps {
  collector: CollectorResult;
  isSelected: boolean;
  onSelect: () => void;
  colorScheme?: { border: string; fill: string; text: string; bg: string; rawBg: string; name: string };
}

export default function CollectorCard({ collector, isSelected, onSelect, colorScheme }: CollectorCardProps) {
  const { rank, collector_code, score, confidence, reason, supporting_metrics } = collector;

  // Confidence styling
  const getConfStyle = (conf: "HIGH" | "MEDIUM" | "LOW") => {
    switch (conf) {
      case "HIGH":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60";
      case "MEDIUM":
        return "bg-amber-50 text-amber-700 border-amber-200/60";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200/60";
    }
  };

  // Rank-based borders/shadows/badges for elite visual hierarchy
  const getRankStyle = (r: number) => {
    if (r === 1) {
      return {
        card: "bg-white border-slate-200 shadow-sm hover:border-slate-300",
        badge: "bg-slate-800 text-white rounded font-mono",
        icon: <Award className="w-4 h-4 text-slate-600" />,
      };
    }
    if (r === 2) {
      return {
        card: "bg-white border-slate-200 shadow-xs hover:border-slate-300",
        badge: "bg-slate-500 text-white rounded font-mono",
        icon: <Award className="w-4 h-4 text-slate-400" />,
      };
    }
    return {
      card: "bg-white border-slate-200/60 shadow-xs hover:border-slate-300",
      badge: "bg-slate-300 text-slate-700 rounded font-mono",
      icon: <User className="w-4 h-4 text-slate-400" />,
    };
  };

  const style = getRankStyle(rank);
  const confStyle = getConfStyle(confidence);
  const colors = colorScheme || {
    border: "#cbd5e1",
    fill: "#f1f5f9",
    text: "text-slate-650",
    bg: "bg-slate-500",
    rawBg: "#64748b",
    name: "Abu-abu"
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-4 transition-all duration-150 cursor-pointer flex flex-col gap-3.5 relative overflow-hidden text-left ${style.card}`}
      style={{
        borderColor: isSelected ? colors.border : undefined,
        borderWidth: isSelected ? "2px" : "1px",
        boxShadow: isSelected ? `0 0 12px ${colors.border}25` : undefined
      }}
      id={`collector-card-${collector_code}`}
    >
      {/* Top Banner Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-5 h-5 flex items-center justify-center text-[11px] font-bold ${style.badge}`} id={`badge-rank-${collector_code}`}>
            #{rank}
          </span>
          <div>
            <h4 className="font-sans font-bold text-slate-800 tracking-tight text-sm flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.border }} />
              Kolektor {collector_code}
            </h4>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                Kandidat Terpilih {rank === 1 ? "Utama" : `Cadangan #${rank - 1}`}
              </span>
            </div>
          </div>
        </div>

        {/* Global score indicator */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-xl font-bold text-slate-800 leading-none">
              {score}
              <span className="text-[10px] font-normal text-slate-400 ml-0.5">/100</span>
            </div>
            <span className="text-[8px] text-slate-400 font-mono tracking-wider">SKOR MATCH</span>
          </div>
        </div>
      </div>

      {/* Action / Explanation Box complying with Rule 7 */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
        <div className="text-slate-605 text-[11px] leading-relaxed text-slate-600 italic">
          "{reason}"
        </div>
      </div>

      {/* Metrics breakdown grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Rerata Jarak</span>
          <span className="font-mono text-slate-700 font-medium text-xs mt-0.5">{supporting_metrics.avg_distance_km} km</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Aktivitas (Radius)</span>
          <span className="font-mono text-slate-700 font-medium text-xs mt-0.5">{supporting_metrics.activity_count_in_area} kali</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Konsistensi CV</span>
          <span className="font-mono text-slate-700 font-medium text-xs mt-0.5">{supporting_metrics.consistency_cv}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Tertagih Sekitar</span>
          <span className="font-mono text-slate-700 font-medium text-xs mt-0.5">
            Rp {supporting_metrics.total_transaction_amount_in_area.toLocaleString("id-ID")}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Beban Kerja</span>
          <span className="font-mono text-slate-700 font-medium text-xs mt-0.5">
            {supporting_metrics.active_customers} Nasabah
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Recency</span>
          <span className="font-mono text-slate-700 font-medium text-xs mt-0.5 text-right md:text-left">{supporting_metrics.last_activity_date}</span>
        </div>
      </div>

      {/* Confidence Pill Bar */}
      <div className="flex items-center justify-between text-[11px] border-t border-slate-100 pt-2 shadow-none">
        <span className="text-slate-400 flex items-center gap-1 font-mono text-[8px] tracking-wider uppercase font-semibold">
          Confidence Level
        </span>
        <span className={`px-2 py-0.5 border rounded text-[9px] font-bold ${confStyle}`}>
          {confidence}
        </span>
      </div>
    </div>
  );
}
