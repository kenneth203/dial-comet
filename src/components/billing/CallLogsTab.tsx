import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Calendar, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ExcelJS from 'exceljs';
import { secureLog } from '@/lib/secureLogger';

interface CallLog {
  call_id: string;
  customer_id: string;
  date: string;
  time: string;
  duration: string | null;
  call_type: 'Inbound' | 'Outbound';
  channel_type: 'Voice' | 'SMS' | 'Other';
  agent: string | null;
  ddi: string | null;
  result: string | null;
  billing_period: string;
  billing_customers?: { name: string };
}

interface BillingCustomer {
  customer_id: string;
  name: string;
}

export function CallLogsTab() {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState(() => {
    // Will be updated once data loads
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // CSV column mapping step state
  type TargetField = 'customer' | 'date' | 'time' | 'duration' | 'agent' | 'ddi' | 'channelType' | 'direction';
  const TARGET_FIELDS: { key: TargetField; label: string; required: boolean }[] = [
    { key: 'customer', label: 'Customer', required: true },
    { key: 'date', label: 'Date', required: true },
    { key: 'time', label: 'Time', required: false },
    { key: 'duration', label: 'Duration', required: false },
    { key: 'direction', label: 'Direction (Result)', required: false },
    { key: 'channelType', label: 'Channel Type', required: false },
    { key: 'agent', label: 'Agent', required: false },
    { key: 'ddi', label: 'DDI / Contact', required: false },
  ];
  const NONE = '__none__';
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [parsedFileName, setParsedFileName] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<Record<TargetField, string>>({
    customer: NONE, date: NONE, time: NONE, duration: NONE,
    agent: NONE, ddi: NONE, channelType: NONE, direction: NONE,
  });
  const [importing, setImporting] = useState(false);

  type ValidationIssue = { row: number | null; column?: string; message: string };
  type ValidationReport = {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    stats: { total: number; valid: number; skipped: number };
  } | null;
  const [validation, setValidation] = useState<ValidationReport>(null);
  const [validating, setValidating] = useState(false);

  const autoDetectMapping = (headers: string[]): Record<TargetField, string> => {
    const find = (patterns: RegExp[]) =>
      headers.find(h => patterns.some(p => p.test(h.toLowerCase()))) || NONE;
    return {
      customer: find([/^customer$/, /^department/, /^client$/, /^account$/]),
      date: find([/^date$/, /call.?date/]),
      time: find([/^time$/, /call.?time/, /started/]),
      duration: find([/duration/, /talk.?time/, /length/]),
      agent: find([/^agent$/, /^user/, /operator/, /handler/]),
      ddi: find([/^ddi$/, /contact.?method/, /^contact$/, /number/]),
      channelType: find([/channel/, /^type$/, /media/]),
      direction: find([/direction/, /^result$/, /inbound|outbound/]),
    };
  };

  // Pre-flight validation: required headers, date/time formats, column-count consistency
  const runPreflightValidation = () => {
    setValidating(true);
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // 1) Required mappings
    TARGET_FIELDS.filter(f => f.required).forEach(f => {
      if (columnMapping[f.key] === NONE) {
        errors.push({ row: null, message: `Required field "${f.label}" is not mapped to any column.` });
      }
    });

    const idx: Record<string, number> = {};
    (Object.keys(columnMapping) as TargetField[]).forEach(k => {
      idx[k] = columnMapping[k] === NONE ? -1 : parsedHeaders.indexOf(columnMapping[k]);
    });

    // 2) Column count / quoted-comma sanity check
    const expectedCols = parsedHeaders.length;
    let mismatchCount = 0;
    parsedRows.forEach((row, i) => {
      if (row.length !== expectedCols && row.some(c => c && c.trim() !== '')) {
        mismatchCount++;
        if (mismatchCount <= 3) {
          warnings.push({
            row: i + 2,
            message: `Row has ${row.length} columns but header has ${expectedCols} (possible unquoted comma in data).`,
          });
        }
      }
    });
    if (mismatchCount > 3) {
      warnings.push({ row: null, message: `…and ${mismatchCount - 3} more rows with column-count mismatches.` });
    }

    // 3) Per-row format checks (use normalizers so auto-fixable formats pass)
    const durRe = /^(\d+|\d{1,2}:\d{2}(:\d{2})?)$/;

    let valid = 0;
    let skipped = 0;
    const badDates = new Map<string, number>();
    const badTimes = new Map<string, number>();
    const badDurations = new Map<string, number>();
    let missingCustomer = 0;
    let missingDate = 0;

    parsedRows.forEach((row, i) => {
      if (!row || row.every(c => !c || !c.trim())) { skipped++; return; }

      const get = (k: TargetField) => (idx[k] >= 0 ? (row[idx[k]] ?? '').toString().trim() : '');
      const customer = get('customer');
      const date = get('date');
      const time = get('time');
      const dur = get('duration');

      let rowOk = true;

      if (idx.customer >= 0 && !customer) { missingCustomer++; rowOk = false; }
      if (idx.date >= 0 && !date) { missingDate++; rowOk = false; }
      if (date && !normalizeDate(date)) {
        badDates.set(date, (badDates.get(date) || 0) + 1);
        rowOk = false;
      }
      if (time && time !== '-' && !normalizeTime(time)) {
        badTimes.set(time, (badTimes.get(time) || 0) + 1);
      }
      if (dur && dur !== '-' && !['Inbound', 'Outbound'].includes(dur) && !durRe.test(dur)) {
        badDurations.set(dur, (badDurations.get(dur) || 0) + 1);
      }

      if (rowOk) valid++;
    });

    if (missingCustomer > 0) errors.push({ row: null, column: 'Customer', message: `${missingCustomer} row(s) missing Customer value.` });
    if (missingDate > 0) errors.push({ row: null, column: 'Date', message: `${missingDate} row(s) missing Date value.` });

    const summarise = (map: Map<string, number>, label: string, target: 'error' | 'warning') => {
      const samples = [...map.entries()].slice(0, 3).map(([v, c]) => `"${v}" (×${c})`).join(', ');
      const total = [...map.values()].reduce((a, b) => a + b, 0);
      const msg = `${total} row(s) have unrecognised ${label}: ${samples}${map.size > 3 ? `, +${map.size - 3} more` : ''}.`;
      (target === 'error' ? errors : warnings).push({ row: null, message: msg });
    };
    if (badDates.size > 0) summarise(badDates, 'date format (expected DD/MM/YYYY or YYYY-MM-DD)', 'error');
    if (badTimes.size > 0) summarise(badTimes, 'time format (expected HH:MM or HH:MM:SS)', 'warning');
    if (badDurations.size > 0) summarise(badDurations, 'duration format (expected HH:MM:SS, MM:SS, or seconds)', 'warning');

    setValidation({
      errors,
      warnings,
      stats: { total: parsedRows.length, valid, skipped },
    });
    setValidating(false);
  };



  // Function to refresh call logs data
  const refreshData = useCallback(() => {
    secureLog.info('Refreshing Call Logs data');
    setLoading(true);
    fetchCallLogs();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchCallLogs();
    fetchCustomers();
  }, []);

  // Get unique billing periods from call logs using useMemo to prevent redeclaration
  const billingPeriods = useMemo(() => {
    return [...new Set(callLogs.map(log => log.billing_period))]
      .filter(period => period && period.trim() !== '') // Filter out empty periods
      .sort()
      .reverse();
  }, [callLogs]);

  // Auto-select first month with data when call logs are loaded
  useEffect(() => {
    if (callLogs.length > 0 && billingPeriods.length > 0) {
      // Set to first available period with data if current selection has no data
      const currentHasData = billingPeriods.includes(selectedBillingPeriod);
      if (!currentHasData) {
        setSelectedBillingPeriod(billingPeriods[0]);
        secureLog.debug('Auto-selected first period with data', { period: billingPeriods[0] });
      }
    }
  }, [callLogs, billingPeriods, selectedBillingPeriod]);

  useEffect(() => {
    let filtered = callLogs;

    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.agent?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ddi?.includes(searchTerm) ||
        log.result?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log as any).billing_customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by billing period - handle both current month and specific periods
    if (selectedBillingPeriod) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (selectedBillingPeriod === currentMonth) {
        // Show current month data
        filtered = filtered.filter(log => 
          log.billing_period === selectedBillingPeriod || 
          !log.billing_period || 
          log.billing_period === ''
        );
      } else {
        // Filter by specific billing period
        filtered = filtered.filter(log => log.billing_period === selectedBillingPeriod);
      }
    }

    secureLog.debug('Filtering call logs', { 
      selectedPeriod: selectedBillingPeriod,
      availablePeriods: [...new Set(callLogs.map(log => log.billing_period))].length,
      filteredCount: filtered.length 
    });

    setFilteredLogs(filtered);
  }, [callLogs, searchTerm, selectedBillingPeriod]);

  // Auto-refresh every 3 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      secureLog.debug('Auto-refreshing call logs');
      refreshData();
    }, 3 * 60 * 1000); // 3 minutes

    return () => clearInterval(interval);
  }, [refreshData]);

  const fetchCallLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .select(`
          *,
          billing_customers (name)
        `)
        .order('date', { ascending: false, nullsFirst: false })
        .order('call_started_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setCallLogs((data as any) || []);
    } catch (error) {
      console.error('Error fetching call logs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch call logs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('billing_customers')
        .select('customer_id, name')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  // RFC 4180-ish CSV line parser: handles quoted fields with commas and escaped quotes
  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuotes = false; }
        } else {
          cur += ch;
        }
      } else {
        if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') { inQuotes = true; }
        else { cur += ch; }
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  // Strip BOM/zero-width chars, normalise non-breaking spaces, smart quotes, collapse whitespace
  const cleanCell = (raw: any): string => {
    if (raw == null) return '';
    let s = String(raw);
    s = s.replace(/^\uFEFF/, '');                  // BOM
    s = s.replace(/[\u200B-\u200D\u2060]/g, '');   // zero-width
    s = s.replace(/\u00A0/g, ' ');                 // NBSP → space
    s = s.replace(/[\u2018\u2019\u201B]/g, "'");   // smart single quotes
    s = s.replace(/[\u201C\u201D\u201F]/g, '"');   // smart double quotes
    s = s.replace(/\s+/g, ' ');                    // collapse whitespace
    return s.trim();
  };

  // Normalise common UK / ISO date formats → DD/MM/YYYY (or null if unrecognised)
  const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const normalizeDate = (raw: string): string | null => {
    if (!raw) return null;
    let s = cleanCell(raw).replace(/[.,]/g, '');
    // Drop time portion if present (ISO or space-separated)
    s = s.split(/[T ]/)[0] || s;
    if (!s) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    const fourDigit = (y: string) => (y.length === 2 ? `20${y}` : y);
    const valid = (d: number, m: number, y: number) => {
      if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
      return `${pad(d)}/${pad(m)}/${y}`;
    };

    // ISO YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return valid(+m[3], +m[2], +m[1]);

    // DD/MM/YYYY, DD-MM-YYYY, D/M/YY (UK first)
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) return valid(+m[1], +m[2], +fourDigit(m[3]));

    // 30 May 2026 / 30-May-26 / May 30 2026
    m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]+)[\s\-](\d{2,4})$/);
    if (m && MONTHS[m[2].toLowerCase()]) return valid(+m[1], MONTHS[m[2].toLowerCase()], +fourDigit(m[3]));
    m = s.match(/^([A-Za-z]+)[\s\-](\d{1,2})[\s\-](\d{2,4})$/);
    if (m && MONTHS[m[1].toLowerCase()]) return valid(+m[2], MONTHS[m[1].toLowerCase()], +fourDigit(m[3]));

    return null;
  };

  // Convert a normalised DD/MM/YYYY (or anything normalizeDate accepts) → ISO YYYY-MM-DD
  const toIsoDate = (raw: string): string | null => {
    const norm = normalizeDate(raw);
    if (!norm) return null;
    const [dd, mm, yyyy] = norm.split('/');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Normalise time strings → HH:MM:SS (or null if unrecognised)
  const normalizeTime = (raw: string): string | null => {
    if (!raw) return null;
    let s = cleanCell(raw).toLowerCase();
    if (!s || s === '-') return null;
    // Detect AM/PM suffix
    let ampm: 'am' | 'pm' | null = null;
    const ap = s.match(/\b(am|pm|a\.m\.|p\.m\.)\b/);
    if (ap) {
      ampm = ap[1].startsWith('a') ? 'am' : 'pm';
      s = s.replace(/\b(am|pm|a\.m\.|p\.m\.)\b/, '').trim();
    }
    const m = s.match(/^(\d{1,2})[:.h](\d{1,2})(?:[:.](\d{1,2}))?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = m[3] ? parseInt(m[3], 10) : 0;
    if (mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
    if (ampm) {
      if (h < 1 || h > 12) return null;
      if (ampm === 'am') h = h === 12 ? 0 : h;
      else h = h === 12 ? 12 : h + 12;
    } else if (h < 0 || h > 23) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(mm)}:${pad(ss)}`;
  };



  // Stage 1: parse the file into headers + rows, show mapping UI
  const handleFileSelected = async (file: File) => {
    try {
      let data: any[][];

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        data = text
          .split(/\r?\n/)
          .filter(line => line.length > 0)
          .map(line => parseCsvLine(line));
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error('Excel file too large. Please use a file under 10MB or convert to CSV.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];
        data = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          data.push((row.values as any[]).slice(1).map((v: any) => v != null ? String(v) : ''));
        });
      } else {
        throw new Error('Unsupported file format. Please upload CSV or Excel files.');
      }

      if (data.length < 2) {
        throw new Error('File must contain at least a header and one data row');
      }

      const headers = data[0].map((h: any) => cleanCell(h));
      const rows = data.slice(1).map(r => r.map(c => cleanCell(c)));

      setParsedHeaders(headers);
      setParsedRows(rows);
      setParsedFileName(file.name);
      setColumnMapping(autoDetectMapping(headers));
    } catch (error: any) {
      console.error('Error parsing file:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to read file.',
        variant: 'destructive',
      });
    }
  };

  const resetImportState = () => {
    setParsedHeaders([]);
    setParsedRows([]);
    setParsedFileName('');
    setColumnMapping({
      customer: NONE, date: NONE, time: NONE, duration: NONE,
      agent: NONE, ddi: NONE, channelType: NONE, direction: NONE,
    });
    setValidation(null);
  };

  // Stage 2: import using the user-confirmed column mapping
  const runImport = async () => {
    const mapping = columnMapping;
    const missing = TARGET_FIELDS.filter(f => f.required && mapping[f.key] === NONE);
    if (missing.length > 0) {
      toast({
        title: 'Mapping required',
        description: `Please map: ${missing.map(m => m.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    try {
      const idx: Record<TargetField, number> = Object.fromEntries(
        TARGET_FIELDS.map(f => [f.key, mapping[f.key] === NONE ? -1 : parsedHeaders.indexOf(mapping[f.key])])
      ) as any;
      const get = (row: string[], key: TargetField) => idx[key] >= 0 ? (row[idx[key]] ?? '').toString().trim() : '';

      const { data: batchData, error: batchError } = await supabase
        .from('import_batches')
        .insert({
          source: parsedFileName,
          billing_period: selectedBillingPeriod || new Date().toISOString().slice(0, 7),
          total_records: parsedRows.length,
          status: 'processing'
        } as any)
        .select()
        .single();

      if (batchError) throw batchError;

      const calls: any[] = [];
      let processedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < parsedRows.length; i++) {
        try {
          const row = parsedRows[i];
          if (!row || row.every(cell => !cell)) continue;

          const customerName = get(row, 'customer');
          const callDate = get(row, 'date');
          const callTime = get(row, 'time');
          const duration = get(row, 'duration');
          const agent = get(row, 'agent');
          const ddi = get(row, 'ddi');
          const channelType = get(row, 'channelType') || 'Voice';
          const direction = get(row, 'direction') || 'Inbound';

          if (!customerName || !callDate) { errorCount++; continue; }

          const isoDate = toIsoDate(callDate);
          if (!isoDate) {
            console.warn(`Row ${i + 2}: unrecognized date "${callDate}"`);
            errorCount++;
            continue;
          }

          let customer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
          if (!customer) {
            const { data: newCustomer, error: customerError } = await supabase
              .from('billing_customers')
              .insert({ name: customerName, active: true })
              .select()
              .single();
            if (customerError) { errorCount++; continue; }
            customer = newCustomer;
            customers.push(newCustomer);
          }

          let durationSeconds = 0;
          let formattedDuration: string | null = null;
          if (duration && duration !== '-' && duration !== 'Inbound' && duration !== 'Outbound') {
            const parts = duration.split(':');
            if (parts.length === 3) {
              const [h, m, s] = parts.map(p => parseInt(p) || 0);
              durationSeconds = h * 3600 + m * 60 + s;
              formattedDuration = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            } else if (parts.length === 2) {
              const [m, s] = parts.map(p => parseInt(p) || 0);
              durationSeconds = m * 60 + s;
              formattedDuration = `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            } else if (parts.length === 1 && !isNaN(parseInt(duration))) {
              durationSeconds = parseInt(duration);
              const h = Math.floor(durationSeconds / 3600);
              const m = Math.floor((durationSeconds % 3600) / 60);
              const s = durationSeconds % 60;
              formattedDuration = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            }
          }

          const timePart = normalizeTime(callTime) || '00:00:00';
          const callStartedAt = new Date(`${isoDate}T${timePart}Z`).toISOString();

          calls.push({
            customer_id: customer.customer_id,
            date: isoDate,
            time: timePart,
            duration: formattedDuration,
            duration_seconds: durationSeconds,
            call_started_at: callStartedAt,
            agent: agent && agent !== '-' ? agent : null,
            ddi: ddi && ddi !== '-' ? ddi : '',
            channel_type: channelType,
            call_type: direction,
            direction: direction,
            result: 'Completed',
            billing_period: selectedBillingPeriod || new Date().toISOString().slice(0, 7),
            import_batch_id: (batchData as any).batch_id,
            raw_source_row: row,
          });
          processedCount++;
        } catch (rowError) {
          console.warn(`Error processing row ${i}:`, rowError);
          errorCount++;
        }
      }

      if (calls.length === 0) throw new Error('No valid call records found in the upload');

      const batchSize = 100;
      for (let i = 0; i < calls.length; i += batchSize) {
        const { error } = await supabase.from('call_logs').insert(calls.slice(i, i + batchSize));
        if (error) throw error;
      }

      await supabase
        .from('import_batches')
        .update({ processed_count: processedCount, error_count: errorCount, status: 'completed' })
        .eq('batch_id', (batchData as any).batch_id);

      toast({
        title: 'Success',
        description: `Successfully uploaded ${processedCount} call logs. ${errorCount} rows had errors.`,
      });

      setUploadDialogOpen(false);
      resetImportState();
      fetchCallLogs();
    } catch (error: any) {
      console.error('Error uploading calls:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to upload call logs.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const exportCallLogs = () => {
    const csvContent = [
      'Date,Time,Duration,Customer,Call Type,Channel,Agent,DDI,Result',
      ...filteredLogs.map(log => [
        log.date,
        log.time,
        log.duration || '',
        (log as any).billing_customers?.name || 'Unknown',
        log.call_type,
        log.channel_type,
        log.agent || '',
        log.ddi || '',
        log.result || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-logs-${selectedBillingPeriod}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Generate last 12 months for better month selection
  const generateMonthOptions = () => {
    const months = [];
    const currentDate = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      months.push(monthStr);
    }
    
    // Combine with actual billing periods and remove duplicates
    const allPeriods = [...new Set([...months, ...billingPeriods])].sort().reverse();
    return allPeriods;
  };

  const allAvailableMonths = generateMonthOptions();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Call Logs</CardTitle>
              <CardDescription>Upload and manage monthly call logs</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={refreshData} variant="outline" disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button onClick={exportCallLogs} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Logs
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Upload Call Logs</DialogTitle>
                    <DialogDescription>
                      {parsedHeaders.length === 0
                        ? 'Step 1: choose an Excel or CSV file.'
                        : `Step 2: map columns from "${parsedFileName}" (${parsedRows.length} rows) to the call log fields.`}
                    </DialogDescription>
                  </DialogHeader>

                  {parsedHeaders.length === 0 ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="file">Excel or CSV File</Label>
                        <Input
                          id="file"
                          name="file"
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileSelected(f);
                          }}
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          You'll be able to map columns (Result, Date, Time, etc.) in the next step.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setUploadDialogOpen(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {TARGET_FIELDS.map(field => (
                          <div key={field.key}>
                            <Label className="text-sm">
                              {field.label}
                              {field.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                            <Select
                              value={columnMapping[field.key]}
                              onValueChange={(val) => {
                                setColumnMapping(prev => ({ ...prev, [field.key]: val }));
                                setValidation(null);
                              }}
                            >
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Select column" />
                              </SelectTrigger>
                              <SelectContent className="bg-background border border-border shadow-lg z-50 max-h-60">
                                <SelectItem value={NONE}>— Not mapped —</SelectItem>
                                {parsedHeaders.map((h, i) => (
                                  <SelectItem key={`${h}-${i}`} value={h}>{h || `(column ${i + 1})`}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>

                      {parsedRows.length > 0 && (
                        <div>
                          <Label className="text-sm">Preview (first 3 rows)</Label>
                          <div className="overflow-x-auto rounded-lg border mt-1">
                            <table className="text-xs w-full">
                              <thead className="bg-muted">
                                <tr>
                                  {parsedHeaders.map((h, i) => (
                                    <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {parsedRows.slice(0, 3).map((r, ri) => (
                                  <tr key={ri} className="border-t">
                                    {parsedHeaders.map((_, ci) => (
                                      <td key={ci} className="px-2 py-1 whitespace-nowrap">{r[ci] ?? ''}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {validation && (
                        <div className="rounded-lg border p-3 space-y-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">Validation report</span>
                            <Badge variant={validation.errors.length === 0 ? 'outline' : 'destructive'}>
                              {validation.errors.length === 0 ? 'Passed' : `${validation.errors.length} error(s)`}
                            </Badge>
                            {validation.warnings.length > 0 && (
                              <Badge variant="secondary">{validation.warnings.length} warning(s)</Badge>
                            )}
                            <span className="text-muted-foreground text-xs ml-auto">
                              {validation.stats.valid} valid · {validation.stats.skipped} blank · {validation.stats.total} total
                            </span>
                          </div>
                          {validation.errors.length > 0 && (
                            <div>
                              <p className="text-destructive font-medium text-xs mb-1">Errors (must fix to import)</p>
                              <ul className="list-disc list-inside text-xs space-y-0.5 text-destructive">
                                {validation.errors.map((e, i) => (
                                  <li key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.message}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {validation.warnings.length > 0 && (
                            <div>
                              <p className="text-amber-600 font-medium text-xs mb-1">Warnings (import will proceed; affected rows may be skipped)</p>
                              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                                {validation.warnings.map((w, i) => (
                                  <li key={i}>{w.row ? `Row ${w.row}: ` : ''}{w.message}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={resetImportState} disabled={importing}>
                          Back
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { setUploadDialogOpen(false); resetImportState(); }} disabled={importing}>
                          Cancel
                        </Button>
                        <Button type="button" variant="secondary" onClick={runPreflightValidation} disabled={importing || validating}>
                          {validating ? 'Validating...' : 'Validate'}
                        </Button>
                        <Button
                          type="button"
                          onClick={runImport}
                          disabled={importing || !validation || validation.errors.length > 0}
                          title={!validation ? 'Run validation first' : validation.errors.length > 0 ? 'Fix errors before importing' : ''}
                        >
                          {importing ? 'Importing...' : `Import ${parsedRows.length} rows`}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:max-w-sm"
              />
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedBillingPeriod} onValueChange={setSelectedBillingPeriod}>
                <SelectTrigger className="w-full sm:w-48 bg-background border-input">
                  <SelectValue placeholder="Current month" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg z-50 max-h-60 overflow-y-auto">
                  <SelectItem value={new Date().toISOString().slice(0, 7)} className="bg-background hover:bg-muted">
                    <div className="flex items-center justify-between w-full">
                      <span>Current Month ({new Date().toISOString().slice(0, 7)})</span>
                      {billingPeriods.includes(new Date().toISOString().slice(0, 7)) && 
                        <span className="text-green-600 ml-2">✓ Has Data</span>
                      }
                    </div>
                  </SelectItem>
                  {allAvailableMonths.filter(period => period !== new Date().toISOString().slice(0, 7)).map(period => {
                    const [year, month] = period.split('-');
                    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-GB', { 
                      year: 'numeric', 
                      month: 'long' 
                    });
                    const hasData = billingPeriods.includes(period);
                    
                    return (
                      <SelectItem 
                        key={period} 
                        value={period}
                        className="bg-background hover:bg-muted"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{monthName}</span>
                          {hasData ? (
                            <span className="text-green-600 ml-2">✓ Has Data</span>
                          ) : (
                            <span className="text-muted-foreground text-xs ml-2">No Data</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto -mx-6 sm:mx-0"><div className="min-w-[640px] px-6 sm:px-0 sm:min-w-0"><div className="rounded-lg border"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Channel Type</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>DDI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.call_id}>
                    <TableCell>{log.date}</TableCell>
                    <TableCell>{log.time}</TableCell>
                    <TableCell>
                      {(log as any).billing_customers?.name || 'Unknown Customer'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {log.channel_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{log.result || '-'}</span>
                    </TableCell>
                    <TableCell>{log.duration || '-'}</TableCell>
                    <TableCell>{log.agent || '-'}</TableCell>
                    <TableCell>{log.ddi || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></div></div>

          {filteredLogs.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No call logs found</p>
              {!searchTerm && (
                <p className="text-sm text-muted-foreground mt-2">
                  Upload call logs to get started
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}