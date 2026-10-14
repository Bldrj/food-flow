"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportSheetsToExcel, todayStamp } from "@/lib/export-excel";
import {
  BASE_UNIT_LABELS,
  STATION_LABELS,
  type Material,
  type MaterialKind,
  type StationCode,
} from "@/lib/types";

type ExportSheet = {
  title: string;
  fileName: string;
  date: string;
  headers: string[];
  widths: number[];
  rows: (string | number | null)[][];
  lossColumn: number;
};

const STATIONS: StationCode[] = ["prep", "hot_aux", "hot", "packaging"];

type Props = {
  rows: Material[];
  kind: MaterialKind;
  categoryPaths: Map<string, string>;
  stationsByMaterial: Map<string, Set<StationCode>>;
  disabled: boolean;
};

export function MaterialsExport({
  rows,
  kind,
  categoryPaths,
  stationsByMaterial,
  disabled,
}: Props) {
  const [printing, setPrinting] = React.useState<ExportSheet | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const unavailable = disabled || rows.length === 0 || printing !== null;

  function makeSheet(): ExportSheet {
    const raw = kind === "raw";
    const date = todayStamp();
    const columns: {
      header: string;
      value: (row: Material) => string | number | null;
      width: number;
    }[] = [
      { header: "Нэр", value: (r) => r.name, width: 36 },
      raw
        ? {
            header: "Ангилал",
            value: (r) => r.category_id
              ? categoryPaths.get(r.category_id) ?? "Ангилалгүй"
              : "Ангилалгүй",
            width: 30,
          }
        : {
            header: "Үйлдвэрлэдэг цех",
            value: (r) => r.source_station ? STATION_LABELS[r.source_station] : null,
            width: 24,
          },
      {
        header: "Цехүүд",
        value: (r) => STATIONS
          .filter((s) => stationsByMaterial.get(r.id)?.has(s))
          .map((s) => STATION_LABELS[s]).join(", "),
        width: 36,
      },
      { header: "Үндсэн нэгж", value: (r) => BASE_UNIT_LABELS[r.base_unit], width: 14 },
      ...(raw ? [{ header: "Хорогдол (%)", value: (r: Material) => Number(r.loss_pct), width: 16 }] : []),
      { header: "Доод үлдэгдэл", value: (r) => r.min_stock === null ? null : Number(r.min_stock), width: 18 },
    ];
    const lossColumn = columns.findIndex((c) => c.header === "Хорогдол (%)");
    return {
      title: raw ? "Материал — Түүхий эд" : "Материал — Бэлдэц",
      fileName: `materials-${kind}-${date}`,
      date,
      headers: ["№", ...columns.map((c) => c.header)],
      widths: [6, ...columns.map((c) => c.width ?? 16)],
      rows: rows.map((row, i) => [i + 1, ...columns.map((c) => c.value(row))]),
      lossColumn: lossColumn >= 0 ? lossColumn + 1 : -1,
    };
  }

  function exportExcel() {
    setError(null);
    try {
      const sheet = makeSheet();
      exportSheetsToExcel({
        fileName: sheet.fileName,
        sheets: [{
          name: kind === "raw" ? "Түүхий эд" : "Бэлдэц",
          rows: [
            [sheet.title],
            [`Огноо: ${sheet.date} · Нийт: ${sheet.rows.length}`],
            sheet.headers,
            ...sheet.rows,
          ],
          widths: sheet.widths,
          merges: [[0, 0, sheet.headers.length - 1], [1, 0, sheet.headers.length - 1]],
          boldRows: [0],
          headerRow: 2,
          formats: sheet.lossColumn < 0 ? [] : sheet.rows.map(
            (_, i) => [i + 3, sheet.lossColumn, "0.##%"],
          ),
        }],
      });
    } catch {
      setError("Excel экспорт амжилтгүй боллоо. Дахин оролдоно уу.");
    }
  }

  React.useEffect(() => {
    if (!printing) return;
    const previousTitle = document.title;
    document.title = printing.fileName;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    const frame = requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        setError("PDF хэвлэх цонх нээгдсэнгүй. Дахин оролдоно уу.");
        done();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
      document.title = previousTitle;
    };
  }, [printing]);

  return (
    <>
      <Button
        variant="outline"
        disabled={unavailable}
        onClick={() => {
          setError(null);
          setPrinting(makeSheet());
        }}
        title="Хэвлэх цонхноос PDF болгон хадгална"
      >
        <PrinterIcon /> PDF хадгалах
      </Button>
      <Button variant="outline" disabled={unavailable} onClick={exportExcel}>
        <DownloadIcon /> Excel татах
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
      {printing && createPortal(
        <div data-print-sheet className="hidden bg-white text-[10px] leading-snug text-black print:block">
          <style>{"@page { size: A4 portrait; margin: 10mm; }"}</style>
          <h1 className="mb-2 text-lg font-bold">{printing.title}</h1>
          <p className="mb-3">Огноо: {printing.date} · Нийт: {printing.rows.length}</p>
          <table className="w-full table-fixed border-collapse">
            <thead className="table-header-group">
              <tr>
                {printing.headers.map((header, i) => (
                  <th
                    key={header}
                    style={{ width: `${printing.widths[i] / printing.widths.reduce((sum, width) => sum + width, 0) * 100}%` }}
                    className="border border-black px-1 py-1 text-left"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printing.rows.map((row, i) => (
                <tr key={i} className="break-inside-avoid">
                  {row.map((value, c) => (
                    <td key={c} className="border border-black px-1 py-1 wrap-anywhere">
                      {value === null || value === "" ? "—"
                        : c === printing.lossColumn
                          ? `${Number((Number(value) * 100).toFixed(2))}%`
                          : value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>, document.body,
      )}
    </>
  );
}
