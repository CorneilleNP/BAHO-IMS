import { useMemo, useState } from 'react';
import type { CherryGrade, PaymentMethod } from '@baho/shared-types';
import { farmers } from '../../mock/config';

interface LineState {
  quantityKg: string;
  farmPricePerKg: string;
  transportCost: string;
  commission: string;
}

const emptyLine: LineState = { quantityKg: '', farmPricePerKg: '', transportCost: '0', commission: '0' };

/**
 * Cherry reception: one row per farmer delivery. Good/Float are two
 * independent lines (cherry_receipt_lines), matching the real workbook's
 * Good Cherries / Float Cherries column pairs but normalized into rows.
 */
export function CherryReceiptForm() {
  const [farmerId, setFarmerId] = useState(farmers[0].id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [lines, setLines] = useState<Record<CherryGrade, LineState>>({
    GOOD: emptyLine,
    FLOAT: emptyLine,
  });

  const updateLine = (grade: CherryGrade, field: keyof LineState, value: string) =>
    setLines((prev) => ({ ...prev, [grade]: { ...prev[grade], [field]: value } }));

  const computed = useMemo(() => {
    return (Object.entries(lines) as [CherryGrade, LineState][]).map(([grade, l]) => {
      const qty = Number(l.quantityKg) || 0;
      const price = Number(l.farmPricePerKg) || 0;
      const transport = Number(l.transportCost) || 0;
      const commission = Number(l.commission) || 0;
      const lineAmount = qty * price;
      return { grade, qty, lineAmount, transport, commission };
    });
  }, [lines]);

  const totalQty = computed.reduce((a, c) => a + c.qty, 0);
  const totalAmount = computed.reduce((a, c) => a + c.lineAmount + c.transport + c.commission, 0);

  return (
    <section style={{ maxWidth: 720 }}>
      <h2>Cherry Reception (GRN)</h2>

      <label style={labelStyle}>
        Farmer
        <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} style={inputStyle}>
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.full_name} ({f.farmer_code})
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Payment method
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} style={inputStyle}>
          <option value="CASH">Cash</option>
          <option value="BANK">Bank</option>
          <option value="MOBILE_MONEY">Mobile Money</option>
        </select>
      </label>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Grade</th>
            <th style={thStyle}>Qty (kg)</th>
            <th style={thStyle}>Price/kg</th>
            <th style={thStyle}>Transport</th>
            <th style={thStyle}>Commission</th>
            <th style={thStyle}>Line amount</th>
          </tr>
        </thead>
        <tbody>
          {(['GOOD', 'FLOAT'] as CherryGrade[]).map((grade) => {
            const row = computed.find((c) => c.grade === grade)!;
            return (
              <tr key={grade}>
                <td style={tdStyle}>{grade === 'GOOD' ? 'Good cherry' : 'Float cherry'}</td>
                <td style={tdStyle}>
                  <input type="number" min={0} value={lines[grade].quantityKg} onChange={(e) => updateLine(grade, 'quantityKg', e.target.value)} style={{ width: 90 }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" min={0} value={lines[grade].farmPricePerKg} onChange={(e) => updateLine(grade, 'farmPricePerKg', e.target.value)} style={{ width: 90 }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" min={0} value={lines[grade].transportCost} onChange={(e) => updateLine(grade, 'transportCost', e.target.value)} style={{ width: 90 }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" min={0} value={lines[grade].commission} onChange={(e) => updateLine(grade, 'commission', e.target.value)} style={{ width: 90 }} />
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{row.lineAmount.toLocaleString()} RWF</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
            <td style={{ ...tdStyle, fontWeight: 700 }}>{totalQty.toFixed(1)} kg</td>
            <td colSpan={3} />
            <td style={{ ...tdStyle, fontWeight: 700 }}>{totalAmount.toLocaleString()} RWF</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 12, fontWeight: 600 };
const inputStyle: React.CSSProperties = { display: 'block', marginTop: 4, padding: 6, width: '100%', fontWeight: 400 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', marginTop: 8 };
const thStyle: React.CSSProperties = { textAlign: 'left', borderBottom: '2px solid #ccc', padding: '6px 8px' };
const tdStyle: React.CSSProperties = { borderBottom: '1px solid #eee', padding: '6px 8px' };
